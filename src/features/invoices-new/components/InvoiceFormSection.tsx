// Sección del formulario de invoice: ícono, título, etiqueta "Optional" y
// acciones a la derecha del título (p. ej. "Add note").
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface InvoiceFormSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  isOptional?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

const InvoiceFormSection = ({ id, title, icon: Icon, isOptional = false, actions, children }: InvoiceFormSectionProps) => (
  <section className="invf-section" aria-labelledby={id}>
    <div className="invf-section-top">
      <h3 className="invf-section-title" id={id}>
        <Icon size={18} className="invf-section-icon" aria-hidden="true" />
        {title}
        {isOptional && <span className="invf-optional">Optional</span>}
      </h3>
      {actions}
    </div>
    {children}
  </section>
);

export default InvoiceFormSection;
