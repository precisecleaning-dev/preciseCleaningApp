// src/features/invoices-new/invoiceTabs.ts
// Ids de las pestañas (components/InvoiceTabs.tsx) y de su panel: la pestaña y
// el panel usan los mismos, así `aria-controls` / `aria-labelledby` coinciden.

export const getTabId = (idPrefix: string, tabKey: string) => `${idPrefix}-tab-${tabKey}`;
export const getTabPanelId = (idPrefix: string, tabKey: string) => `${idPrefix}-panel-${tabKey}`;

/** Atributos del panel de la pestaña activa. */
export const getTabPanelProps = (idPrefix: string, activeTab: string) => ({
  role: 'tabpanel' as const,
  id: getTabPanelId(idPrefix, activeTab),
  'aria-labelledby': getTabId(idPrefix, activeTab),
});
