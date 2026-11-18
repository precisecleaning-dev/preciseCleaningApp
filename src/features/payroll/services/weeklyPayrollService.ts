// src/features/payroll/services/weeklyPayrollService.ts
// Escrituras de la nómina semanal por casa (pestaña Nóminas de Payroll): pagar
// la semana completa, regresarla a Pending, guardar el bono / descuento de un
// empleado, editar el pago de una casa desde el detalle y subir o quitar las
// fotos del comprobante del pago. Cada una es una sola escritura o UN batch
// (todo o nada) y deja su registro en el Activity Log. Lo
// pagado o ajustado aquí lleva batchId `week_AAAA-MM-DD` (ver weeklyPayroll.ts):
// así Asignar nómina lo ve como pagado y "Mark week pending" sabe qué regresar.
import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import type {
  PayrollRecord, PropertyPaymentChanges, SystemUser, WeekAdjustmentInput, WeeklyPayrollRow, WeeklyReceiptPhoto,
} from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { commitOps, type BatchOp } from '../../../shared/data/batchWrites';
import { formatDate, formatDateRange, todayIso } from '../../../utils/dateFormat';
import { fullName } from '../../../utils/homeData';
import { getPayrollTotal, money, roundToCents } from '../../../utils/jobFinancials';
import { compressImage } from '../../../utils/imageCompression';
import { uploadBatchWithProgress } from '../../../utils/photoUploader';
import { getWeekBatchId, getWeekDays, getWeekRecord } from '../weeklyPayroll';

const describeWeek = (weekStart: string) => {
  const weekDays = getWeekDays(weekStart);
  return `week ${formatDateRange(weekDays[0], weekDays[6])}`;
};

const logWeekChange = (weekStart: string, targetLabel: string, detail: string, actor?: SystemUser | null) => {
  void logActivity({ action: 'update', module: 'Payroll', user: actor, targetId: getWeekBatchId(weekStart), targetLabel, detail });
};

/**
 * Marca como pagados los pagos sin pagar que recibe (toda la semana o los de un
 * empleado), con la fecha del pago y el batchId de la semana. Si venían de una
 * nómina asignada (`batch_…`), su batchId y su fecha quedan en previousBatchId /
 * previousPaymentDate para que "Not sent" los regrese a "En nómina".
 * `employeeLabel`: a quién se pagó (Activity Log).
 */
export const payWeek = async (
  records: readonly PayrollRecord[], weekStart: string, paymentDate: string, actor?: SystemUser | null,
  employeeLabel = 'All employees',
): Promise<void> => {
  const unpaidRecords = records.filter((record) => record.id && record.status !== 'Paid');
  if (unpaidRecords.length === 0) return;
  const paidBy = fullName(actor);
  const weekBatchId = getWeekBatchId(weekStart);
  await commitOps(unpaidRecords.map((record): BatchOp => {
    const cameFromAssignedPayroll = !!record.batchId && record.batchId !== weekBatchId;
    return (batch) => payrollService.batchUpdate(batch, record.id as string, {
      status: 'Paid', paidAt: paymentDate, paidBy, paymentDate, batchId: weekBatchId,
      ...(cameFromAssignedPayroll ? { previousBatchId: record.batchId, previousPaymentDate: record.paymentDate ?? null } : {}),
    });
  }));
  const total = roundToCents(unpaidRecords.reduce((sum, record) => sum + getPayrollTotal(record), 0));
  logWeekChange(weekStart, `Payroll ${describeWeek(weekStart)}`,
    `${employeeLabel} paid on ${formatDate(paymentDate)}: ${unpaidRecords.length} payment(s), ${money(total)}.`, actor);
};

/**
 * Regresa a Pending lo que se pagó desde esta pestaña (toda la semana o lo de
 * un empleado: "Not sent"). Lo que venía de una nómina asignada recupera su
 * batchId y su fecha (vuelve a "En nómina"); las demás casas pierden el batchId
 * (vuelven a Asignar nómina como pendientes) y los ajustes de la semana lo
 * conservan, porque es lo que los ubica en su semana. `employeeLabel`: de quién (Activity Log).
 */
export const markWeekPending = async (
  paidRecords: readonly PayrollRecord[], weekStart: string, actor?: SystemUser | null, employeeLabel = 'All employees',
): Promise<void> => {
  const records = paidRecords.filter((record) => record.id);
  if (records.length === 0) return;
  await commitOps(records.map((record): BatchOp => {
    const getRestoredBatch = () => {
      if (record.previousBatchId) {
        return {
          batchId: record.previousBatchId, paymentDate: record.previousPaymentDate ?? deleteField(),
          previousBatchId: deleteField(), previousPaymentDate: deleteField(),
        };
      }
      return record.propertyId ? { batchId: deleteField(), paymentDate: deleteField() } : { paymentDate: deleteField() };
    };
    return (batch) => payrollService.batchUpdate(batch, record.id as string, {
      status: 'Pending', paidAt: '', paidBy: '', ...getRestoredBatch(),
    });
  }));
  logWeekChange(weekStart, `Payroll ${describeWeek(weekStart)}`,
    `${employeeLabel} changed back to Pending (not sent): ${records.length} payment(s).`, actor);
};

/**
 * Bono y descuento de un empleado en la semana: quedan en UN solo ajuste con el
 * batchId de la semana. Solo se tocan los ajustes SIN pagar de esta pestaña
 * (`week_…`): se actualiza el primero, se borran los demás y, si no hay, se crea
 * uno. Los ajustes de una nómina asignada (`batch_…`) y los ya pagados no se tocan.
 * El registro de la semana con fotos del comprobante no se borra aunque quede sin
 * bono ni descuento: se queda con montos en 0 para conservar las fotos.
 */
export const saveWeekAdjustment = async (
  input: WeekAdjustmentInput, unpaidWeekAdjustments: readonly PayrollRecord[], actor?: SystemUser | null,
): Promise<void> => {
  const weekBatchId = getWeekBatchId(input.weekStart);
  const [weekAdjustment, ...duplicates] = unpaidWeekAdjustments.filter((adjustment) =>
    adjustment.id && adjustment.status !== 'Paid' && adjustment.batchId === weekBatchId);
  const hasAdjustment = input.bonus > 0 || input.discount > 0;
  const amounts = {
    extraAmount: input.bonus,
    extraNote: input.bonus > 0 ? input.bonusNote : '',
    discountAmount: input.discount,
    discountNote: input.discount > 0 ? input.discountNote : '',
    totalAmount: roundToCents(input.bonus - input.discount),
  };
  const ops: BatchOp[] = duplicates.map((adjustment) => payrollService.deleteOp(adjustment.id as string));
  if (weekAdjustment && hasAdjustment) {
    ops.push(payrollService.updateOp(weekAdjustment.id as string, amounts));
  } else if (weekAdjustment?.receiptPhotos?.length) {
    ops.push(payrollService.updateOp(weekAdjustment.id as string, amounts));
  } else if (weekAdjustment) {
    ops.push(payrollService.deleteOp(weekAdjustment.id as string));
  } else if (hasAdjustment) {
    const adjustment: PayrollRecord = {
      propertyId: '',
      employeeId: input.employeeId,
      date: input.weekStart,
      baseAmount: 0,
      ...amounts,
      status: 'Pending',
      paidAt: '',
      paidBy: '',
      batchId: weekBatchId,
    };
    ops.push((batch) => payrollService.batchCreate(batch, adjustment));
  }
  if (ops.length === 0) return;
  await commitOps(ops);
  logWeekChange(input.weekStart, input.employeeName,
    `Payroll ${describeWeek(input.weekStart)}: bonus ${money(input.bonus)}, discount ${money(input.discount)}.`, actor);
};

/** El descuento de una casa no puede dejar su pago en negativo. */
export const NEGATIVE_PAYMENT_ERROR = 'NEGATIVE_PROPERTY_PAYMENT';

/**
 * Edita el pago de una casa desde el detalle semanal (base, extra y descuento
 * con sus notas) sin salir de la pestaña. Solo esos campos: si alguien lo
 * marca pagado mientras tanto, el estado no se pisa. Un total negativo
 * (descuento mayor que base + extra) no se guarda: lanza NEGATIVE_PAYMENT_ERROR.
 */
export const updatePropertyPayment = async (
  record: PayrollRecord, changes: PropertyPaymentChanges, propertyLabel: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!record.id) return;
  const totalAmount = roundToCents(changes.baseAmount + changes.extraAmount - changes.discountAmount);
  if (totalAmount < 0) throw new Error(NEGATIVE_PAYMENT_ERROR);
  await payrollService.update(record.id, { ...changes, totalAmount });
  void logActivity({
    action: 'update', module: 'Payroll', user: actor, targetId: record.id, targetLabel: propertyLabel,
    detail: `House payment edited from the weekly payroll: ${money(getPayrollTotal(record))} → ${money(totalAmount)}.`,
  });
};

/** Carpeta de Storage de los comprobantes (la misma de los recibos de Hourly). */
const RECEIPTS_FOLDER = 'payroll_receipts';

const toSafeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, '_');

/**
 * Sube fotos del comprobante del pago semanal de un empleado (se comprimen
 * antes) y las agrega a su registro de la semana. Si no tiene, se crea uno con
 * montos en 0: no cambia ningún total, y la semana pagada o no lo ignora
 * (`isReceiptOnlyRecord`). Va Pending para que "Pay week" / "Mark week pending"
 * lo muevan junto con la semana sin dejarlo pagado con otra nómina.
 */
export const addWeekReceiptPhotos = async (
  row: WeeklyPayrollRow, weekStart: string, files: readonly File[], employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (files.length === 0) return;
  const preparedFiles = await Promise.all(files.map((file) => compressImage(file).catch(() => file)));
  const uploadStamp = Date.now();
  const tasks = preparedFiles.map((file, index) => ({
    file,
    fullPath: `${RECEIPTS_FOLDER}/${row.employeeId}/week_${weekStart}_${uploadStamp}_${index}_${toSafeFileName(file.name)}`,
  }));
  const urls = await uploadBatchWithProgress(tasks);
  const uploadedBy = fullName(actor);
  const photos: WeeklyReceiptPhoto[] = urls.map((url, index) => ({
    url, name: files[index].name, uploadedAt: todayIso(), uploadedBy,
  }));

  const weekRecord = getWeekRecord(row, weekStart);
  if (weekRecord?.id) {
    await commitOps([(batch) => payrollService.batchUpdate(batch, weekRecord.id as string, { receiptPhotos: arrayUnion(...photos) })]);
  } else {
    const weekHolder: PayrollRecord = {
      propertyId: '',
      employeeId: row.employeeId,
      date: weekStart,
      baseAmount: 0,
      extraAmount: 0,
      extraNote: '',
      discountAmount: 0,
      discountNote: '',
      totalAmount: 0,
      status: 'Pending',
      paidAt: '',
      paidBy: '',
      batchId: getWeekBatchId(weekStart),
      receiptPhotos: photos,
    };
    await commitOps([(batch) => payrollService.batchCreate(batch, weekHolder)]);
  }
  logWeekChange(weekStart, employeeName, `Payroll ${describeWeek(weekStart)}: ${photos.length} pay receipt photo(s) added.`, actor);
};

/**
 * Quita una foto del comprobante. El archivo se queda en Storage: las reglas
 * solo dejan borrar archivos a Quality Check y Task List.
 */
export const removeWeekReceiptPhoto = async (
  record: PayrollRecord, photo: WeeklyReceiptPhoto, weekStart: string, employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!record.id) return;
  await commitOps([(batch) => payrollService.batchUpdate(batch, record.id as string, { receiptPhotos: arrayRemove(photo) })]);
  logWeekChange(weekStart, employeeName, `Payroll ${describeWeek(weekStart)}: pay receipt photo "${photo.name}" removed.`, actor);
};
