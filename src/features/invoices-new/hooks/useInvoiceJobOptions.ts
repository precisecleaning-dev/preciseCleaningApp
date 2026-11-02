// src/features/invoices-new/hooks/useInvoiceJobOptions.ts
// ============================================================================
// Jobs que ofrece el selector de Create Invoice (decisión de Omar): primero
// los que están en el status "Invoice" del Pipeline; con `showAllJobs`, todos
// los de la ventana de 12 meses de App.tsx. Cada opción muestra dirección,
// unidad, cliente y fecha del servicio para distinguir jobs de la misma casa.
// ============================================================================
import { useMemo } from 'react';
import type { Customer, Property, Status } from '../../../types/index';
import { isInvoiceStatus } from '../../../utils/invoiceEntry';
import { customerNameIndex, displayClientNameIn } from '../../../utils/customerDocs';
import { dateSortValue, formatDate } from '../../../utils/dateFormat';

/** Opción del selector (SearchableSelect busca en `name`). */
export interface InvoiceJobOption {
  id: string;
  name: string;
}

const buildJobLabel = (property: Property, clientName: string): string => {
  const address = [property.address, property.unit].filter(Boolean).join(' · ');
  const serviceDate = property.scheduleDate ? formatDate(property.scheduleDate) : 'No date';
  return `${address} — ${clientName} — ${serviceDate}`;
};

export function useInvoiceJobOptions(
  properties: Property[],
  statuses: Status[],
  customers: Customer[],
  showAllJobs: boolean,
  /** Job ya elegido (al editar): siempre está en la lista aunque cambie de status. */
  selectedPropertyId: string,
): InvoiceJobOption[] {
  return useMemo(() => {
    const clientNames = customerNameIndex(customers);
    const shownJobs = properties
      .filter((property) => showAllJobs || property.id === selectedPropertyId || isInvoiceStatus(statuses, property.statusId))
      .sort((jobA, jobB) => dateSortValue(jobB.scheduleDate) - dateSortValue(jobA.scheduleDate));
    return shownJobs.map((property) => ({
      id: property.id,
      name: buildJobLabel(property, displayClientNameIn(clientNames, property.client)),
    }));
  }, [properties, statuses, customers, showAllJobs, selectedPropertyId]);
}
