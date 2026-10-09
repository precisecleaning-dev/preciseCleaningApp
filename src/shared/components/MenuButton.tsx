// src/shared/components/MenuButton.tsx
// ⭐ Botón de menú (abre/cierra el menú lateral) — UNO solo para toda la app.
//    Va siempre como primer hijo de `.view-header-title-group`, junto al
//    título de la vista: a la izquierda en computadora y a la derecha en el
//    teléfono (regla de index.css). Estilo: clase global `.hamburger-btn`.
//    No lo posiciones con `fixed` ni le pongas clases propias por vista: la
//    esquina superior derecha de la computadora es de TopRightActions.
import { Menu } from 'lucide-react';

interface MenuButtonProps {
  onClick?: () => void;
}

export default function MenuButton({ onClick }: MenuButtonProps) {
  if (!onClick) return null;
  return (
    <button type="button" className="hamburger-btn" onClick={onClick} aria-label="Open menu">
      <Menu size={24} />
    </button>
  );
}
