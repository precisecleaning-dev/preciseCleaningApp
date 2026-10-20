// Marca "Recall" antes del nombre del cliente: la casa estuvo alguna vez en
// Recall (regla wasHouseInRecall de utils/jobRecall.ts). Usa la etiqueta del
// Overview (.ujt-recall de UnifiedJobsTable.css) para verse igual en toda la app.
import { RotateCcw } from 'lucide-react';
import './RecallMark.css';

const RecallMark = () => (
  <span className="recall-mark ujt-recall" title="Esta casa estuvo en Recall">
    <RotateCcw size={11} /> Recall
  </span>
);

export default RecallMark;
