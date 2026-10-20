// Pestaña "Quality check" del detalle de la casa: todas las inspecciones de
// ESTA casa (terminadas y en curso), de la más reciente a la más vieja. Escucha
// solo los reportes de la casa (useQcForHouses), no la colección completa.
import { ClipboardCheck } from 'lucide-react';
import type { Place, QcReportRow } from '../../../types/index';
import { useLiveData } from '../../../shared/data/liveCollections';
import type { QCPdfTask } from '../../../utils/qcReportPdf';
import { getReportAreas, getReportScore, getReportTimeMs } from '../qcReports';
import { useQcForHouses } from '../useQcForHouses';
import HouseQcReportItem from './HouseQcReportItem';
import './HouseQcHistory.css';

interface HouseQcHistoryProps {
  houseId: string;
}

const HouseQcHistory = ({ houseId }: HouseQcHistoryProps) => {
  const { data: houseReports, loaded: areReportsLoaded } = useQcForHouses<QcReportRow>([houseId]);
  const places: Place[] = useLiveData('places');
  const tasks: QCPdfTask[] = useLiveData('tasks');

  const reportsByNewest = [...houseReports]
    .sort((firstReport, secondReport) => getReportTimeMs(secondReport) - getReportTimeMs(firstReport));

  return (
    <div className="hqc-panel">
      <div className="hqc-header">
        <ClipboardCheck size={14} /> Quality Check
        {areReportsLoaded && <span className="hqc-header-count">{reportsByNewest.length}</span>}
      </div>

      {!areReportsLoaded && (
        <div className="hqc-loading">
          <div className="skel-line skel-row-main" />
          <div className="skel-line skel-row-main" />
        </div>
      )}
      {areReportsLoaded && reportsByNewest.length === 0 && (
        <div className="hqc-empty">Esta casa todavía no tiene inspecciones de Quality Check.</div>
      )}
      {areReportsLoaded && reportsByNewest.length > 0 && (
        <ul className="hqc-reports">
          {reportsByNewest.map((report) => (
            <HouseQcReportItem
              key={report.id}
              report={report}
              areas={getReportAreas(report, places, tasks)}
              score={getReportScore(report, tasks)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

export default HouseQcHistory;
