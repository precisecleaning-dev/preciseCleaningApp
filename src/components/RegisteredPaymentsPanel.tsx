import { useMemo, useState } from "react";
import {
  DollarSign,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  User,
  CalendarDays,
  Home,
} from "lucide-react";
import type { PayrollRecord, Property, SystemUser } from "../types/index";
import { payrollService } from "../services/payrollService";
import { formatDate, dateSortValue } from "../utils/dateFormat";
import "./RegisteredPaymentsPanel.css";

// ⭐ `status` aún no está declarado en PayrollRecord (types/index.ts). Alias local
//    para no tocar el tipo compartido — mismo patrón que PropertyU / PropertyNotes.
type PayrollRecordX = PayrollRecord & { status?: string };

interface RegisteredPaymentsPanelProps {
  /** Lista viva de payroll (la que ya trae InvoicesView por onSnapshot). */
  payrolls: PayrollRecord[];
  /** Catálogo de usuarios para resolver el nombre del empleado. */
  employees: SystemUser[];
  /** Catálogo de casas: para el selector del formulario y la columna PROPERTY. */
  properties?: Property[];
  /**
   * Modo "una casa": filtra a esa propiedad y bloquea el selector del formulario.
   * Es el modo que se usa dentro del modal de detalle.
   */
  propertyId?: string | null;
  /**
   * Modo "global acotado": limita el panel a las casas actualmente filtradas
   * en la tabla. Si viene null/undefined se muestran TODOS los pagos.
   */
  propertyIds?: string[] | null;
  /** Permiso de escritura (registrar / eliminar). */
  canEdit?: boolean;
  /** Título del panel. */
  title?: string;
  /** Texto del botón de acción. En el modal de detalle se usa "Pay". */
  actionLabel?: string;
  /** Se dispara después de guardar o borrar, por si el padre quiere refrescar. */
  onChanged?: () => void;
}

const emptyForm = (propertyId: string): PayrollRecordX => ({
  propertyId,
  date: new Date().toISOString().split("T")[0],
  employeeId: "",
  baseAmount: 0,
  extraAmount: 0,
  extraNote: "",
  discountAmount: 0,
  discountNote: "",
  totalAmount: 0,
});

export default function RegisteredPaymentsPanel({
  payrolls,
  employees,
  properties = [],
  propertyId = null,
  propertyIds = null,
  canEdit = false,
  title = "Registered Payments",
  actionLabel = "Register Payment",
  onChanged,
}: RegisteredPaymentsPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // ⭐ EDICIÓN EN SITIO: id del pago que se está editando. null = registro
  //    nuevo. Antes editar exigía borrar el pago y volver a capturarlo.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<PayrollRecordX>(emptyForm(propertyId || ""));

  // Cuando el panel está fijado a una casa, la columna PROPERTY sobra.
  const showPropertyColumn = !propertyId;

  const employeeName = (id?: string | null): string => {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return "Unknown";
    return [emp.firstName, emp.lastName].filter(Boolean).join(" ") || "Unknown";
  };

  const propertyAddress = (id?: string | null): string => {
    const prop = properties.find((p) => p.id === id);
    return prop?.address || "-";
  };

  // ⭐ Alcance del panel: una casa, un subconjunto (lo filtrado en la tabla) o todo.
  const records = useMemo<PayrollRecordX[]>(() => {
    const scoped = propertyIds ? new Set(propertyIds.map(String)) : null;
    return (payrolls as PayrollRecordX[])
      .filter((r) => {
        const pid = String(r.propertyId || "");
        if (propertyId) return pid === String(propertyId);
        if (scoped) return scoped.has(pid);
        return true;
      })
      .sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
  }, [payrolls, propertyId, propertyIds]);

  const grandTotal = useMemo(
    () => records.reduce((acc, r) => acc + Number(r.totalAmount || 0), 0),
    [records],
  );

  // El total del formulario se deriva; no hace falta un useEffect que lo sincronice.
  const formTotal =
    Number(form.baseAmount || 0) +
    Number(form.extraAmount || 0) -
    Number(form.discountAmount || 0);

  const employeeOptions = useMemo(
    () =>
      employees
        .map((e) => ({
          id: String(e.id),
          name:
            [e.firstName, e.lastName].filter(Boolean).join(" ") ||
            String(e.id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );

  const propertyOptions = useMemo(
    () =>
      properties
        .map((p) => ({ id: String(p.id), name: p.address || String(p.id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [properties],
  );

  const handleOpen = () => {
    setEditingId(null);
    setForm(emptyForm(propertyId || ""));
    setIsModalOpen(true);
  };

  // ⭐ Abre el MISMO formulario del registro, precargado con el pago elegido.
  const handleOpenEdit = (record: PayrollRecordX) => {
    setEditingId(String(record.id));
    setForm({
      propertyId: String(record.propertyId || ""),
      date: record.date || new Date().toISOString().split("T")[0],
      employeeId: String(record.employeeId || ""),
      baseAmount: Number(record.baseAmount || 0),
      extraAmount: Number(record.extraAmount || 0),
      extraNote: String(record.extraNote || ""),
      discountAmount: Number(record.discountAmount || 0),
      discountNote: String(record.discountNote || ""),
      totalAmount: Number(record.totalAmount || 0),
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.propertyId) return alert("Please select a property.");
    if (!form.employeeId) return alert("Please select an employee.");
    if (Number(form.baseAmount) <= 0)
      return alert("Base amount must be greater than 0.");

    setIsSaving(true);
    try {
      if (editingId) {
        // ⭐ EDITAR: se actualizan solo los campos del formulario. El `status`
        //    del pago NO se toca (conserva Pending/Paid tal como estaba), y el
        //    total se recalcula con base + extra - descuento.
        await payrollService.update(editingId, {
          propertyId: form.propertyId,
          date: form.date,
          employeeId: form.employeeId,
          baseAmount: Number(form.baseAmount || 0),
          extraAmount: Number(form.extraAmount || 0),
          extraNote: form.extraNote || "",
          discountAmount: Number(form.discountAmount || 0),
          discountNote: form.discountNote || "",
          totalAmount: formTotal,
        });
      } else {
        await payrollService.create({
          ...form,
          totalAmount: formTotal,
          status: "Pending",
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
      onChanged?.();
    } catch (error) {
      console.error("Error saving payroll:", error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `Error saving payment.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this payment record?")) return;
    setIsSaving(true);
    try {
      await payrollService.delete(id);
      onChanged?.();
    } catch (error) {
      console.error("Error deleting payroll:", error);
      alert("Error deleting record.");
    } finally {
      setIsSaving(false);
    }
  };

  const colSpan = (showPropertyColumn ? 7 : 6) + (canEdit ? 1 : 0);

  return (
    <div className="rpp-card">
      <div className="rpp-header">
        <h4 className="rpp-title">
          <DollarSign size={18} className="rpp-title-icon" /> {title}
        </h4>
        <div className="rpp-header-right">
          <span className="rpp-total-chip">${grandTotal.toFixed(2)}</span>
          {canEdit && (
            <button
              type="button"
              onClick={handleOpen}
              disabled={isSaving}
              className="rpp-btn-add"
            >
              <Plus size={16} /> {actionLabel}
            </button>
          )}
        </div>
      </div>

      <div className="rpp-scroll">
        <table className="rpp-table">
          <thead>
            <tr>
              <th className="rpp-th">Date</th>
              <th className="rpp-th">Employee</th>
              {showPropertyColumn && <th className="rpp-th">Property</th>}
              <th className="rpp-th right">Base</th>
              <th className="rpp-th right">Extra</th>
              <th className="rpp-th right">Discount</th>
              <th className="rpp-th right">Total</th>
              {canEdit && <th className="rpp-th right">Act</th>}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="rpp-empty-row">
                  No payments registered yet.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={String(record.id)}>
                  <td className="rpp-td muted">{formatDate(record.date)}</td>
                  <td className="rpp-td strong">
                    {employeeName(record.employeeId)}
                  </td>
                  {showPropertyColumn && (
                    <td className="rpp-td muted ellipsis">
                      {propertyAddress(record.propertyId)}
                    </td>
                  )}
                  <td className="rpp-td right">
                    ${Number(record.baseAmount || 0).toFixed(2)}
                  </td>
                  <td className="rpp-td right extra">
                    +${Number(record.extraAmount || 0).toFixed(2)}
                  </td>
                  <td className="rpp-td right discount">
                    -${Number(record.discountAmount || 0).toFixed(2)}
                  </td>
                  <td className="rpp-td right bold">
                    ${Number(record.totalAmount || 0).toFixed(2)}
                  </td>
                  {canEdit && (
                    <td className="rpp-td right">
                      <div className="rpp-actions-cell">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(record)}
                          disabled={isSaving}
                          className="rpp-action-btn edit"
                          title="Edit payment"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(String(record.id))}
                          disabled={isSaving}
                          className="rpp-action-btn delete"
                          title="Delete payment"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- MODAL: REGISTRAR PAGO (PAY) --- */}
      {isModalOpen && (
        <div
          className="modal-overlay-centered"
          onClick={() => setIsModalOpen(false)}
        >
          <div className="modal-70" onClick={(e) => e.stopPropagation()}>
            <header className="rpp-modal-header">
              <h3 className="rpp-modal-title">{editingId ? "Edit Payment" : "Register Payment"}</h3>
              <button
                type="button"
                className="rpp-modal-close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={22} />
              </button>
            </header>

            <div className="rpp-modal-body">
              <div className="rpp-form-grid">
                <div className="rpp-field rpp-field-wide">
                  <label className="rpp-label">
                    Property <span className="rpp-required">*</span>
                  </label>
                  <div className="rpp-input-wrap">
                    <Home className="rpp-input-icon" size={16} />
                    <select
                      className="rpp-input"
                      value={String(form.propertyId || "")}
                      disabled={!!propertyId}
                      onChange={(e) =>
                        setForm({ ...form, propertyId: e.target.value })
                      }
                    >
                      <option value="">Select property...</option>
                      {propertyOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rpp-field">
                  <label className="rpp-label">
                    Employee <span className="rpp-required">*</span>
                  </label>
                  <div className="rpp-input-wrap">
                    <User className="rpp-input-icon" size={16} />
                    <select
                      className="rpp-input"
                      value={String(form.employeeId || "")}
                      onChange={(e) =>
                        setForm({ ...form, employeeId: e.target.value })
                      }
                    >
                      <option value="">Select employee...</option>
                      {employeeOptions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rpp-field">
                  <label className="rpp-label">Date</label>
                  <div className="rpp-input-wrap">
                    <CalendarDays className="rpp-input-icon" size={16} />
                    <input
                      type="date"
                      className="rpp-input"
                      value={String(form.date || "")}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="rpp-field">
                  <label className="rpp-label">
                    Base Amount <span className="rpp-required">*</span>
                  </label>
                  <div className="rpp-input-wrap">
                    <DollarSign className="rpp-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="rpp-input"
                      value={Number(form.baseAmount || 0)}
                      onChange={(e) =>
                        setForm({ ...form, baseAmount: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="rpp-field">
                  <label className="rpp-label">Extra Amount</label>
                  <div className="rpp-input-wrap">
                    <DollarSign className="rpp-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="rpp-input"
                      value={Number(form.extraAmount || 0)}
                      onChange={(e) =>
                        setForm({ ...form, extraAmount: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="rpp-field rpp-field-wide">
                  <label className="rpp-label">Extra Note</label>
                  <input
                    type="text"
                    className="rpp-input no-icon"
                    value={String(form.extraNote || "")}
                    placeholder="Reason for extra..."
                    onChange={(e) =>
                      setForm({ ...form, extraNote: e.target.value })
                    }
                  />
                </div>

                <div className="rpp-field">
                  <label className="rpp-label">Discount Amount</label>
                  <div className="rpp-input-wrap">
                    <DollarSign className="rpp-input-icon" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="rpp-input"
                      value={Number(form.discountAmount || 0)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          discountAmount: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="rpp-field">
                  <label className="rpp-label">Discount Note</label>
                  <input
                    type="text"
                    className="rpp-input no-icon"
                    value={String(form.discountNote || "")}
                    placeholder="Reason for discount..."
                    onChange={(e) =>
                      setForm({ ...form, discountNote: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="rpp-summary-box">
                <span className="rpp-summary-label">Total Payment</span>
                <span className="rpp-summary-value">
                  ${formTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <footer className="rpp-modal-footer">
              <button
                type="button"
                className="rpp-btn-outline"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rpp-btn-primary"
              >
                <Save size={16} /> {isSaving ? "Saving..." : editingId ? "Save Changes" : "Register Payment"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}