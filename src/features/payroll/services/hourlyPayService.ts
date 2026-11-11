// src/features/payroll/services/hourlyPayService.ts
// Guarda un pago por horas: sube el recibo (si hay) y crea el pago en `payroll`
// sin casa (propertyId vacío), con payType 'hourly', horas, rate y total.
// También lo edita y lo borra (con su recibo de Storage).
import type { HourlyPaymentChanges, HourlyPaymentInput, PayrollRecord, SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { storageService } from '../../../services/storageService';
import { logActivity } from '../../../services/activityLogService';
import { compressImage } from '../../../utils/imageCompression';
import { uploadBatchWithProgress } from '../../../utils/photoUploader';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { computeHourlyTotal } from '../hourlyPay';

/** Carpeta de Storage de los recibos: payroll_receipts/{empleado}/{hora}_{archivo}. */
const RECEIPTS_FOLDER = 'payroll_receipts';

const toSafeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, '_');

/** Sube el recibo (una imagen se comprime antes; un PDF va tal cual) y devuelve su URL. */
const uploadReceipt = async (employeeId: string, receiptFile: File): Promise<string> => {
  const fileToUpload = await compressImage(receiptFile);
  const fullPath = `${RECEIPTS_FOLDER}/${employeeId}/${Date.now()}_${toSafeFileName(fileToUpload.name)}`;
  const [receiptUrl] = await uploadBatchWithProgress([{ file: fileToUpload, fullPath }]);
  return receiptUrl;
};

/** Si el pago no se pudo guardar, el recibo recién subido se borra (si no, queda huérfano en Storage). */
const discardUploadedReceipt = async (receiptUrl: string) => {
  if (!receiptUrl) return;
  try {
    await storageService.deletePhotoByUrl(receiptUrl);
  } catch (error) {
    console.error('Could not delete the unused receipt:', error);
  }
};

export const createHourlyPayment = async (payment: HourlyPaymentInput, actor?: SystemUser | null): Promise<void> => {
  const receiptUrl = payment.receiptFile ? await uploadReceipt(payment.employeeId, payment.receiptFile) : '';
  const totalAmount = computeHourlyTotal(payment.hours, payment.hourlyRate);
  let paymentId: string;
  try {
    paymentId = await payrollService.create({
      propertyId: '',
      employeeId: payment.employeeId,
      date: payment.date,
      baseAmount: totalAmount,
      extraAmount: 0,
      extraNote: '',
      discountAmount: 0,
      discountNote: '',
      totalAmount,
      status: 'Pending',
      payType: 'hourly',
      hours: payment.hours,
      hourlyRate: payment.hourlyRate,
      receiptUrl,
      receiptFileName: payment.receiptFile?.name ?? '',
    });
  } catch (error) {
    await discardUploadedReceipt(receiptUrl);
    throw error;
  }
  void logActivity({
    action: 'create',
    module: 'Payroll',
    user: actor,
    targetId: paymentId,
    targetLabel: payment.employeeName,
    detail: `Hourly payment: ${payment.hours} h × ${money(payment.hourlyRate)} = ${money(totalAmount)} (${formatDate(payment.date)}).`,
  });
};

/** Recibo que queda en el pago: el nuevo (se sube), el actual o ninguno. */
const resolveReceipt = async (payment: PayrollRecord, changes: HourlyPaymentChanges) => {
  if (changes.receiptFile) {
    return {
      receiptUrl: await uploadReceipt(changes.employeeId, changes.receiptFile),
      receiptFileName: changes.receiptFile.name,
    };
  }
  if (changes.shouldKeepCurrentReceipt) {
    return { receiptUrl: payment.receiptUrl ?? '', receiptFileName: payment.receiptFileName ?? '' };
  }
  return { receiptUrl: '', receiptFileName: '' };
};

/** Edita un pago por horas. No cambia su estado (Pending / Paid). */
export const updateHourlyPayment = async (
  payment: PayrollRecord, changes: HourlyPaymentChanges, actor?: SystemUser | null,
): Promise<void> => {
  if (!payment.id) return;
  const totalAmount = computeHourlyTotal(changes.hours, changes.hourlyRate);
  const receipt = await resolveReceipt(payment, changes);
  const uploadedReceiptUrl = changes.receiptFile ? receipt.receiptUrl : '';
  try {
    await payrollService.update(payment.id, {
      employeeId: changes.employeeId,
      date: changes.date,
      hours: changes.hours,
      hourlyRate: changes.hourlyRate,
      baseAmount: totalAmount,
      totalAmount,
      ...receipt,
    });
  } catch (error) {
    await discardUploadedReceipt(uploadedReceiptUrl);
    throw error;
  }
  // El recibo anterior se borra de Storage solo después de guardar (si falla, se queda).
  if (payment.receiptUrl && payment.receiptUrl !== receipt.receiptUrl) {
    void storageService.deletePhotoByUrl(payment.receiptUrl);
  }
  void logActivity({
    action: 'update',
    module: 'Payroll',
    user: actor,
    targetId: payment.id,
    targetLabel: changes.employeeName,
    detail: `Hourly payment edited: ${changes.hours} h × ${money(changes.hourlyRate)} = ${money(totalAmount)} (${formatDate(changes.date)}).`,
  });
};

/** Borra un pago por horas y su recibo de Storage. */
export const deleteHourlyPayment = async (
  payment: PayrollRecord, employeeName: string, actor?: SystemUser | null,
): Promise<void> => {
  if (!payment.id) return;
  await payrollService.delete(payment.id);
  if (payment.receiptUrl) void storageService.deletePhotoByUrl(payment.receiptUrl);
  void logActivity({
    action: 'delete',
    module: 'Payroll',
    user: actor,
    targetId: payment.id,
    targetLabel: employeeName,
    detail: `Hourly payment deleted: ${payment.hours ?? 0} h × ${money(payment.hourlyRate ?? 0)} = ${money(payment.totalAmount)} (${formatDate(payment.date)}).`,
  });
};
