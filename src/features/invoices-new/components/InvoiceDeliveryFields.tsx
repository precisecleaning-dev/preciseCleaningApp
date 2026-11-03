// Opciones de envío por correo: "Email invoice as PDF" y "Email invoice for
// card payment" (enlace de Stripe), con un solo destinatario. El correo se
// muestra si hay alguna opción; el enlace, solo si se pide pago con tarjeta.
// Lo usan el formulario Create / Edit y Send / Resend.
import { useId } from 'react';
import type { InvoiceDeliveryChoice } from '../../../types/index';
import { STRIPE_PAYMENT_LINK_PLACEHOLDER, isDeliveryRequested, type InvoiceDeliveryErrors } from '../invoiceDelivery';
import InvoiceFormField from './InvoiceFormField';
import './InvoiceFormModal.css';

interface InvoiceDeliveryFieldsProps {
  choice: InvoiceDeliveryChoice;
  onChange: (patch: Partial<InvoiceDeliveryChoice>) => void;
  /** Invoice pagado: no se ofrece un nuevo cobro. */
  isPaid: boolean;
  /** Total con formato ("$108.25"): el enlace de Stripe debe cobrar eso. */
  totalText: string;
  errors: InvoiceDeliveryErrors;
}

const InvoiceDeliveryFields = ({ choice, onChange, isPaid, totalText, errors }: InvoiceDeliveryFieldsProps) => {
  const fieldIdPrefix = useId();
  const pdfId = `${fieldIdPrefix}-pdf`;
  const paymentLinkOptionId = `${fieldIdPrefix}-card`;
  const emailId = `${fieldIdPrefix}-email`;
  const paymentLinkId = `${fieldIdPrefix}-link`;
  const paymentLinkHelp = isPaid
    ? 'This invoice is paid: there is nothing left to charge.'
    : 'The email includes a button to pay with a card through Stripe.';

  return (
    <div className="invf-option-card">
      <label className="invf-option-row" htmlFor={pdfId}>
        <input
          id={pdfId}
          type="checkbox"
          checked={choice.sendPdf}
          onChange={(event) => onChange({ sendPdf: event.target.checked })}
        />
        <span className="invf-option-copy">
          <span className="invf-option-title">Email invoice as PDF</span>
          <span className="invf-option-help">The client receives the invoice PDF as an attachment.</span>
        </span>
      </label>
      <label className="invf-option-row" htmlFor={paymentLinkOptionId}>
        <input
          id={paymentLinkOptionId}
          type="checkbox"
          checked={choice.sendPaymentLink && !isPaid}
          disabled={isPaid}
          onChange={(event) => onChange({ sendPaymentLink: event.target.checked })}
        />
        <span className="invf-option-copy">
          <span className="invf-option-title">Email invoice for card payment</span>
          <span className="invf-option-help">{paymentLinkHelp}</span>
        </span>
      </label>
      {isDeliveryRequested(choice) && (
        <InvoiceFormField htmlFor={emailId} label="Client email" error={errors.recipientEmail}>
          <input
            id={emailId}
            type="email"
            className="invf-input"
            autoComplete="off"
            value={choice.recipientEmail}
            onChange={(event) => onChange({ recipientEmail: event.target.value })}
          />
        </InvoiceFormField>
      )}
      {choice.sendPaymentLink && !isPaid && (
        <InvoiceFormField
          htmlFor={paymentLinkId}
          label="Stripe payment link"
          help={`Create the payment link in Stripe for exactly ${totalText} and paste it here.`}
          error={errors.paymentLinkUrl}
        >
          <input
            id={paymentLinkId}
            type="url"
            className="invf-input"
            autoComplete="off"
            placeholder={STRIPE_PAYMENT_LINK_PLACEHOLDER}
            value={choice.paymentLinkUrl}
            onChange={(event) => onChange({ paymentLinkUrl: event.target.value })}
          />
        </InvoiceFormField>
      )}
      {errors.options && <p className="invf-error" role="alert">{errors.options}</p>}
    </div>
  );
};

export default InvoiceDeliveryFields;
