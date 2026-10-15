// ⭐ CLIENTE NUEVO desde el formulario de casa (mismos campos que Customers).
//    Al guardar, el formulario lo deja seleccionado (y toma su dirección si la
//    trae). Extraído de HousesView.
import { useState } from "react";
import { Briefcase, FileText, Hash, MapPin, Save, User, X } from "lucide-react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { COLLECTIONS } from "../../../lib/firebase/collections";
import SearchableSelect from "./SearchableSelect";

interface CustomerQuickModalProps {
  /** Id del cliente creado y su dirección (vacía si no se capturó). */
  onCreated: (customerId: string, address: string) => void;
  onClose: () => void;
}

export default function CustomerQuickModal({ onCreated, onClose }: CustomerQuickModalProps) {
  const [customerForm, setCustomerForm] = useState({
    type: "Residential",
    color: "#3b82f6",
    name: "",
    businessName: "",
    email: "",
    phone: "",
    address: "",
    cityStateZip: "",
  });
  const [saving, setSaving] = useState(false);

  // ⭐ Guarda el cliente en 'customers'; el listener de clientes lo recoge solo.
  const save = async () => {
    if (!customerForm.name.trim()) return alert("El nombre completo (Full Name) es obligatorio.");
    try {
      setSaving(true);
      const ref = await addDoc(collection(db, COLLECTIONS.customers), {
        type: customerForm.type,
        color: customerForm.color,
        name: customerForm.name.trim(),
        businessName: customerForm.businessName.trim(),
        email: customerForm.email.trim(),
        phone: customerForm.phone.trim(),
        address: customerForm.address.trim(),
        cityStateZip: customerForm.cityStateZip.trim(),
        createdAt: new Date().toISOString(),
      });
      onCreated(ref.id, customerForm.address.trim());
      onClose();
    } catch (e) {
      console.error("Error guardando cliente:", e);
      alert("No se pudo guardar el cliente. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div
        className="modal-70 hv-customer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">&nbsp;</h3>
          <button
            className="hv-modal-close-btn"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="hv-modal-body-padded">
          <div className="hv-form-grid cols-260">
            <div>
              <label className="hv-label">Type</label>
              <SearchableSelect
                options={[
                  { id: "Private customer", name: "Private customer" },
                  { id: "Residential", name: "Residential" },
                  { id: "Commercial", name: "Commercial" },
                ]}
                value={customerForm.type}
                onChange={(val: string) =>
                  setCustomerForm({ ...customerForm, type: val })
                }
                placeholder="Select type..."
                icon={Briefcase}
              />
            </div>

            <div>
              <label className="hv-label">Color Marker</label>
              <input
                type="color"
                value={customerForm.color}
                onChange={(e) =>
                  setCustomerForm({
                    ...customerForm,
                    color: e.target.value,
                  })
                }
                className="hv-color-input"
              />
            </div>

            <div>
              <label className="hv-label">
                Full Name <span className="hv-required">*</span>
              </label>
              <div className="hv-input-wrap">
                <User className="hv-input-icon" size={16} />
                <input
                  type="text"
                  className="hv-input"
                  value={customerForm.name}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      name: e.target.value,
                    })
                  }
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="hv-label">Business Name</label>
              <div className="hv-input-wrap">
                <Briefcase className="hv-input-icon" size={16} />
                <input
                  type="text"
                  className="hv-input"
                  value={customerForm.businessName}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      businessName: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="hv-label">Email</label>
              <div className="hv-input-wrap">
                <FileText className="hv-input-icon" size={16} />
                <input
                  type="email"
                  className="hv-input"
                  value={customerForm.email}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      email: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="hv-label">Phone</label>
              <div className="hv-input-wrap">
                <Hash className="hv-input-icon" size={16} />
                <input
                  type="text"
                  className="hv-input"
                  value={customerForm.phone}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      phone: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="hv-full-col">
              <label className="hv-label">Address</label>
              <div className="hv-input-wrap">
                <MapPin className="hv-input-icon" size={16} />
                <input
                  type="text"
                  className="hv-input"
                  value={customerForm.address}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      address: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="hv-full-col">
              <label className="hv-label">City / State / Zip</label>
              <div className="hv-input-wrap">
                <MapPin className="hv-input-icon" size={16} />
                <input
                  type="text"
                  className="hv-input"
                  placeholder="e.g. Maracaibo, Zulia 4001"
                  value={customerForm.cityStateZip}
                  onChange={(e) =>
                    setCustomerForm({
                      ...customerForm,
                      cityStateZip: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <footer className="hv-modal-footer-between">
          <div>
            <button
              onClick={onClose}
              className="hv-btn-outline-modal"
            >
              Cancel
            </button>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="hv-btn-primary-modal green"
          >
            <Save size={16} /> {saving ? "Saving..." : "Save Customer"}
          </button>
        </footer>
      </div>
    </div>
  );
}
