import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction, CSSProperties } from 'react';
import {
  Tags, Users, UserCheck, Flag, Activity, Percent,
  MapPin, Wrench, CreditCard, ClipboardList, Package, Building, Plus,
  Edit2, Trash2, X, Contact, Menu
} from 'lucide-react';
import type { SettingOption, CategoryExpense, Team, Responsable, Priority, Status, Tax, Place, Service, PaymentMethod, Task, Product, Business, SystemUser } from '../types/index';

import { settingsService } from '../services/settingsService';
import { db } from '../config/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import CustomSelect from '../components/CustomSelect';
import './SettingsView.css';

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
  
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
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
          setSystemUsers(usersReq.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser)));
        }

      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllSettings();
  }, []);

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
    <div className="settings-wrapper fade-in stv-page">

      {currentSettingView === 'menu' && (
        <>
          <header className="settings-header">
            <div className="header-titles">
              <div className="stv-menu-header-row">
                <button className="mobile-menu-btn stv-hamburger-btn" onClick={onOpenMenu} aria-label="Abrir menú">
                  <Menu size={24} />
                </button>
                <h2 className="stv-menu-title">Settings</h2>
              </div>
              <p className="stv-menu-subtitle">Manage your system parameters and lists</p>
            </div>
          </header>

          <div className="stv-menu-grid">
            {settingsOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setCurrentSettingView(option.id)}
                  className="stv-menu-card"
                >
                  <div className="stv-menu-card-icon-box">
                    <Icon size={24} />
                  </div>
                  <span className="stv-menu-card-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {currentSettingView !== 'menu' && activeSettingOption && (
        <div className="table-view-container fade-in">
          <header className="table-view-header stv-table-view-header">
            <div className="table-view-title-group stv-table-view-title-group">
              <div className="stv-menu-header-row">
                <button className="mobile-menu-btn stv-hamburger-btn compact" onClick={onOpenMenu} aria-label="Abrir menú">
                  <Menu size={20} />
                </button>
                <button className="stv-back-btn" onClick={() => setCurrentSettingView('menu')}>&lt; Back to Settings</button>
              </div>
              <div className="stv-title-icon-row">
                <activeSettingOption.icon size={28} color="#3b82f6" />
                <h2 className="stv-table-title">{activeSettingOption.label}</h2>
              </div>
            </div>

            <div className="stv-header-actions">
              {currentSettingView === 'team_catalog' && (
                <div className="stv-team-filter-group">
                  <span className="stv-team-filter-label">Filter:</span>
                  <select
                    className="stv-input stv-filter-select"
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
                <button onClick={() => handleOpenForm()} className="stv-btn-primary"><Plus size={18} /> Add New</button>
              )}
            </div>
          </header>

          <div className="stv-table-card">
            <div className="stv-table-scroll">
              {isLoading ? (
                 <div className="stv-loading">Loading data...</div>
              ) : (
                <table className="responsive-settings-table stv-table">
                  <thead>
                    <tr>
                      {currentSettingView === 'team_catalog' ? (
                        <>
                          <th className="stv-th">Employee</th>
                          <th className="stv-th">Email</th>
                          <th className="stv-th">Assigned Team</th>
                        </>
                      ) : (
                        <>
                          {currentSettingView === 'status' && (
                            <>
                              <th className="stv-th">Order</th>
                              <th className="stv-th">Name</th>
                              <th className="stv-th">Business</th>
                              <th className="stv-th center">In Dash?</th>
                              <th className="stv-th center">Dash Order</th>
                              <th className="stv-th">Color</th>
                            </>
                          )}

                          {currentSettingView !== 'status' && (
                            <>
                              {currentSettingView === 'task' && <th className="stv-th">Place</th>}

                              {currentSettingView === 'task' ? <th className="stv-th">Task</th> :
                               currentSettingView === 'tax' ? <th className="stv-th">Tax %</th> :
                               currentSettingView === 'business' ? <th className="stv-th">Business</th> :
                               currentSettingView === 'payment' ? <th className="stv-th">Payment Method</th> :
                               <th className="stv-th">Name</th>}

                              {currentSettingView === 'product' && <th className="stv-th">Price</th>}
                              {currentSettingView === 'service' && <th className="stv-th">Estimated time</th>}

                              {(currentSettingView === 'team' || currentSettingView === 'priority' || currentSettingView === 'service') && <th className="stv-th">Business</th>}
                              {(currentSettingView === 'team' || currentSettingView === 'responsable' || currentSettingView === 'priority') && <th className="stv-th">Color</th>}
                            </>
                          )}
                        </>
                      )}

                      <th className="stv-th right actions">Actions</th>
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
                          <tr key={u.id} onClick={() => handleOpenDetail(u)} className="stv-row">
                            <td data-label="Employee" className="stv-td strong">{u.firstName} {u.lastName}</td>
                            <td data-label="Email" className="stv-td muted">{u.email}</td>
                            <td data-label="Assigned Team" className="stv-td">
                              {t ? (
                                <div className="stv-team-cell">
                                  <span className="stv-color-dot sz-12" style={{ '--dot-color': t.color } as CSSProperties}></span>
                                  <span className="stv-team-name">{t.name}</span>
                                </div>
                              ) : (
                                <span className="stv-unassigned-text">Unassigned</span>
                              )}
                            </td>
                            <td data-label="Actions" className="stv-td right">
                              <div className="stv-actions-cell">
                                <button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(u); }}>
                                  <Edit2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                    })}

                    {currentSettingView === 'category' && categories.map((cat) => (
                      <tr key={cat.id} onClick={() => handleOpenDetail(cat)} className="stv-row">
                        <td data-label="Name" className="stv-td">{cat.name}</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(cat); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(cat.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'team' && teams.map((team) => (
                      <tr key={team.id} onClick={() => handleOpenDetail(team)} className="stv-row">
                        <td data-label="Name" className="stv-td">{team.name}</td><td data-label="Business" className="stv-td muted">{team.business || '-'}</td><td data-label="Color" className="stv-td"><span className="stv-color-dot sz-16" style={{ '--dot-color': team.color } as CSSProperties}></span></td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(team); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(team.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'responsable' && responsables.map((resp) => (
                      <tr key={resp.id} onClick={() => handleOpenDetail(resp)} className="stv-row">
                        <td data-label="Name" className="stv-td">{resp.name}</td><td data-label="Color" className="stv-td"><span className="stv-color-dot sz-16" style={{ '--dot-color': resp.color } as CSSProperties}></span></td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(resp); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(resp.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'priority' && priorities.map((priority) => (
                      <tr key={priority.id} onClick={() => handleOpenDetail(priority)} className="stv-row">
                        <td data-label="Name" className="stv-td">{priority.name}</td><td data-label="Business" className="stv-td muted">{priority.business || '-'}</td><td data-label="Color" className="stv-td"><span className="stv-color-dot sz-16" style={{ '--dot-color': priority.color } as CSSProperties}></span></td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(priority); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(priority.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'status' && statuses.map((status: any) => (
                      <tr key={status.id} onClick={() => handleOpenDetail(status)} className="stv-row">
                        <td data-label="Order" className="stv-td">{status.order}</td>
                        <td data-label="Name" className="stv-td strong">{status.name}</td>
                        <td data-label="Business" className="stv-td muted">{status.business || '-'}</td>
                        <td data-label="In Dash?" className="stv-td center">
                          <span className={`stv-dash-badge${status.showInDashboard ? ' on' : ''}`}>
                            {status.showInDashboard ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td data-label="Dash Order" className="stv-td center">{status.showInDashboard ? status.dashboardOrder : '-'}</td>
                        <td data-label="Color" className="stv-td"><span className="stv-color-dot sz-16" style={{ '--dot-color': status.color } as CSSProperties}></span></td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(status); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(status.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'place' && places.map((place) => (
                      <tr key={place.id} onClick={() => handleOpenDetail(place)} className="stv-row">
                        <td data-label="Name" className="stv-td">{place.name}</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(place); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(place.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'task' && sortedTasks.map((task) => {
                      const placeName = places.find(p => p.id === task.placeId)?.name || 'Unknown Place';
                      return (
                        <tr key={task.id} onClick={() => handleOpenDetail(task)} className="stv-row">
                          <td data-label="Place" className="stv-td muted">{placeName}</td><td data-label="Task" className="stv-td medium">{task.name}</td>
                          <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(task); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(task.id); }}><Trash2 size={16} /></button></div></td>
                        </tr>
                      )
                    })}

                    {currentSettingView === 'product' && products.map((product) => (
                      <tr key={product.id} onClick={() => handleOpenDetail(product)} className="stv-row">
                        <td data-label="Name" className="stv-td">{product.name}</td><td data-label="Price" className="stv-td muted">{product.price ? `$${Number(product.price).toFixed(2)}` : '-'}</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(product); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(product.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'business' && businesses.map((bus) => (
                      <tr key={bus.id} onClick={() => handleOpenDetail(bus)} className="stv-row">
                        <td data-label="Name" className="stv-td">{bus.name}</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(bus); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(bus.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'service' && services.map((srv) => (
                      <tr key={srv.id} onClick={() => handleOpenDetail(srv)} className="stv-row">
                        <td data-label="Name" className="stv-td">{srv.name}</td><td data-label="Est. Time" className="stv-td muted">{srv.estimatedTime || '-'}</td><td data-label="Business" className="stv-td muted">{srv.business || '-'}</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(srv); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(srv.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'payment' && paymentMethods.map((payment) => (
                      <tr key={payment.id} onClick={() => handleOpenDetail(payment)} className="stv-row">
                        <td data-label="Name" className="stv-td">{payment.name}</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(payment); }}><Edit2 size={16} /></button><button className="stv-icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteClick(payment.id); }}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}

                    {currentSettingView === 'tax' && (
                      <tr onClick={() => handleOpenDetail(taxValue)} className="stv-row">
                        <td data-label="Tax %" className="stv-td tax-value">{taxValue.percentage}%</td>
                        <td data-label="Actions" className="stv-td right"><div className="stv-actions-cell"><button className="stv-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenForm(taxValue); }}><Edit2 size={16} /></button></div></td>
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
        <div className="stv-modal-overlay" onClick={handleCloseForm}>
          <div className={`stv-modal${currentSettingView === 'place' ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
            <header className="stv-modal-header">
              <h3 className="stv-modal-title">{selectedItem ? 'Edit' : 'New'} {activeSettingOption?.label}</h3>
              <button className="stv-modal-close" onClick={handleCloseForm}><X size={20} /></button>
            </header>
            <div className="stv-modal-body">

              {currentSettingView === 'team_catalog' && (
                <div className="stv-form-group">
                  <div className="stv-employee-summary-box">
                    <strong className="stv-employee-summary-name">{selectedItem?.firstName} {selectedItem?.lastName}</strong>
                    <span className="stv-employee-summary-email">{selectedItem?.email}</span>
                  </div>
                  <label className="stv-label">Assign to Team</label>
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
                 <div className="stv-form-group">
                  <label className="stv-label">Place <span className="stv-required-mark">*</span></label>
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
                 <div className="stv-form-group">
                  <label className="stv-label">Tax Percentage (%) <span className="stv-required-mark">*</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    className="stv-input"
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
                      <div className="stv-form-group">
                        <label className="stv-label">Form Order (Dropdown) <span className="stv-required-mark">*</span></label>
                        <input type="number" autoFocus className="stv-input" value={formData.order} onChange={(e) => setFormData({ ...formData, order: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                      </div>

                      {/* NUEVOS CAMPOS PARA STATUS DASHBOARD */}
                      <div className="stv-form-group checkbox-row">
                        <input type="checkbox" id="showDash" checked={formData.showInDashboard} onChange={(e) => setFormData({ ...formData, showInDashboard: e.target.checked })} className="stv-checkbox" />
                        <label htmlFor="showDash" className="stv-label inline">Show as Tab in Dashboard?</label>
                      </div>

                      {formData.showInDashboard && (
                        <div className="stv-form-group">
                          <label className="stv-label">Dashboard Tab Order <span className="stv-required-mark">*</span></label>
                          <input type="number" className="stv-input" value={formData.dashboardOrder} onChange={(e) => setFormData({ ...formData, dashboardOrder: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                        </div>
                      )}
                    </>
                  )}

                  <div className="stv-form-group">
                    <label className="stv-label">
                      {currentSettingView === 'task' ? 'Task Name' :
                       currentSettingView === 'business' ? 'Business Name' :
                       currentSettingView === 'payment' ? 'Payment Method' : 'Name'} <span className="stv-required-mark">*</span>
                    </label>
                    <input type="text" autoFocus={currentSettingView !== 'status'} className="stv-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                  </div>

                  {currentSettingView === 'product' && (
                    <div className="stv-form-group">
                      <label className="stv-label">Price ($)</label>
                      <input type="number" step="0.01" className="stv-input" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} placeholder="0.00" />
                    </div>
                  )}

                  {currentSettingView === 'service' && (
                    <div className="stv-form-group">
                      <label className="stv-label">Estimated time (min)</label>
                      <input type="number" className="stv-input" value={formData.estimatedTime} onChange={(e) => setFormData({ ...formData, estimatedTime: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                    </div>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'priority' || currentSettingView === 'status' || currentSettingView === 'service') && (
                    <div className="stv-form-group">
                      <label className="stv-label">Business</label>
                      <input type="text" className="stv-input" value={formData.business} onChange={(e) => setFormData({ ...formData, business: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                    </div>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'responsable' || currentSettingView === 'priority' || currentSettingView === 'status') && (
                    <div className="stv-form-group">
                      <label className="stv-label">Color Identifier</label>
                      <div className="stv-color-picker-row">
                        <input type="color" className="stv-color-native-input" value={formData.color.length === 7 ? formData.color : '#000000'} onChange={(e) => setFormData({ ...formData, color: e.target.value })} />
                        <input type="text" className="stv-input narrow" value={formData.color.toUpperCase()} onChange={handleColorTextChange} placeholder="#000000" />
                      </div>
                    </div>
                  )}

                  {currentSettingView === 'place' && (
                    <div className="stv-form-group spaced">
                      <label className="stv-label">Tasks associated with this Place</label>
                      <div className="stv-place-tasks-row">
                        <input type="text" className="stv-input grow" placeholder="Add a new task..." value={newTaskInput} onChange={(e) => setNewTaskInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTempTask(e)} />
                        <button className="stv-btn-outline small" onClick={() => handleAddTempTask()}>Add</button>
                      </div>
                      <ul className="stv-place-tasks-list">
                        {formData.placeTasks.length === 0 && <li className="stv-place-task-empty">No tasks added yet.</li>}
                        {formData.placeTasks.map((t) => (
                          <li key={t.id} className="stv-place-task-item">
                            <span className="stv-place-task-name">{t.name}</span>
                            <button className="stv-place-task-remove-btn" onClick={() => setFormData({...formData, placeTasks: formData.placeTasks.filter(pt => pt.id !== t.id)})}><Trash2 size={16}/></button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

            </div>
            <footer className="stv-modal-footer">
              <button className="stv-btn-outline" onClick={handleCloseForm} disabled={isSaving}>Cancel</button>
              <button className="stv-btn-primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL DE DETALLES BLINDADO CENTRADO --- */}
      {isDetailModalOpen && selectedItem && (
        <div className="stv-modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
          <div className={`stv-modal${currentSettingView === 'place' ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
            <header className="stv-modal-header">
              <h3 className="stv-modal-title">{activeSettingOption?.label} Details</h3>
              <button className="stv-modal-close" onClick={() => setIsDetailModalOpen(false)}><X size={20} /></button>
            </header>
            <div className="stv-modal-body">

              {currentSettingView === 'team_catalog' ? (
                <dl className="stv-detail-list">
                  <div className="stv-detail-item"><dt className="stv-detail-label">Employee Name</dt><dd className="stv-detail-value">{selectedItem.firstName} {selectedItem.lastName}</dd></div>
                  <div className="stv-detail-item"><dt className="stv-detail-label">Email Address</dt><dd className="stv-detail-value">{selectedItem.email}</dd></div>
                  <div className="stv-detail-item">
                    <dt className="stv-detail-label">Assigned Team</dt>
                    {teams.find(t => t.id === selectedItem.teamId) ? (
                      <dd className="stv-detail-value-row">
                        <span className="stv-color-dot sz-16" style={{ '--dot-color': teams.find(t => t.id === selectedItem.teamId)?.color } as CSSProperties}></span>
                        <span className="stv-detail-value">{teams.find(t => t.id === selectedItem.teamId)?.name}</span>
                      </dd>
                    ) : (
                      <dd className="stv-detail-value muted-italic">Unassigned</dd>
                    )}
                  </div>
                </dl>
              ) : currentSettingView === 'place' ? (
                <>
                  <div className="stv-detail-item">
                    <span className="stv-detail-label">PLACE NAME:</span>
                    <span className="stv-detail-value">{selectedItem.name}</span>
                  </div>

                  <div className="stv-place-detail-header">
                    <h4 className="stv-place-detail-title">Associated Tasks</h4>
                    <button className="stv-add-task-btn" onClick={() => setShowQuickAdd(!showQuickAdd)}>+ Add Task</button>
                  </div>

                  <div className="stv-place-tasks-table-wrap">
                    <table className="responsive-settings-table stv-table">
                      <thead>
                        <tr><th className="stv-th">TASK NAME</th><th className="stv-th right actions">ACTION</th></tr>
                      </thead>
                      <tbody>
                        {tasks.filter(t => t.placeId === selectedItem.id).length === 0 && !showQuickAdd && (
                          <tr><td colSpan={2} className="stv-td empty">No tasks linked.</td></tr>
                        )}

                        {tasks.filter(t => t.placeId === selectedItem.id).map(t => (
                          <tr key={t.id}>
                            <td data-label="Task Name" className="stv-td">{t.name}</td>
                            <td data-label="Action" className="stv-td right"><button className="stv-remove-task-btn" onClick={() => confirmDeleteTask(t.id)} disabled={isSaving}>{isSaving ? '...' : 'Remove'}</button></td>
                          </tr>
                        ))}

                        {showQuickAdd && (
                          <tr>
                            <td className="stv-td"><input type="text" className="stv-input" placeholder="Type new task and press Enter..." value={newTaskInput} onChange={(e) => setNewTaskInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickAddTask(); } }} autoFocus /></td>
                            <td className="stv-td right"><button className="stv-save-task-btn" onClick={handleQuickAddTask} disabled={isSaving}>Save</button></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : currentSettingView === 'tax' ? (
                <div className="stv-detail-item"><span className="stv-detail-label">Current Tax</span><span className="stv-detail-value large">{selectedItem.percentage}%</span></div>
              ) : (
                <dl className="stv-detail-list">
                  {currentSettingView === 'status' && (
                    <div className="stv-detail-item"><dt className="stv-detail-label">Form Order</dt><dd className="stv-detail-value">{selectedItem.order}</dd></div>
                  )}
                  {currentSettingView === 'task' && (
                    <div className="stv-detail-item"><dt className="stv-detail-label">Place</dt><dd className="stv-detail-value">{places.find(p => p.id === selectedItem.placeId)?.name || 'Unknown'}</dd></div>
                  )}

                  <div className="stv-detail-item">
                    <dt className="stv-detail-label">
                      {currentSettingView === 'task' ? 'Task Name' : currentSettingView === 'business' ? 'Business Name' : currentSettingView === 'payment' ? 'Payment Method' : 'Name'}
                    </dt>
                    <dd className="stv-detail-value">{selectedItem.name}</dd>
                  </div>

                  {currentSettingView === 'product' && (
                    <div className="stv-detail-item"><dt className="stv-detail-label">Price</dt><dd className="stv-detail-value">{selectedItem.price ? `$${Number(selectedItem.price).toFixed(2)}` : 'N/A'}</dd></div>
                  )}

                  {currentSettingView === 'service' && (
                    <div className="stv-detail-item"><dt className="stv-detail-label">Estimated time (min)</dt><dd className="stv-detail-value">{selectedItem.estimatedTime || 'N/A'}</dd></div>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'priority' || currentSettingView === 'status' || currentSettingView === 'service') && (
                    <div className="stv-detail-item"><dt className="stv-detail-label">Business</dt><dd className="stv-detail-value">{selectedItem.business || 'N/A'}</dd></div>
                  )}

                  {currentSettingView === 'status' && (
                    <>
                      <div className="stv-detail-item"><dt className="stv-detail-label">Show in Dashboard?</dt><dd className="stv-detail-value">{selectedItem.showInDashboard ? 'Yes' : 'No'}</dd></div>
                      {selectedItem.showInDashboard && (
                         <div className="stv-detail-item"><dt className="stv-detail-label">Dashboard Tab Order</dt><dd className="stv-detail-value">{selectedItem.dashboardOrder}</dd></div>
                      )}
                    </>
                  )}

                  {(currentSettingView === 'team' || currentSettingView === 'responsable' || currentSettingView === 'priority' || currentSettingView === 'status') && (
                    <div className="stv-detail-item">
                      <dt className="stv-detail-label">Color</dt>
                      <dd className="stv-detail-value-row">
                        <span className="stv-color-dot sz-24" style={{ '--dot-color': selectedItem.color } as CSSProperties}></span>
                        <span className="stv-detail-value mono">{selectedItem.color.toUpperCase()}</span>
                      </dd>
                    </div>
                  )}
                </dl>
              )}

            </div>

            <footer className={`stv-modal-footer${(currentSettingView === 'tax' || currentSettingView === 'team_catalog') ? '' : ' between'}`}>
              {currentSettingView !== 'tax' && currentSettingView !== 'team_catalog' && (
                <button className="stv-btn-danger-light" onClick={() => handleDeleteClick(selectedItem.id)}>
                  <Trash2 size={16}/> Delete {activeSettingOption?.label}
                </button>
              )}

              <div className="stv-detail-footer-actions">
                <button className="stv-btn-outline borderless" onClick={() => setIsDetailModalOpen(false)}>Close</button>
                <button className="stv-btn-primary" onClick={() => handleOpenForm(selectedItem)}>
                  <Edit2 size={16}/> Edit {activeSettingOption?.label}
                </button>
              </div>
            </footer>

          </div>
        </div>
      )}

      {/* --- MODAL DE CONFIRMACIÓN DE ELIMINACIÓN BLINDADO CENTRADO --- */}
      {isDeleteModalOpen && (
        <div className="stv-modal-overlay" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="stv-modal" onClick={e => e.stopPropagation()}>
            <header className="stv-modal-header">
              <h3 className="stv-modal-title">Confirm Deletion</h3>
              <button className="stv-modal-close" onClick={() => setIsDeleteModalOpen(false)}><X size={20} /></button>
            </header>
            <div className="stv-modal-body">
              <p className="stv-delete-confirm-text">Are you sure you want to delete this record? This action cannot be undone.</p>
            </div>
            <footer className="stv-modal-footer">
              <button className="stv-btn-outline" onClick={() => setIsDeleteModalOpen(false)} disabled={isSaving}>Cancel</button>
              <button className="stv-btn-primary danger" onClick={confirmDelete} disabled={isSaving}>{isSaving ? 'Deleting...' : 'Delete'}</button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}