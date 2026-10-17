// ⭐ Barra de periodo del diseño "Unified Jobs View": ← [Semana 41 · Oct 5 –
//    Oct 11, 2026] → · Today · Show: Day Week Month Year Custom.
//    La comparten el Overview, Invoices, QC Dashboard, Quality Check (casas y
//    reportes), Payroll y Nóminas. Debajo puede llevar la fila de filtros de
//    cada pantalla (`children`: buscador, pestañas…); con `allowedKinds` se
//    limita a ciertos periodos (Nóminas: solo Week).
import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  PERIOD_KINDS, periodRange, shiftPeriod, todayIso, type PeriodKind, type PeriodState,
} from '../utils/periods';
import DateInput from '../shared/components/DateInput';
import './PeriodBar.css';

interface PeriodBarProps {
  period: PeriodState;
  onChange: (nextPeriod: PeriodState) => void;
  /** Controles a la derecha de la barra (p. ej. el botón Filters). */
  trailingActions?: ReactNode;
  /** Periodos que se pueden elegir (por defecto todos; una lista vacía cuenta
   *  como todos). Con uno solo no se muestra el selector "Show". */
  allowedKinds?: PeriodKind[];
  /** Fila de filtros de la pantalla, debajo de la barra (buscador, pestañas…). */
  children?: ReactNode;
}

/** Periodo al que lleva "Today" cuando el actual no sirve (Custom o no
 *  permitido): Week si se puede; si no, el primero que tenga "hoy" (no Custom).
 *  null = solo se permite Custom y "Today" no tiene a dónde ir. */
const getFallbackPeriodKind = (selectablePeriodKinds: typeof PERIOD_KINDS): PeriodKind | null => {
  if (selectablePeriodKinds.some((periodKindOption) => periodKindOption.id === 'week')) return 'week';
  return selectablePeriodKinds.find((periodKindOption) => periodKindOption.id !== 'custom')?.id ?? null;
};

const PeriodBar = ({ period, onChange, trailingActions, allowedKinds, children }: PeriodBarProps) => {
  const range = periodRange(period);
  const isCustomPeriod = period.kind === 'custom';
  const allowedPeriodKinds = allowedKinds?.length
    ? PERIOD_KINDS.filter((periodKindOption) => allowedKinds.includes(periodKindOption.id))
    : [];
  const selectablePeriodKinds = allowedPeriodKinds.length > 0 ? allowedPeriodKinds : PERIOD_KINDS;
  const hasPeriodKindSelector = selectablePeriodKinds.length > 1;
  const isPeriodKindAllowed = selectablePeriodKinds.some((periodKindOption) => periodKindOption.id === period.kind);
  // "Today" vuelve a hoy en el mismo periodo; desde Custom, o si el periodo que
  // llegó por props no está permitido, pasa al de respaldo (Week si se puede).
  const fallbackPeriodKind = getFallbackPeriodKind(selectablePeriodKinds);
  const todayPeriodKind = isPeriodKindAllowed && !isCustomPeriod ? period.kind : fallbackPeriodKind;

  // Aviso en desarrollo: la pantalla pasó un periodo que la barra no permite.
  useEffect(() => {
    if (import.meta.env.DEV && !isPeriodKindAllowed) {
      console.warn(`PeriodBar: el periodo "${period.kind}" no está en allowedKinds; "Today" lo lleva a "${fallbackPeriodKind}".`);
    }
  }, [isPeriodKindAllowed, period.kind, fallbackPeriodKind]);

  const handleSelectPeriodKind = (periodKind: PeriodKind) => {
    if (periodKind === period.kind) return;
    onChange({ ...period, kind: periodKind, anchor: todayIso() });
  };

  const handleGoToToday = () => {
    if (todayPeriodKind) onChange({ ...period, kind: todayPeriodKind, anchor: todayIso() });
  };

  return (
    <section className="pb-bar" aria-label="Periodo">
      <div className="pb-nav">
        <button
          type="button"
          className="pb-iconbtn"
          aria-label="Previous period"
          disabled={isCustomPeriod}
          onClick={() => onChange(shiftPeriod(period, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        {/* Espacio de ANCHO FIJO: el título (o las fechas de Custom) nunca
            empuja ni mueve los demás controles de la barra. */}
        <div className="pb-title">
          {isCustomPeriod ? (
            <div className="pb-custom">
              <label className="pb-field">
                <span className="pb-name">Start</span>
                <DateInput
                  className="pb-date"
                  value={period.customStart}
                  onChange={(isoDate) => onChange({ ...period, customStart: isoDate })}
                />
              </label>
              <label className="pb-field">
                <span className="pb-name">End</span>
                <DateInput
                  className="pb-date"
                  value={period.customEnd}
                  onChange={(isoDate) => onChange({ ...period, customEnd: isoDate })}
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
          disabled={isCustomPeriod}
          onClick={() => onChange(shiftPeriod(period, 1))}
        >
          <ChevronRight size={16} />
        </button>
        {/* Solo Custom permitido: no hay un periodo de "hoy" al que ir. */}
        {todayPeriodKind && (
          <button
            type="button"
            className="pb-chip"
            onClick={handleGoToToday}
          >
            Today
          </button>
        )}
      </div>

      <div className="pb-right">
        {hasPeriodKindSelector && <span className="pb-name">Show</span>}
        {hasPeriodKindSelector && (
          <div className="pb-seg" role="radiogroup" aria-label="Periodo">
            {selectablePeriodKinds.map((periodKindOption) => (
              <button
                key={periodKindOption.id}
                type="button"
                role="radio"
                aria-checked={period.kind === periodKindOption.id}
                className={`pb-seg-btn${period.kind === periodKindOption.id ? ' selected' : ''}`}
                onClick={() => handleSelectPeriodKind(periodKindOption.id)}
              >
                {periodKindOption.label}
              </button>
            ))}
          </div>
        )}
        {trailingActions}
      </div>
      {children && <div className="pb-filters">{children}</div>}
    </section>
  );
};

export default PeriodBar;
