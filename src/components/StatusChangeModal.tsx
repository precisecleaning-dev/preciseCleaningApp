import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Activity, X, CheckCircle } from 'lucide-react';
import type { Status } from '../types/index';
import './StatusChangeModal.css';

// Configuración que un chip/pastilla de estado envía al abrir el modal central de selección.
export type StatusModalConfig = {
  currentId: string;
  onSelect: (id: string) => void;
  title?: string;
  subtitle?: string;
};

interface StatusChangeModalProps {
  config: StatusModalConfig;
  statuses: Status[];
  onClose: () => void;
}

// Modal central de selección de estado, compartido entre PipelineBoardView y HousesView
// (antes duplicado casi idéntico en ambos). Se elige un estado (queda resaltado) y se
// confirma con "Aceptar".
export default function StatusChangeModal({ config, statuses, onClose }: StatusChangeModalProps) {
  const cur = String(config.currentId || '').toLowerCase().trim();
  const resolveCurrentId = () => {
    const match = statuses.find(st => String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur);
    return match ? match.id : (config.currentId || '');
  };
  const [selectedId, setSelectedId] = useState<string>(resolveCurrentId());

  // Reinicia la selección al estado actual cada vez que se abre para otro elemento.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedId(resolveCurrentId()); }, [config]);

  const selectedIsCurrent = (() => {
    const sel = statuses.find(st => st.id === selectedId);
    const selName = String(sel?.name || '').toLowerCase().trim();
    return String(selectedId).toLowerCase().trim() === cur || (selName !== '' && selName === cur);
  })();

  const handleAccept = () => {
    if (selectedId && !selectedIsCurrent) config.onSelect(selectedId);
    onClose();
  };

  return (
    <div className="scm-overlay" onClick={onClose}>
      <div className="scm-card" onClick={e => e.stopPropagation()}>
        <div className="scm-head">
          <div className="scm-head-info">
            <div className="scm-icon">
              <Activity size={20} color="#2563eb" />
            </div>
            <div className="scm-min-w-0">
              <h3 className="scm-title">Cambiar estado</h3>
              {config.title && (
                <p className="scm-subtitle">
                  {config.title}{config.subtitle ? ` · ${config.subtitle}` : ''}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="scm-close-btn">
            <X size={22} />
          </button>
        </div>

        <div className="scm-grid">
          {statuses.length === 0 ? (
            <div className="scm-empty">No hay estados configurados.</div>
          ) : statuses.map(st => {
            const isCurrent = String(st.id).toLowerCase().trim() === cur || String(st.name).toLowerCase().trim() === cur;
            const isSelected = st.id === selectedId;
            return (
              <button
                key={st.id}
                onClick={() => setSelectedId(st.id)}
                className={`scm-option${isSelected ? ' selected' : ''}`}
              >
                <span
                  className="scm-option-dot"
                  style={{ '--dot-color': st.color, '--dot-shadow': `${st.color}1f` } as CSSProperties}
                />
                <span className="scm-option-name">{st.name}</span>
                {isCurrent && !isSelected && (
                  <span className="scm-option-badge">Actual</span>
                )}
                {isSelected && <CheckCircle size={18} color="#2563eb" className="scm-shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="scm-foot">
          <button onClick={onClose} className="scm-btn-secondary">Cancelar</button>
          <button onClick={handleAccept} disabled={selectedIsCurrent} className="scm-btn-primary">
            <CheckCircle size={16} /> Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
