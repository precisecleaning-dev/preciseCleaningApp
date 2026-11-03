// Pestañas del detalle del invoice y de la cuenta del cliente (patrón ARIA
// "tabs"): flechas izquierda/derecha, Home y End cambian de pestaña y mueven el
// foco; solo la pestaña activa entra en el orden de Tab. Se dibuja solo el
// panel activo, así que `aria-controls` va solo en la pestaña activa.
import { useRef, type KeyboardEvent } from 'react';
import { getTabId, getTabPanelId } from '../invoiceTabs';

export interface InvoiceTabItem<TabKey extends string> {
  key: TabKey;
  label: string;
}

interface InvoiceTabsProps<TabKey extends string> {
  tabs: InvoiceTabItem<TabKey>[];
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  /** Prefijo de los ids ("invoice-detail", "client-account"). */
  idPrefix: string;
  /** Nombre accesible de la lista de pestañas. */
  label: string;
  className?: string;
}

const InvoiceTabs = <TabKey extends string>({
  tabs, activeTab, onChange, idPrefix, label, className = '',
}: InvoiceTabsProps<TabKey>) => {
  const tabButtonsRef = useRef(new Map<TabKey, HTMLButtonElement>());

  // Guarda el botón de cada pestaña para mover el foco con las flechas.
  const registerTabButton = (tabKey: TabKey) => (tabButton: HTMLButtonElement | null) => {
    if (tabButton) tabButtonsRef.current.set(tabKey, tabButton);
    else tabButtonsRef.current.delete(tabKey);
  };

  const selectTabAt = (tabIndex: number) => {
    const nextTab = tabs[(tabIndex + tabs.length) % tabs.length];
    onChange(nextTab.key);
    tabButtonsRef.current.get(nextTab.key)?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = tabs.findIndex((tab) => tab.key === activeTab);
    const nextIndexByKey: Record<string, number> = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in nextIndexByKey)) return;
    event.preventDefault();
    selectTabAt(nextIndexByKey[event.key]);
  };

  return (
    <div className={`invdt-tabs ${className}`.trim()} role="tablist" aria-label={label} onKeyDown={handleTabKeyDown}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            ref={registerTabButton(tab.key)}
            type="button"
            role="tab"
            id={getTabId(idPrefix, tab.key)}
            aria-selected={isActive}
            aria-controls={isActive ? getTabPanelId(idPrefix, tab.key) : undefined}
            tabIndex={isActive ? 0 : -1}
            className={`invdt-tab${isActive ? ' active' : ''}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default InvoiceTabs;
