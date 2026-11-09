// Servicios que cobra el invoice: los del job (billing_services, los mismos de
// "Services" en el formulario de la casa), de solo lectura. El precio se
// corrige en el job. Al editar un invoice sin pagar, "Refresh from job" vuelve
// a traer los servicios actuales del job y avisa si cambiaron.
import { RefreshCw } from 'lucide-react';
import type { InvoiceLineItem } from '../../../types/index';
import { bpsToPercent, formatCents } from '../invoiceMath';

/** Texto de la columna Tax de una línea. */
const getLineTaxText = (lineItem: InvoiceLineItem): string => {
  if (lineItem.taxMode === 'added') return `+${formatCents(lineItem.taxCents)} (${bpsToPercent(lineItem.taxRateBps)}%)`;
  if (lineItem.taxMode === 'subtracted') return `Deducted (${bpsToPercent(lineItem.taxRateBps)}%)`;
  return '—';
};

interface InvoiceServicesListProps {
  /** null = los servicios del job todavía no llegan. */
  lineItems: InvoiceLineItem[] | null;
  hasJob: boolean;
  error?: string;
  /** Al editar sin pagar, con el job cargado: se puede traer lo del job. */
  canRefresh: boolean;
  /** Los servicios del job ya no son los del invoice. */
  hasJobChanges: boolean;
  /** Ya se trajeron del job: se guardan al guardar el invoice. */
  isRefreshed: boolean;
  onRefresh: () => void;
}

const InvoiceServicesList = ({
  lineItems, hasJob, error, canRefresh, hasJobChanges, isRefreshed, onRefresh,
}: InvoiceServicesListProps) => {
  if (!hasJob) return <p className="invf-help">Select a job to load the services it charges.</p>;
  if (lineItems === null) {
    return (
      <div className="invf-services-loading" aria-hidden="true">
        <span className="skel-line skel-row-main" />
        <span className="skel-line skel-row-main" />
      </div>
    );
  }

  return (
    <div className="invf-services">
      {lineItems.length > 0 && (
        <div className="invf-services-scroll">
          <table className="invf-services-table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col" className="invf-services-number">Qty</th>
                <th scope="col" className="invf-services-number">Unit price</th>
                <th scope="col">Tax</th>
                <th scope="col" className="invf-services-number">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((lineItem) => (
                <tr key={lineItem.billingServiceId || lineItem.serviceName}>
                  <td>
                    <span className="invf-services-name">{lineItem.serviceName}</span>
                    {lineItem.notes && <span className="invf-services-notes">{lineItem.notes}</span>}
                  </td>
                  <td className="invf-services-number">{lineItem.quantity}</td>
                  <td className="invf-services-number">{formatCents(lineItem.unitPriceCents)}</td>
                  <td>{getLineTaxText(lineItem)}</td>
                  <td className="invf-services-number">{formatCents(lineItem.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="invf-error" role="alert">{error}</p>}
      {lineItems.length > 0 && !error && (
        <p className="invf-help">Amounts come from the services of the job. To change a price, edit the service in the job.</p>
      )}
      {hasJobChanges && !isRefreshed && (
        <p className="invf-warning" role="status">The services of the job changed since this invoice was created.</p>
      )}
      {isRefreshed && <p className="invf-help" role="status">Services loaded from the job. They are saved when you save the invoice.</p>}
      {canRefresh && (
        <button type="button" className="invf-text-btn invf-services-refresh" onClick={onRefresh}>
          <RefreshCw size={16} aria-hidden="true" /> Refresh from job
        </button>
      )}
    </div>
  );
};

export default InvoiceServicesList;
