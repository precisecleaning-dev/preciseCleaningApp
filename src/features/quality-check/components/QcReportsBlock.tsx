// Bloque "Quality Check Reports" de Quality Check, debajo de Recall: se abre y
// se cierra con su encabezado. La sección (y la colección completa de
// reportes) se monta SOLO al abrirlo: quien solo inspecciona no paga esas
// lecturas. Se ve con el permiso "Quality Check Reports" de Roles.
import { useState } from 'react';
import { ChevronDown, ChevronRight, FileBarChart } from 'lucide-react';
import type { Property, Role, SystemUser } from '../../../types/index';
import QcReportsSection from './QcReportsSection';
import './QcReportsBlock.css';

interface QcReportsBlockProps {
  properties: Property[];
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  /** Abre el detalle de la casa al tocar un reporte. */
  onOpenHouseDetail?: (house: Property) => void;
}

const QcReportsBlock = ({ properties, currentUser, activeRole, isSuperAdmin, onOpenHouseDetail }: QcReportsBlockProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="qcv-house-block reports" aria-label="Quality Check Reports">
      <button
        type="button"
        className="qcv-house-block-header qcv-reports-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        <span className="qcv-house-block-icon reports">
          <FileBarChart size={19} />
        </span>
        <span className="qcv-reports-toggle-text">
          <span className="qcv-house-block-title reports">Quality Check Reports</span>
          <span className="qcv-house-block-sub">Inspecciones finalizadas · WhatsApp, email y PDF</span>
        </span>
        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {isOpen && (
        <QcReportsSection
          properties={properties}
          currentUser={currentUser}
          activeRole={activeRole}
          isSuperAdmin={isSuperAdmin}
          onOpenHouseDetail={onOpenHouseDetail}
        />
      )}
    </section>
  );
};

export default QcReportsBlock;
