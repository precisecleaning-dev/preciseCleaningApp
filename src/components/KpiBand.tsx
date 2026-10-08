// ⭐ Banda de indicadores del diseño "Unified Jobs View": una etiqueta de
//    sección (Operations, Quality check…) y una rejilla de tiles.
import type { CSSProperties } from 'react';
import './KpiBand.css';

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  sub?: string;
  /** Color del número (good/warn/bad) — estados finitos del diseño. */
  tone?: 'good' | 'warn' | 'bad';
  /** Tile resaltado (fondo de alerta suave). */
  highlight?: 'bad' | 'warn' | 'good';
  active?: boolean;
  onClick?: () => void;
  title?: string;
}

interface KpiBandProps {
  title: string;
  /** Color de la etiqueta de la sección (de datos o del diseño). */
  color: string;
  tiles: KpiTile[];
  /** Ancho mínimo de cada tile en px. */
  minTile?: number;
  /** Peso flexible de la banda dentro de la fila. */
  grow?: 'wide' | 'narrow';
}

export default function KpiBand({ title, color, tiles, minTile = 150, grow = 'wide' }: KpiBandProps) {
  return (
    <section className={`kb-band ${grow}`} aria-label={title}>
      <p className="kb-title" style={{ '--kb-color': color } as CSSProperties}>{title}</p>
      <div className="kb-grid" style={{ '--kb-min': `${minTile}px` } as CSSProperties}>
        {tiles.map((t) => {
          const cls = `kb-tile${t.highlight ? ` hl-${t.highlight}` : ''}${t.active ? ' active' : ''}${t.onClick ? ' clickable' : ''}`;
          const body = (
            <>
              <span className="kb-label">{t.label}</span>
              <span className={`kb-value${t.tone ? ` ${t.tone}` : ''}`}>{t.value}</span>
              {t.sub && <span className="kb-sub">{t.sub}</span>}
            </>
          );
          return t.onClick ? (
            <button key={t.key} type="button" className={cls} onClick={t.onClick} title={t.title} aria-pressed={!!t.active}>
              {body}
            </button>
          ) : (
            <div key={t.key} className={cls} title={t.title}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
