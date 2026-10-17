// Píldora con el nombre de un equipo pintada con su color (inicio del gerente).
// Sin nombre no dibuja nada. Estilos: .hm-team en views/HomeViews.css.
import type { CSSProperties } from 'react';

interface TeamPillProps {
  name: string;
  color: string;
}

const TeamPill = ({ name, color }: TeamPillProps) => {
  if (!name) return null;
  return <span className="hm-team" style={{ '--team-color': color } as CSSProperties}>{name}</span>;
};

export default TeamPill;
