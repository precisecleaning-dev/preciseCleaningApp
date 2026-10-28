// Pestaña "Quality check" del detalle de la casa: todas las inspecciones de
// ESTA casa (terminadas y en curso), de la más reciente a la más vieja. Escucha
// solo los reportes de la casa (useQcForHouses), no la colección completa. El
// PDF de un reporte sale de useQcReportActions, el mismo de Quality Check Reports.
import { ClipboardCheck } from 'lucide-react';
import type { Place, Property, QcReportRow } from '../../../types/index';
import { useLiveData } from '../../../shared/data/liveCollections';
import { displayClientName } from '../../../utils/customerDocs';
import type { QCPdfTask } from '../../../utils/qcReportPdf';
import { getRelationName } from '../../../utils/relations';
import { useQcReportActions } from '../hooks/useQcReportActions';
import { getReportAreas, getReportScore, getReportTimeMs } from '../qcReports';
import { useQcForHouses } from '../useQcForHouses';
import HouseQcReportItem from './HouseQcReportItem';
import './HouseQcHistory.css';

interface HouseQcHistoryProps {
  house: Property;
}

const HouseQcHistory = ({ house }: HouseQcHistoryProps) => {
  const { data: houseReports, loaded: areReportsLoaded, error: reportsError } = useQcForHouses<QcReportRow>([house.id]);
  const places: Place[] = useLiveData('places');
  const tasks: QCPdfTask[] = useLiveData('tasks');
  const statuses = useLiveData('statuses');
  const customers = useLiveData('customers');
  const teams = useLiveData('teams');
  // Mismos nombres que en Quality Check Reports: cliente borrado sin id crudo y
  // el equipo de la casa si el reporte no lo trae.
  const reportActions = useQcReportActions({
    statuses,
    places,
    tasks,
    getClientName: (clientIdOrName) => displayClientName(customers, clientIdOrName),
    getTeamName: (teamId) => getRelationName(teams, teamId, 'Unassigned'),
    getPropertyForReport: () => house,
  });

  const reportsByNewest = [...houseReports]
    .sort((firstReport, secondReport) => getReportTimeMs(secondReport) - getReportTimeMs(firstReport));
  // Si la lectura falló se dice, en vez de "cargando" para siempre o "sin inspecciones".
  const areReportsShown = areReportsLoaded && reportsError === null;

  return (
    <div className="hqc-panel">
      <div className="hqc-header">
        <ClipboardCheck size={14} /> Quality Check
        {areReportsShown && <span className="hqc-header-count">{reportsByNewest.length}</span>}
      </div>

      {!areReportsLoaded && (
        <div className="hqc-loading">
          <div className="skel-line skel-row-main" />
          <div className="skel-line skel-row-main" />
        </div>
      )}
      {reportsError !== null && (
        <div className="hqc-error" role="alert">
          Could not load the Quality Check inspections. Check your connection and try again.
        </div>
      )}
      {areReportsShown && reportsByNewest.length === 0 && (
        <div className="hqc-empty">This house has no Quality Check inspections yet.</div>
      )}
      {areReportsShown && reportsByNewest.length > 0 && (
        <ul className="hqc-reports">
          {reportsByNewest.map((report) => (
            <HouseQcReportItem
              key={report.id}
              report={report}
              areas={getReportAreas(report, places, tasks)}
              score={getReportScore(report, tasks)}
              isExportingPdf={reportActions.exportingReportId === report.id}
              onExportPdf={reportActions.handleExportPdf}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default HouseQcHistory;
