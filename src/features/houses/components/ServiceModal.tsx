// ⭐ SERVICIO COBRADO de una casa (alta o edición): producto, cantidad, precio e
//    impuesto, con los totales calculados en vivo (computeServiceTotals). No
//    escribe: entrega el registro a quien lo abrió (el borrador del formulario o
//    el detalle, que lo guarda en billing_services). Extraído de HousesView.
import { useState } from "react";
import { DollarSign, Hash, Percent, Save, Wrench, X } from "lucide-react";
import { computeServiceTotals } from "../serviceRecords";
import type { ProductRecord } from "../hooks/useHouseCatalogs";
import type { ServiceRecord, Tax } from "../../../types/index";
import SearchableSelect from "./SearchableSelect";

interface ServiceModalProps {
  initial: ServiceRecord;
  products: ProductRecord[];
  /** Respaldo si no hay productos (settings_services). */
  services: { id: string; name: string }[];
  taxes: Tax[];
  busy: boolean;
  /** Registro validado, con totales y createdAt. */
  onSave: (record: ServiceRecord) => void;
  onClose: () => void;
}

export default function ServiceModal({ initial, products, services, taxes, busy, onSave, onClose }: ServiceModalProps) {
  const [serviceForm, setServiceForm] = useState<ServiceRecord>(initial);
  // ⭐ Totales: se CALCULAN en el render y al guardar (no se copian al estado).
  const serviceTotals = computeServiceTotals(serviceForm);

  const save = () => {
    if (!serviceForm.serviceId) return alert("Please select a Product/Service.");
    if (serviceForm.price <= 0) return alert("Price must be greater than 0.");
    onSave({
      ...serviceForm,
      ...computeServiceTotals(serviceForm),
      createdAt: serviceForm.createdAt || new Date().toISOString(),
    });
  };

  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div className="modal-70" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">
            {serviceForm.id ? "Edit Service" : "Add Billed Service"}
          </h3>
          <button
            className="hv-modal-close-btn"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="hv-modal-body-padded">
          <div className="hv-form-grid cols-240">
            <div className="hv-full-col">
              <label className="hv-label">
                Product / Service <span className="hv-required">*</span>
              </label>
              <SearchableSelect
                options={products.length ? products : services}
                value={serviceForm.serviceId}
                onChange={(val: string) => {
                  const list = products.length ? products : services;
                  const srv = list.find((c) => c.id === val);
                  const price =
                    srv && "price" in srv ? srv.price : undefined;
                  setServiceForm((prev) => ({
                    ...prev,
                    serviceId: val,
                    price: Number(price || prev.price),
                  }));
                }}
                placeholder="Select Product/Service..."
                icon={Wrench}
              />
            </div>
            <div>
              <label className="hv-label">Quantity</label>
              <div className="hv-input-wrap">
                <Hash className="hv-input-icon" size={16} />
                <input
                  type="number"
                  min="1"
                  className="hv-input"
                  value={serviceForm.quantity}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="hv-label">Unit Price</label>
              <div className="hv-input-wrap">
                <DollarSign className="hv-input-icon" size={16} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="hv-input"
                  value={serviceForm.price}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      price: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="hv-label">Tax %</label>
              {taxes.length > 0 && (
                <div className="hv-tax-select-wrap">
                  <SearchableSelect
                    options={taxes.map((t) => ({
                      id: String(Number(t.percentage)),
                      name: `${t.name} (${Number(t.percentage)}%)`,
                    }))}
                    value={String(Number(serviceForm.taxPercentage))}
                    onChange={(val: string) =>
                      setServiceForm((prev) => ({
                        ...prev,
                        taxPercentage: Number(val),
                      }))
                    }
                    placeholder="Select tax rate..."
                    icon={Percent}
                  />
                </div>
              )}
              <div className="hv-input-wrap">
                <Percent className="hv-input-icon" size={16} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="hv-input"
                  value={serviceForm.taxPercentage}
                  onChange={(e) =>
                    setServiceForm({
                      ...serviceForm,
                      taxPercentage: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <label className="hv-label">Apply Tax (add)</label>
              <div className="hv-segment-container">
                <button
                  onClick={() =>
                    setServiceForm({
                      ...serviceForm,
                      applyTax: "Yes",
                      minusTax: "No",
                    })
                  }
                  className={`hv-segment-btn${serviceForm.applyTax === "Yes" ? " active yes" : ""}`}
                >
                  Yes
                </button>
                <button
                  onClick={() =>
                    setServiceForm({ ...serviceForm, applyTax: "No" })
                  }
                  className={`hv-segment-btn${serviceForm.applyTax === "No" ? " active no" : ""}`}
                >
                  No
                </button>
              </div>
            </div>
            {serviceForm.applyTax === "No" && (
              <div>
                <label className="hv-label">Minus Tax (subtract)</label>
                <div className="hv-segment-container">
                  <button
                    onClick={() =>
                      setServiceForm({ ...serviceForm, minusTax: "Yes" })
                    }
                    className={`hv-segment-btn${serviceForm.minusTax === "Yes" ? " active yes" : ""}`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() =>
                      setServiceForm({ ...serviceForm, minusTax: "No" })
                    }
                    className={`hv-segment-btn${serviceForm.minusTax === "No" ? " active no" : ""}`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}
            <div className="hv-full-col">
              <label className="hv-label">Notes</label>
              <textarea
                className="hv-input hv-textarea compact"
                value={serviceForm.notes}
                onChange={(e) =>
                  setServiceForm({ ...serviceForm, notes: e.target.value })
                }
                placeholder="Optional notes..."
              ></textarea>
            </div>
          </div>

          <div className="hv-service-summary-box">
            <div className="hv-summary-row">
              <span>Subtotal</span>
              <span className="hv-summary-row-value">
                ${serviceTotals.subtotal.toFixed(2)}
              </span>
            </div>
            <div className="hv-summary-row">
              <span>Tax</span>
              <span
                className={`hv-summary-row-value${serviceForm.applyTax === "Yes" ? " tax-add" : serviceForm.minusTax === "Yes" ? " tax-subtract" : ""}`}
              >
                {serviceForm.applyTax === "Yes"
                  ? "+"
                  : serviceForm.minusTax === "Yes"
                    ? "-"
                    : ""}
                ${serviceTotals.taxAmount.toFixed(2)}
              </span>
            </div>
            <div className="hv-summary-divider"></div>
            <div className="hv-summary-total-row">
              <span className="hv-summary-total-label">Total</span>
              <span className="hv-summary-total-value">
                ${serviceTotals.total.toFixed(2)}
              </span>
            </div>
            <div className="hv-summary-minustax-row">
              <span className="hv-summary-minustax-label">
                Total Minus Tax
              </span>
              <span className="hv-summary-minustax-value">
                ${serviceTotals.totalMinusTax.toFixed(2)}
              </span>
            </div>
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
            className="hv-btn-primary-modal"
          >
            <Save size={16} /> {busy ? "Saving..." : "Save Service"}
          </button>
        </footer>
      </div>
    </div>
  );
}
