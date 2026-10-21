// Nombre del cliente de un reporte de QC (tabla y tarjeta), con la marca
// "Recall" antes si la casa estuvo alguna vez en Recall.
import RecallMark from '../../../shared/components/RecallMark';

interface QcReportClientNameProps {
  clientName: string;
  wasInRecall: boolean;
}

const QcReportClientName = ({ clientName, wasInRecall }: QcReportClientNameProps) => (
  <div className="qcrs-client-name">
    {wasInRecall && <RecallMark />}
    {clientName}
  </div>
);

export default QcReportClientName;
