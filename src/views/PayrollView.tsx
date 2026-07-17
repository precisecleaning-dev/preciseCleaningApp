import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  Calendar, User, DollarSign, CheckCircle, Activity, MapPin,
  X, Home, FileText, CalendarDays, Clock, Wrench, Hash, Flag, Users, StickyNote, PenTool, Edit2, Trash2, Save, Menu,
  Search, Wallet, ClipboardList
} from 'lucide-react';
import { payrollService } from '../services/payrollService';
import HousesView from './HousesView'; // ⭐ modo 'modals-only': edición de casa sin salir de Payroll
import { db, auth } from '../config/firebase';
import { collection, onSnapshot, doc, updateDoc, deleteField } from 'firebase/firestore';
import type { PayrollRecord, Property, SystemUser, Status, Team, Priority, Service, Customer, Role } from '../types/index';
import { getRelationName, getRelationColor } from '../utils/relations';
import './PayrollView.css';

interface PayrollViewProps {
  onOpenMenu: () => void;
  // ⭐ Contexto de usuario para el formulario de edición de casa (HousesView modals-only):
  //    sin esto, canEdit de HousesView sería false y el formulario quedaría de solo lectura.
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
}

const collectionMap: Record<string, string> = {
  team: 'settings_teams',
  priority: 'settings_priorities',
  status: 'settings_statuses',
  service: 'settings_services',
};

// paidAt/paidBy no están en el PayrollRecord de types/index.ts, pero handleMarkAsPaid los
// escribe en el documento y el resto del archivo los lee — de ahí salían los `as any`.
type PayrollRecordExt = PayrollRecord & {
  paidAt?: string | null;
  paidBy?: string | null;
  // ⭐ Pago consolidado (pestaña Asignar nómina): las casas incluidas en un pago
  //    llevan batchId y salen de la lista de asignación; paymentDate = fecha del pago.
  batchId?: string | null;
  paymentDate?: string | null;
};

// Tiempo real robusto: soporta ISO 'YYYY-MM-DD', MM/DD/YYYY, DD/MM/YYYY, Timestamps de
// Firestore y Date. Antes había una segunda versión más simple duplicada dentro del
// useEffect de carga, que no soportaba todos estos formatos — unificadas en esta sola.
const toTime = (val: unknown): number => {
  if (val === null || val === undefined || val === '') return NaN;
  if (typeof val === 'object' && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? NaN : d.getTime();
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? NaN : val.getTime();
  const str = String(val).trim();
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
  // ⭐ Regla de negocio: TODAS las fechas con / se capturan como MM/DD/YYYY. Sin
  //    heurística de intercambio día/mes: si el "mes" queda fuera de 1-12, el dato
  //    está mal capturado y se trata como inválido (NaN) para que no contamine el
  //    orden ni los filtros (esos registros caen al final de la tabla).
  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const mon = +slash[1], day = +slash[2], y = +slash[3];
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return NaN;
    return new Date(y, mon - 1, day).getTime();
  }
  const t = new Date(str).getTime();
  return isNaN(t) ? NaN : t;
};

// Nombre del empleado sin "undefined" cuando falta el apellido.
const empName = (e?: SystemUser | null) => e ? [e.firstName, e.lastName].filter(Boolean).join(' ').trim() : '';

// Formateo de fecha a MM/DD/YYYY (autocontenido).
const fmtDate = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  if (typeof val === 'object' && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    const d = (val as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? '' : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }
  const str = String(val).trim();
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${pad(+iso[2])}/${pad(+iso[3])}/${iso[1]}`;
  // ⭐ MM/DD/YYYY estricto; si el mes es inválido se muestra el valor CRUDO tal cual
  //    está guardado, para detectarlo a simple vista y corregirlo con el lápiz de editar.
  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) { const mon = +slash[1], day = +slash[2]; if (mon < 1 || mon > 12 || day < 1 || day > 31) return str; return `${pad(mon)}/${pad(day)}/${slash[3]}`; }
  const d = new Date(str); return isNaN(d.getTime()) ? str : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

// ⭐ Semanas de nómina (pestaña "Nóminas"): lunes-domingo sobre el Schedule Date
//    de la casa vinculada. mondayOf normaliza cualquier timestamp al lunes de su semana.
const mondayOf = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7; // 0=lunes ... 6=domingo
  d.setDate(d.getDate() - diff);
  return d.getTime();
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const weekLabel = (mondayT: number): string => {
  const a = new Date(mondayT);
  const b = new Date(mondayT + 6 * 86400000);
  if (a.getMonth() === b.getMonth()) return `${MESES[a.getMonth()]} ${a.getDate()} - ${b.getDate()}`;
  return `${MESES[a.getMonth()]} ${a.getDate()} - ${MESES[b.getMonth()]} ${b.getDate()}`;
};

export default function PayrollView({ onOpenMenu, currentUser, activeRole, isSuperAdmin }: PayrollViewProps) {
  const [records, setRecords] = useState<PayrollRecordExt[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [employees, setEmployees] = useState<SystemUser[]>([]);

  // Catálogos para el detalle de la casa
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  // ⭐ FIX: cargar customers para resolver el nombre del cliente desde el ID
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Estados de Modales
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecordExt | null>(null);
  const [isEditingPayroll, setIsEditingPayroll] = useState(false);
  const [selectedHouse, setSelectedHouse] = useState<Property | null>(null);
  // ⭐ Casa a EDITAR desde el botón de la fila: monta HousesView en modo 'modals-only'.
  //    IMPORTANTE: houseEditorMounted mantiene HousesView MONTADO una vez usado.
  //    HousesView llama clearHouseToOpenEdit() apenas abre el formulario; si el montaje
  //    dependiera de houseToEdit, se desmontaría en el mismo frame y el modal moriría
  //    al instante (el bug de "el botón no hace nada").
  const [houseToEdit, setHouseToEdit] = useState<Property | null>(null);
  const [houseEditorMounted, setHouseEditorMounted] = useState(false);

  // Formulario temporal de edición
  const [editForm, setEditForm] = useState<PayrollRecordExt | null>(null);

  // ⭐ Filtros de "Asignar nómina": solo fechas (Schedule Date) y empleado
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ⭐ Sub-pestaña de "Asignar nómina" (sustituye al filtro de Status):
  //    pending  = casas que NO están en ninguna nómina
  //    ennomina = casas asignadas a una nómina pero sin pagar
  //    paid     = casas en nómina y marcadas como pagadas
  const [assignView, setAssignView] = useState<'pending' | 'ennomina' | 'paid'>('pending');

  // ⭐ Pestañas del módulo: 'asignar' = registros de Pay (tabla de siempre);
  //    'nominas' = tarjetas semanales por empleado.
  const [tab, setTab] = useState<'asignar' | 'nominas'>('asignar');

  // ⭐ Pestaña Nóminas: semana seleccionada (key = timestamp del lunes), búsqueda y orden
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const [weekSearch, setWeekSearch] = useState('');
  const [weekSort, setWeekSort] = useState<'name' | 'amount'>('name');
  const [weekDetail, setWeekDetail] = useState<{ employee: SystemUser; records: PayrollRecordExt[] } | null>(null);

  // ⭐ Pago consolidado (pestaña Asignar nómina): casas seleccionadas + formulario
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [payForm, setPayForm] = useState<{ date: string; bonus: number; bonusNote: string; discount: number; discountNote: string; status: 'Pending' | 'Paid' } | null>(null);
  // ⭐ Edición de una nómina ya asignada (tarjeta de la pestaña Nóminas)
  const [batchEdit, setBatchEdit] = useState<{ employee: SystemUser; records: PayrollRecordExt[]; date: string; bonus: number; bonusNote: string; discount: number; discountNote: string; status: 'Pending' | 'Paid' } | null>(null);

  // ⭐ Resolver el nombre del cliente desde la colección customers (retrocompatible)
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };

  // ⭐ FIX (amount): el documento en Firestore NO guarda `totalAmount`, solo
  //    baseAmount / extraAmount / discountAmount. Calculamos el total al vuelo:
  //    base + extra - discount. Si existiera totalAmount guardado y distinto de 0,
  //    se respeta ese valor.
  const getTotal = (r?: Partial<PayrollRecord> | null) => {
    if (!r) return 0;
    if (r.totalAmount != null && Number(r.totalAmount) !== 0) return Number(r.totalAmount);
    return Number(r.baseAmount || 0) + Number(r.extraAmount || 0) - Number(r.discountAmount || 0);
  };

  // ⭐ Fecha efectiva de un registro para filtros y semanas: el SCHEDULE DATE de la casa
  //    vinculada (pedido explícito del negocio: la nómina se agrupa por semana trabajada).
  //    Solo si el registro no tiene casa o la casa no tiene scheduleDate, cae a record.date.
  const recScheduleTime = (r: PayrollRecordExt): number => {
    const prop = properties.find(p => p.id === r.propertyId);
    const t = toTime(prop?.scheduleDate);
    if (!isNaN(t)) return t;
    // Registros sin casa (ajustes de bonus/descuento): usan la fecha del pago
    const tp = toTime(r.paymentDate);
    return isNaN(tp) ? toTime(r.date) : tp;
  };

  // ⭐ Semanas disponibles (más reciente primero) con su sufijo de estado:
  //    (Pagado MM/DD/YYYY) cuando toda la semana está pagada, (Pendiente) si no.
  // ⭐ Fecha de agrupación de la pestaña Nóminas: la FECHA DEL PAGO del batch
  //    (payForm.date), NO el Schedule Date de la casa. Así el pago que registras hoy
  //    aparece en la semana actual aunque alguna casa tenga una fecha mal capturada,
  //    y todo el batch (casas + ajuste) queda siempre en la misma semana.
  const recPaymentTime = (r: PayrollRecordExt): number => {
    const tp = toTime(r.paymentDate);
    if (!isNaN(tp)) return tp;
    const ta = toTime(r.paidAt);
    return isNaN(ta) ? toTime(r.date) : ta;
  };

  // ⭐ La pestaña Nóminas SOLO muestra nóminas ASIGNADAS: registros que ya pasaron
  //    por el flujo de pago de "Asignar nómina" (tienen batchId). Lo pendiente de
  //    asignar vive únicamente en la primera pestaña.
  const weeks = useMemo(() => {
    const map = new Map<number, PayrollRecordExt[]>();
    records.filter(r => r.batchId).forEach(r => {
      const t = recPaymentTime(r);
      if (isNaN(t)) return;
      const k = mondayOf(t);
      map.set(k, [...(map.get(k) || []), r]);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([k, recs]) => {
        const allPaid = recs.length > 0 && recs.every(r => r.status === 'Paid');
        const lastPaidT = recs.map(r => toTime(r.paidAt)).filter(t => !isNaN(t)).sort((a, b) => b - a)[0];
        const suffix = allPaid ? (lastPaidT ? `(Pagado ${fmtDate(new Date(lastPaidT))})` : '(Pagado)') : '(Pendiente)';
        return { key: String(k), label: weekLabel(k), suffix };
      });
    // recScheduleTime depende de properties (closure); por eso está en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, properties]);

  // Semana seleccionada por defecto: la más reciente disponible
  useEffect(() => {
    if (weeks.length > 0 && !weeks.some(w => w.key === selectedWeekKey)) setSelectedWeekKey(weeks[0].key);
  }, [weeks, selectedWeekKey]);

  const selectedWeek = weeks.find(w => w.key === selectedWeekKey) || null;

  // ⭐ Tarjetas de la semana: una por empleado, SOLO si tiene nómina asignada en ella.
  const weekCards = useMemo(() => {
    if (!selectedWeekKey) return [];
    const weekT = Number(selectedWeekKey);
    const assigned = records.filter(r => r.batchId);
    const weekRecs = assigned.filter(r => {
      const t = recPaymentTime(r);
      return !isNaN(t) && mondayOf(t) === weekT;
    });
    // ⭐ Solo empleados CON nómina asignada en la semana seleccionada. Las tarjetas
    //    "Missing Payroll" (todo el personal histórico) se eliminaron a pedido del
    //    negocio: generaban tarjetas de empleados que no se podían quitar a mano.
    const cards = employees
      .filter(e => weekRecs.some(r => r.employeeId === e.id))
      .map(emp => {
        const recs = weekRecs.filter(r => r.employeeId === emp.id);
        const total = recs.reduce((s, r) => s + getTotal(r), 0);
        const allPaid = recs.length > 0 && recs.every(r => r.status === 'Paid');
        return { emp, recs, total, allPaid };
      });
    const q = weekSearch.trim().toLowerCase();
    let out = q ? cards.filter(c => empName(c.emp).toLowerCase().includes(q)) : cards;
    if (weekSort === 'amount') out = [...out].sort((a, b) => b.total - a.total);
    else out = [...out].sort((a, b) => empName(a.emp).localeCompare(empName(b.emp)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, employees, properties, selectedWeekKey, weekSearch, weekSort]);

  // Mantiene el modal de detalle semanal sincronizado con los cambios en vivo
  useEffect(() => {
    setWeekDetail(prev => {
      if (!prev) return prev;
      const ids = new Set(prev.records.map(r => r.id));
      return { ...prev, records: records.filter(r => ids.has(r.id)) };
    });
  }, [records]);

  // ⭐ FIX: usar onSnapshot para carga viva. Esto también significa que los cambios
  //         hechos desde otras vistas (Houses, Invoices) se reflejan en tiempo real.
  useEffect(() => {
    setIsLoading(true);
    const unsubscribes: (() => void)[] = [];
    let loaded = 0;
    const TOTAL = 8;
    const tick = () => { loaded++; if (loaded >= TOTAL) setIsLoading(false); };

    // ⭐ FIX (registros nuevos invisibles): NO usar limit() ni orderBy() en el servidor
    //    para esta colección.
    //    - limit(100) sin orderBy devolvía los primeros 100 por ID de documento (orden
    //      lexicográfico), NO los más recientes: al pasar de 100 docs, los pagos nuevos
    //      del botón Pay de Houses quedaban fuera del corte y no aparecían jamás.
    //    - orderBy('date') tampoco sirve: el campo `date` existe en formatos mixtos
    //      ("YYYY-MM-DD", "MM/DD/YYYY", Timestamps — ver toTime()), y el orden
    //      lexicográfico del servidor con formatos mezclados es basura (mostraba
    //      hasta abril y excluía los pagos recientes). Además excluye docs sin `date`.
    //    Por eso: se trae la colección COMPLETA y el orden (más reciente primero) se
    //    resuelve en el cliente con toTime(), tolerante a todos los formatos.
    //    Costo: lecturas = tamaño de la colección por sesión. Esta vista es de admin
    //    (pocos usuarios); si la colección crece a miles, migrar a paginación con
    //    cursor como en ServiciosCompletados, o agregar un campo `createdAt` uniforme.
    unsubscribes.push(onSnapshot(
      collection(db, 'payroll'),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecordExt));
        // Orden de más reciente a más antigua. Sin fecha válida => tratada como 0 (al final).
        data.sort((a, b) => {
          const ta = toTime(a.date), tb = toTime(b.date);
          return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
        });
        console.log(`[PayrollView] Loaded ${data.length} payroll records (colección completa)`);
        setRecords(data);
        tick();
      },
      (err) => { console.error("[PayrollView] Error payroll:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'properties'),
      (snap) => { setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Property[]); tick(); },
      (err) => { console.error("Error properties:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, 'system_users'),
      (snap) => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })) as SystemUser[]); tick(); },
      (err) => { console.error("Error users:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.status),
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Status[];
        setStatuses(data.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)));
        tick();
      },
      (err) => { console.error("Error statuses:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.team),
      (snap) => { setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Team[]); tick(); },
      (err) => { console.error("Error teams:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.priority),
      (snap) => { setPriorities(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Priority[]); tick(); },
      (err) => { console.error("Error priorities:", err); tick(); }
    ));

    unsubscribes.push(onSnapshot(
      collection(db, collectionMap.service),
      (snap) => { setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Service[]); tick(); },
      (err) => { console.error("Error services:", err); tick(); }
    ));

    // ⭐ NUEVO: customers
    unsubscribes.push(onSnapshot(
      collection(db, 'customers'),
      (snap) => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]); tick(); },
      (err) => { console.error("Error customers:", err); tick(); }
    ));

    return () => unsubscribes.forEach(u => u());
  }, []);

  // Lógica de Filtros
  // ⭐ Clasificación de cada casa respecto a la nómina (sub-pestañas):
  const classifyRecord = (r: PayrollRecordExt): 'pending' | 'ennomina' | 'paid' =>
    !r.batchId ? 'pending' : (r.status === 'Paid' ? 'paid' : 'ennomina');

  // Registros filtrados SOLO por fechas (Schedule Date) y empleado; la sub-pestaña
  // reparte después entre pending / en nómina / paid. Los registros de ajuste
  // (bonus/descuento, sin casa) no se listan aquí — se ven en la pestaña Nóminas.
  const baseFiltered = useMemo(() => {
    const startT = startDate ? toTime(startDate) : null;
    const endT = endDate ? toTime(endDate) + (24 * 60 * 60 * 1000 - 1) : null; // fin inclusivo

    return records.filter(record => {
      if (!record.propertyId) return false;
      if (selectedEmployee && record.employeeId !== selectedEmployee) return false;
      if (startT !== null || endT !== null) {
        const recT = recScheduleTime(record);
        if (isNaN(recT)) return false; // sin fecha válida: fuera del rango
        if (startT !== null && recT < startT) return false;
        if (endT !== null && recT > endT) return false;
      }
      return true;
    }).sort((a, b) => {
      // ⭐ Orden principal: fecha del PAGO registrado (record.date) descendente —
      //    el pago que registras hoy desde el botón Pay aparece ARRIBA, sin importar
      //    el Schedule Date de la casa (había casas con schedule en nov/dic que
      //    enterraban los pagos recientes cientos de filas abajo).
      const ca = toTime(a.date), cb = toTime(b.date);
      const d = (isNaN(cb) ? 0 : cb) - (isNaN(ca) ? 0 : ca);
      if (d !== 0) return d;
      // ⭐ Empate (o sin fecha de pago): Schedule Date de la casa descendente.
      const ta = recScheduleTime(a), tb = recScheduleTime(b);
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, properties, startDate, endDate, selectedEmployee]);

  const viewCounts = {
    pending: baseFiltered.filter(r => classifyRecord(r) === 'pending').length,
    ennomina: baseFiltered.filter(r => classifyRecord(r) === 'ennomina').length,
    paid: baseFiltered.filter(r => classifyRecord(r) === 'paid').length,
  };
  const filteredRecords = baseFiltered.filter(r => classifyRecord(r) === assignView);

  // ⭐ Selección de casas para el pago consolidado (solo registros pendientes)
  // La selección para pagar solo aplica en la vista de pendientes
  const selectableRecords = assignView === 'pending' ? filteredRecords.filter(r => r.id) : [];
  const selectedRecords = records.filter(r => r.id && selectedRecordIds.includes(r.id as string));
  const selectedSubtotal = selectedRecords.reduce((s, r) => s + getTotal(r), 0);
  const allPendingSelected = selectableRecords.length > 0 && selectableRecords.every(r => selectedRecordIds.includes(r.id as string));

  const toggleRecordSelected = (r: PayrollRecordExt) => {
    if (!r.id) return;
    const id = r.id as string;
    setSelectedRecordIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    setSelectedRecordIds(allPendingSelected ? [] : selectableRecords.map(r => r.id as string));
  };

  // La selección se limpia al cambiar de empleado en el filtro
  useEffect(() => { setSelectedRecordIds([]); }, [selectedEmployee, assignView]);

  // ⭐ Guarda el pago consolidado: (1) marca cada casa con el batchId, la fecha y el
  //    status elegido; (2) si hay bonus/descuento, crea UN registro de ajuste para el
  //    empleado, así el total semanal de la pestaña Nóminas cuadra con
  //    subtotal + bonus - descuento sin duplicar montos de casas.
  const handleSavePayment = async () => {
    if (!payForm || !selectedEmployee || selectedRecords.length === 0) return;
    const bonus = Number(payForm.bonus || 0);
    const discount = Number(payForm.discount || 0);
    const totalPay = selectedSubtotal + bonus - discount;
    const isPaid = payForm.status === 'Paid';
    const paidBy = isPaid ? (auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown') : '';
    const paidAt = isPaid ? new Date().toISOString().split('T')[0] : '';
    const batchId = `batch_${Date.now()}`;
    setIsSaving(true);
    try {
      await Promise.all(selectedRecords.map(r => updateDoc(doc(db, 'payroll', r.id as string), {
        batchId, paymentDate: payForm.date, status: payForm.status, paidAt, paidBy,
      })));
      if (bonus > 0 || discount > 0) {
        const ajuste: PayrollRecordExt = {
          propertyId: '', employeeId: selectedEmployee, date: payForm.date,
          baseAmount: 0,
          extraAmount: bonus, extraNote: payForm.bonusNote || (bonus > 0 ? 'Bonus del pago consolidado' : ''),
          discountAmount: discount, discountNote: payForm.discountNote || (discount > 0 ? 'Descuento del pago consolidado' : ''),
          totalAmount: bonus - discount, status: payForm.status,
          paidAt, paidBy, batchId, paymentDate: payForm.date,
        };
        await payrollService.create(ajuste);
      }
      setPayForm(null);
      setSelectedRecordIds([]);
      alert(`Pago registrado: ${selectedRecords.length} casa(s) · Total $${totalPay.toFixed(2)}.`);
    } catch (error) {
      console.error('Error registrando el pago consolidado:', error);
      alert('No se pudo registrar el pago.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cálculos dinámicos
  // Totales sobre TODO lo filtrado por fecha/empleado (independiente de la sub-pestaña):
  // pagado = casas en nómina pagadas; en nómina = asignadas sin pagar;
  // pendiente = casas aún sin asignar a ninguna nómina.
  const totalPaid = baseFiltered.filter(r => classifyRecord(r) === 'paid').reduce((sum, r) => sum + getTotal(r), 0);
  const totalEnNomina = baseFiltered.filter(r => classifyRecord(r) === 'ennomina').reduce((sum, r) => sum + getTotal(r), 0);
  const totalPending = baseFiltered.filter(r => classifyRecord(r) === 'pending').reduce((sum, r) => sum + getTotal(r), 0);

  const handleMarkAsPaid = async (record: PayrollRecordExt) => {
    if (!record.id) return;
    if (!window.confirm("Mark this record as Paid?")) return;
    const paidBy = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
    const paidAt = new Date().toISOString().split('T')[0]; // fecha en que se pagó (YYYY-MM-DD)
    try {
      // ⭐ Update directo a Firestore (merge parcial garantizado, sin depender del service)
      await updateDoc(doc(db, 'payroll', record.id), { status: 'Paid', paidAt, paidBy });
    } catch (error: any) {
      console.error("Error updating status", error);
      alert(`No se pudo marcar como pagado: ${error?.message || error?.code || 'error desconocido'}`);
    }
  };

  // ⭐ Marca como pagados TODOS los registros pendientes de un empleado en la semana
  //    (botón de la tarjeta y del modal de detalle semanal).
  const handleMarkWeekPaid = async (recs: PayrollRecordExt[], who: string) => {
    const pending = recs.filter(r => r.id && r.status !== 'Paid');
    if (pending.length === 0) return;
    if (!window.confirm(`¿Marcar como pagada toda la nómina de ${who} (${pending.length} registro(s))?`)) return;
    const paidBy = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
    const paidAt = new Date().toISOString().split('T')[0];
    setIsSaving(true);
    try {
      await Promise.all(pending.map(r => updateDoc(doc(db, 'payroll', r.id as string), { status: 'Paid', paidAt, paidBy })));
    } catch (error) {
      console.error('Error marcando la semana como pagada:', error);
      alert('No se pudieron marcar todos los registros como pagados.');
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ Abre el editor de una nómina asignada, precargando bonus/descuento desde los
  //    registros de ajuste existentes (los que no tienen casa).
  const openBatchEdit = (emp: SystemUser, recs: PayrollRecordExt[]) => {
    const adjustments = recs.filter(r => !r.propertyId);
    setBatchEdit({
      employee: emp,
      records: recs,
      date: (recs.find(r => r.paymentDate)?.paymentDate as string) || new Date().toISOString().split('T')[0],
      bonus: adjustments.reduce((s, r) => s + Number(r.extraAmount || 0), 0),
      bonusNote: adjustments.map(r => r.extraNote).filter(Boolean).join(' · '),
      discount: adjustments.reduce((s, r) => s + Number(r.discountAmount || 0), 0),
      discountNote: adjustments.map(r => r.discountNote).filter(Boolean).join(' · '),
      status: recs.length > 0 && recs.every(r => r.status === 'Paid') ? 'Paid' : 'Pending',
    });
  };

  // ⭐ Guarda la edición: actualiza fecha/status de las casas y consolida el ajuste en
  //    UN solo registro (elimina los previos; crea el nuevo solo si hay bonus/descuento).
  const handleSaveBatchEdit = async () => {
    if (!batchEdit) return;
    const houses = batchEdit.records.filter(r => r.propertyId && r.id);
    const adjustments = batchEdit.records.filter(r => !r.propertyId && r.id);
    const bonus = Number(batchEdit.bonus || 0);
    const discount = Number(batchEdit.discount || 0);
    const isPaid = batchEdit.status === 'Paid';
    const paidBy = isPaid ? (auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown') : '';
    const paidAt = isPaid ? new Date().toISOString().split('T')[0] : '';
    const batchId = (batchEdit.records.find(r => r.batchId)?.batchId as string) || `batch_${Date.now()}`;
    setIsSaving(true);
    try {
      await Promise.all(houses.map(r => updateDoc(doc(db, 'payroll', r.id as string), {
        paymentDate: batchEdit.date, status: batchEdit.status, paidAt, paidBy,
      })));
      await Promise.all(adjustments.map(r => payrollService.delete(r.id as string)));
      if (bonus > 0 || discount > 0) {
        const ajuste: PayrollRecordExt = {
          propertyId: '', employeeId: (batchEdit.employee.id as string), date: batchEdit.date,
          baseAmount: 0,
          extraAmount: bonus, extraNote: batchEdit.bonusNote || (bonus > 0 ? 'Bonus del pago consolidado' : ''),
          discountAmount: discount, discountNote: batchEdit.discountNote || (discount > 0 ? 'Descuento del pago consolidado' : ''),
          totalAmount: bonus - discount, status: batchEdit.status,
          paidAt, paidBy, batchId, paymentDate: batchEdit.date,
        };
        await payrollService.create(ajuste);
      }
      setBatchEdit(null);
      setWeekDetail(null);
    } catch (error) {
      console.error('Error editando la nómina:', error);
      alert('No se pudo guardar la edición de la nómina.');
    } finally {
      setIsSaving(false);
    }
  };

  // ⭐ Elimina la nómina asignada: las casas vuelven a "Asignar nómina" como pendientes
  //    (se les quita el batch) y los registros de ajuste se borran.
  const handleDeleteBatch = async (emp: SystemUser, recs: PayrollRecordExt[]) => {
    if (!window.confirm(`¿Eliminar la nómina de ${empName(emp)} de esta semana? Las casas volverán a "Asignar nómina" como pendientes.`)) return;
    const houses = recs.filter(r => r.propertyId && r.id);
    const adjustments = recs.filter(r => !r.propertyId && r.id);
    setIsSaving(true);
    try {
      await Promise.all(houses.map(r => updateDoc(doc(db, 'payroll', r.id as string), {
        batchId: deleteField(), paymentDate: deleteField(), status: 'Pending', paidAt: '', paidBy: '',
      })));
      await Promise.all(adjustments.map(r => payrollService.delete(r.id as string)));
      setWeekDetail(null);
    } catch (error) {
      console.error('Error eliminando la nómina:', error);
      alert('No se pudo eliminar la nómina.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAsPending = async (record: PayrollRecordExt) => {
    if (!record.id) return;
    if (!window.confirm("Change status back to Pending?")) return;
    try {
      await updateDoc(doc(db, 'payroll', record.id), { status: 'Pending', paidAt: '', paidBy: '' });
    } catch (error: any) {
      console.error("Error updating status", error);
      alert(`No se pudo cambiar a Pending: ${error?.message || error?.code || 'error desconocido'}`);
    }
  };

  const handleDeletePayroll = async (id: string) => {
    if (!window.confirm("Are you sure you want to completely delete this payment record? This action cannot be undone.")) return;
    setIsSaving(true);
    try {
      await payrollService.delete(id);
    } catch (error) {
      console.error("Error deleting payroll record:", error);
      alert("Failed to delete record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditModal = (record: PayrollRecord) => {
    setEditForm({ ...record });
    setSelectedPayroll(null);
    setIsEditingPayroll(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editForm.id) return;
    
    const total = Number(editForm.baseAmount || 0) + Number(editForm.extraAmount || 0) - Number(editForm.discountAmount || 0);
    const finalData = { ...editForm, totalAmount: total };

    setIsSaving(true);
    try {
      await payrollService.update(editForm.id, finalData);
      setIsEditingPayroll(false);
      setEditForm(null);
    } catch (error) {
      console.error("Error saving payroll edit:", error);
      alert("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  // Efecto para actualizar el total automáticamente mientras se edita
  useEffect(() => {
    if (editForm) {
      const total = Number(editForm.baseAmount || 0) + Number(editForm.extraAmount || 0) - Number(editForm.discountAmount || 0);
      if (editForm.totalAmount !== total) {
        setEditForm({ ...editForm, totalAmount: total });
      }
    }
  }, [editForm?.baseAmount, editForm?.extraAmount, editForm?.discountAmount]);


  return (
    <div className="fade-in pv-page">

      {/* HEADER */}
      <header className="main-header dashboard-header-container pv-header">
        <div className="view-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <Menu size={24} />
          </button>
          <div>
            <h1 className="pv-title">Payroll & Payments</h1>
            <p className="pv-subtitle">Manage employee payments and debts</p>
          </div>
        </div>
      </header>

      {/* PESTAÑAS: Asignar nómina (registros de Pay) | Nóminas (semanal por empleado) */}
      <div className="pv-tabbar">
        <button className={`pv-tab-btn${tab === 'asignar' ? ' active' : ''}`} onClick={() => setTab('asignar')}>
          <ClipboardList size={16} /> Asignar nómina
        </button>
        <button className={`pv-tab-btn${tab === 'nominas' ? ' active' : ''}`} onClick={() => setTab('nominas')}>
          <Wallet size={16} /> Nóminas
        </button>
      </div>

      {/* ═══════════ PESTAÑA 1: ASIGNAR NÓMINA (registros creados desde "Pay" en Houses) ═══════════ */}
      {tab === 'asignar' && (<>

      {/* FILTROS */}
      <div className="pv-filters">
        <div className="pv-filter-item">
          <label className="pv-label">Schedule Date (inicio)</label>
          <div className="pv-input-wrap">
            <Calendar size={16} color="#9ca3af" className="pv-input-icon" />
            <input type="date" className="pv-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="pv-filter-item">
          <label className="pv-label">Schedule Date (fin)</label>
          <div className="pv-input-wrap">
            <Calendar size={16} color="#9ca3af" className="pv-input-icon" />
            <input type="date" className="pv-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="pv-filter-item employee">
          <label className="pv-label">Employee</label>
          <div className="pv-input-wrap">
            <User size={16} color="#9ca3af" className="pv-input-icon" />
            {/* ⭐ Buscador: escribe para filtrar; elige una sugerencia para aplicar. Vacío = todos. */}
            <input
              list="pv-employee-list"
              className="pv-input"
              placeholder="All Employees..."
              value={employeeQuery}
              onChange={e => {
                const v = e.target.value;
                setEmployeeQuery(v);
                const match = employees.find(emp => empName(emp).toLowerCase() === v.toLowerCase().trim());
                setSelectedEmployee(match ? match.id : '');
              }}
            />
            <datalist id="pv-employee-list">
              {employees.map(emp => <option key={emp.id} value={empName(emp)} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* ⭐ SUB-PESTAÑAS (sustituyen al filtro de Status): estado de cada casa
          respecto a la nómina */}
      <div className="pva-subtabs">
        <button className={`pva-subtab${assignView === 'pending' ? ' active' : ''}`} onClick={() => setAssignView('pending')}>
          Pending ({viewCounts.pending})
        </button>
        <button className={`pva-subtab ennomina${assignView === 'ennomina' ? ' active' : ''}`} onClick={() => setAssignView('ennomina')}>
          En nómina ({viewCounts.ennomina})
        </button>
        <button className={`pva-subtab paid${assignView === 'paid' ? ' active' : ''}`} onClick={() => setAssignView('paid')}>
          Paid ({viewCounts.paid})
        </button>
      </div>

      {/* RESUMEN FINANCIERO */}
      <div className="pv-summary-grid">
        <div className="pv-summary-card paid">
          <div className="pv-summary-icon-box paid"><CheckCircle size={24} /></div>
          <div>
            <div className="pv-summary-label paid">Total Paid (Filtered)</div>
            <div className="pv-summary-value paid">${totalPaid.toFixed(2)}</div>
          </div>
        </div>
        <div className="pv-summary-card ennomina">
          <div className="pv-summary-icon-box ennomina"><Wallet size={24} /></div>
          <div>
            <div className="pv-summary-label ennomina">Total en nómina (Filtered)</div>
            <div className="pv-summary-value ennomina">${totalEnNomina.toFixed(2)}</div>
          </div>
        </div>
        <div className="pv-summary-card pending">
          <div className="pv-summary-icon-box pending"><DollarSign size={24} /></div>
          <div>
            <div className="pv-summary-label pending">Total Pending (Filtered)</div>
            <div className="pv-summary-value pending">${totalPending.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* ⭐ BARRA DE PAGO: aparece al seleccionar casas del empleado filtrado */}
      {selectedEmployee && selectedRecordIds.length > 0 && (
        <div className="pv-paybar">
          <span className="pv-paybar-text">
            {selectedRecordIds.length} casa(s) seleccionada(s) · Subtotal ${selectedSubtotal.toFixed(2)}
          </span>
          <button
            className="pv-paybar-btn"
            onClick={() => setPayForm({ date: new Date().toISOString().split('T')[0], bonus: 0, bonusNote: '', discount: 0, discountNote: '', status: 'Pending' })}
          >
            <Wallet size={16} /> Pagar seleccionadas
          </button>
        </div>
      )}

      {/* REGISTROS */}
      <div className="pv-table-wrap">
        <table className="pv-table">
          <thead>
            <tr>
              {/* ⭐ Columna de selección: solo en la vista Pending y con empleado elegido */}
              {selectedEmployee && assignView === 'pending' && (
                <th className="pv-th check">
                  <input
                    type="checkbox"
                    className="pv-row-check"
                    checked={allPendingSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todas las casas pendientes"
                  />
                </th>
              )}
              <th className="pv-th">Property</th>
              <th className="pv-th">Schedule Date</th>
              <th className="pv-th">Employee</th>
              <th className="pv-th right">Total Amount</th>
              <th className="pv-th actions right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5} className="pv-empty-cell">Loading payroll data...</td></tr>
            ) : records.length === 0 ? (
              // ⭐ Distinguir entre "BD vacía" y "filtros excluyen todo"
              <tr><td colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5} className="pv-empty-cell">No payroll records in database yet. Register payments from the Houses view.</td></tr>
            ) : filteredRecords.length === 0 ? (
              <tr><td colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5} className="pv-empty-cell italic">
                {assignView === 'pending'
                  ? 'No hay casas pendientes de asignar con los filtros actuales.'
                  : assignView === 'ennomina'
                    ? 'No hay casas en nómina sin pagar con los filtros actuales.'
                    : 'No hay casas pagadas con los filtros actuales.'}
              </td></tr>
            ) : (
              filteredRecords.map(record => {
                const emp = employees.find(e => e.id === record.employeeId);
                const prop = properties.find(p => p.id === record.propertyId);
                const isSelected = record.id ? selectedRecordIds.includes(record.id as string) : false;
                // ⭐ Resolver nombre del cliente
                const clientName = prop ? getClientName(prop.client) : 'Unknown Property';

                return (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedPayroll(record)}
                    className="pv-row"
                  >
                    {/* ⭐ Check para armar el pago del empleado (solo casas pendientes) */}
                    {selectedEmployee && assignView === 'pending' && (
                      <td className="pv-td check" onClick={(e) => e.stopPropagation()}>
                        {record.status !== 'Paid' && (
                          <input
                            type="checkbox"
                            className="pv-row-check"
                            checked={isSelected}
                            onChange={() => toggleRecordSelected(record)}
                            aria-label="Seleccionar casa para pagar"
                          />
                        )}
                      </td>
                    )}

                    <td className="pv-td">
                      <div className="pv-client-name">{clientName}</div>
                      <div className="pv-client-address"><MapPin size={12} /> {prop ? prop.address : 'Unknown Address'}</div>
                    </td>

                    {/* ⭐ Muestra el Schedule Date de la casa (coherente con el filtro); cae a record.date si no hay */}
                    <td className="pv-td">{fmtDate(prop?.scheduleDate || record.date)}</td>

                    <td className="pv-td strong">{empName(emp) || 'Unknown'}</td>

                    <td className="pv-td amount">${getTotal(record).toFixed(2)}</td>

                    {/* ⭐ Acciones al final de la fila (el status ahora se gestiona al pagar
                        y desde la pestaña Nóminas, ya no con Mark Paid aquí) */}
                    <td className="pv-td right" onClick={(e) => e.stopPropagation()}>
                      <div className="pv-row-actions end">
                        {/* ⭐ Abre el FORMULARIO DE EDICIÓN de la casa (HousesView modals-only) para rectificar información */}
                        {prop && <button onClick={() => { setHouseEditorMounted(true); setHouseToEdit(prop); }} className="pv-icon-btn edit" title="Editar casa"><Home size={16} /></button>}
                        <button onClick={() => handleOpenEditModal(record)} className="pv-icon-btn edit" title="Editar pago"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeletePayroll(record.id as string)} className="pv-icon-btn delete" title="Eliminar"><Trash2 size={16} /></button>
                      </div>
                    </td>

                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      </>)}

      {/* ═══════════ PESTAÑA 2: NÓMINAS SEMANALES POR EMPLEADO ═══════════ */}
      {tab === 'nominas' && (
        <>
          {/* Toolbar: semana + búsqueda + orden */}
          <div className="pnw-toolbar">
            <div className="pnw-toolbar-row">
              <div className="pnw-field week">
                <label className="pv-label" htmlFor="pnw-week">Semana (fecha de pago)</label>
                <select id="pnw-week" className="pv-input pnw-select" value={selectedWeekKey} onChange={e => setSelectedWeekKey(e.target.value)}>
                  {weeks.length === 0 && <option value="">Sin semanas con nómina</option>}
                  {weeks.map(w => <option key={w.key} value={w.key}>{w.label} {w.suffix}</option>)}
                </select>
              </div>
              <div className="pnw-field grow">
                <label className="pv-label" htmlFor="pnw-search">Buscar</label>
                <div className="pv-input-wrap">
                  <Search size={16} color="#9ca3af" className="pv-input-icon" />
                  <input id="pnw-search" className="pv-input" placeholder="Nombre..." value={weekSearch} onChange={e => setWeekSearch(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="pnw-toolbar-row bottom">
              <div className="pnw-field">
                <span className="pv-label">Ordenar por</span>
                <div className="pnw-sort-group">
                  <button className={`pnw-sort-btn${weekSort === 'name' ? ' active' : ''}`} onClick={() => setWeekSort('name')}>Nombre (A-Z)</button>
                  <button className={`pnw-sort-btn${weekSort === 'amount' ? ' active' : ''}`} onClick={() => setWeekSort('amount')}>Payroll (mayor a menor)</button>
                </div>
              </div>
              <button className="pnw-clear-btn" onClick={() => { setWeekSearch(''); setWeekSort('name'); if (weeks[0]) setSelectedWeekKey(weeks[0].key); }}>
                Limpiar filtros
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="pnw-empty">Cargando nóminas...</div>
          ) : weeks.length === 0 ? (
            <div className="pnw-empty">
              Aún no hay nóminas asignadas. Ve a la pestaña "Asignar nómina", elige un empleado, marca sus casas con el check y presiona "Pagar seleccionadas" — el pago aparecerá aquí agrupado por semana.
            </div>
          ) : (
            <ul className="pnw-grid">
              {weekCards.map(card => {
                const stateCls = card.allPaid ? ' paid' : ' pending';
                return (
                  <li
                    key={card.emp.id}
                    className={`pnw-card${stateCls}`}
                    onClick={() => setWeekDetail({ employee: card.emp, records: card.recs })}
                  >
                    <div className="pnw-card-top">
                      <div className="pnw-card-head-row">
                        <h3 className="pnw-card-name">{empName(card.emp) || 'Sin nombre'}</h3>
                        <div className="pnw-card-actions">
                          <button
                            className="pnw-card-icon-btn edit"
                            title="Editar nómina (fecha, bonus, descuento, status)"
                            onClick={(e) => { e.stopPropagation(); openBatchEdit(card.emp, card.recs); }}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            className="pnw-card-icon-btn delete"
                            title="Eliminar nómina — las casas vuelven a Asignar nómina"
                            onClick={(e) => { e.stopPropagation(); handleDeleteBatch(card.emp, card.recs); }}
                            disabled={isSaving}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="pnw-card-range">
                        <CalendarDays size={13} /> {selectedWeek ? selectedWeek.label : ''}
                      </div>
                    </div>
                    <div className="pnw-card-divider" />
                    <div className="pnw-card-body">
                      <div className="pnw-amount">${card.total.toFixed(2)}</div>
                      <div className="pnw-card-bottom">
                        {card.allPaid
                          ? <span className="pnw-status-chip paid">● Pagado</span>
                          : <span className="pnw-status-chip pending">● No Pagado</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
              {weekCards.length === 0 && <li className="pnw-empty">No hay nóminas asignadas en esta semana (o ninguna coincide con la búsqueda).</li>}
            </ul>
          )}
        </>
      )}

      {/* --- MODAL: REGISTRAR PAGO CONSOLIDADO (casas seleccionadas del empleado) --- */}
      {payForm && (() => {
        const emp = employees.find(e => e.id === selectedEmployee) || null;
        const bonus = Number(payForm.bonus || 0);
        const discount = Number(payForm.discount || 0);
        const totalPay = selectedSubtotal + bonus - discount;
        return (
          <div className="modal-overlay-centered" onClick={() => setPayForm(null)}>
            <div className="modal-70 pv-edit-modal pvp-modal" onClick={e => e.stopPropagation()}>
              <header className="pv-modal-header">
                <h3 className="pv-modal-title">Pagar nómina — {empName(emp) || 'Empleado'}</h3>
                <button className="pv-modal-close" onClick={() => setPayForm(null)}><X size={24} /></button>
              </header>
              <div className="pv-modal-body">
                <div className="pv-edit-grid">
                  <div className="pv-edit-row">
                    <div className="pv-edit-field">
                      <label className="pv-label">Fecha</label>
                      <input type="date" className="pv-input pvp-input-plain" value={payForm.date} onChange={e => setPayForm({ ...payForm, date: e.target.value })} />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Empleado</label>
                      <input className="pv-input pvp-input-plain" value={empName(emp)} readOnly />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Status</label>
                      <select className="pv-input pvp-input-plain" value={payForm.status} onChange={e => setPayForm({ ...payForm, status: e.target.value as 'Pending' | 'Paid' })}>
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>
                  <div className="pv-edit-row">
                    <div className="pv-edit-field">
                      <label className="pv-label">Subtotal (casas)</label>
                      <input className="pv-input pvp-input-plain" value={`$${selectedSubtotal.toFixed(2)}`} readOnly />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Bonus (+)</label>
                      <input type="number" min={0} className="pv-input pvp-input-plain" value={payForm.bonus} onChange={e => setPayForm({ ...payForm, bonus: Number(e.target.value) })} />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Discount (−)</label>
                      <input type="number" min={0} className="pv-input pvp-input-plain" value={payForm.discount} onChange={e => setPayForm({ ...payForm, discount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="pv-edit-row">
                    <div className="pv-edit-field">
                      <label className="pv-label">Nota del bonus</label>
                      <input className="pv-input pvp-input-plain" placeholder="Motivo del bonus..." value={payForm.bonusNote} onChange={e => setPayForm({ ...payForm, bonusNote: e.target.value })} />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Nota del descuento</label>
                      <input className="pv-input pvp-input-plain" placeholder="Motivo del descuento..." value={payForm.discountNote} onChange={e => setPayForm({ ...payForm, discountNote: e.target.value })} />
                    </div>
                  </div>
                  <div className="pv-total-row">
                    <span className="pv-total-label">Total a pagar</span>
                    <span className="pv-total-value">${totalPay.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="pv-label">Casas incluidas en este pago ({selectedRecords.length})</span>
                    <ul className="pvp-house-list">
                      {selectedRecords.map(rec => {
                        const prop = properties.find(p => p.id === rec.propertyId);
                        return (
                          <li key={rec.id} className="pvp-house">
                            <div className="pvp-house-info">
                              <div className="pv-client-name">{prop ? getClientName(prop.client) : 'Unknown Property'}</div>
                              <div className="pv-client-address"><MapPin size={12} /> {prop?.address || '—'} · {fmtDate(prop?.scheduleDate || rec.date)}</div>
                            </div>
                            <div className="pvp-house-amount">${getTotal(rec).toFixed(2)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
              <footer className="pv-modal-footer">
                <button className="pv-btn-outline-modal" onClick={() => setPayForm(null)}>Cancel</button>
                <button className="pv-btn-primary-modal green" onClick={handleSavePayment} disabled={isSaving || selectedRecords.length === 0}>
                  <Save size={16} /> {isSaving ? 'Guardando...' : 'Registrar pago'}
                </button>
              </footer>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: EDITAR NÓMINA ASIGNADA (fecha, bonus, descuento, status) --- */}
      {batchEdit && (() => {
        const housesInBatch = batchEdit.records.filter(r => r.propertyId);
        const subtotal = housesInBatch.reduce((s, r) => s + getTotal(r), 0);
        const bonus = Number(batchEdit.bonus || 0);
        const discount = Number(batchEdit.discount || 0);
        const totalPay = subtotal + bonus - discount;
        return (
          <div className="modal-overlay-centered" onClick={() => setBatchEdit(null)}>
            <div className="modal-70 pv-edit-modal pvp-modal" onClick={e => e.stopPropagation()}>
              <header className="pv-modal-header">
                <h3 className="pv-modal-title">Editar nómina — {empName(batchEdit.employee)}</h3>
                <button className="pv-modal-close" onClick={() => setBatchEdit(null)}><X size={24} /></button>
              </header>
              <div className="pv-modal-body">
                <div className="pv-edit-grid">
                  <div className="pv-edit-row">
                    <div className="pv-edit-field">
                      <label className="pv-label">Fecha del pago</label>
                      <input type="date" className="pv-input pvp-input-plain" value={batchEdit.date} onChange={e => setBatchEdit({ ...batchEdit, date: e.target.value })} />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Status</label>
                      <select className="pv-input pvp-input-plain" value={batchEdit.status} onChange={e => setBatchEdit({ ...batchEdit, status: e.target.value as 'Pending' | 'Paid' })}>
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>
                  <div className="pv-edit-row">
                    <div className="pv-edit-field">
                      <label className="pv-label">Subtotal (casas)</label>
                      <input className="pv-input pvp-input-plain" value={`$${subtotal.toFixed(2)}`} readOnly />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Bonus (+)</label>
                      <input type="number" min={0} className="pv-input pvp-input-plain" value={batchEdit.bonus} onChange={e => setBatchEdit({ ...batchEdit, bonus: Number(e.target.value) })} />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Discount (−)</label>
                      <input type="number" min={0} className="pv-input pvp-input-plain" value={batchEdit.discount} onChange={e => setBatchEdit({ ...batchEdit, discount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="pv-edit-row">
                    <div className="pv-edit-field">
                      <label className="pv-label">Nota del bonus</label>
                      <input className="pv-input pvp-input-plain" placeholder="Motivo del bonus..." value={batchEdit.bonusNote} onChange={e => setBatchEdit({ ...batchEdit, bonusNote: e.target.value })} />
                    </div>
                    <div className="pv-edit-field">
                      <label className="pv-label">Nota del descuento</label>
                      <input className="pv-input pvp-input-plain" placeholder="Motivo del descuento..." value={batchEdit.discountNote} onChange={e => setBatchEdit({ ...batchEdit, discountNote: e.target.value })} />
                    </div>
                  </div>
                  <div className="pv-total-row">
                    <span className="pv-total-label">Total a pagar</span>
                    <span className="pv-total-value">${totalPay.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="pv-label">Casas incluidas ({housesInBatch.length})</span>
                    <ul className="pvp-house-list">
                      {housesInBatch.map(rec => {
                        const prop = properties.find(p => p.id === rec.propertyId);
                        return (
                          <li key={rec.id} className="pvp-house">
                            <div className="pvp-house-info">
                              <div className="pv-client-name">{prop ? getClientName(prop.client) : 'Unknown Property'}</div>
                              <div className="pv-client-address"><MapPin size={12} /> {prop?.address || '—'} · {fmtDate(prop?.scheduleDate || rec.date)}</div>
                            </div>
                            <div className="pvp-house-amount">${getTotal(rec).toFixed(2)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
              <footer className="pv-modal-footer">
                <button className="pv-btn-outline-modal" onClick={() => setBatchEdit(null)}>Cancel</button>
                <button className="pv-btn-primary-modal green" onClick={handleSaveBatchEdit} disabled={isSaving}>
                  <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </footer>
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: DETALLE DE NÓMINA SEMANAL (qué casas, extras y descuentos) --- */}
      {weekDetail && (
        <div className="modal-overlay-centered" onClick={() => setWeekDetail(null)}>
          <div className="modal-70 pnw-detail-modal" onClick={e => e.stopPropagation()}>
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Nómina — {empName(weekDetail.employee)}</h3>
              <button className="pv-modal-close" onClick={() => setWeekDetail(null)}><X size={24} /></button>
            </header>
            <div className="pv-modal-body">
              {(() => {
                const houses = weekDetail.records.filter(r => r.propertyId);
                const adjustments = weekDetail.records.filter(r => !r.propertyId);
                const subtotal = houses.reduce((s, r) => s + getTotal(r), 0);
                const bonus = adjustments.reduce((s, r) => s + Number(r.extraAmount || 0), 0);
                const discount = adjustments.reduce((s, r) => s + Number(r.discountAmount || 0), 0);
                const totalPay = subtotal + bonus - discount;
                const payDate = weekDetail.records.find(r => r.paymentDate)?.paymentDate || weekDetail.records[0]?.date;
                const allPaid = weekDetail.records.length > 0 && weekDetail.records.every(r => r.status === 'Paid');
                return (
                  <>
                    {/* Resumen del pago */}
                    <dl className="pnw-summary-dl">
                      <div className="pnw-sum-pair"><dt>Fecha</dt><dd>{fmtDate(payDate)}</dd></div>
                      <div className="pnw-sum-pair"><dt>Empleado</dt><dd>{empName(weekDetail.employee)}</dd></div>
                      <div className="pnw-sum-pair">
                        <dt>Status</dt>
                        <dd>{allPaid
                          ? <span className="pnw-status-chip paid">● Pagado</span>
                          : <span className="pnw-status-chip pending">● No Pagado</span>}</dd>
                      </div>
                      <div className="pnw-sum-pair"><dt>Subtotal (casas)</dt><dd>${subtotal.toFixed(2)}</dd></div>
                      <div className="pnw-sum-pair extra"><dt>Bonus</dt><dd>+${bonus.toFixed(2)}</dd></div>
                      <div className="pnw-sum-pair discount"><dt>Descuento</dt><dd>−${discount.toFixed(2)}</dd></div>
                    </dl>

                    <div className="pv-total-row">
                      <span className="pv-total-label">Total a pagar</span>
                      <span className="pv-total-value">${totalPay.toFixed(2)}</span>
                    </div>

                    {/* Subtabla de casas asignadas (clic en la fila = detalle de la casa) */}
                    <span className="pv-label pnw-table-label">Casas asignadas ({houses.length})</span>
                    <div className="pnw-subtable-wrap">
                      <table className="pnw-subtable">
                        <thead>
                          <tr>
                            <th>Cliente</th>
                            <th>Dirección</th>
                            <th>Schedule</th>
                            <th className="right">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {houses.map(rec => {
                            const prop = properties.find(p => p.id === rec.propertyId);
                            return (
                              <tr
                                key={rec.id}
                                className={prop ? 'clickable' : ''}
                                onClick={() => { if (prop) setSelectedHouse(prop); }}
                                title={prop ? 'Ver detalle de la casa' : undefined}
                              >
                                <td className="client">{prop ? getClientName(prop.client) : 'Unknown Property'}</td>
                                <td className="addr">{prop?.address || '—'}</td>
                                <td>{fmtDate(prop?.scheduleDate || rec.date)}</td>
                                <td className="right amount">${getTotal(rec).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
            <footer className="pv-modal-footer">
              {weekDetail.records.some(r => r.status !== 'Paid') && (
                <button className="pv-btn-primary-modal green" onClick={() => handleMarkWeekPaid(weekDetail.records, empName(weekDetail.employee))} disabled={isSaving}>
                  <CheckCircle size={16} /> Marcar nómina como pagada
                </button>
              )}
              <button className="pv-btn-close-plain" onClick={() => setWeekDetail(null)}>Cerrar</button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL DETALLE DEL PAGO --- */}
      {selectedPayroll && (
        <div className="modal-overlay-centered" onClick={() => setSelectedPayroll(null)}>
          <div className="modal-70 pv-payment-modal" onClick={e => e.stopPropagation()}>
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Payment Details</h3>
              <button className="pv-modal-close" onClick={() => setSelectedPayroll(null)}><X size={24} /></button>
            </header>

            <div className="pv-modal-body">
              {(() => {
                const emp = employees.find(e => e.id === selectedPayroll.employeeId);
                const prop = properties.find(p => p.id === selectedPayroll.propertyId);
                const isPaid = selectedPayroll.status === 'Paid';
                const clientName = prop ? getClientName(prop.client) : 'Unknown Property';

                return (
                  <>
                    <div className="pv-payment-top-row">
                      <div>
                        <h4 className="pv-payment-employee-name">
                          <User size={22} color="#3b82f6" /> {empName(emp) || 'Unknown Employee'}
                        </h4>
                        <div className="pv-payment-paid-on">
                          <CalendarDays size={16} /> Paid on: {fmtDate(selectedPayroll.paidAt || selectedPayroll.date)}{selectedPayroll.paidBy ? ` · by ${selectedPayroll.paidBy}` : ''}
                        </div>
                      </div>
                      <span className={`pv-payment-status-chip ${isPaid ? 'paid' : 'pending'}`}>
                        {selectedPayroll.status || 'Pending'}
                      </span>
                    </div>

                    <div className="pv-detail-banner">
                      <div className="pv-property-banner-inner">
                        <div className="pv-property-banner-col">
                          <span className="pv-detail-label blue"><Home size={14} /> PROPERTY COMPLETED</span>
                          <span className="pv-property-banner-client">{clientName}</span>
                          <span className="pv-property-banner-address">
                            <MapPin size={14}/> {prop ? prop.address : 'Unknown Address'}
                          </span>
                        </div>
                        <button
                          onClick={() => { setSelectedHouse(prop || null); setSelectedPayroll(null); }}
                          className="pv-view-property-btn"
                        >
                          <FileText size={18} /> View Property
                        </button>
                      </div>
                    </div>

                    <div className="pv-amounts-grid">
                      <div className="pv-amount-box">
                        <span className="pv-amount-label">Base Amount</span>
                        <span className="pv-amount-value">${Number(selectedPayroll.baseAmount || 0).toFixed(2)}</span>
                      </div>
                      <div className="pv-amount-box">
                        <span className="pv-amount-label">Extra Amount</span>
                        <span className="pv-amount-value">+ ${Number(selectedPayroll.extraAmount || 0).toFixed(2)}</span>
                        {selectedPayroll.extraNote && <span className="pv-amount-note">"{selectedPayroll.extraNote}"</span>}
                      </div>
                      <div className="pv-amount-box discount">
                        <span className="pv-amount-label discount">Discount</span>
                        <span className="pv-amount-value discount">- ${Number(selectedPayroll.discountAmount || 0).toFixed(2)}</span>
                        {selectedPayroll.discountNote && <span className="pv-amount-note discount">"{selectedPayroll.discountNote}"</span>}
                      </div>
                      <div className="pv-amount-box total">
                        <span className="pv-amount-label total">TOTAL PAYOUT</span>
                        <span className="pv-amount-value total">${getTotal(selectedPayroll).toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <footer className="pv-modal-footer">
              <button className="pv-btn-outline-modal" onClick={() => setSelectedPayroll(null)}>Close</button>
              {selectedPayroll.status === 'Paid' ? (
                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPending(selectedPayroll); setSelectedPayroll(null); }} className="pv-btn-outline-modal">Mark as Pending</button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); handleMarkAsPaid(selectedPayroll); setSelectedPayroll(null); }} className="pv-btn-primary-modal green"><CheckCircle size={18}/> Mark as Paid</button>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL EDICIÓN DEL PAGO --- */}
      {isEditingPayroll && editForm && (
        <div className="modal-overlay-centered" onClick={() => setIsEditingPayroll(false)}>
          <div className="modal-70 pv-edit-modal" onClick={e => e.stopPropagation()}>
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Edit Payment</h3>
              <button className="pv-modal-close" onClick={() => setIsEditingPayroll(false)}><X size={20} /></button>
            </header>

            <div className="pv-modal-body">
              <div className="pv-edit-grid">
                <div className="pv-edit-row">
                  <div className="pv-edit-field">
                    <label className="pv-label">Base Amount ($) <span className="pv-required-mark">*</span></label>
                    <input type="number" step="0.01" className="pv-input" placeholder="0.00" value={editForm.baseAmount || ''} onChange={(e) => setEditForm({ ...editForm, baseAmount: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="pv-edit-row">
                  <div className="pv-edit-field">
                    <label className="pv-label">Extra ($)</label>
                    <input type="number" step="0.01" className="pv-input" placeholder="0.00" value={editForm.extraAmount || ''} onChange={(e) => setEditForm({ ...editForm, extraAmount: Number(e.target.value) })} />
                  </div>
                  <div className="pv-edit-field wide">
                    <label className="pv-label">Extra Note</label>
                    <input type="text" className="pv-input" placeholder="Reason for extra..." value={editForm.extraNote || ''} onChange={(e) => setEditForm({ ...editForm, extraNote: e.target.value })} />
                  </div>
                </div>

                <div className="pv-edit-row">
                  <div className="pv-edit-field">
                    <label className="pv-label">Discount ($)</label>
                    <input type="number" step="0.01" className="pv-input" placeholder="0.00" value={editForm.discountAmount || ''} onChange={(e) => setEditForm({ ...editForm, discountAmount: Number(e.target.value) })} />
                  </div>
                  <div className="pv-edit-field wide">
                    <label className="pv-label">Discount Note</label>
                    <input type="text" className="pv-input" placeholder="Reason for discount..." value={editForm.discountNote || ''} onChange={(e) => setEditForm({ ...editForm, discountNote: e.target.value })} />
                  </div>
                </div>

                <div className="pv-total-row">
                  <span className="pv-total-label">TOTAL TO PAY:</span>
                  <span className="pv-total-value">${(editForm.totalAmount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <footer className="pv-modal-footer">
              <button className="pv-btn-outline-modal" onClick={() => setIsEditingPayroll(false)}>Cancel</button>
              <button className="pv-btn-primary-modal" onClick={handleSaveEdit} disabled={isSaving}>
                {isSaving ? 'Saving...' : <><Save size={18}/> Save Changes</>}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* --- MODAL DETALLE DE PROPIEDAD (READ ONLY) --- */}
      {selectedHouse && (
        <div className="modal-overlay-centered" onClick={() => setSelectedHouse(null)}>
          <div className="modal-70" onClick={e => e.stopPropagation()}>
            <header className="pv-modal-header">
              <h3 className="pv-modal-title">Property Overview</h3>
              <button className="pv-modal-close" onClick={() => setSelectedHouse(null)}><X size={24} /></button>
            </header>

            <div className="pv-modal-body">
              <dl className="pv-detail-banner">
                <div className="pv-detail-item">
                  <dt className="pv-detail-label blue"><Home size={14} /> PROPERTY ADDRESS</dt>
                  <dd className="pv-property-banner-client-static">{selectedHouse.address}</dd>
                </div>
              </dl>

              <div className="grid-3-cols">
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Activity size={14} /> STATUS</span>
                  <div className="pv-mt-4">
                    <span className="pv-status-chip">
                      {getRelationName(statuses, selectedHouse.statusId, selectedHouse.statusId)}
                    </span>
                  </div>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><FileText size={14} /> INVOICE STATUS</span>
                  <span className="pv-detail-value">{selectedHouse.invoiceStatus || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><User size={14} /> CLIENT</span>
                  {/* ⭐ FIX: nombre del cliente resuelto desde customers */}
                  <span className="pv-detail-value">{getClientName(selectedHouse.client)}</span>
                </div>

                <div className="pv-detail-item">
                  <span className="pv-detail-label"><CalendarDays size={14} /> RECEIVE DATE</span>
                  <span className="pv-detail-value">{selectedHouse.receiveDate || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><CalendarDays size={14} /> SCHEDULE DATE</span>
                  <span className="pv-detail-value">{selectedHouse.scheduleDate || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Wrench size={14} /> SERVICE</span>
                  <span className="pv-detail-value">{getRelationName(services, selectedHouse.serviceId)}</span>
                </div>

                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Clock size={14} /> TIME IN</span>
                  <span className="pv-detail-value">{selectedHouse.timeIn || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Clock size={14} /> TIME OUT</span>
                  <span className="pv-detail-value">{selectedHouse.timeOut || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Flag size={14} /> PRIORITY</span>
                  <div className="pv-dot-row">
                    {getRelationColor(priorities, selectedHouse.priorityId) && <span className="pv-dot-12" style={{ '--dot-color': getRelationColor(priorities, selectedHouse.priorityId) } as CSSProperties}></span>}
                    <span className="pv-detail-value">{getRelationName(priorities, selectedHouse.priorityId)}</span>
                  </div>
                </div>

                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Hash size={14} /> ROOMS</span>
                  <span className="pv-detail-value">{selectedHouse.rooms || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Hash size={14} /> BATHROOMS</span>
                  <span className="pv-detail-value">{selectedHouse.bathrooms || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><Users size={14} /> TEAM</span>
                  <div className="pv-dot-row">
                    {getRelationColor(teams, selectedHouse.teamId) && <span className="pv-dot-12" style={{ '--dot-color': getRelationColor(teams, selectedHouse.teamId) } as CSSProperties}></span>}
                    <span className="pv-detail-value">{getRelationName(teams, selectedHouse.teamId, 'Unassigned')}</span>
                  </div>
                </div>

                <div className="col-span-full pv-workers-box">
                  <div className="pv-workers-header">
                    <span className="pv-detail-label"><User size={14} className="pv-label-icon-inline"/> ASSIGNED WORKERS</span>
                  </div>
                  <div className="pv-worker-chips">
                    {!(selectedHouse.assignedWorkers && selectedHouse.assignedWorkers.length > 0) ? (
                      <span className="pv-workers-none-text">No workers assigned.</span>
                    ) : (
                      selectedHouse.assignedWorkers.map(workerId => {
                        const emp = employees.find(e => e.id === workerId);
                        if (!emp) return null;
                        return (
                          <div key={workerId} className="pv-worker-chip">
                            <User size={12} color="#64748b" />
                            {empName(emp)}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="col-span-full"><div className="pv-note-box"><span className="pv-detail-label spaced"><StickyNote size={14} /> GENERAL NOTE</span><span className="pv-detail-value small">{selectedHouse.note || 'No notes.'}</span></div></div>
                <div className="col-span-full"><div className="pv-note-box orange"><span className="pv-detail-label orange spaced"><PenTool size={14} /> EMPLOYEE'S NOTE</span><span className="pv-detail-value small">{selectedHouse.employeeNote || 'No employee notes.'}</span></div></div>

              </div>
            </div>

            <footer className="pv-modal-footer alt-bg">
              <button className="pv-btn-close-plain" onClick={() => setSelectedHouse(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}

      {/* ⭐ EDICIÓN DE LA CASA sin salir de Payroll: HousesView en modo 'modals-only'
          dibuja únicamente su formulario de edición encima de esta vista.
          Se monta solo mientras hay una casa por editar (mismo patrón que Invoices). */}
      {houseEditorMounted && (
        <HousesView
          renderMode="modals-only"
          onOpenMenu={() => { /* sin página propia en modals-only */ }}
          properties={properties}
          setProperties={setProperties}
          currentUser={currentUser}
          activeRole={activeRole}
          isSuperAdmin={isSuperAdmin}
          houseToOpenEdit={houseToEdit}
          clearHouseToOpenEdit={() => setHouseToEdit(null)}
        />
      )}

    </div>
  );
}