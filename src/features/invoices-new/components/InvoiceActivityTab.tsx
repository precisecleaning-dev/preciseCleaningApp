// Detalle · Activity: creación, cambios, notas, fotos, envíos y pagos, del más
// reciente al más viejo. Se lee al abrir la pestaña.
import type { InvoiceEvent } from '../../../types/index';
import { formatDateTime } from '../../../utils/dateFormat';
import { useInvoiceEvents } from '../hooks/useInvoiceEvents';

interface InvoiceActivityTabProps {
  invoiceId: string;
}

/** Texto de los campos que cambiaron: "Due date: 11/17/2026 → 11/30/2026". */
const describeChanges = (event: InvoiceEvent): string =>
  event.changes.map((change) => `${change.field}: ${change.before || '—'} → ${change.after || '—'}`).join(' · ');

const InvoiceActivityTab = ({ invoiceId }: InvoiceActivityTabProps) => {
  const { events, isLoading, hasError } = useInvoiceEvents(invoiceId);

  if (isLoading) {
    return (
      <div className="invdt-activity-loading" aria-hidden="true">
        <span className="skel-line skel-row-main" />
        <span className="skel-line skel-row-main" />
      </div>
    );
  }
  if (hasError) return <p className="invf-error" role="alert">Could not load the activity. Check your connection and try again.</p>;
  if (events.length === 0) return <p className="invdt-secondary">No activity yet.</p>;

  return (
    <ol className="invdt-activity">
      {events.map((invoiceEvent) => (
        <li key={invoiceEvent.id} className="invdt-activity-item">
          <strong className="invdt-activity-summary">{invoiceEvent.summary}</strong>
          {invoiceEvent.changes.length > 0 && <span className="invdt-secondary">{describeChanges(invoiceEvent)}</span>}
          <span className="invdt-secondary">{`${invoiceEvent.actorUserName} · ${formatDateTime(invoiceEvent.at)}`}</span>
        </li>
      ))}
    </ol>
  );
};

export default InvoiceActivityTab;
