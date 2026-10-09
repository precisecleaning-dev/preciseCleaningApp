// ⭐ Barra de periodo del diseño "Unified Jobs View": ← [Semana 41 · Oct 5 –
//    Oct 11, 2026] → · Today · Show: Day Week Month Year Custom.
//    La comparten el Overview e Invoices.
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
}

export default function PeriodBar({ period, onChange, extra }: PeriodBarProps) {
  const range = periodRange(period);
  const isCustom = period.kind === 'custom';

  const pick = (kind: PeriodKind) => {
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
          onClick={() => onChange({ ...period, kind: isCustom ? 'week' : period.kind, anchor: todayIso() })}
        >
          Today
        </button>
      </div>

      <div className="pb-right">
        <span className="pb-name">Show</span>
        <div className="pb-seg" role="radiogroup" aria-label="Periodo">
          {PERIOD_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={period.kind === k.id}
              className={`pb-seg-btn${period.kind === k.id ? ' on' : ''}`}
              onClick={() => pick(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
        {extra}
      </div>
    </section>
  );
}
