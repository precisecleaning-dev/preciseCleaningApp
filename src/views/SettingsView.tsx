import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { 
  Tags, Users, UserCheck, Flag, Activity, Percent, 
  MapPin, Wrench, CreditCard, ClipboardList, Package, Building, Plus,
  Edit2, Trash2, X, ChevronDown, Contact
} from 'lucide-react';
import type { SettingOption, CategoryExpense, Team, Responsable, Priority, Status, Tax, Place, Service, PaymentMethod, Task, Product, Business } from '../types/index';

import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const settingsOptions: SettingOption[] = [
  { id: 'category', label: 'Category Expenses', icon: Tags },
  { id: 'team', label: 'Teams', icon: Users },
  { id: 'team_catalog', label: 'Team Catalog', icon: Contact },
  { id: 'responsable', label: 'Responsable', icon: UserCheck },
  { id: 'priority', label: 'Priority', icon: Flag },
  { id: 'status', label: 'Status', icon: Activity },
  { id: 'tax', label: 'Tax %', icon: Percent },
  { id: 'place', label: 'Place', icon: MapPin },
  { id: 'service', label: 'Service', icon: Wrench },
  { id: 'payment', label: 'Payment Method', icon: CreditCard },
  { id: 'task', label: 'Task', icon: ClipboardList },
  { id: 'product', label: 'Product', icon: Package },
  { id: 'business', label: 'Business', icon: Building },
];

const collectionMap: Record<string, string> = {
  category: 'settings_categories',
  team: 'settings_teams',
  responsable: 'settings_responsables',
  priority: 'settings_priorities',
  status: 'settings_statuses',
  tax: 'settings_tax', 
  place: 'settings_places',
  service: 'settings_services',
  payment: 'settings_payment_methods',
  task: 'settings_tasks',
  product: 'settings_products',
  business: 'settings_businesses'
};

const CustomSelect = ({ options, value, onChange, placeholder, icon: Icon }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o: any) => o.id === value);

  return (
    <div tabIndex={0} onBlur={() => setTimeout(() => setIsOpen(false), 200)} style={{ position: 'relative', width: '100%', outline: 'none' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: '#ffffff', padding: '12px 14px 12px 40px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', position: 'relative' }}
      >
        <Icon size={16} style={{ position: 'absolute', left: '14px', color: '#6b7280' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selected?.color && <span style={{ backgroundColor: selected.color, width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>}
          <span style={{ color: selected ? '#111827' : '#9ca3af' }}>{selected ? selected.name : placeholder}</span>
        </div>
        <ChevronDown size={16} color="#9ca3af" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </div>

      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, maxHeight: '220px', overflowY: 'auto', marginTop: '4px' }}>
          <div style={{ padding: '12px 14px', cursor: 'pointer', color: '#9ca3af', borderBottom: '1px solid #f3f4f6' }} onMouseDown={(e) => { e.preventDefault(); onChange(''); setIsOpen(false); }}>
            None / Unassigned
          </div>
          {options.map((o: any) => (
            <div 
              key={o.id} 
              style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #f9fafb' }}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.id); setIsOpen(false); }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {o.color && <span style={{ backgroundColor: o.color, display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0 }}></span>}
              <span style={{ color: '#111827', fontWeight: 500 }}>{o.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface SettingsViewProps {
  currentSettingView: string;
  setCurrentSettingView: Dispatch<SetStateAction<string>>;
  onOpenMenu: () => void;
}

export default function SettingsView({ currentSettingView, setCurrentSettingView, onOpenMenu }: SettingsViewProps) {
  
  const [categories, setCategories] = useState<CategoryExpense[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [responsables, setResponsables] = useState<Responsable[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [taxValue, setTaxValue] = useState<Tax>({ id: 'tax-1', percentage: 0 });
  const [products, setProducts] = useState<Product[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('All');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({ 
    order: '', name: '', business: '', color: '#3b82f6', percentage: '' as string, estimatedTime: '', placeId: '', price: '',
    placeTasks: [] as {id: string, name: string}[],
    teamId: '',
    showInDashboard: false, 
    dashboardOrder: '' 
  });
  
  const [newTaskInput, setNewTaskInput] = useState(''); 
  const [showQuickAdd, setShowQuickAdd] = useState(false); 

  const activeSettingOption = settingsOptions.find(opt => opt.id === currentSettingView);

  useEffect(() => {
    const fetchAllSettings = async () => {
      setIsLoading(true);
      try {
        const [
          catData, teamData, respData, prioData, statData, servData, 
          payData, prodData, busData, placeData, taskData, taxData
        ] = await Promise.all([
          settingsService.getAll(collectionMap.category),
          settingsService.getAll(collectionMap.team),
          settingsService.getAll(collectionMap.responsable),
          settingsService.getAll(collectionMap.priority),
          settingsService.getAll(collectionMap.status),
          settingsService.getAll(collectionMap.service),
          settingsService.getAll(collectionMap.payment),
          settingsService.getAll(collectionMap.product),
          settingsService.getAll(collectionMap.business),
          settingsService.getAll(collectionMap.place),
          settingsService.getAll(collectionMap.task),
          settingsService.getAll(collectionMap.tax)
        ]);

        if (catData.length) setCategories(catData as CategoryExpense[]);
        if (teamData.length) setTeams(teamData as Team[]);
        if (respData.length) setResponsables(respData as Responsable[]);
        if (prioData.length) setPriorities(prioData as Priority[]);
        if (statData.length) setStatuses((statData as Status[]).sort((a, b) => Number(a.order) - Number(b.order)));
        if (servData.length) setServices(servData as Service[]);
        if (payData.length) setPaymentMethods(payData as PaymentMethod[]);
        if (prodData.length) setProducts(prodData as Product[]);
        if (busData.length) setBusinesses(busData as Business[]);
        if (placeData.length) setPlaces(placeData as Place[]);
        if (taskData.length) setTasks(taskData as Task[]);
        if (taxData.length) setTaxValue(taxData[0] as Tax);

        const usersReq = await getDocs(collection(db, 'system_users')).catch(() => null);
        if (usersReq) {
          setSystemUsers(usersReq.docs.map(d => ({ id: d.id, ...d.data() })));
        }

      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllSettings();
  }, []);

  const thStyle = { backgroundColor: '#f9fafb', padding: '12px 16px', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const };
  const tdStyle = { padding: '12px 16px', borderBottom: '1px solid #e5e7eb', color: '#111827', fontSize: '0.95rem', verticalAlign: 'middle' as const };

  const s = {
    overlayCentered: { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box' } as React.CSSProperties,
    modal: { backgroundColor: '#ffffff', width: '100%', maxWidth: '450px', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' } as React.CSSProperties,
    modalWide: { maxWidth: '700px' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 },
    title: { fontSize: '1.15rem', fontWeight: 600, color: '#111827', margin: 0 },
    body: { padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' } as React.CSSProperties,
    footer: { display: 'flex', gap: '12px', padding: '16px 24px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', flexShrink: 0, flexWrap: 'wrap' } as React.CSSProperties,
    formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' } as React.CSSProperties,
    label: { fontSize: '0.85rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' } as React.CSSProperties,
    input: { backgroundColor: '#ffffff', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.95rem', color: '#111827', width: '100%', boxSizing: 'border-box', outline: 'none', transition: 'all 0.2s' } as React.CSSProperties,
    btnPrimary: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' } as React.CSSProperties,
    btnOutline: { backgroundColor: 'white', border: '1px solid #e5e7eb', color: '#111827', padding: '10px 16px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' } as React.CSSProperties,
    btnDangerLight: { backgroundColor: '#fef2f2', color: '#ef4444', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' } as React.CSSProperties,
    closeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex' },
    detailItem: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' } as React.CSSProperties,
    detailLabel: { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280', fontWeight: 600 } as React.CSSProperties,
    detailValue: { fontSize: '1.05rem', color: '#111827', fontWeight: 500 }
  };

  const handleOpenForm = (item?: any) => {
    if (item) {
      setSelectedItem(item);
      setFormData({ 
        order: item.order || '', name: item.name || '', business: item.business || '', 
        color: item.color || '#3b82f6', percentage: (item.percentage !== undefined && item.percentage !== null && item.percentage !== 0) ? String(item.percentage) : '', estimatedTime: item.estimatedTime || '',
        placeId: item.placeId || '', price: item.price || '',
        placeTasks: currentSettingView === 'place' ? tasks.filter(t => t.placeId === item.id).map(t => ({id: t.id, name: t.name})) : [],
        teamId: item.teamId || '',
        showInDashboard: item.showInDashboard || false,
        dashboardOrder: item.dashboardOrder || ''
      });
    } else {
      setSelectedItem(null);
      setFormData({ order: '', name: '', business: '', color: '#3b82f6', percentage: '', estimatedTime: '', placeId: '', price: '', placeTasks: [], teamId: '', showInDashboard: false, dashboardOrder: '' });
    }
    setNewTaskInput('');
    setIsDetailModalOpen(false); 
    setIsFormModalOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormModalOpen(false);
    setSelectedItem(null);
  };

  const handleColorTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('#')) val = '#' + val.replace(/#/g, '');
    if (val.length > 7) val = val.slice(0, 7);
    setFormData({ ...formData, color: val });
  };

  const handleAddTempTask = (e?: React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (newTaskInput.trim() === '') return;
    setFormData({ ...formData, placeTasks: [...formData.placeTasks, { id: `temp-${Date.now()}`, name: newTaskInput }] });
    setNewTaskInput('');
  };

  const handleQuickAddTask = async () => {
    if (newTaskInput.trim() === '') return;
    setIsSaving(true);
    try {
      const data = { placeId: selectedItem.id, name: newTaskInput };
      const newId = await settingsService.create(collectionMap.task, data);
      setTasks([...tasks, { id: newId, ...data }]);
      setNewTaskInput('');
      setShowQuickAdd(false);
    } catch(err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (currentSettingView === 'team_catalog') {
      setIsSaving(true);
      try {
        await updateDoc(doc(db, 'system_users', selectedItem.id), { teamId: formData.teamId });
        setSystemUsers(systemUsers.map(u => u.id === selectedItem.id ? { ...u, teamId: formData.teamId } : u));
        handleCloseForm();
      } catch(err) {
        console.error(err);
        alert("Failed to assign team to employee.");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (currentSettingView === 'tax') {
      setIsSaving(true);
      try {
        const data = { percentage: Number(formData.percentage) };
        if(taxValue.id === 'tax-1') {
          await settingsService.create(collectionMap.tax, data);
        } else {
          await settingsService.update(collectionMap.tax, taxValue.id, data);
        }
        setTaxValue({ ...taxValue, percentage: data.percentage });
        handleCloseForm();
      } catch(err) { console.error(err); }
      finally { setIsSaving(false); }
      return;
    }

    if (currentSettingView === 'task' && !formData.placeId) return alert("Please select a Place.");
    if (formData.name.trim() === '') return alert("Name is required.");

    setIsSaving(true);
    const colName = collectionMap[currentSettingView];
    
    try {
      let dataToSave: any = { name: formData.name };
      if (['team','priority','status','service'].includes(currentSettingView)) dataToSave.business = formData.business;
      if (['team','responsable','priority','status'].includes(currentSettingView)) dataToSave.color = formData.color;
      if (currentSettingView === 'status') {
        dataToSave.order = formData.order;
        dataToSave.showInDashboard = formData.showInDashboard;
        dataToSave.dashboardOrder = formData.dashboardOrder;
      }
      if (currentSettingView === 'task') dataToSave.placeId = formData.placeId;
      if (currentSettingView === 'product') dataToSave.price = formData.price;
      if (currentSettingView === 'service') dataToSave.estimatedTime = formData.estimatedTime;

      let finalId = selectedItem?.id;
      if (selectedItem) {
        await settingsService.update(colName, finalId, dataToSave);
      } else {
        finalId = await settingsService.create(colName, dataToSave);
      }

      if (currentSettingView === 'place') {
        for (const pt of formData.placeTasks) {
          if (pt.id.startsWith('temp-')) {
            const newTaskId = await settingsService.create(collectionMap.task, { placeId: finalId, name: pt.name });
            setTasks(prev => [...prev, { id: newTaskId, placeId: finalId, name: pt.name }]);
          }
        }
      }

      const updatedItem = { id: finalId, ...dataToSave };
      const updateList = (list: any[], setList: any) => {
        if (selectedItem) setList(list.map(i => i.id === finalId ? { ...i, ...dataToSave } : i));
        else setList([...list, updatedItem]);
      };

      if (currentSettingView === 'category') updateList(categories, setCategories);
      if (currentSettingView === 'place') updateList(places, setPlaces);
      if (currentSettingView === 'task') updateList(tasks, setTasks);
      if (currentSettingView === 'team') updateList(teams, setTeams);
      if (currentSettingView === 'status') {
         const newStatuses = selectedItem ? statuses.map(s => s.id === finalId ? { ...s, ...dataToSave } : s) : [...statuses, updatedItem];
         setStatuses(newStatuses.sort((a:any, b:any) => Number(a.order) - Number(b.order)));
      }
      if (currentSettingView === 'product') updateList(products, setProducts);
      if (currentSettingView === 'business') updateList(businesses, setBusinesses);
      if (currentSettingView === 'responsable') updateList(responsables, setResponsables);
      if (currentSettingView === 'priority') updateList(priorities, setPriorities);
      if (currentSettingView === 'service') updateList(services, setServices);
      if (currentSettingView === 'payment') updateList(paymentMethods, setPaymentMethods);

      handleCloseForm();
    } catch (error) {
      console.error("Error saving setting:", error);
      alert("Failed to save setting.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDetail = (item: any) => {
    setSelectedItem(item);
    setNewTaskInput('');
    setShowQuickAdd(false);
    setIsDetailModalOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setItemToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteTask = async (taskId: string) => {
    if (window.confirm("Delete this task?")) {
      setIsSaving(true);
      try {
        await settingsService.delete(collectionMap.task, taskId);
        setTasks(tasks.filter(t => t.id !== taskId));
      } catch(err) { console.error(err); }
      finally { setIsSaving(false); }
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsSaving(true);
    const colName = collectionMap[currentSettingView];

    try {
      await settingsService.delete(colName, itemToDelete);

      if (currentSettingView === 'category') setCategories(categories.filter(c => c.id !== itemToDelete));
      else if (currentSettingView === 'place') {
        setPlaces(places.filter(p => p.id !== itemToDelete));
        setTasks(tasks.filter(t => t.placeId !== itemToDelete)); 
      }
      else if (currentSettingView === 'task') setTasks(tasks.filter(t => t.id !== itemToDelete));
      else if (currentSettingView === 'team') setTeams(teams.filter(t => t.id !== itemToDelete));
      else if (currentSettingView === 'status') setStatuses(statuses.filter(s => s.id !== itemToDelete));
      else if (currentSettingView === 'product') setProducts(products.filter(p => p.id !== itemToDelete));
      else if (currentSettingView === 'business') setBusinesses(businesses.filter(b => b.id !== itemToDelete));
      else if (currentSettingView === 'responsable') setResponsables(responsables.filter(r => r.id !== itemToDelete));
      else if (currentSettingView === 'priority') setPriorities(priorities.filter(p => p.id !== itemToDelete));
      else if (currentSettingView === 'service') setServices(services.filter(s => s.id !== itemToDelete));
      else if (currentSettingView === 'payment') setPaymentMethods(paymentMethods.filter(p => p.id !== itemToDelete));
      
      setItemToDelete(null);
      setIsDeleteModalOpen(false);
      setIsDetailModalOpen(false); 
    } catch(err) {
      console.error(err);
      alert("Failed to delete item.");
    } finally {
      setIsSaving(false);
    }
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    const placeA = places.find(p => p.id === a.placeId)?.name || '';
    const placeB = places.find(p => p.id === b.placeId)?.name || '';
    return placeA.localeCompare(placeB);
  });

  return (
    <div className="settings-wrapper fade-in" style={{ padding: '20px' }}>
      
      <style>{`
        @media (max-width: 768px) {
          .responsive-settings-table thead { display: none; }
          .responsive-settings-table tr {
            display: flex;
            flex-direction: column;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            margin-bottom: 16px;
            padding: 16px;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
          .responsive-settings-table td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #f1f5f9;
            text-align: right;
            white-space: normal !important;
          }
          .responsive-settings-table td:last-child { border-bottom: none; padding-bottom: 0; }
          .responsive-settings-table td::before {
            content: attr(data-label);
            font-weight: 700;
            color: #6b7280;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-right: 16px;
          }
        }
      `}</style>

      {currentSettingView === 'menu' && (
        <>
          <header className="settings-header">
            <div className="header-titles">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="mobile-menu-btn" onClick={onOpenMenu} aria-label="Abrir menú" style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </svg>
                </button>
                <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Settings</h2>
              </div>
              <p style={{ marginTop: '4px', color: '#6b7280' }}>Manage your system parameters and lists</p>
            </div>
          </header>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', marginTop: '24px' }}>
            {settingsOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button 
                  key={option.id} 
                  onClick={() => setCurrentSettingView(option.id)}
                  style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: '#111827', transition: 'all 0.2s ease', width: '100%', outline: 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}
                >
                  <div style={{ backgroundColor: '#eff6ff', color: '#3b82f6', width: '56px', height: '56px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={24} />
                  </div>
                  <span style={{ fontSize: '1rem', fontWeight: 600 }}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {currentSettingView !== 'menu' && activeSettingOption && (
        <div className="table-view-container fade-in">
          <header className="table-view-header" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
            <div className="table-view-title-group" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button className="mobile-menu-btn" onClick={onOpenMenu} aria-label="Abrir menú" style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', color: '#111827' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </svg>
                </button>
                <button style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }} onClick={() => setCurrentSettingView('menu')}>&lt; Back to Settings</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <activeSettingOption.icon size={28} color="#3b82f6" />
                <h2 style={{ fontSize: '1.8rem', margin: 0, color: '#111827', fontWeight: 700 }}>{activeSettingOption.label}</h2>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {currentSettingView === 'team_catalog' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Filter:</span>
                  <select 
                    style={{ ...s.input, width: 'auto', padding: '8px 12px', minWidth: '160px', cursor: 'pointer' }} 
                    value={selectedTeamFilter} 
                    onChange={e => setSelectedTeamFilter(e.target.value)}
                  >
                    <option value="All">All Employees</option>
                    <option value="Unassigned">Unassigned</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              
              {currentSettingView !== 'tax' && currentSettingView !== 'team_catalog' && (
                <button onClick={() => handleOpenForm()} style={s.btnPrimary}><Plus size={18} /> Add New</button>
              )}
            </div>
          </header>

          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: '100%', overflow: 'hidden', padding: '10px' }}>
            <div style={{ overflowX: 'auto', width: '100%' }}>
              {isLoading ? (
                 <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading data...</div>
              ) : (
                <table className="responsive-settings-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr>
                      {currentSettingView === 'team_catalog' ? (
                        <>
                          <th style={thStyle}>Employee</th>
                          <th style={thStyle}>Email</th>
                          <th style={thStyle}>Assigned Team</th>
                        </>
                      ) : (
                        <>
                          {currentSettingView === 'status' && (
                            <>
                              <th style={thStyle}>Order</th>
                              <th style={thStyle}>Name</th>
                              <th style={thStyle}>Business</th>
                              <th style={{...thStyle, textAlign: 'center'}}>In Dash?</th>
                              <th style={{...thStyle, textAlign: 'center'}}>Dash Order</th>
                              <th style={thStyle}>Color</th>
                            </>
                          )}

                          {currentSettingView !== 'status' && (
                            <>
                              {currentSettingView === 'task' && <th style={thStyle}>Place</th>}
                              
                              {currentSettingView === 'task' ? <th style={thStyle}>Task</th> : 
                               currentSettingView === 'tax' ? <th style={thStyle}>Tax %</th> : 
                               currentSettingView === 'business' ? <th style={thStyle}>Business</th> : 
                               currentSettingView === 'payment' ? <th style={thStyle}>Payment Method</th> :
                               <th style={thStyle}>Name</th>}
                              
                              {currentSettingView === 'product' && <th style={thStyle}>Price</th>}
                              {currentSettingView === 'service' && <th style={thStyle}>Estimated time</th>}
                              
                              {(currentSettingView === 'team' || currentSettingView === 'priority' || currentSettingView === 'service') && <th style={thStyle}>Business</th>}
                              {(currentSettingView === 'team' || currentSettingView === 'responsable' || currentSettingView === 'priority') && <th style={thStyle}>Color</th>}
                            </>
                          )}
                        </>
                      )}
                      
                      <th style={{...thStyle, textAlign: 'right', width: '100px'}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSettingView === 'team_catalog' && systemUsers
                      .filter(u => {
                        if (selectedTeamFilter === 'All') return true;
                        if (selectedTeamFilter === 'Unassigned') return !u.teamId;
                        return u.teamId === selectedTeamFilter;
                      })
                      .map((u) => {
                        const t = teams.find(team => team.id === u.teamId);
                        return (
                          <tr key={u.id} onClick={() => handleOpenDetail(u)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <td data-label="Employee" style={{...tdStyle, fontWeight: 600}}>{u.firstName} {u.lastName}</td>
                            <td data-label="Email" style={{...tdStyle, color: '#6b7280'}}>{u.email}</td>
                            <td data-label="Assigned Team" style={tdStyle}>
                              {t ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ backgroundColor: t.color, width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' }}></span>
                                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                                </div>
                              ) : (
                                <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Unassigned</span>
                              )}
                            </td>
                            <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                                <button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(u); }}>
                                  <Edit2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                    })}

                    {currentSettingView === 'category' && categories.map((cat) => (
                      <tr key={cat.id} onClick={() => handleOpenDetail(cat)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{cat.name}</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(cat); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(cat.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'team' && teams.map((team) => (
                      <tr key={team.id} onClick={() => handleOpenDetail(team)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{team.name}</td><td data-label="Business" style={{...tdStyle, color: '#6b7280'}}>{team.business || '-'}</td><td data-label="Color" style={tdStyle}><span style={{ backgroundColor: team.color, display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%' }}></span></td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(team); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(team.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'responsable' && responsables.map((resp) => (
                      <tr key={resp.id} onClick={() => handleOpenDetail(resp)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{resp.name}</td><td data-label="Color" style={tdStyle}><span style={{ backgroundColor: resp.color, display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%' }}></span></td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(resp); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(resp.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'priority' && priorities.map((priority) => (
                      <tr key={priority.id} onClick={() => handleOpenDetail(priority)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{priority.name}</td><td data-label="Business" style={{...tdStyle, color: '#6b7280'}}>{priority.business || '-'}</td><td data-label="Color" style={tdStyle}><span style={{ backgroundColor: priority.color, display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%' }}></span></td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(priority); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(priority.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'status' && statuses.map((status: any) => (
                      <tr key={status.id} onClick={() => handleOpenDetail(status)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Order" style={tdStyle}>{status.order}</td>
                        <td data-label="Name" style={{...tdStyle, fontWeight: 600}}>{status.name}</td>
                        <td data-label="Business" style={{...tdStyle, color: '#6b7280'}}>{status.business || '-'}</td>
                        <td data-label="In Dash?" style={{...tdStyle, textAlign: 'center'}}>
                          <span style={{ backgroundColor: status.showInDashboard ? '#dcfce7' : '#f1f5f9', color: status.showInDashboard ? '#166534' : '#64748b', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {status.showInDashboard ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td data-label="Dash Order" style={{...tdStyle, textAlign: 'center'}}>{status.showInDashboard ? status.dashboardOrder : '-'}</td>
                        <td data-label="Color" style={tdStyle}><span style={{ backgroundColor: status.color, display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%' }}></span></td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(status); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(status.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'place' && places.map((place) => (
                      <tr key={place.id} onClick={() => handleOpenDetail(place)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{place.name}</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(place); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(place.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'task' && sortedTasks.map((task) => {
                      const placeName = places.find(p => p.id === task.placeId)?.name || 'Unknown Place';
                      return (
                        <tr key={task.id} onClick={() => handleOpenDetail(task)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                          <td data-label="Place" style={{...tdStyle, color: '#6b7280'}}>{placeName}</td><td data-label="Task" style={{...tdStyle, fontWeight: 500}}>{task.name}</td>
                          <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(task); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(task.id); }}><Trash2 size={16} /></button></div></td>
                        </tr>
                      )
                    })}

                    {currentSettingView === 'product' && products.map((product) => (
                      <tr key={product.id} onClick={() => handleOpenDetail(product)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{product.name}</td><td data-label="Price" style={{...tdStyle, color: '#6b7280'}}>{product.price ? `$${Number(product.price).toFixed(2)}` : '-'}</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(product); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(product.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'business' && businesses.map((bus) => (
                      <tr key={bus.id} onClick={() => handleOpenDetail(bus)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{bus.name}</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(bus); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(bus.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}
                    
                    {currentSettingView === 'service' && services.map((srv) => (
                      <tr key={srv.id} onClick={() => handleOpenDetail(srv)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{srv.name}</td><td data-label="Est. Time" style={{...tdStyle, color: '#6b7280'}}>{srv.estimatedTime || '-'}</td><td data-label="Business" style={{...tdStyle, color: '#6b7280'}}>{srv.business || '-'}</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(srv); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(srv.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'payment' && paymentMethods.map((payment) => (
                      <tr key={payment.id} onClick={() => handleOpenDetail(payment)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Name" style={tdStyle}>{payment.name}</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(payment); }}><Edit2 size={16} /></button><button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleDeleteClick(payment.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'tax' && (
                      <tr onClick={() => handleOpenDetail(taxValue)} style={{ cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td data-label="Tax %" style={{...tdStyle, fontWeight: '700', fontSize: '1.2rem', color: '#3b82f6'}}>{taxValue.percentage}%</td>
                        <td data-label="Actions" style={{...tdStyle, textAlign: 'right'}}><div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}><button style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '4px', display: 'flex' }} onClick={(e) => { e.stopPropagation(); handleOpenForm(taxValue); }}><Edit2 size={16} /></button></div></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE FORMULARIO (CREAR / EDITAR) BLINDADO CENTRADO --- */}
      {isFormModalOpen && (
        <div style={s.overlayCentered} onClick={handleCloseForm}>
          <div style={{...s.modal, ...(currentSettingView === 'place' ? s.modalWide : {})}} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>{selectedItem ? 'Edit' : 'New'} {activeSettingOption?.label}</h3>
              <button style={s.closeBtn} onClick={handleCloseForm}><X size={20} /></button>
            </header>
            <div style={s.body}>

              {currentSettingView === 'team_catalog' && (
                <div style={s.formGroup}>
                  <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <strong style={{ display: 'block', fontSize: '1.1rem', color: '#111827', marginBottom: '4px' }}>{selectedItem?.firstName} {selectedItem?.lastName}</strong>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{selectedItem?.email}</span>
                  </div>
                  <label style={s.label}>Assign to Team</label>
                  <CustomSelect 
                    options={teams}
                    value={formData.teamId}
                    onChange={(val: string) => setFormData({ ...formData, teamId: val })}
                    placeholder="Select Team..."
                    icon={Users}
                  />
                </div>
              )}

              {currentSettingView === 'task' && (
                 <div style={s.formGroup}>
                  <label style={s.label}>Place <span style={{color: '#3b82f6'}}>*</span></label>
                  <CustomSelect 
                    options={places}
                    value={formData.placeId}
                    onChange={(val: string) => setFormData({ ...formData, placeId: val })}
                    placeholder="Select a Place..."
                    icon={MapPin}
                  />
                </div>
              )}

              {currentSettingView === 'tax' ? (
                 <div style={s.formGroup}>
                  <label style={s.label}>Tax Percentage (%) <span style={{color: '#3b82f6'}}>*</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    style={s.input}
                    placeholder="Ej. 8.25"
                    value={formData.percentage}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Permite vacío y decimales con punto: 8, 8., 8.25, .5
                      if (v === '' || /^\d*\.?\d*$/.test(v)) {
                        setFormData({ ...formData, percentage: v });
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  />
                </div>
              ) : currentSettingView !== 'team_catalog' && (
                <>
                  {currentSettingView === 'status' && (
                    <>
                      <div style={s.formGroup}>
                        <label style={s.label}>Form Order (Dropdown) <span style={{color: '#3b82f6'}}>*</span></label>
                        <input type="number" autoFocus style={s.input} value={formData.order} onChange={(e) => setFormData({ ...formData, order: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                      </div>
                      
                      {/* NUEVOS CAMPOS PARA STATUS DASHBOARD */}
                      <div style={{...s.formGroup, flexDirection: 'row', alignItems: 'center', marginTop: '8px', marginBottom: '8px'}}>
                        <input type="checkbox" id="showDash" checked={formData.showInDashboard} onChange={(e) => setFormData({ ...formData, showInDashboard: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                        <label htmlFor="showDash" style={{...s.label, margin: 0, cursor: 'pointer'}}>Show as Tab in Dashboard?</label>
                      </div>
                      
                      {formData.showInDashboard && (
                        <div style={s.formGroup}>
                          <label style={s.label}>Dashboard Tab Order <span style={{color: '#3b82f6'}}>*</span></label>
                          <input type="number" style={s.input} value={formData.dashboardOrder} onChange={(e) => setFormData({ ...formData, dashboardOrder: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                        </div>
                      )}
                    </>
                  )}

                  <div style={s.formGroup}>
                    <label style={s.label}>
                      {currentSettingView === 'task' ? 'Task Name' : 
                       currentSettingView === 'business' ? 'Business Name' : 
                       currentSettingView === 'payment' ? 'Payment Method' : 'Name'} <span style={{color: '#3b82f6'}}>*</span>
                    </label>
                    <input type="text" autoFocus={currentSettingView !== 'status'} style={s.input} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                  </div>

                  {currentSettingView === 'product' && (
                    <div style={s.formGroup}>
                      <label style={s.label}>Price ($)</label>
                      <input type="number" step="0.01" style={s.input} value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} placeholder="0.00" />
                    </div>
                  )}

                  {currentSettingView === 'service' && (
                    <div style={s.formGroup}>
                      <label style={s.label}>Estimated time (min)</label>
                      <input type="number" style={s.input} value={formData.estimatedTime} onChange={(e) => setFormData({ ...formData, estimatedTime: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                    </div>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'priority' || currentSettingView === 'status' || currentSettingView === 'service') && (
                    <div style={s.formGroup}>
                      <label style={s.label}>Business</label>
                      <input type="text" style={s.input} value={formData.business} onChange={(e) => setFormData({ ...formData, business: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                    </div>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'responsable' || currentSettingView === 'priority' || currentSettingView === 'status') && (
                    <div style={s.formGroup}>
                      <label style={s.label}>Color Identifier</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input type="color" style={{ width: '40px', height: '40px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '6px', backgroundColor: 'transparent' }} value={formData.color.length === 7 ? formData.color : '#000000'} onChange={(e) => setFormData({ ...formData, color: e.target.value })} />
                        <input type="text" style={{...s.input, width: '120px', fontFamily: 'monospace'}} value={formData.color.toUpperCase()} onChange={handleColorTextChange} placeholder="#000000" />
                      </div>
                    </div>
                  )}

                  {currentSettingView === 'place' && (
                    <div style={{...s.formGroup, marginTop: '8px'}}>
                      <label style={s.label}>Tasks associated with this Place</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="text" style={{...s.input, flex: 1}} placeholder="Add a new task..." value={newTaskInput} onChange={(e) => setNewTaskInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTempTask(e)} />
                        <button style={{...s.btnOutline, padding: '6px 12px'}} onClick={() => handleAddTempTask()}>Add</button>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {formData.placeTasks.length === 0 && <li style={{ padding: '12px', color: '#6b7280', fontStyle: 'italic', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '6px' }}>No tasks added yet.</li>}
                        {formData.placeTasks.map((t, idx) => (
                          <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }}>
                            <span style={{ fontWeight: 500, color: '#1e293b' }}>{t.name}</span>
                            <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', padding: '4px' }} onClick={() => setFormData({...formData, placeTasks: formData.placeTasks.filter((_, i) => i !== idx)})}><Trash2 size={16}/></button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

            </div>
            <footer style={{...s.footer, justifyContent: 'flex-end'}}>
              <button style={s.btnOutline} onClick={handleCloseForm} disabled={isSaving}>Cancel</button>
              <button style={s.btnPrimary} onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL DE DETALLES BLINDADO CENTRADO --- */}
      {isDetailModalOpen && selectedItem && (
        <div style={s.overlayCentered} onClick={() => setIsDetailModalOpen(false)}>
          <div style={{...s.modal, ...(currentSettingView === 'place' ? s.modalWide : {})}} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>{activeSettingOption?.label} Details</h3>
              <button style={s.closeBtn} onClick={() => setIsDetailModalOpen(false)}><X size={20} /></button>
            </header>
            <div style={s.body}>
              
              {currentSettingView === 'team_catalog' ? (
                <>
                  <div style={s.detailItem}><span style={s.detailLabel}>Employee Name</span><span style={s.detailValue}>{selectedItem.firstName} {selectedItem.lastName}</span></div>
                  <div style={s.detailItem}><span style={s.detailLabel}>Email Address</span><span style={s.detailValue}>{selectedItem.email}</span></div>
                  <div style={s.detailItem}>
                    <span style={s.detailLabel}>Assigned Team</span>
                    {teams.find(t => t.id === selectedItem.teamId) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <span style={{ backgroundColor: teams.find(t => t.id === selectedItem.teamId)?.color, width: '16px', height: '16px', borderRadius: '50%', display: 'inline-block' }}></span>
                        <span style={s.detailValue}>{teams.find(t => t.id === selectedItem.teamId)?.name}</span>
                      </div>
                    ) : (
                      <span style={{ ...s.detailValue, color: '#6b7280', fontStyle: 'italic', marginTop: '6px' }}>Unassigned</span>
                    )}
                  </div>
                </>
              ) : currentSettingView === 'place' ? (
                <>
                  <div style={s.detailItem}>
                    <span style={s.detailLabel}>PLACE NAME:</span>
                    <span style={s.detailValue}>{selectedItem.name}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
                    <h4 style={{ margin: 0, color: '#111827', fontSize: '1rem' }}>Associated Tasks</h4>
                    <button style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowQuickAdd(!showQuickAdd)}>+ Add Task</button>
                  </div>

                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                    <table className="responsive-settings-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr><th style={thStyle}>TASK NAME</th><th style={{...thStyle, width: '100px', textAlign: 'right'}}>ACTION</th></tr>
                      </thead>
                      <tbody>
                        {tasks.filter(t => t.placeId === selectedItem.id).length === 0 && !showQuickAdd && (
                          <tr><td colSpan={2} style={{ padding: '20px', color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>No tasks linked.</td></tr>
                        )}
                        
                        {tasks.filter(t => t.placeId === selectedItem.id).map(t => (
                          <tr key={t.id}>
                            <td data-label="Task Name" style={tdStyle}>{t.name}</td>
                            <td data-label="Action" style={{...tdStyle, textAlign: 'right'}}><button style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 500, cursor: 'pointer' }} onClick={() => confirmDeleteTask(t.id)} disabled={isSaving}>{isSaving ? '...' : 'Remove'}</button></td>
                          </tr>
                        ))}

                        {showQuickAdd && (
                          <tr>
                            <td style={tdStyle}><input type="text" style={s.input} placeholder="Type new task and press Enter..." value={newTaskInput} onChange={(e) => setNewTaskInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAddTask(); } }} autoFocus /></td>
                            <td style={{...tdStyle, textAlign: 'right'}}><button style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }} onClick={handleQuickAddTask} disabled={isSaving}>Save</button></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : currentSettingView === 'tax' ? (
                <div style={s.detailItem}><span style={s.detailLabel}>Current Tax</span><span style={{...s.detailValue, fontSize: '1.5rem', color: '#3b82f6', fontWeight: 700}}>{selectedItem.percentage}%</span></div>
              ) : (
                <>
                  {currentSettingView === 'status' && (
                    <div style={s.detailItem}><span style={s.detailLabel}>Form Order</span><span style={s.detailValue}>{selectedItem.order}</span></div>
                  )}
                  {currentSettingView === 'task' && (
                    <div style={s.detailItem}><span style={s.detailLabel}>Place</span><span style={s.detailValue}>{places.find(p => p.id === selectedItem.placeId)?.name || 'Unknown'}</span></div>
                  )}

                  <div style={s.detailItem}>
                    <span style={s.detailLabel}>
                      {currentSettingView === 'task' ? 'Task Name' : currentSettingView === 'business' ? 'Business Name' : currentSettingView === 'payment' ? 'Payment Method' : 'Name'}
                    </span>
                    <span style={s.detailValue}>{selectedItem.name}</span>
                  </div>

                  {currentSettingView === 'product' && (
                    <div style={s.detailItem}><span style={s.detailLabel}>Price</span><span style={s.detailValue}>{selectedItem.price ? `$${Number(selectedItem.price).toFixed(2)}` : 'N/A'}</span></div>
                  )}

                  {currentSettingView === 'service' && (
                    <div style={s.detailItem}><span style={s.detailLabel}>Estimated time (min)</span><span style={s.detailValue}>{selectedItem.estimatedTime || 'N/A'}</span></div>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'priority' || currentSettingView === 'status' || currentSettingView === 'service') && (
                    <div style={s.detailItem}><span style={s.detailLabel}>Business</span><span style={s.detailValue}>{selectedItem.business || 'N/A'}</span></div>
                  )}

                  {currentSettingView === 'status' && (
                    <>
                      <div style={s.detailItem}><span style={s.detailLabel}>Show in Dashboard?</span><span style={s.detailValue}>{selectedItem.showInDashboard ? 'Yes' : 'No'}</span></div>
                      {selectedItem.showInDashboard && (
                         <div style={s.detailItem}><span style={s.detailLabel}>Dashboard Tab Order</span><span style={s.detailValue}>{selectedItem.dashboardOrder}</span></div>
                      )}
                    </>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'responsable' || currentSettingView === 'priority' || currentSettingView === 'status') && (
                    <div style={s.detailItem}>
                      <span style={s.detailLabel}>Color</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <span style={{ backgroundColor: selectedItem.color, width: '24px', height: '24px', borderRadius: '50%', display: 'inline-block' }}></span>
                        <span style={{...s.detailValue, fontFamily: 'monospace'}}>{selectedItem.color.toUpperCase()}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
            
            <footer style={{...s.footer, justifyContent: (currentSettingView === 'tax' || currentSettingView === 'team_catalog') ? 'flex-end' : 'space-between'}}>
              {currentSettingView !== 'tax' && currentSettingView !== 'team_catalog' && (
                <button style={s.btnDangerLight} onClick={() => handleDeleteClick(selectedItem.id)}>
                  <Trash2 size={16}/> Delete {activeSettingOption?.label}
                </button>
              )}
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <button style={{...s.btnOutline, border: 'none'}} onClick={() => setIsDetailModalOpen(false)}>Close</button>
                <button style={s.btnPrimary} onClick={() => handleOpenForm(selectedItem)}>
                  <Edit2 size={16}/> Edit {activeSettingOption?.label}
                </button>
              </div>
            </footer>

          </div>
        </div>
      )}

      {/* --- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN BLINDADO CENTRADO --- */}
      {isDeleteModalOpen && (
        <div style={s.overlayCentered} onClick={() => setIsDeleteModalOpen(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <header style={s.header}>
              <h3 style={s.title}>Confirm Deletion</h3>
              <button style={s.closeBtn} onClick={() => setIsDeleteModalOpen(false)}><X size={20} /></button>
            </header>
            <div style={s.body}>
              <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>Are you sure you want to delete this record? This action cannot be undone.</p>
            </div>
            <footer style={{...s.footer, justifyContent: 'flex-end'}}>
              <button style={s.btnOutline} onClick={() => setIsDeleteModalOpen(false)} disabled={isSaving}>Cancel</button>
              <button style={{...s.btnPrimary, backgroundColor: '#ef4444'}} onClick={confirmDelete} disabled={isSaving}>{isSaving ? 'Deleting...' : 'Delete'}</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}