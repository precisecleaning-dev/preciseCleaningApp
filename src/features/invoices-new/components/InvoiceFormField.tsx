// Campo del formulario de invoice: etiqueta, control, ayuda y error.
import type { ReactNode } from 'react';

interface InvoiceFormFieldProps {
  /** id del control: la etiqueta apunta a él. */
  htmlFor: string;
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}

const InvoiceFormField = ({ htmlFor, label, help, error, children }: InvoiceFormFieldProps) => (
  <div className={`invf-field${error ? ' has-error' : ''}`}>
    <label className="invf-label" htmlFor={htmlFor}>{label}</label>
    {children}
    {help && !error && <p className="invf-help">{help}</p>}
    {error && <p className="invf-error" role="alert">{error}</p>}
  </div>
);

export default InvoiceFormField;
