// Reportes de Quality Check ya FINALIZADOS: barra de periodo (fecha de la
// inspección) con las pestañas por estado actual de la casa y el buscador,
// tabla en escritorio o tarjetas en el teléfono (se dibuja solo una,
// useMediaQuery) y envío por WhatsApp, email o PDF. Desde aquí una casa solo
// se mueve a Quality Check, Recall o Invoice.
// SIN columnas de dinero: es para la manager de calidad, no para facturación.
// Lee la colección completa `qualityChecks` del store compartido: quien la monta
// paga esas lecturas (por eso Quality Check la abre solo bajo demanda).
import { useDeferredValue, useMemo, useState } from 'react';
import type { Property, QcReportRow, QcReportTab, Role, SystemUser } from '../../../types/index';
import { useLiveCollection, useLiveData } from '../../../shared/data/liveCollections';
import { isHiddenByWindow, useFullHistory } from '../../../shared/data/propertiesWindow';
import { useMediaQuery } from '../../../shared/hooks/useMediaQuery';
import { useStoredPeriod } from '../../../shared/hooks/useStoredPeriod';
import PeriodBar from '../../../components/PeriodBar';
import { inPeriod, periodRange } from '../../../utils/periods';
import { displayClientName } from '../../../utils/customerDocs';
import { getRelationName } from '../../../utils/relations';
import ShareReportSheet from '../../../components/ShareReportSheet';
import StatusChangeModal from '../../../components/StatusChangeModal';
import type { QCPdfPlace, QCPdfTask } from '../../../utils/qcReportPdf';
import { useQcReportActions } from '../hooks/useQcReportActions';
import { getReportNotes, getReportScore, getReportTab, getReportTimeMs } from '../qcReports';
import QcReportCard from './QcReportCard';
import QcReportFilters from './QcReportFilters';
import QcReportSendButtons from './QcReportSendButtons';
import QcReportStatusPill from './QcReportStatusPill';
import QcReportTableRow from './QcReportTableRow';
import QcReportsTable from './QcReportsTable';
import './QcReportsSection.css';

interface QcReportsSectionProps {
  properties: Property[];
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
}

/** Por debajo de este ancho la tabla (980 px) se cambia por tarjetas. */
const REPORT_CARDS_QUERY = '(max-width: 900px)';

const QcReportsSection = ({ properties, currentUser, activeRole, isSuperAdmin = false }: QcReportsSectionProps) => {
  const { data: qualityCheckDocs, loaded: areReportsLoaded } = useLiveCollection('qualityChecks');
  const allReports = qualityCheckDocs as unknown as QcReportRow[];
  const customers = useLiveData('customers');
  const statuses = useLiveData('statuses');
  const teams = useLiveData('teams');
  const places: QCPdfPlace[] = useLiveData('places');
  const tasks: QCPdfTask[] = useLiveData('tasks');
  const isCardLayout = useMediaQuery(REPORT_CARDS_QUERY);

  const [searchText, setSearchText] = useState('');
  // La caja responde al instante; el filtro de la tabla va un paso atrás.
  const deferredSearchText = useDeferredValue(searchText);
  // Periodo por la fecha de la inspección (se recuerda por navegador).
  const [reportsPeriod, setReportsPeriod] = useStoredPeriod('pc.qc.reports.period', 'month');
  const reportsPeriodRange = useMemo(() => periodRange(reportsPeriod), [reportsPeriod]);
  const [selectedTab, setSelectedTab] = useState<QcReportTab>('quality_check');

  // Cambiar el status de la casa: mismo permiso que Invoices (módulo "Quality Check").
  const canChangePropertyStatus = isSuperAdmin
    || !!activeRole?.permissions?.find((permission) => permission.module === 'Quality Check')?.canEdit;

  // Nombres con las utilidades del proyecto: un cliente borrado sale como
  // "Cliente eliminado · xxxx" (nunca el id crudo) y el equipo se resuelve por
  // id o nombre, sin mayúsculas ni espacios de más.
  const getClientName = (clientIdOrName?: string): string => displayClientName(customers, clientIdOrName);
  const getTeamName = (teamId?: string | null): string => getRelationName(teams, teamId, 'Unassigned');

  const propertiesById = useMemo(() => new Map(properties.map((property) => [property.id, property] as const)), [properties]);
  const getPropertyForReport = (report: QcReportRow): Property | undefined => propertiesById.get(report.houseId);
  const getReportTeamName = (report: QcReportRow): string =>
    report.team || getTeamName(getPropertyForReport(report)?.teamId);

  const reportActions = useQcReportActions({
    statuses, places, tasks, currentUser, getClientName, getTeamName, getPropertyForReport,
  });

  // Solo FINALIZADOS, del más reciente al más viejo. Con la ventana de 12 meses,
  // un reporte viejo cuya casa no se cargó es historial oculto, no una casa borrada.
  const hasFullHistory = useFullHistory();
  const loadedPropertyIds = useMemo(() => new Set(properties.map((property) => property.id)), [properties]);
  const finishedReports = useMemo(() => allReports
    .filter((report) => report.status === 'Finished')
    .filter((report) => !isHiddenByWindow(hasFullHistory, loadedPropertyIds.has(report.houseId), getReportTimeMs(report)))
    .sort((firstReport, secondReport) => getReportTimeMs(secondReport) - getReportTimeMs(firstReport)),
  [allReports, hasFullHistory, loadedPropertyIds]);

  const tabByReportId = useMemo(
    () => new Map(finishedReports.map((report) => [report.id, getReportTab(propertiesById.get(report.houseId), statuses)] as const)),
    [finishedReports, propertiesById, statuses],
  );

  const reportCountByTab = useMemo(() => {
    const countByTab: Record<QcReportTab, number> = { quality_check: 0, invoice: 0, recall: 0 };
    tabByReportId.forEach((reportTab) => { countByTab[reportTab] += 1; });
    return countByTab;
  }, [tabByReportId]);

  const normalizedSearchText = deferredSearchText.trim().toLowerCase();
  const visibleReports = finishedReports.filter((report) => {
    if (tabByReportId.get(report.id) !== selectedTab) return false;
    if (!inPeriod(report.date, reportsPeriodRange)) return false;
    if (!normalizedSearchText) return true;
    return [getClientName(report.client), report.address, report.inspector, report.team, report.date]
      .some((searchableValue) => String(searchableValue ?? '').toLowerCase().includes(normalizedSearchText));
  });

  const emptyMessage = (() => {
    if (!areReportsLoaded) return 'Cargando reportes de calidad...';
    if (isCardLayout && visibleReports.length === 0) return 'No hay reportes para mostrar con estos filtros.';
    if (finishedReports.length === 0) {
      return 'Todavía no hay inspecciones finalizadas. Al terminar una inspección en Quality Check aparecerá aquí.';
    }
    if (visibleReports.length === 0) {
      return 'Ningún reporte en esta pestaña coincide con los filtros. Limpia la búsqueda o revisa las otras pestañas.';
    }
    return null;
  })();

  const renderSendButtons = (report: QcReportRow, layout: 'icons' | 'full') => (
    <QcReportSendButtons
      report={report}
      layout={layout}
      companyEmail={reportActions.branding.email ?? ''}
      isSharing={reportActions.sharingReportId === report.id}
      isSendingEmail={reportActions.sendingEmailReportId === report.id}
      isExporting={reportActions.exportingReportId === report.id}
      onShareWhatsApp={reportActions.handleShareWhatsApp}
      onSendEmail={reportActions.handleSendEmail}
      onExportPdf={reportActions.handleExportPdf}
    />
  );

  const renderStatusPill = (report: QcReportRow) => (
    <QcReportStatusPill
      house={getPropertyForReport(report)}
      statuses={statuses}
      isDisabled={reportActions.isSavingStatus || !canChangePropertyStatus}
      onChangeStatus={(house) => reportActions.openStatusModal(report, house)}
    />
  );

  return (
    <>
      <div className="qcrs-period">
        <PeriodBar period={reportsPeriod} onChange={setReportsPeriod}>
          <QcReportFilters
            selectedTab={selectedTab}
            reportCountByTab={reportCountByTab}
            searchText={searchText}
            onSelectTab={setSelectedTab}
            onSearchTextChange={setSearchText}
          />
        </PeriodBar>
      </div>

      {isCardLayout ? (
        <div className="qcrs-cards-wrap">
          {emptyMessage !== null && <div className="qcrs-card-empty">{emptyMessage}</div>}
          {emptyMessage === null && visibleReports.map((report) => (
            <QcReportCard
              key={report.id}
              report={report}
              clientName={getClientName(report.client)}
              teamName={getReportTeamName(report)}
              notes={getReportNotes(report)}
              score={getReportScore(report, tasks)}
              sendButtons={renderSendButtons(report, 'full')}
              statusPill={renderStatusPill(report)}
            />
          ))}
        </div>
      ) : (
        <QcReportsTable emptyMessage={emptyMessage}>
          {visibleReports.map((report) => (
            <QcReportTableRow
              key={report.id}
              report={report}
              clientName={getClientName(report.client)}
              teamName={getReportTeamName(report)}
              notes={getReportNotes(report)}
              score={getReportScore(report, tasks)}
              sendButtons={renderSendButtons(report, 'icons')}
              statusPill={renderStatusPill(report)}
            />
          ))}
        </QcReportsTable>
      )}

      {reportActions.preparedShare && (
        <ShareReportSheet
          prepared={reportActions.preparedShare}
          clientName={reportActions.shareClientName}
          onClose={reportActions.closeShare}
        />
      )}

      {reportActions.statusModal && (
        <StatusChangeModal
          config={reportActions.statusModal}
          statuses={reportActions.allowedStatuses}
          note='Desde los reportes de calidad una casa solo puede moverse a "Quality Check", "Recall" o "Invoice".'
          onClose={reportActions.closeStatusModal}
        />
      )}
    </>
  );
};

export default QcReportsSection;
