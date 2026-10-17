// src/features/quality-check/hooks/useQcReportActions.ts
// ============================================================================
// Acciones de la tabla de reportes de Quality Check (antes en
// QCReportsTableView, sin cambios de lógica):
//   · PDF del reporte · envío por email (real, colección `mail`) ·
//     WhatsApp (prepara el PDF; el envío lo dispara ShareReportSheet)
//   · cambio de status de la casa, limitado a Quality Check · Recall · Invoice,
//     con su status_history y el reporte alineado (syncQCRecordWithStatus).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import type { Property, QcReportRow, Status, SystemUser } from '../../../types/index';
import { getCompanySettings } from '../../../services/companyService';
import { changeHouseStatus, houseLogLabel } from '../../houses/services/houseStatus';
import { exportQCReportPDF, type QCPdfBranding, type QCPdfPlace, type QCPdfTask } from '../../../utils/qcReportPdf';
import { formatDate } from '../../../utils/dateFormat';
import { mailResultMessage, sendMailAndConfirm } from '../../../utils/sendMail';
import { prepareQCShare, type PreparedQCShare } from '../../../utils/shareQCReport';
import { qcReportsAllowedStatuses } from '../../../utils/statusFilters';
import { syncQCRecordWithStatus } from '../../../utils/qcRecordSync';
import type { StatusModalConfig } from '../../../components/StatusChangeModal';
import { getReportScore } from '../qcReports';

interface QcReportActionsInput {
  statuses: Status[];
  places: QCPdfPlace[];
  tasks: QCPdfTask[];
  currentUser?: SystemUser | null;
  getClientName: (clientIdOrName?: string) => string;
  getTeamName: (teamId?: string | null) => string;
  getPropertyForReport: (report: QcReportRow) => Property | undefined;
}

export function useQcReportActions({
  statuses, places, tasks, currentUser, getClientName, getTeamName, getPropertyForReport,
}: QcReportActionsInput) {
  const [branding, setBranding] = useState<QCPdfBranding>({ name: 'Precise Cleaning' });
  const [exportingReportId, setExportingReportId] = useState<string | null>(null);
  const [sharingReportId, setSharingReportId] = useState<string | null>(null);
  const [sendingEmailReportId, setSendingEmailReportId] = useState<string | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);
  const [preparedShare, setPreparedShare] = useState<PreparedQCShare | null>(null);
  const [shareClientName, setShareClientName] = useState('');

  useEffect(() => {
    let isMounted = true;
    const loadBranding = async () => {
      try {
        const company = await getCompanySettings();
        if (isMounted) {
          setBranding({ name: company.name || 'Precise Cleaning', address: company.address || '', logo: company.logo || '', email: company.email || '' });
        }
      } catch {
        /* branding por defecto */
      }
    };
    void loadBranding();
    return () => { isMounted = false; };
  }, []);

  // Estados a los que se puede mover una casa desde los reportes (ver statusFilters.ts).
  const allowedStatuses = useMemo(() => qcReportsAllowedStatuses(statuses), [statuses]);

  const handleStatusChange = async (house: Property, newStatusId: string) => {
    // Doble candado: el modal ya solo ofrece los permitidos.
    if (!allowedStatuses.some((status) => status.id === newStatusId)) {
      alert('Desde esta vista una casa solo puede moverse a "Quality Check", "Recall" o "Invoice".');
      return;
    }
    setIsSavingStatus(true);
    try {
      // Casa + status_history en un batch (todo o nada) y bitácora después.
      await changeHouseStatus(house, newStatusId, {
        statuses,
        actor: currentUser,
        source: 'qc_reports',
        module: 'Quality Check',
        label: houseLogLabel(getClientName(house.client), house.address),
      });
      // El reporte se alinea con el nuevo estado de la casa (src/utils/qcRecordSync.ts).
      await syncQCRecordWithStatus(house.id, statuses, newStatusId);
    } catch (error) {
      console.error('Error cambiando el estado:', error);
      alert('No se pudo cambiar el estado de la casa.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const openStatusModal = (report: QcReportRow, house: Property) => setStatusModal({
    currentId: house.statusId || '',
    onSelect: (newStatusId: string) => handleStatusChange(house, newStatusId),
    title: getClientName(report.client),
    subtitle: report.address,
  });

  // Lo que el PDF necesita de un reporte (exportar, email y WhatsApp).
  const getPdfInput = (report: QcReportRow) => ({
    house: { address: report.address || '' },
    clientName: getClientName(report.client),
    teamName: report.team || getTeamName(getPropertyForReport(report)?.teamId) || '—',
    qcData: report.qcData || {},
    inspectorName: report.inspector || 'Unknown',
    recordDate: report.date,
    places,
    tasks,
    branding,
  });

  const handleExportPdf = async (report: QcReportRow) => {
    setExportingReportId(report.id);
    try {
      await exportQCReportPDF(getPdfInput(report));
    } catch (error) {
      console.error('Error generando el PDF:', error);
      alert('No se pudo generar el PDF del reporte.');
    } finally {
      setExportingReportId(null);
    }
  };

  // Envío REAL (colección `mail` + extensión Trigger Email), siempre al email de la empresa.
  const handleSendEmail = async (report: QcReportRow) => {
    const companyEmail = branding.email;
    if (!companyEmail) {
      alert('No hay un email de empresa configurado.\n\nVe a la sección "Empresa" y captura el correo para poder enviar reportes.');
      return;
    }
    const clientName = getClientName(report.client);
    if (!window.confirm(`¿Enviar el reporte de ${clientName} a ${companyEmail}?`)) return;

    setSendingEmailReportId(report.id);
    try {
      const reportHtml = await exportQCReportPDF({ ...getPdfInput(report), returnHtml: true });
      if (!reportHtml || typeof reportHtml !== 'string') {
        alert('Este reporte no tiene datos para enviar (sin tareas, notas ni fotos).');
        return;
      }
      const subject = `Quality Check Report - ${clientName} (${formatDate(report.date)})`;
      // sendMailAndConfirm espera la confirmación real de la extensión (src/utils/sendMail.ts).
      const mailResult = await sendMailAndConfirm(companyEmail, subject, reportHtml);
      alert(mailResultMessage(mailResult, companyEmail));
    } catch (error) {
      console.error('Error enviando el reporte por email:', error);
      alert('No se pudo enviar el reporte por email. Revisa la consola.');
    } finally {
      setSendingEmailReportId(null);
    }
  };

  // WhatsApp: solo se PREPARA el PDF; el envío lo dispara el segundo toque en
  // ShareReportSheet (iOS exige un gesto fresco para navigator.share).
  const handleShareWhatsApp = async (report: QcReportRow) => {
    setSharingReportId(report.id);
    try {
      const reportHtml = await exportQCReportPDF({ ...getPdfInput(report), returnHtml: true });
      if (!reportHtml || typeof reportHtml !== 'string') {
        alert('Este reporte no tiene datos para enviar.');
        return;
      }
      const reportScore = getReportScore(report, tasks);
      const clientName = getClientName(report.client);
      const prepared = await prepareQCShare(reportHtml, {
        clientName,
        address: report.address || '',
        date: report.date,
        inspectorName: report.inspector || 'Unknown',
        teamName: report.team || getTeamName(getPropertyForReport(report)?.teamId),
        passRate: reportScore.hasData ? reportScore.passRate : null,
        failed: report.result === 'failed',
      });
      setShareClientName(clientName);
      setPreparedShare(prepared);
    } catch (error) {
      console.error('Error preparando el reporte:', error);
      alert('No se pudo generar el PDF del reporte.');
    } finally {
      setSharingReportId(null);
    }
  };

  return {
    branding,
    allowedStatuses,
    exportingReportId,
    sharingReportId,
    sendingEmailReportId,
    isSavingStatus,
    statusModal,
    preparedShare,
    shareClientName,
    openStatusModal,
    closeStatusModal: () => setStatusModal(null),
    closeShare: () => setPreparedShare(null),
    handleExportPdf,
    handleSendEmail,
    handleShareWhatsApp,
  };
}
