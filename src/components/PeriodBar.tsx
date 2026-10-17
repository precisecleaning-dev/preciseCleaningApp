// ⭐ Barra de periodo del diseño "Unified Jobs View": ← [Semana 41 · Oct 5 –
//    Oct 11, 2026] → · Today · Show: Day Week Month Year Custom.
//    La comparten el Overview, Invoices, QC Dashboard, Quality Check (casas y
//    reportes), Payroll y Nóminas. Debajo puede llevar la fila de filtros de
//    cada pantalla (`children`: buscador, pestañas…); con `allowedKinds` se
//    limita a ciertos periodos (Nóminas: solo Week).
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PERIOD_KINDS, periodRange, shiftPeriod, todayIso, type PeriodKind, type PeriodState,
} from '../utils/periods';
import DateInput from '../shared/components/DateInput';
import './PeriodBar.css';

interface PeriodBarProps {
  period: PeriodState;
  onChange: (p: PeriodState) => void;
  /** Controles extra a la derecha (p. ej. el botón Filters). */
  extra?: ReactNode;
  /** Periodos que se pueden elegir (por defecto todos). Con uno solo no se
   *  muestra el selector "Show". */
  allowedKinds?: PeriodKind[];
  /** Fila de filtros de la pantalla, debajo de la barra (buscador, pestañas…). */
  children?: ReactNode;
}

const PeriodBar = ({ period, onChange, extra, allowedKinds, children }: PeriodBarProps) => {
  const range = periodRange(period);
  const isCustom = period.kind === 'custom';
  const selectablePeriodKinds = allowedKinds
    ? PERIOD_KINDS.filter((periodKind) => allowedKinds.includes(periodKind.id))
    : PERIOD_KINDS;
  const showPeriodKindSelector = selectablePeriodKinds.length > 1;
  // "Today" vuelve a hoy; desde Custom pasa a Week (o al primer periodo permitido).
  const defaultPeriodKind = selectablePeriodKinds.some((periodKind) => periodKind.id === 'week')
    ? 'week'
    : selectablePeriodKinds[0]?.id ?? 'week';
  const todayPeriodKind = isCustom ? defaultPeriodKind : period.kind;

  const handleSelectPeriodKind = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    onChange({ ...period, kind, anchor: todayIso() });
  };

  return (
    <section className="pb-bar" aria-label="Periodo">
      <div className="pb-nav">
        <button
          type="button"
          className="pb-iconbtn"
          aria-label="Previous period"
          disabled={isCustom}
          onClick={() => onChange(shiftPeriod(period, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        {/* Espacio de ANCHO FIJO: el título (o las fechas de Custom) nunca
            empuja ni mueve los demás controles de la barra. */}
        <div className="pb-title">
          {isCustom ? (
            <div className="pb-custom">
              <label className="pb-field">
                <span className="pb-name">Start</span>
                <DateInput
                  className="pb-date"
                  value={period.customStart}
                  onChange={(iso) => onChange({ ...period, customStart: iso })}
                />
              </label>
              <label className="pb-field">
                <span className="pb-name">End</span>
                <DateInput
                  className="pb-date"
                  value={period.customEnd}
                  onChange={(iso) => onChange({ ...period, customEnd: iso })}
                />
              </label>
            </div>
          ) : (
            <>
              <span className="pb-name">{range.name}</span>
              <span className="pb-label">{range.label}</span>
            </>
          )}
        </div>
        <button
          type="button"
          className="pb-iconbtn"
          aria-label="Next period"
          disabled={isCustom}
          onClick={() => onChange(shiftPeriod(period, 1))}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="pb-chip"
          onClick={() => onChange({ ...period, kind: todayPeriodKind, anchor: todayIso() })}
        >
          Today
        </button>
      </div>

      <div className="pb-right">
        {showPeriodKindSelector && <span className="pb-name">Show</span>}
        {showPeriodKindSelector && (
          <div className="pb-seg" role="radiogroup" aria-label="Periodo">
            {selectablePeriodKinds.map((periodKind) => (
              <button
                key={periodKind.id}
                type="button"
                role="radio"
                aria-checked={period.kind === periodKind.id}
                className={`pb-seg-btn${period.kind === periodKind.id ? ' on' : ''}`}
                onClick={() => handleSelectPeriodKind(periodKind.id)}
              >
                {periodKind.label}
              </button>
            ))}
          </div>
        )}
        {extra}
      </div>
      {children && <div className="pb-filters">{children}</div>}
    </section>
  );
};

export default PeriodBar;
