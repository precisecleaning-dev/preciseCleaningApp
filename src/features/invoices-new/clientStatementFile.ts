// src/features/invoices-new/clientStatementFile.ts
// ============================================================================
// Descarga el estado de cuenta del cliente en PDF (Download statement de la
// cuenta del cliente). El HTML lo arma clientStatementPdf.ts.
// ============================================================================
import type { Invoice, YmdDate } from '../../types/index';
import { getBranding } from '../../utils/companyBranding';
import { generatePDFBlob } from '../../utils/pdfGenerator';
import { downloadBlob } from '../../shared/utils/downloadFile';
import { buildClientStatementData, buildClientStatementDocument, getClientStatementFileName } from './clientStatementPdf';

/** Arma el PDF con TODOS los invoices del cliente y lo descarga. Lanza un error si no se pudo. */
export const downloadClientStatement = async (invoices: readonly Invoice[], clientName: string, today: YmdDate): Promise<void> => {
  const branding = await getBranding();
  const statementData = buildClientStatementData(invoices, clientName, today);
  const fileName = getClientStatementFileName(clientName, today);
  const blob = await generatePDFBlob(buildClientStatementDocument(statementData, branding), { filename: fileName, format: 'a4' });
  downloadBlob(blob, fileName);
};
