// src/features/payroll/services/hourlyPayService.ts
// Guarda un pago por horas: sube el recibo (si hay) y crea el pago en `payroll`
// sin casa (propertyId vacío), con payType 'hourly', horas, rate y total.
import type { SystemUser } from '../../../types/index';
import { payrollService } from '../../../services/payrollService';
import { logActivity } from '../../../services/activityLogService';
import { compressImage } from '../../../utils/imageCompression';
import { uploadBatchWithProgress } from '../../../utils/photoUploader';
import { formatDate } from '../../../utils/dateFormat';
import { money } from '../../../utils/jobFinancials';
import { calcHourlyTotal } from '../hourlyPay';

/** Carpeta de Storage de los recibos: payroll_receipts/{empleado}/{hora}_{archivo}. */
const RECEIPTS_FOLDER = 'payroll_receipts';

export interface HourlyPaymentInput {
  employeeId: string;
  employeeName: string;
  /** Fecha de pago, AAAA-MM-DD. */
  date: string;
  hours: number;
  hourlyRate: number;
  receiptFile: File | null;
}

const toSafeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, '_');

/** Sube el recibo (una imagen se comprime antes; un PDF va tal cual) y devuelve su URL. */
const uploadReceipt = async (employeeId: string, receiptFile: File): Promise<string> => {
  const fileToUpload = await compressImage(receiptFile);
  const fullPath = `${RECEIPTS_FOLDER}/${employeeId}/${Date.now()}_${toSafeFileName(fileToUpload.name)}`;
  const [receiptUrl] = await uploadBatchWithProgress([{ file: fileToUpload, fullPath }]);
  return receiptUrl;
};

export const createHourlyPayment = async (payment: HourlyPaymentInput, actor?: SystemUser | null): Promise<void> => {
  const receiptUrl = payment.receiptFile ? await uploadReceipt(payment.employeeId, payment.receiptFile) : '';
  const totalAmount = calcHourlyTotal(payment.hours, payment.hourlyRate);
  const paymentId = await payrollService.create({
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
  void logActivity({
    action: 'create',
    module: 'Payroll',
    user: actor,
    targetId: paymentId,
    targetLabel: payment.employeeName,
    detail: `Hourly payment: ${payment.hours} h × ${money(payment.hourlyRate)} = ${money(totalAmount)} (${formatDate(payment.date)}).`,
  });
};
