// Selector del job (casa) del invoice. Por defecto lista los jobs en status
// "Invoice"; "Show all jobs" amplía a toda la ventana de 12 meses. Debajo,
// avisos (job retenido por QC, job que ya tiene invoices) y el cliente.
import { Briefcase } from 'lucide-react';
import type { InvoiceClientSnapshot } from '../../../types/index';
import type { InvoiceJobOption } from '../hooks/useInvoiceJobOptions';
import SearchableSelect from '../../../shared/components/SearchableSelect';
import InvoiceFormField from './InvoiceFormField';
import InvoiceClientCard from './InvoiceClientCard';

interface InvoiceJobPickerProps {
  jobOptions: InvoiceJobOption[];
  selectedPropertyId: string;
  onSelectJob: (propertyId: string) => void;
  showAllJobs: boolean;
  onShowAllJobsChange: (showAllJobs: boolean) => void;
  /** Al editar el job no cambia (cliente y job se copiaron al emitir). */
  isLocked: boolean;
  error?: string;
  warnings: string[];
  client: InvoiceClientSnapshot | null;
  serviceDate: string;
}

const InvoiceJobPicker = ({
  jobOptions, selectedPropertyId, onSelectJob, showAllJobs, onShowAllJobsChange, isLocked, error, warnings, client,
  serviceDate,
}: InvoiceJobPickerProps) => {
  const jobHelp = showAllJobs ? 'Showing every job from the last 12 months.' : 'Showing jobs in the Invoice status.';

  return (
    <div className="invf-job-picker">
      <InvoiceFormField htmlFor="invoice-job" label="Job" help={isLocked ? 'The job cannot change after the invoice is created.' : jobHelp} error={error}>
        <SearchableSelect
          options={jobOptions}
          value={selectedPropertyId}
          onChange={onSelectJob}
          placeholder="Search by address or client"
          icon={Briefcase}
          disabled={isLocked}
        />
      </InvoiceFormField>
      {!isLocked && (
        <label className="invf-inline-check" htmlFor="invoice-show-all-jobs">
          <input
            id="invoice-show-all-jobs"
            type="checkbox"
            checked={showAllJobs}
            onChange={(event) => onShowAllJobsChange(event.target.checked)}
          />
          Show all jobs
        </label>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="invf-warning" role="status">{warning}</p>
      ))}
      {client && <InvoiceClientCard client={client} serviceDate={serviceDate} />}
    </div>
  );
};

export default InvoiceJobPicker;
