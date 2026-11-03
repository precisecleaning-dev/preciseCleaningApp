// src/features/invoices-new/clientStatementPdf.ts
// ============================================================================
// Estado de cuenta del cliente (Statement) en HTML para generatePDFBlob: marca
// de la empresa, datos del cliente, saldo pendiente y vencido, los invoices
// ENVIADOS sin pagar (Pending, Payment Link Sent, Overdue) y los pagos de los
// últimos 12 meses. Los borradores (Needs Invoice) NO van: el cliente todavía
// no los recibió. Todo texto libre pasa por escapeHtml.
// Mismas trampas de html2pdf que invoicePdf.ts: el <style> va dentro del
// <body> y todo cuelga de `.stmpdf`.
// ============================================================================
import type { ClientAccountPayment, Invoice, InvoiceClientSnapshot, YmdDate } from '../../types/index';
import type { Branding } from '../../utils/companyBranding';
import { brandingHeaderHTML } from '../../utils/companyBranding';
import { escapeHtml } from '../../utils/escapeHtml';
import { formatDate, formatDateForFile } from '../../utils/dateFormat';
import { formatCents } from './invoiceMath';
import { OUTSTANDING_STATUSES, getLateDays, isDeletedInvoice, isOverdue } from './invoiceStatus';
import { getClientContact, getClientPayments } from './clientAccount';

/** Filas por página: la primera lleva encabezado, cliente y resumen. */
const FIRST_PAGE_ROWS = 14;
const NEXT_PAGE_ROWS = 30;

/** Lo que muestra el estado de cuenta. */
export interface ClientStatementData {
  clientName: string;
  contact: InvoiceClientSnapshot | null;
  statementDate: YmdDate;
  /** Enviados y sin pagar, el vencimiento más viejo primero. */
  openInvoices: Invoice[];
  /** Pagos desde hace 12 meses, el más reciente primero. */
  recentPayments: ClientAccountPayment[];
  outstandingCents: number;
  overdueCents: number;
}

/** Misma fecha de hace un año ("2026-11-03" → "2025-11-03"). */
const oneYearBefore = (isoDate: YmdDate): YmdDate => `${Number(isoDate.slice(0, 4)) - 1}${isoDate.slice(4)}`;

/** Datos del estado de cuenta con TODOS los invoices del cliente. */
export const buildClientStatementData = (allInvoices: readonly Invoice[], clientName: string, today: YmdDate): ClientStatementData => {
  // Los de la papelera nunca salen en el estado de cuenta.
  const invoices = allInvoices.filter((invoice) => !isDeletedInvoice(invoice));
  const openInvoices = invoices
    .filter((invoice) => OUTSTANDING_STATUSES.includes(invoice.status))
    .sort((invoiceA, invoiceB) => invoiceA.dueDate.localeCompare(invoiceB.dueDate) || invoiceA.numberKey - invoiceB.numberKey);
  const paymentsSince = oneYearBefore(today);
  return {
    clientName,
    contact: getClientContact(invoices),
    statementDate: today,
    openInvoices,
    recentPayments: getClientPayments(invoices).filter(({ payment }) => payment.paidDate >= paymentsSince),
    outstandingCents: openInvoices.reduce((total, invoice) => total + invoice.totalCents, 0),
    overdueCents: openInvoices
      .filter((invoice) => isOverdue(invoice, today))
      .reduce((total, invoice) => total + invoice.totalCents, 0),
  };
};

/** Una fila del documento: un invoice sin pagar o un pago. */
type StatementRow = { kind: 'open'; invoice: Invoice } | { kind: 'payment'; payment: ClientAccountPayment };

/** Reparte las filas en páginas (la primera con menos lugar). */
const paginateRows = (rows: StatementRow[]): StatementRow[][] => {
  const pages: StatementRow[][] = [rows.slice(0, FIRST_PAGE_ROWS)];
  for (let rowIndex = FIRST_PAGE_ROWS; rowIndex < rows.length; rowIndex += NEXT_PAGE_ROWS) {
    pages.push(rows.slice(rowIndex, rowIndex + NEXT_PAGE_ROWS));
  }
  return pages;
};

const openInvoicesTableHtml = (invoices: Invoice[], today: YmdDate): string => {
  if (invoices.length === 0) return '';
  const rowsHtml = invoices.map((invoice) => {
    const lateDays = getLateDays(invoice, today);
    const lateText = lateDays > 0 ? `${lateDays} day${lateDays === 1 ? '' : 's'}` : '—';
    return `<tr${lateDays > 0 ? ' class="late"' : ''}>`
      + `<td>${escapeHtml(invoice.number)}</td>`
      + `<td>${escapeHtml([invoice.job.address, invoice.job.unit].filter(Boolean).join(' · '))}</td>`
      + `<td>${escapeHtml(formatDate(invoice.issueDate))}</td>`
      + `<td>${escapeHtml(formatDate(invoice.dueDate))}</td>`
      + `<td>${escapeHtml(lateText)}</td>`
      + `<td class="money">${escapeHtml(formatCents(invoice.totalCents))}</td></tr>`;
  }).join('');
  return `<h3>Open invoices</h3><table class="rows"><thead><tr><th>Invoice</th><th>Job</th><th>Issue date</th>`
    + `<th>Due date</th><th>Overdue</th><th class="money">Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
};

const paymentsTableHtml = (payments: ClientAccountPayment[]): string => {
  if (payments.length === 0) return '';
  const rowsHtml = payments.map(({ invoice, payment }) => `<tr>`
    + `<td>${escapeHtml(formatDate(payment.paidDate))}</td>`
    + `<td>${escapeHtml(invoice.number)}</td>`
    + `<td>${escapeHtml(payment.method)}</td>`
    + `<td>${escapeHtml(payment.reference || '—')}</td>`
    + `<td class="money">${escapeHtml(formatCents(payment.amountCents))}</td></tr>`).join('');
  return `<h3>Payments received (last 12 months)</h3><table class="rows"><thead><tr><th>Paid date</th><th>Invoice</th>`
    + `<th>Method</th><th>Reference</th><th class="money">Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
};

const pageRowsHtml = (pageRows: StatementRow[], today: YmdDate): string => {
  const openInvoices = pageRows.flatMap((row) => (row.kind === 'open' ? [row.invoice] : []));
  const payments = pageRows.flatMap((row) => (row.kind === 'payment' ? [row.payment] : []));
  return openInvoicesTableHtml(openInvoices, today) + paymentsTableHtml(payments);
};

const firstPageHeaderHtml = (data: ClientStatementData, branding: Branding): string => {
  const contactLines = [
    data.contact?.email, data.contact?.phone, data.contact?.address, data.contact?.cityStateZip,
  ].filter(Boolean) as string[];
  return `
    ${brandingHeaderHTML(branding, 'Statement')}
    <div class="title-row">
      <div>
        <div class="doc-title">Account statement</div>
        <div class="muted">${escapeHtml(`As of ${formatDate(data.statementDate)}`)}</div>
      </div>
      <div class="total-box">
        <div class="total-label">Balance due</div>
        <div class="total-value">${escapeHtml(formatCents(data.outstandingCents))}</div>
        <div class="total-sub">${escapeHtml(`Overdue ${formatCents(data.overdueCents)}`)}</div>
      </div>
    </div>
    <div class="party">
      <div class="muted">Bill to</div>
      <div class="party-name">${escapeHtml(data.clientName)}</div>
      ${contactLines.map((line) => `<div class="party-line">${escapeHtml(line)}</div>`).join('')}
    </div>`;
};

const EMPTY_STATEMENT_HTML = '<p class="empty">There are no open invoices or payments in the last 12 months.</p>';

const STATEMENT_STYLES = `
  .stmpdf, .stmpdf * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  .stmpdf { background: #ffffff; color: #0f172a; font-size: 12px; line-height: 1.4; width: 100%; }
  .stmpdf .page { padding: 4px 2px; }
  .stmpdf .page + .page { page-break-before: always; break-before: page; }
  .stmpdf h3 { font-size: 14px; margin: 22px 0 8px; color: #1e3a8a; }
  .stmpdf .muted { color: #64748b; font-size: 11px; }
  .stmpdf .title-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 22px; }
  .stmpdf .doc-title { font-size: 22px; font-weight: 800; line-height: 1.2; }
  .stmpdf .total-box { text-align: right; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 16px; }
  .stmpdf .total-label { font-size: 11px; color: #1e40af; font-weight: 700; text-transform: uppercase; }
  .stmpdf .total-value { font-size: 22px; font-weight: 800; color: #1e3a8a; }
  .stmpdf .total-sub { font-size: 11px; color: #b91c1c; font-weight: 700; }
  .stmpdf .party { border: 1px solid #e2e8f0; border-radius: 10px; margin-top: 18px; padding: 12px 14px; }
  .stmpdf .party-name { font-size: 14px; font-weight: 700; margin-top: 4px; }
  .stmpdf .party-line { color: #475569; margin-top: 2px; word-break: break-word; }
  .stmpdf table { width: 100%; border-collapse: collapse; }
  .stmpdf .rows th { text-align: left; font-size: 10px; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding: 6px 4px; }
  .stmpdf .rows td { border-bottom: 1px solid #e2e8f0; padding: 8px 4px; }
  .stmpdf .rows tr.late td { color: #b91c1c; }
  .stmpdf .money { text-align: right; white-space: nowrap; }
  .stmpdf .empty { color: #64748b; margin-top: 24px; }
  .stmpdf .continued { color: #64748b; font-size: 11px; margin-bottom: 8px; }
`;

/** Documento completo para generatePDFBlob. */
export const buildClientStatementDocument = (data: ClientStatementData, branding: Branding): string => {
  const rows: StatementRow[] = [
    ...data.openInvoices.map((invoice): StatementRow => ({ kind: 'open', invoice })),
    ...data.recentPayments.map((payment): StatementRow => ({ kind: 'payment', payment })),
  ];
  const pages = paginateRows(rows);
  const pagesHtml = pages.map((pageRows, pageIndex) => {
    const header = pageIndex === 0
      ? firstPageHeaderHtml(data, branding)
      : `<div class="continued">${escapeHtml(`${data.clientName} · statement (continued ${pageIndex} of ${pages.length - 1})`)}</div>`;
    const body = rows.length === 0 ? EMPTY_STATEMENT_HTML : pageRowsHtml(pageRows, data.statementDate);
    return `<div class="page">${header}${body}</div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(`Statement ${data.clientName}`)}</title></head>`
    + `<body style="margin:0;background:#ffffff;"><div class="stmpdf"><style>${STATEMENT_STYLES}</style>${pagesHtml}</div></body></html>`;
};

/** Nombre del archivo: Statement_Ana_Perez_11-03-2026.pdf. */
export const getClientStatementFileName = (clientName: string, statementDate: YmdDate): string => {
  const safeName = clientName.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Client';
  return `Statement_${safeName}_${formatDateForFile(statementDate)}.pdf`;
};
