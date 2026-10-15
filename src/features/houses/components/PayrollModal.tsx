// ⭐ PAGO de una casa (registrar o editar): empleado, fecha, base, extra y
//    descuento, con el total en vivo. No escribe: entrega el formulario
//    validado a quien lo abrió (borrador del formulario o el detalle, que lo
//    guarda en payroll). Extraído de HousesView.
import { useState } from "react";
import { CalendarDays, DollarSign, Save, User, X } from "lucide-react";
import type { PayrollRecord, SystemUser } from "../../../types/index";
import DateInput from "../../../shared/components/DateInput";
import SearchableSelect from "./SearchableSelect";

interface PayrollModalProps {
  initial: PayrollRecord;
  /** Editando un pago existente (cambia títulos y botón). */
  editing: boolean;
  employees: SystemUser[];
  busy: boolean;
  onSave: (form: PayrollRecord) => void;
  onClose: () => void;
}

export default function PayrollModal({ initial, editing, employees, busy, onSave, onClose }: PayrollModalProps) {
  const [payrollForm, setPayrollForm] = useState<PayrollRecord>(initial);
  // Total en el render (al guardar se vuelve a calcular igual).
  const payrollFormTotal =
    Number(payrollForm.baseAmount || 0) + Number(payrollForm.extraAmount || 0) - Number(payrollForm.discountAmount || 0);

  const save = () => {
    if (!payrollForm.employeeId) return alert("Please select an employee.");
    if (Number(payrollForm.baseAmount) <= 0) return alert("Base amount must be greater than 0.");
    onSave(payrollForm);
  };

  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div className="modal-70" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">{editing ? "Edit Payment" : "Register Payment"}</h3>
          <button
            className="hv-modal-close-btn"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="hv-modal-body-padded">
          <div className="hv-form-grid cols-240">
            <div>
              <label className="hv-label">
                Employee <span className="hv-required">*</span>
              </label>
              <SearchableSelect
                options={employees.map((e) => ({
                  id: e.id,
                  name: [e.firstName, e.lastName].filter(Boolean).join(" "),
                }))}
                value={payrollForm.employeeId}
                onChange={(val: string) =>
                  setPayrollForm({ ...payrollForm, employeeId: val })
                }
                placeholder="Type to search employee..."
                icon={User}
                returnKey="id"
              />
            </div>
            <div>
              <label className="hv-label">Date</label>
              <div className="hv-input-wrap">
                <CalendarDays className="hv-input-icon" size={16} />
                <DateInput
                  className="hv-input"
                  value={payrollForm.date}
                  onChange={(iso) =>
                    setPayrollForm({ ...payrollForm, date: iso })
                  }
                />
              </div>
            </div>
            <div>
              <label className="hv-label">
                Base Amount <span className="hv-required">*</span>
              </label>
              <div className="hv-input-wrap">
                <DollarSign className="hv-input-icon" size={16} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="hv-input"
                  value={payrollForm.baseAmount}
                  onChange={(e) =>
                    setPayrollForm({
                      ...payrollForm,
                      baseAmount: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="hv-label">Extra Amount</label>
              <div className="hv-input-wrap">
                <DollarSign className="hv-input-icon" size={16} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="hv-input"
                  value={payrollForm.extraAmount}
                  onChange={(e) =>
                    setPayrollForm({
                      ...payrollForm,
                      extraAmount: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div className="hv-full-col">
              <label className="hv-label">Extra Note</label>
              <input
                type="text"
                className="hv-input no-icon"
                value={payrollForm.extraNote}
                onChange={(e) =>
                  setPayrollForm({
                    ...payrollForm,
                    extraNote: e.target.value,
                  })
                }
                placeholder="Reason for extra..."
              />
            </div>
            <div>
              <label className="hv-label">Discount Amount</label>
              <div className="hv-input-wrap">
                <DollarSign className="hv-input-icon" size={16} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="hv-input"
                  value={payrollForm.discountAmount}
                  onChange={(e) =>
                    setPayrollForm({
                      ...payrollForm,
                      discountAmount: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="hv-label">Discount Note</label>
              <input
                type="text"
                className="hv-input no-icon"
                value={payrollForm.discountNote}
                onChange={(e) =>
                  setPayrollForm({
                    ...payrollForm,
                    discountNote: e.target.value,
                  })
                }
                placeholder="Reason for discount..."
              />
            </div>
          </div>

          <div className="hv-payroll-summary-box">
            <span className="hv-payroll-summary-label">Total Payment</span>
            <span className="hv-payroll-summary-value">
              ${payrollFormTotal.toFixed(2)}
            </span>
          </div>
        </div>
        <footer className="hv-modal-footer">
          <button
            onClick={onClose}
            className="hv-btn-outline-modal"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="hv-btn-primary-modal green"
          >
            <Save size={16} /> {busy ? "Saving..." : editing ? "Save Changes" : "Register Payment"}
          </button>
        </footer>
      </div>
    </div>
  );
}
