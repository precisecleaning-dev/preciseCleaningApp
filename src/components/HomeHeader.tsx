// ⭐ Encabezado de las vistas Owner y Manager: marca, saludo, fecha y el
//    selector Owner / Manager (solo si el rol puede ver las dos vistas).
import { Menu } from 'lucide-react';

export type HomeTab = 'owner' | 'manager';

interface HomeHeaderProps {
  title: string;
  subtitle: string;
  active: HomeTab;
  /** Pestañas que el rol puede abrir; con menos de 2 no se dibuja el selector. */
  available: HomeTab[];
  onSwitch: (tab: HomeTab) => void;
  onOpenMenu: () => void;
}

const LABEL: Record<HomeTab, string> = { owner: 'Owner', manager: 'Manager' };

export default function HomeHeader({ title, subtitle, active, available, onSwitch, onOpenMenu }: HomeHeaderProps) {
  return (
    <header className="hm-header">
      <div className="hm-header-left">
        <button type="button" className="hamburger-btn hm-menu" aria-label="Open menu" onClick={onOpenMenu}>
          <Menu size={24} />
        </button>
        <div className="hm-header-text">
          <p className="hm-eyebrow">Precise Cleaning</p>
          <h1 className="hm-title">{title}</h1>
          <p className="hm-subtitle">{subtitle}</p>
        </div>
      </div>
      {available.length > 1 && (
        <div className="hm-switch" role="tablist" aria-label="Vista">
          {available.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active === t}
              className={`hm-switch-btn${active === t ? ' on' : ''}`}
              onClick={() => onSwitch(t)}
            >
              {LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
