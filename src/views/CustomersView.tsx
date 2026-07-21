import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  Search, Plus, X, Edit2, Trash2, Menu, Mail, Phone, MapPin, StickyNote, Building2
} from 'lucide-react';
import { customersService } from '../services/customersService';
import type { Customer } from '../types/index';
import './CustomersView.css';

interface CustomersViewProps {
  onOpenMenu: () => void;
}

export default function CustomersView({ onOpenMenu }: CustomersViewProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ⭐ Detalle del cliente: al hacer clic en la fila se abre este modal con los datos guardados
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [formData, setFormData] = useState<Customer>({
    id: '', name: '', type: 'Residential', business: '', note: '', address: '', cityStateZip: '', email: '', phone: '', color: '#3b82f6'
  });

  useEffect(() => {
    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const data = await customersService.getAll();
        setCustomers(data);
      } catch (error) {
        console.error('Error fetching customers:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.business && c.business.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ⭐ Clase del badge de tipo (Commercial / Residential / Private customer)
  const typeBadgeClass = (type?: string) => {
    const t = String(type || '').toLowerCase().trim();
    if (t === 'commercial') return 'commercial';
    if (t === 'private customer') return 'private';
    return 'residential';
  };

  const handleOpenForm = (customer?: Customer) => {
    if (customer) {
      setFormData(customer);
    } else {
      setFormData({ id: '', name: '', type: 'Residential', business: '', note: '', address: '', cityStateZip: '', email: '', phone: '', color: '#3b82f6' });
    }
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
  };

  // ⭐ Abre el detalle del cliente (clic en la fila)
  const handleOpenDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const handleCloseDetail = () => {
    setSelectedCustomer(null);
  };

  const handleSave = async () => {
    if (!formData.name) return alert('Name is required.');
    setIsSaving(true);
    try {
      if (formData.id) {
        await customersService.update(formData.id, formData);
        setCustomers(customers.map(c => c.id === formData.id ? formData : c));
        // ⭐ Si el detalle está abierto sobre este cliente, refleja los cambios
        if (selectedCustomer && selectedCustomer.id === formData.id) {
          setSelectedCustomer(formData);
        }
      } else {
        const { id, ...dataToAdd } = formData;
        const newId = await customersService.create(dataToAdd);
        setCustomers([...customers, { ...formData, id: newId }]);
      }
      setIsFormModalOpen(false);
    } catch (error) {
      console.error("Error saving customer:", error);
      alert("Error saving customer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    setIsSaving(true);
    try {
      await customersService.delete(id);
      setCustomers(customers.filter(c => c.id !== id));
      // ⭐ Si estaba abierto el detalle de este cliente, ciérralo
      if (selectedCustomer && selectedCustomer.id === id) {
        setSelectedCustomer(null);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      alert("Error deleting customer.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fade-in cx-page">
      {/* HEADER DINÁMICO */}
      <header className="main-header dashboard-header-container cx-header">
        <div className="view-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <Menu size={24} />
          </button>
          <div>
            <h1 className="cx-title">Customers</h1>
            <p className="cx-subtitle">{customers.length} registered customers</p>
          </div>
        </div>

        <div className="dashboard-actions-wrapper cx-header-actions">
          <div className="search-box-container cx-search-box">
            <Search size={16} color="#9ca3af" />
            <input type="text" placeholder="Search customers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="cx-search-input" />
          </div>

          <button className="add-btn-mobile cx-btn-add" onClick={() => handleOpenForm()}>
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </header>

      {/* TABLE */}
      <div className="cx-table-card">
        <table className="responsive-table cx-table">
          <thead>
            <tr>
              <th className="cx-th color-col">Color</th>
              <th className="cx-th">Type</th>
              <th className="cx-th">Name</th>
              <th className="cx-th">Business</th>
              <th className="cx-th">Note</th>
              <th className="cx-th">Address</th>
              <th className="cx-th">City/State/Zip</th>
              <th className="cx-th">Email</th>
              <th className="cx-th right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="cx-empty-row">Loading customers...</td></tr>
            ) : filteredCustomers.length === 0 ? (
              <tr><td colSpan={9} className="cx-empty-row">No customers found.</td></tr>
            ) : (
              filteredCustomers.map(c => (
                <tr key={c.id} onClick={() => handleOpenDetail(c)} className="cx-row-clickable" title="Ver detalle del cliente">
                  <td data-label="Color" className="cx-td">
                    <div className="td-content">
                      <span className="cx-color-dot" style={{ '--dot-color': c.color || '#e2e8f0' } as CSSProperties}></span>
                    </div>
                  </td>
                  <td data-label="Type" className="cx-td"><div className="td-content"><span className={`cx-type-badge ${typeBadgeClass(c.type)}`}>{c.type}</span></div></td>
                  <td data-label="Name" className="cx-td strong"><div className="td-content">{c.name}</div></td>
                  <td data-label="Business" className="cx-td"><div className="td-content">{c.business || '-'}</div></td>
                  <td data-label="Note" className="cx-td muted-small"><div className="td-content">{c.note || '-'}</div></td>
                  <td data-label="Address" className="cx-td"><div className="td-content">{c.address || '-'}</div></td>

                  <td data-label="City/State/Zip" className="cx-td"><div className="td-content">{c.cityStateZip || '-'}</div></td>

                  <td data-label="Email" className="cx-td"><div className="td-content">{c.email || '-'}</div></td>
                  <td data-label="Actions" className="cx-td right">
                    <div className="td-content actions-cell cx-actions-cell">
                      {/* ⭐ stopPropagation: que el botón no dispare también el detalle de la fila */}
                      <button onClick={(e) => { e.stopPropagation(); handleOpenForm(c); }} className="cx-btn-edit" title="Editar cliente"><Edit2 size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="cx-btn-delete" title="Eliminar cliente"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ⭐ DETAIL MODAL — se abre al hacer clic en la fila del cliente */}
      {selectedCustomer && (
        <div className="modal-overlay-centered" onClick={handleCloseDetail}>
          <div className="modal-70 modal-narrow" onClick={e => e.stopPropagation()}>
            <header className="cx-modal-header">
              <div className="cx-detail-title-group">
                <span className="cx-color-dot lg" style={{ '--dot-color': selectedCustomer.color || '#e2e8f0' } as CSSProperties}></span>
                <div>
                  <h3 className="cx-modal-title">{selectedCustomer.name}</h3>
                  <span className={`cx-type-badge ${typeBadgeClass(selectedCustomer.type)}`}>{selectedCustomer.type}</span>
                </div>
              </div>
              <button onClick={handleCloseDetail} className="cx-modal-close"><X size={24} color="#64748b" /></button>
            </header>

            <div className="cx-modal-body">
              <div className="cx-detail-grid">
                <div className="cx-detail-row">
                  <span className="cx-detail-label"><Building2 size={13} /> Business</span>
                  <span className="cx-detail-value">{selectedCustomer.business || '-'}</span>
                </div>
                <div className="cx-detail-row">
                  <span className="cx-detail-label"><Mail size={13} /> Email</span>
                  <span className="cx-detail-value">{selectedCustomer.email || '-'}</span>
                </div>
                <div className="cx-detail-row">
                  <span className="cx-detail-label"><Phone size={13} /> Phone</span>
                  <span className="cx-detail-value">{selectedCustomer.phone || '-'}</span>
                </div>
                <div className="cx-detail-row">
                  <span className="cx-detail-label"><MapPin size={13} /> Address</span>
                  <span className="cx-detail-value">{selectedCustomer.address || '-'}</span>
                </div>
                <div className="cx-detail-row">
                  <span className="cx-detail-label"><MapPin size={13} /> City / State / Zip</span>
                  <span className="cx-detail-value">{selectedCustomer.cityStateZip || '-'}</span>
                </div>
              </div>

              <div className="cx-detail-note-box">
                <span className="cx-detail-label"><StickyNote size={13} /> Note</span>
                <p className="cx-detail-note-text">{selectedCustomer.note || 'No notes saved.'}</p>
              </div>
            </div>

            <footer className="cx-modal-footer between">
              <button onClick={() => handleDelete(selectedCustomer.id)} disabled={isSaving} className="cx-btn-delete-modal">
                <Trash2 size={15} /> Delete
              </button>
              <div className="cx-footer-actions">
                <button onClick={handleCloseDetail} disabled={isSaving} className="cx-btn-cancel">Close</button>
                <button onClick={() => handleOpenForm(selectedCustomer)} disabled={isSaving} className="cx-btn-edit-modal">
                  <Edit2 size={15} /> Edit
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* FORM MODAL */}
      {isFormModalOpen && (
        <div className="modal-overlay-centered" onClick={handleCloseForm}>
          <div className="modal-70 modal-narrow" onClick={e => e.stopPropagation()}>
            <header className="cx-modal-header">
              <h3 className="cx-modal-title">{formData.id ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={handleCloseForm} className="cx-modal-close"><X size={24} color="#64748b" /></button>
            </header>

            <div className="cx-modal-body">
              <div className="grid-2-cols">
                <div>
                  <label className="cx-label">Type</label>
                  <select className="cx-input selectable" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                    <option value="Private customer">Private customer</option>
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>
                <div>
                  <label className="cx-label">Color Marker</label>
                  <input type="color" className="cx-input color-input" value={formData.color || '#3b82f6'} onChange={e => setFormData({...formData, color: e.target.value})} />
                </div>
                <div>
                  <label className="cx-label">Full Name <span className="cx-required">*</span></label>
                  <input type="text" className="cx-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="cx-label">Business Name</label>
                  <input type="text" className="cx-input" value={formData.business || ''} onChange={e => setFormData({...formData, business: e.target.value})} />
                </div>
                <div>
                  <label className="cx-label">Email</label>
                  <input type="email" className="cx-input" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div>
                  <label className="cx-label">Phone</label>
                  <input type="text" className="cx-input" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="col-span-full">
                  <label className="cx-label">Address</label>
                  <input type="text" className="cx-input" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>

                <div className="col-span-full">
                  <label className="cx-label">City / State / Zip</label>
                  <input
                    type="text"
                    className="cx-input"
                    placeholder="e.g. Maracaibo, Zulia 4001"
                    value={formData.cityStateZip || ''}
                    onChange={e => setFormData({...formData, cityStateZip: e.target.value})}
                  />
                </div>

                <div className="col-span-full">
                  <label className="cx-label">Note</label>
                  <textarea className="cx-input textarea" value={formData.note || ''} onChange={e => setFormData({...formData, note: e.target.value})}></textarea>
                </div>
              </div>
            </div>

            <footer className="cx-modal-footer">
              <button onClick={handleCloseForm} disabled={isSaving} className="cx-btn-cancel">Cancel</button>
              <button onClick={handleSave} disabled={isSaving} className="cx-btn-save">
                {isSaving ? 'Saving...' : 'Save Customer'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}