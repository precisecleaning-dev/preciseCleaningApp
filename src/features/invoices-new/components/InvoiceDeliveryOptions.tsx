// Las dos opciones de envío por correo: "Email invoice as PDF" y "Email invoice
// for card payment" (enlace de Stripe), en su recuadro. Lo de adentro
// (`children`: correo, enlace, errores) lo pone quien lo usa. Lo usan
// InvoiceDeliveryFields (formulario y Send Invoice) y Send en bloque.
import { useId, type ReactNode } from 'react';
import './InvoiceFormModal.css';

interface InvoiceDeliveryOptionsProps {
  sendPdf: boolean;
  sendPaymentLink: boolean;
  onChange: (patch: { sendPdf?: boolean; sendPaymentLink?: boolean }) => void;
  pdfHelp: string;
  paymentLinkHelp: string;
  /** Invoice pagado: no se ofrece el enlace de pago. */
  isPaymentLinkDisabled?: boolean;
  /** Mientras se envía, las opciones no cambian. */
  isDisabled?: boolean;
  children?: ReactNode;
}

const InvoiceDeliveryOptions = ({
  sendPdf, sendPaymentLink, onChange, pdfHelp, paymentLinkHelp, isPaymentLinkDisabled = false, isDisabled = false,
  children,
}: InvoiceDeliveryOptionsProps) => {
  const fieldIdPrefix = useId();
  const pdfOptionId = `${fieldIdPrefix}-pdf`;
  const paymentLinkOptionId = `${fieldIdPrefix}-card`;

  return (
    <div className="invf-option-card">
      <label className="invf-option-row" htmlFor={pdfOptionId}>
        <input
          id={pdfOptionId}
          type="checkbox"
          checked={sendPdf}
          disabled={isDisabled}
          onChange={(event) => onChange({ sendPdf: event.target.checked })}
        />
        <span className="invf-option-copy">
          <span className="invf-option-title">Email invoice as PDF</span>
          <span className="invf-option-help">{pdfHelp}</span>
        </span>
      </label>
      <label className="invf-option-row" htmlFor={paymentLinkOptionId}>
        <input
          id={paymentLinkOptionId}
          type="checkbox"
          checked={sendPaymentLink && !isPaymentLinkDisabled}
          disabled={isDisabled || isPaymentLinkDisabled}
          onChange={(event) => onChange({ sendPaymentLink: event.target.checked })}
        />
        <span className="invf-option-copy">
          <span className="invf-option-title">Email invoice for card payment</span>
          <span className="invf-option-help">{paymentLinkHelp}</span>
        </span>
      </label>
      {children}
    </div>
  );
};

export default InvoiceDeliveryOptions;
