// ⭐ Rejilla de indicadores (Overview e Invoices).
//    TODOS los cuadros miden exactamente lo mismo: una sola rejilla con columnas
//    iguales para todos los grupos (Operations, Quality check, Financials…).
//    Los textos NUNCA se cortan: la etiqueta puede ocupar dos líneas y el
//    número usa un tamaño fluido que siempre cabe.
//    · Escritorio ancho: un grupo junto al otro, cada título sobre sus cuadros.
//    · Pantallas medianas / móvil: cada grupo en su propia fila.
import type { CSSProperties } from 'react';
import './KpiGrid.css';

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  sub: string;
  /** Color del número (estados finitos del diseño). */
  tone?: 'good' | 'warn' | 'bad';
  /** Cuadro resaltado (fondo suave). */
  highlight?: 'good' | 'bad';
  active?: boolean;
  onClick?: () => void;
  title?: string;
}

export interface KpiGroup {
  key: string;
  title: string;
  /** Color del título del grupo. */
  color: string;
  tiles: KpiTile[];
}

interface KpiGridProps {
  groups: KpiGroup[];
  label: string;
}

export default function KpiGrid({ groups, label }: KpiGridProps) {
  const total = groups.reduce((n, g) => n + g.tiles.length, 0);
  const maxInGroup = Math.max(...groups.map((g) => g.tiles.length));
  // Columnas en pantallas medianas: el grupo más grande en una fila (hasta 4);
  // con 5 o más, 3 por fila para que los montos quepan completos.
  const midCols = maxInGroup <= 4 ? maxInGroup : 3;
  return (
    <section className="kg-wrap" aria-label={label}>
    <div className="kg-grid" style={{ '--kg-cols': total, '--kg-mid-cols': midCols } as CSSProperties}>
      {groups.map((g, gi) => (
        <div
          key={`h-${g.key}`}
          className="kg-head"
          style={{ '--kg-span': g.tiles.length, '--kg-color': g.color, '--kg-group': gi } as CSSProperties}
        >
          {g.title}
        </div>
      ))}
      {groups.map((g) =>
        g.tiles.map((t) => {
          const cls =
            `kg-tile${t.highlight ? ` hl-${t.highlight}` : ''}` +
            `${t.active ? ' active' : ''}${t.onClick ? ' clickable' : ''}`;
          const body = (
            <>
              <span className="kg-label">{t.label}</span>
              <span className={`kg-value${t.tone ? ` ${t.tone}` : ''}`}>{t.value}</span>
              <span className="kg-sub">{t.sub}</span>
            </>
          );
          const order = { '--kg-group': groups.indexOf(g) } as CSSProperties;
          return t.onClick ? (
            <button
              key={`${g.key}-${t.key}`}
              type="button"
              className={cls}
              style={order}
              onClick={t.onClick}
              title={t.title}
              aria-pressed={!!t.active}
            >
              {body}
            </button>
          ) : (
            <div key={`${g.key}-${t.key}`} className={cls} style={order} title={t.title}>
              {body}
            </div>
          );
        }),
      )}
    </div>
    </section>
  );
}
