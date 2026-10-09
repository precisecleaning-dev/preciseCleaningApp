// src/features/houses/houseFieldConfig.ts
// Campos y botones de Houses que se pueden ocultar o dejar en solo lectura por
// rol (botón "Configure Fields"). Extraído de HousesView.tsx.

export type ConfigurableElement = { id: string; label: string; section: string };

export const CONFIGURABLE_FIELDS: ConfigurableElement[] = [
  { id: "client", label: "Client", section: "General Info" },
  { id: "address", label: "Address", section: "General Info" },
  { id: "unit", label: "Unit / Apto", section: "General Info" },
  { id: "receiveDate", label: "Receive Date", section: "Schedule" },
  { id: "scheduleDate", label: "Schedule Date", section: "Schedule" },
  { id: "dateOfIssue", label: "Date of Issue", section: "Schedule" },
  { id: "dueDate", label: "Due Date", section: "Schedule" },
  { id: "timeIn", label: "Time In", section: "Schedule" },
  { id: "timeOut", label: "Time Out", section: "Schedule" },
  { id: "serviceId", label: "Service", section: "Job Specs" },
  { id: "priorityId", label: "Priority", section: "Job Specs" },
  { id: "rooms", label: "Rooms", section: "Job Specs" },
  { id: "bathrooms", label: "Bathrooms", section: "Job Specs" },
  { id: "statusId", label: "Status", section: "Status & Assignment" },
  {
    id: "invoiceStatus",
    label: "Invoice Status",
    section: "Status & Assignment",
  },
  { id: "teamId", label: "Team", section: "Status & Assignment" },
  {
    id: "assignedWorkers",
    label: "Assigned Workers",
    section: "Status & Assignment",
  },
  { id: "note", label: "General Note", section: "Notes" },
  { id: "employeeNote", label: "Employee's Note", section: "Notes" },
  // ⭐ Notas de OFICINA: internas, no las ve el personal de campo.
  { id: "officeNote", label: "Office Notes", section: "Notes" },
  {
    id: "card_billedServices",
    label: "Billed Services (entire section)",
    section: "Sections",
  },
  {
    id: "card_payroll",
    label: "Payroll / Registered Payments (entire section)",
    section: "Sections",
  },
  { id: "card_photos", label: "Photos (entire section)", section: "Sections" },
  { id: "card_workLog", label: "Work Log (detail view)", section: "Sections" },
  {
    id: "card_damages",
    label: "Damages (botón y modal)",
    section: "Sections",
  },
  {
    id: "card_kpis",
    label: "Tarjetas del Dashboard (KPIs del Overview)",
    section: "Dashboard",
  },
];

export const CONFIGURABLE_BUTTONS: ConfigurableElement[] = [
  { id: "btn_sync", label: "Sync (Google Calendar)", section: "Workflow" },
  { id: "btn_startJob", label: "Start Job", section: "Workflow" },
  { id: "btn_markFinished", label: "Mark Finished", section: "Workflow" },
  { id: "btn_pay", label: "Pay", section: "Financial" },
  { id: "btn_duplicate", label: "Duplicate", section: "Admin" },
  { id: "btn_editDetails", label: "Edit Details", section: "Admin" },
  { id: "btn_deleteProperty", label: "Delete Property", section: "Admin" },
  { id: "btn_exportPdf", label: "Export PDF", section: "Media" },
  { id: "btn_uploadPhoto", label: "Upload Photo (Cargar)", section: "Media" },
  { id: "btn_takePhoto", label: "Take Photo (Cámara)", section: "Media" },
  {
    id: "btn_tabFinancials",
    label: "Financials & Billing Tab",
    section: "Tabs",
  },
  { id: "btn_tabMedia", label: "Notes & Photos Tab", section: "Tabs" },
  {
    id: "btn_myHistory",
    label: "Mi historial (casas asignadas)",
    section: "Header",
  },
  {
    id: "board_beforePhotos",
    label: "Before Photos (tarjeta del Pipeline)",
    section: "Pipeline",
  },
  {
    id: "board_afterPhotos",
    label: "After Photos (tarjeta del Pipeline)",
    section: "Pipeline",
  },
  {
    id: "card_checklist",
    label: "Checklist (botón y visor en el detalle)",
    section: "Sections",
  },
];

export type FormVisibilityConfig = {
  visibility: Record<string, string[]>;
  // ⭐ Roles para los que el CAMPO es de SOLO LECTURA (lo ven pero no lo editan).
  //    Solo aplica a los campos del formulario, no a botones/tabs.
  readOnly?: Record<string, string[]>;
};

export const DEFAULT_FORM_CONFIG: FormVisibilityConfig = {
  visibility: {},
  readOnly: {},
};
