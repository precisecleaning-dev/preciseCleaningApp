// Pantalla final de Mark as Paid, Send invoice y Delete en bloque: cuántos se
// hicieron y la lista de los que fallaron o se saltaron (con el motivo). El foco
// va a "Done" al aparecer (el botón que lo tenía ya no existe).
import { useEffect, useRef } from 'react';
import type { InvoiceBulkResult } from '../../../types/index';
import { describeBulkResult } from '../invoiceBulk';
import InvoiceDialog from './InvoiceDialog';
import InvoiceBulkIssueList from './InvoiceBulkIssueList';
import './InvoiceBulkDialog.css';

interface InvoiceBulkResultViewProps {
  title: string;
  /** "marked as paid", "sent", "deleted". */
  actionText: string;
  result: InvoiceBulkResult;
  onDone: () => void;
}

const InvoiceBulkResultView = ({ title, actionText, result, onDone }: InvoiceBulkResultViewProps) => {
  const doneButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    doneButtonRef.current?.focus();
  }, []);

  return (
    <InvoiceDialog title={title} size="narrow" onClose={onDone}>
      <div className="invd-body">
        <p className="invbd-result-text">{describeBulkResult(actionText, result).text}</p>
        <InvoiceBulkIssueList title="Failed" issues={result.failed} tone="error" />
        <InvoiceBulkIssueList title="Skipped" issues={result.skipped} tone="warning" />
      </div>
      <footer className="invd-footer">
        <button ref={doneButtonRef} type="button" className="btn-primary invd-primary-btn" onClick={onDone}>Done</button>
      </footer>
    </InvoiceDialog>
  );
};

export default InvoiceBulkResultView;
