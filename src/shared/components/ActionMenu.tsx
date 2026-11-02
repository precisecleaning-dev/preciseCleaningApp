// src/shared/components/ActionMenu.tsx
// Menú de acciones de una fila (botón "⋯"). Se dibuja en un portal con
// posición fija, porque dentro de una tabla con scroll horizontal quedaría
// recortado. Se cierra al elegir una acción, con Escape, con un clic afuera o
// al hacer scroll; el foco vuelve al botón. Flechas, Home y End recorren las
// acciones.
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import './ActionMenu.css';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

interface ActionMenuProps {
  /** Nombre accesible del botón ("Actions for INV-2026-0001"). */
  label: string;
  items: ActionMenuItem[];
}

const MENU_WIDTH = 200;
const VIEWPORT_MARGIN = 8;

const ActionMenu = ({ label, items }: ActionMenuProps) => {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const isOpen = position !== null;

  const closeMenu = () => {
    setPosition(null);
    triggerRef.current?.focus();
  };

  const handleToggle = () => {
    if (isOpen) {
      setPosition(null);
      return;
    }
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, triggerRect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    );
    setPosition({ top: triggerRect.bottom + 4, left });
  };

  const handleSelect = (item: ActionMenuItem) => {
    closeMenu();
    item.onSelect();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const focusedIndex = menuItems.findIndex((menuItem) => menuItem === document.activeElement);
    const lastIndex = menuItems.length - 1;
    const nextIndexByKey: Record<string, number> = {
      ArrowDown: focusedIndex >= lastIndex ? 0 : focusedIndex + 1,
      ArrowUp: focusedIndex <= 0 ? lastIndex : focusedIndex - 1,
      Home: 0,
      End: lastIndex,
    };
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key in nextIndexByKey) {
      event.preventDefault();
      menuItems[nextIndexByKey[event.key]]?.focus();
    }
  };

  // Al abrir, el foco va a la primera acción.
  useEffect(() => {
    if (isOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [isOpen]);

  // Un clic afuera cierra el menú.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setPosition(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // Scroll o cambio de tamaño: la posición fija ya no corresponde al botón.
  useEffect(() => {
    if (!isOpen) return;
    const handleViewportChange = () => setPosition(null);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`acm-trigger${isOpen ? ' active' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={handleToggle}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {position && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="acm-menu"
          role="menu"
          aria-label={label}
          style={{ left: position.left, top: position.top, width: MENU_WIDTH }}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) => (
            <button key={item.key} type="button" role="menuitem" className="acm-item" onClick={() => handleSelect(item)}>
              <item.icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};

export default ActionMenu;
