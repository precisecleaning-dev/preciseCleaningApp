import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  User, DollarSign, CheckCircle, Activity, MapPin,
  X, Home, FileText, CalendarDays, Clock, Wrench, Hash, Flag, Users, StickyNote, PenTool, Edit2, Trash2, Save, 
  Wallet, ClipboardList, ChevronDown, ChevronRight, Timer, CalendarClock
} from 'lucide-react';
import { payrollService } from '../services/payrollService';
import { db, auth } from '../config/firebase';
// ⭐ Mapeo correcto de clientes (el id legacy NO pisa al id real)
import { doc, updateDoc } from 'firebase/firestore';
import type { FixedSalary, PayrollRecord, Property, SystemUser, Role } from '../types/index';
import { useLiveCollection, useLiveData } from '../shared/data/liveCollections';
import { commitOps, type BatchOp } from '../shared/data/batchWrites';
import { getPayrollTotal, money } from '../utils/jobFinancials';
import { getRelationName, getRelationColor } from '../utils/relations';
import HistoryWindowNotice from '../components/HistoryWindowNotice';
import { isHiddenByWindow, useFullHistory } from '../shared/data/propertiesWindow';
import PropertyDateFixTool from '../features/houses/components/PropertyDateFixTool';
import { useLiveHouse } from '../features/houses/hooks/useLiveHouse';
import { formatDate, todayIso } from '../utils/dateFormat';
import DateInput from '../shared/components/DateInput';
import PeriodBar from '../components/PeriodBar';
import { useStoredPeriod } from '../shared/hooks/useStoredPeriod';
import { periodRange, type PeriodState } from '../utils/periods';
import VirtualItems from '../shared/components/VirtualItems';
import './PayrollView.css';
import MenuButton from '../shared/components/MenuButton';
import HourlyPaymentForm from '../features/payroll/components/HourlyPaymentForm';
import HourlyPayList from '../features/payroll/components/HourlyPayList';
import HourlyPayDetail from '../features/payroll/components/HourlyPayDetail';
import { isHourlyPayment } from '../features/payroll/hourlyPay';
import { deleteHourlyPayment } from '../features/payroll/services/hourlyPayService';
import { deleteFixedPayment } from '../features/payroll/services/fixedPaymentService';
import { markPayrollPaymentPaid, markPayrollPaymentPending } from '../features/payroll/services/payrollPaymentStatus';
import { canDeleteEmployeePay, canManageEmployeePay, hasPayType } from '../features/payroll/employeePay';
import FixedSalaryForm from '../features/payroll/components/FixedSalaryForm';
import FixedSalaryList from '../features/payroll/components/FixedSalaryList';
import FixedSalaryDetail from '../features/payroll/components/FixedSalaryDetail';
import FixedPaymentForm from '../features/payroll/components/FixedPaymentForm';
import FixedPaymentDetail from '../features/payroll/components/FixedPaymentDetail';
import FixedPaymentList from '../features/payroll/components/FixedPaymentList';
import { isFixedPayment } from '../features/payroll/fixedPay';
import WeeklyPayrollTable from '../features/payroll/components/WeeklyPayrollTable';
import WeeklyPayForm from '../features/payroll/components/WeeklyPayForm';
import WeeklyAdjustmentForm from '../features/payroll/components/WeeklyAdjustmentForm';
import WeeklyPayrollDetail from '../features/payroll/components/WeeklyPayrollDetail';
import {
  buildWeeklyPayroll, getRecordsPaidThisWeek, getUnpaidRecords, toIsoDay, type WeeklyPayrollRecord, type WeeklyPayrollRow,
} from '../features/payroll/weeklyPayroll';
import { markWeekPending, payWeek } from '../features/payroll/services/weeklyPayrollService';

interface PayrollViewProps {
  onOpenMenu: () => void;
  // ⭐ Casas del listener global de App.tsx (antes esta vista abría un SEGUNDO
  //    listener sobre toda la colección `properties`).
  properties: Property[];
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  /** Formulario de la casa: el de Houses, abierto encima por App. */
  onOpenHouseEdit: (house: Property) => void;
}


// Campos del pago consolidado que solo usa esta vista (paidAt/paidBy ya están en PayrollRecord).
type PayrollRecordExt = PayrollRecord & {
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
  // ⭐ Lectura de fechas con barras — MISMA regla que InvoicesView (antes cada
  //    vista interpretaba distinto y la misma casa mostraba dos fechas):
  //    · Si el primer número es > 12 y el segundo <= 12, la única lectura posible
  //      es DD/MM (p. ej. "27/07/2026" = 27 de julio) y así se lee.
  //    · En cualquier otro caso se lee MM/DD (regla por defecto del negocio).
  //    Cuando AMBOS números son <= 12 la fecha es AMBIGUA y no hay forma de
  //    saberlo por el texto: se lee como MM/DD y se marca en la herramienta
  //    "Revisar fechas" para que una persona decida y se guarde en ISO.
  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const a = +slash[1], b = +slash[2], y = +slash[3];
    const mon = a > 12 && b <= 12 ? b : a;
    const day = a > 12 && b <= 12 ? a : b;
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
  // ⭐ Misma lectura que toTime (si no, la fecha mostrada y la ordenada difieren).
  //    Si ninguna lectura es válida se muestra el valor CRUDO para detectarlo a
  //    simple vista y corregirlo con la herramienta "Revisar fechas".
  const slash = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const a = +slash[1], b = +slash[2];
    const mon = a > 12 && b <= 12 ? b : a;
    const day = a > 12 && b <= 12 ? a : b;
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return str;
    return `${pad(mon)}/${pad(day)}/${slash[3]}`;
  }
  const d = new Date(str); return isNaN(d.getTime()) ? str : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
};

// La pestaña Nóminas abre (y "Limpiar filtros" vuelve) en la semana de hoy.
const currentWeekPeriod = (): PeriodState => ({ kind: 'week', anchor: todayIso(), customStart: '', customEnd: '' });

// ⭐ Clasificación de cada casa respecto a la nómina (sub-pestañas):
const classifyRecord = (r: PayrollRecordExt): 'pending' | 'ennomina' | 'paid' =>
  !r.batchId ? 'pending' : (r.status === 'Paid' ? 'paid' : 'ennomina');

export default function PayrollView({ onOpenMenu, properties, currentUser, activeRole, isSuperAdmin, onOpenHouseEdit }: PayrollViewProps) {
  // ══════════════════════════════════════════════════════════════════════════
  // ⭐ ALCANCE POR ROL (scope del módulo Payroll en Roles & Permissions):
  //    · 'All'  → ve la nómina de TODOS los empleados y el filtro de empleado.
  //    · 'Own'  → ve SOLO su propia nómina; el filtro de empleado se OCULTA
  //               (si no, vería el sueldo de sus compañeros).
  //    El Super Admin siempre tiene alcance 'All'.
  // ══════════════════════════════════════════════════════════════════════════
  const payrollPermission = activeRole?.permissions?.find(
    (perm) => perm.module === 'Payroll',
  );
  const payrollScope: 'Own' | 'All' = isSuperAdmin
    ? 'All'
    : ((payrollPermission?.scope as 'Own' | 'All') || 'Own');
  const canSeeAllPayroll = payrollScope === 'All';


  // ⭐ Datos del store compartido (un listener por colección para toda la app).
  //    `payroll` se trae COMPLETA a propósito (ver la nota de abajo sobre
  //    limit/orderBy) y se ordena aquí, más reciente primero.
  const payrollLive = useLiveCollection('payroll');
  // ⭐ Ventana de 12 meses: los registros viejos cuya casa no se cargó (y los
  //    ajustes viejos, que no tienen casa) son historial oculto hasta tocar
  //    "Ver todo el historial"; si no, saldrían sin dirección ni equipo.
  const fullHistory = useFullHistory();
  const loadedHouseIds = useMemo(() => new Set(properties.map(p => p.id)), [properties]);
  // ⭐ PERF: casa por id en O(1). Antes cada fila de nómina recorría las
  //    ~3,600 casas con properties.find (millones de comparaciones por render).
  const propById = useMemo(() => new Map(properties.map(p => [p.id, p] as const)), [properties]);
  const records = useMemo(() => {
    const newest = (r: PayrollRecordExt) =>
      Math.max(...[r.date, r.paymentDate, r.paidAt].map(toTime).filter(t => !isNaN(t)), 0);
    // Los pagos por horas y fijos no tienen casa: la ventana de 12 meses (que es de casas) no los oculta.
    const data = (payrollLive.data as PayrollRecordExt[]).filter(r =>
      !!r.payType || !isHiddenByWindow(fullHistory, !!r.propertyId && loadedHouseIds.has(String(r.propertyId)), newest(r)));
    // Orden de más reciente a más antigua. Sin fecha válida => tratada como 0 (al final).
    data.sort((a, b) => {
      const ta = toTime(a.date), tb = toTime(b.date);
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
    return data;
  }, [payrollLive.data, fullHistory, loadedHouseIds]);
  const usersLive = useLiveCollection('users');
  const employees = usersLive.data;
  // Asignar nómina: empleados que cobran por casa (tipo de pago de System Users; sin tipo = por casa) y también
  // quien cambió de tipo pero todavía tiene casas pendientes de pago (si no, no se le podría pagar lo que debe).
  const employeeIdsWithPendingHouses = useMemo(
    () => new Set(records.filter(record => !!record.propertyId && record.status !== 'Paid').map(record => record.employeeId)),
    [records],
  );
  const perHouseEmployees = useMemo(
    () => employees.filter(employee => hasPayType(employee, 'perHouse') || employeeIdsWithPendingHouses.has(employee.id)),
    [employees, employeeIdsWithPendingHouses],
  );
  // ⭐ Pestaña Hourly: pagos por horas (sin casa). Con alcance 'Own', solo los propios.
  const hourlyPayments = useMemo(
    () => records.filter(record => isHourlyPayment(record) && (canSeeAllPayroll || record.employeeId === currentUser?.id)),
    [records, canSeeAllPayroll, currentUser?.id],
  );
  // Nombre por id en O(1); mientras cargan los usuarios, "…" en vez de "Unknown".
  const employeeNameById = useMemo(() => new Map(employees.map(employee => [employee.id, empName(employee)] as const)), [employees]);
  const getEmployeeName = (employeeId: string) =>
    usersLive.loaded ? employeeNameById.get(employeeId) || 'Unknown' : '…';
  // ⭐ Pestaña Fixed pay: los pagos quincenales que crea la Cloud Function.
  const fixedPayments = useMemo(
    () => records.filter(record => isFixedPayment(record) && (canSeeAllPayroll || record.employeeId === currentUser?.id)),
    [records, canSeeAllPayroll, currentUser?.id],
  );

  // Catálogos para el detalle de la casa
  const statusesLive = useLiveCollection('statuses');
  const statuses = useMemo(
    () => [...statusesLive.data].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    [statusesLive.data],
  );
  const teams = useLiveData('teams');
  const priorities = useLiveData('priorities');
  const services = useLiveData('services');
  // ⭐ FIX: customers para resolver el nombre del cliente desde el ID
  const customersLive = useLiveCollection('customers');
  const customers = customersLive.data;

  // ⭐ Las filas se pintan en cuanto llega la nómina; cliente y empleado
  //    muestran "…" hasta que llegan sus catálogos (nunca el id crudo).
  const isLoading = !payrollLive.loaded;
  const [isSaving, setIsSaving] = useState(false);

  // Estados de Modales
  // Pago abierto en el modal: se muestra su versión EN VIVO (si otra persona
  // lo marca Paid mientras está abierto, el modal lo refleja).
  const [openedPayroll, setSelectedPayroll] = useState<PayrollRecordExt | null>(null);
  const selectedPayroll = useMemo(
    () =>
      openedPayroll
        ? ((payrollLive.data as PayrollRecordExt[]).find(r => r.id === openedPayroll.id) ?? openedPayroll)
        : null,
    [openedPayroll, payrollLive.data],
  );
  const [isEditingPayroll, setIsEditingPayroll] = useState(false);
  // Casa abierta en el modal, mostrada EN VIVO (useLiveHouse).
  const [openedHouse, setSelectedHouse] = useState<Property | null>(null);
  const selectedHouse = useLiveHouse(openedHouse, properties);

  // Formulario temporal de edición
  const [editForm, setEditForm] = useState<PayrollRecordExt | null>(null);

  // ⭐ Filtros de "Asignar nómina": periodo (Schedule Date, se recuerda por
  //    navegador; Custom sin fechas = todo) y empleado
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [assignPeriod, setAssignPeriod] = useStoredPeriod('pc.payroll.assign.period', 'year');
  const assignPeriodRange = useMemo(() => periodRange(assignPeriod), [assignPeriod]);
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ⭐ Sub-pestaña de "Asignar nómina" (sustituye al filtro de Status):
  //    pending  = casas que NO están en ninguna nómina
  //    ennomina = casas asignadas a una nómina pero sin pagar
  //    paid     = casas en nómina y marcadas como pagadas
  const [assignView, setAssignView] = useState<'pending' | 'ennomina' | 'paid'>('pending');
  // ⭐ Agrupacion por equipo: que grupos estan colapsados (por teamId).
  const [collapsedTeams, setCollapsedTeams] = useState<string[]>([]);

  // ⭐ Pestañas del módulo: 'asignar' = registros de Pay (tabla de siempre);
  //    'nominas' = tarjetas semanales por empleado.
  const [tab, setTab] = useState<'asignar' | 'nominas' | 'hourly' | 'fixed'>('asignar');
  // Modal del pago por horas: nuevo o editando uno (se monta de nuevo en cada apertura).
  // Al editar se guarda el id y se usa el pago EN VIVO (si lo borran mientras está abierto, se cierra).
  const [hourlyForm, setHourlyForm] = useState<{ paymentId: string | null } | null>(null);
  const editingHourlyPayment = hourlyForm?.paymentId
    ? hourlyPayments.find(payment => payment.id === hourlyForm.paymentId) ?? null
    : null;
  const isHourlyFormOpen = !!hourlyForm && (!hourlyForm.paymentId || !!editingHourlyPayment);
  // Detalle de un pago por horas: se guarda el id y se muestra la versión EN VIVO (si lo borran, se cierra).
  const [hourlyDetailId, setHourlyDetailId] = useState('');
  const hourlyDetailPayment = hourlyPayments.find(payment => payment.id === hourlyDetailId);
  // ⭐ Sueldos fijos (pestaña Fixed pay): solo alcance 'All'; el listener se abre al entrar a la pestaña.
  const fixedSalariesLive = useLiveCollection('fixedSalaries', canSeeAllPayroll && tab === 'fixed');
  // Sueldos y pagos fijos: crear / editar con Payroll All + Edit; borrar además con Delete (las reglas lo piden).
  const canEditFixedPay = canManageEmployeePay(activeRole, isSuperAdmin);
  const canDeleteFixedPay = canDeleteEmployeePay(activeRole, isSuperAdmin);
  // Rate guardado de cada empleado por hora (System Users): lo propone el modal de Hourly.
  const hourlyRatesLive = useLiveCollection('hourlyRates', canSeeAllPayroll && tab === 'hourly');
  // Modal del sueldo fijo: nuevo o editando uno (se monta de nuevo en cada apertura).
  const [fixedSalaryForm, setFixedSalaryForm] = useState<{ salary: FixedSalary | null } | null>(null);
  // Detalle de un sueldo fijo: se guarda el empleado y se muestra la versión EN VIVO (si lo borran, se cierra).
  const [openedFixedSalaryEmployeeId, setOpenedFixedSalaryEmployeeId] = useState('');
  const openedFixedSalary = fixedSalariesLive.data.find(salary => salary.employeeId === openedFixedSalaryEmployeeId);
  const openedFixedSalaryPayments = openedFixedSalary
    ? fixedPayments.filter(payment => payment.employeeId === openedFixedSalary.employeeId)
    : [];
  // Modal para corregir el monto de un pago fijo (se guarda el id; se usa la versión EN VIVO).
  const [editingFixedPaymentId, setEditingFixedPaymentId] = useState('');
  const editingFixedPayment = fixedPayments.find(payment => payment.id === editingFixedPaymentId);
  // Detalle de un pago fijo: se guarda el id y se muestra la versión EN VIVO (si lo borran, se cierra).
  const [openedFixedPaymentId, setOpenedFixedPaymentId] = useState('');
  const openedFixedPayment = fixedPayments.find(payment => payment.id === openedFixedPaymentId);

  // ⭐ Pestaña Nóminas: semana (PeriodBar solo Week; key = timestamp del lunes), búsqueda y orden
  const [payrollWeekPeriod, setPayrollWeekPeriod] = useState<PeriodState>(currentWeekPeriod);
  // Detalle de la nómina semanal: se guarda el empleado; la fila se usa EN VIVO.
  const [detailEmployeeId, setDetailEmployeeId] = useState('');

  // ⭐ Pago consolidado (pestaña Asignar nómina): casas seleccionadas + formulario
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [payForm, setPayForm] = useState<{ date: string; bonus: number; bonusNote: string; discount: number; discountNote: string; status: 'Pending' | 'Paid' } | null>(null);
  // ⭐ Nómina semanal: modal de pago ('all' = Pay week; un id = "Pay" de ese empleado) y modal
  //    de bono / descuento (se guarda el empleado; la fila se usa EN VIVO)
  const [payTarget, setPayTarget] = useState<'all' | string | null>(null);
  const [adjustingEmployeeId, setAdjustingEmployeeId] = useState('');

  // ⭐ Resolver el nombre del cliente desde la colección customers (retrocompatible)
  const getClientName = (clientIdOrName?: string | null) => {
    if (!clientIdOrName) return 'Unknown';
    if (!customersLive.loaded) return '…';
    return getRelationName(customers, clientIdOrName, String(clientIdOrName));
  };



  // ⭐ Fecha efectiva de un registro para filtros y semanas: el SCHEDULE DATE de la casa
  //    vinculada (pedido explícito del negocio: la nómina se agrupa por semana trabajada).
  //    Solo si el registro no tiene casa o la casa no tiene scheduleDate, cae a record.date.
  const recScheduleTime = (r: PayrollRecordExt): number => {
    const prop = propById.get(r.propertyId);
    const t = toTime(prop?.scheduleDate);
    if (!isNaN(t)) return t;
    // Registros sin casa (ajustes de bonus/descuento): usan la fecha del pago
    const tp = toTime(r.paymentDate);
    return isNaN(tp) ? toTime(r.date) : tp;
  };

  // ⭐ Pestaña Nóminas = nómina semanal por casa (weeklyPayroll.ts): TODOS los pagos
  //    por casa, por semana lunes-domingo y día según el Schedule Date de la casa
  //    (recScheduleTime), sin pasar por "Pagar seleccionadas". Se paga el miércoles
  //    siguiente. Alcance 'Own': solo la fila propia.
  // Pagar la semana y el bono / descuento: Payroll All + Edit (como Hourly y Fixed pay).
  const canManagePayroll = canManageEmployeePay(activeRole, isSuperAdmin);
  // Semana elegida en la PeriodBar: su inicio es el lunes 00:00 local.
  const selectedWeekStart = periodRange(payrollWeekPeriod).start;
  const weekStartIso = selectedWeekStart === null ? '' : toIsoDay(selectedWeekStart);

  // Día trabajado (AAAA-MM-DD) de un pago: Schedule Date de su casa (recScheduleTime).
  const getRecordWorkDay = (record: WeeklyPayrollRecord) => {
    const workTime = recScheduleTime(record);
    return isNaN(workTime) ? '' : toIsoDay(workTime);
  };

  const weeklyRows = useMemo(() => {
    if (!weekStartIso) return [];
    const visibleRecords = canSeeAllPayroll ? records : records.filter(r => r.employeeId === currentUser?.id);
    return buildWeeklyPayroll(visibleRecords, weekStartIso, getRecordWorkDay);
    // recScheduleTime depende de propById (closure); por eso está en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, propById, weekStartIso, canSeeAllPayroll, currentUser?.id]);

  // Siempre A-Z, sin distinguir mayúsculas ni acentos; la tabla los separa en Pending y Paid sin cambiar este orden.
  const visibleWeeklyRows = useMemo(() => {
    const compareNames = (rowA: WeeklyPayrollRow, rowB: WeeklyPayrollRow) => getEmployeeName(rowA.employeeId)
      .localeCompare(getEmployeeName(rowB.employeeId), 'en', { sensitivity: 'base' });
    return [...weeklyRows].sort(compareNames);
    // getEmployeeName depende de los nombres y de si ya cargaron los usuarios (closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyRows, employeeNameById, usersLive.loaded]);
  const recordsPaidThisWeek = weekStartIso ? getRecordsPaidThisWeek(weeklyRows, weekStartIso) : [];
  const adjustingRow = weeklyRows.find(row => row.employeeId === adjustingEmployeeId);
  const detailRow = weeklyRows.find(row => row.employeeId === detailEmployeeId);
  // Lo que paga el modal de pago: toda la semana o solo el empleado de la fila (A-Z, como la tabla).
  const payRows = visibleWeeklyRows.filter(row => !row.isPaid && (payTarget === 'all' || row.employeeId === payTarget));

  // Columna Payment de la tabla: "Sent" / "Not sent" de un empleado con un toque.
  // Sent = pagado HOY (para otra fecha: "Pay" en el detalle).
  const handleSetSent = (row: WeeklyPayrollRow, isSent: boolean) => {
    const employeeName = getEmployeeName(row.employeeId);
    return isSent
      ? payWeek(getUnpaidRecords(row), weekStartIso, todayIso(), currentUser, employeeName)
      : markWeekPending(getRecordsPaidThisWeek([row], weekStartIso), weekStartIso, currentUser, employeeName);
  };

  // Regresa a Pending lo que se pagó desde esta pestaña en la semana elegida.
  const handleMarkWeekPending = async () => {
    if (!weekStartIso || recordsPaidThisWeek.length === 0) return;
    if (!window.confirm(`Change ${recordsPaidThisWeek.length} payment(s) of this week back to Pending? `
      + 'Houses paid with "Pagar seleccionadas" do not change.')) return;
    setIsSaving(true);
    try {
      await markWeekPending(recordsPaidThisWeek, weekStartIso, currentUser);
    } catch (error) {
      console.error('Error changing the week back to Pending:', error);
      alert('Could not change the week back to Pending. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };


  // ⭐ Los datos llegan del store compartido y de App.tsx (ver arriba); los
  //    cambios hechos desde otras vistas (Houses, Invoices) se ven en vivo.
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

  // Lógica de Filtros
  // Registros filtrados SOLO por fechas (Schedule Date) y empleado; la sub-pestaña
  // reparte después entre pending / en nómina / paid. Los registros de ajuste
  // (bonus/descuento, sin casa) no se listan aquí — se ven en la pestaña Nóminas.
  const baseFiltered = useMemo(() => {
    // Fin EXCLUSIVO (periodRange); null = sin límite (Custom sin fechas).
    const { start: periodStartTime, end: periodEndTime } = assignPeriodRange;

    const list = records.filter(record => {
      if (!record.propertyId) return false;
      // ⭐ Alcance 'Own': el usuario solo ve SUS propios registros de nómina.
      if (!canSeeAllPayroll && record.employeeId !== currentUser?.id) return false;
      if (selectedEmployee && record.employeeId !== selectedEmployee) return false;
      if (periodStartTime !== null || periodEndTime !== null) {
        const recT = recScheduleTime(record);
        if (isNaN(recT)) return false; // sin fecha válida: fuera del rango
        if (periodStartTime !== null && recT < periodStartTime) return false;
        if (periodEndTime !== null && recT >= periodEndTime) return false;
      }
      return true;
    });
    // ⭐ Orden principal: fecha del PAGO registrado (record.date) descendente —
    //    el pago que registras hoy desde el botón Pay aparece ARRIBA, sin importar
    //    el Schedule Date de la casa (había casas con schedule en nov/dic que
    //    enterraban los pagos recientes cientos de filas abajo).
    //    Empate (o sin fecha de pago): Schedule Date de la casa descendente.
    // PERF: las fechas se convierten UNA vez por registro, no en cada
    // comparación del sort (antes ~2 conversiones × n·log n).
    const num = (t: number) => (isNaN(t) ? 0 : t);
    return list
      .map(r => ({ r, paid: num(toTime(r.date)), sched: num(recScheduleTime(r)) }))
      .sort((a, b) => (b.paid - a.paid) || (b.sched - a.sched))
      .map(k => k.r);
    // recScheduleTime lee propById (closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, propById, assignPeriodRange, selectedEmployee, canSeeAllPayroll, currentUser?.id]);

  // Memoizado: la tabla se vuelve a dibujar al hacer scroll (ventana de filas) y
  // estos recorridos sobre miles de registros no deben repetirse en cada paso.
  const viewCounts = useMemo(() => ({
    pending: baseFiltered.filter(r => classifyRecord(r) === 'pending').length,
    ennomina: baseFiltered.filter(r => classifyRecord(r) === 'ennomina').length,
    paid: baseFiltered.filter(r => classifyRecord(r) === 'paid').length,
  }), [baseFiltered]);
  const filteredRecords = useMemo(() => baseFiltered.filter(r => classifyRecord(r) === assignView), [baseFiltered, assignView]);

  // ⭐ Selección de casas para el pago consolidado (solo registros pendientes)
  // La selección para pagar solo aplica en la vista de pendientes
  const selectableRecords = assignView === 'pending' ? filteredRecords.filter(r => r.id) : [];

  // ⭐ NOMINA AGRUPADA POR EQUIPO
  //    El equipo NO vive en el registro de nomina: se captura en la casa
  //    (property.teamId). Por eso se resuelve via la propiedad de cada
  //    registro. Las casas sin equipo caen en un grupo "Sin equipo" al final
  //    en vez de desaparecer.
  const groupedByTeam = useMemo(() => {
    const groups = new Map<string, { teamId: string; teamName: string; teamColor: string; records: PayrollRecordExt[]; subtotal: number }>();

    filteredRecords.forEach(record => {
      const prop = propById.get(record.propertyId as string);
      const teamId = String(prop?.teamId || '');
      const key = teamId || '__sin_equipo__';
      if (!groups.has(key)) {
        groups.set(key, {
          teamId: key,
          teamName: teamId ? getRelationName(teams, teamId, teamId) : 'Sin equipo',
          teamColor: teamId ? (getRelationColor(teams, teamId) || '#64748b') : '#94a3b8',
          records: [],
          subtotal: 0,
        });
      }
      const g = groups.get(key)!;
      g.records.push(record);
      g.subtotal += getPayrollTotal(record);
    });

    // Equipos por nombre; "Sin equipo" siempre al final.
    return [...groups.values()].sort((a, b) => {
      if (a.teamId === '__sin_equipo__') return 1;
      if (b.teamId === '__sin_equipo__') return -1;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [filteredRecords, propById, teams]);

  const toggleTeamCollapsed = (teamId: string) =>
    setCollapsedTeams(prev =>
      prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId],
    );

  const tableRows = useMemo(
    () => groupedByTeam.flatMap(group => [
      { group, record: null },
      ...(collapsedTeams.includes(group.teamId) ? [] : group.records.map(record => ({ group, record }))),
    ]),
    [groupedByTeam, collapsedTeams],
  );

  // ⭐ Botón "Pagar" de cada fila (pedido del usuario, 10/2026).
  //    · Casa todavía sin nómina: filtra al empleado de esa casa, la deja marcada
  //      y abre el mismo pago consolidado de "Pagar seleccionadas" (si cierra el
  //      modal puede marcar más casas del mismo empleado y pagarlas juntas).
  //    · Casa ya en una nómina sin pagar: la marca como pagada.
  const startPayFor = (record: PayrollRecordExt) => {
    if (!record.id || record.status === 'Paid') return;
    if (record.batchId) { void handleMarkAsPaid(record); return; }
    const emp = employees.find(e => e.id === record.employeeId);
    if (!emp) { alert('Esta casa no tiene un empleado válido asignado.'); return; }
    setEmployeeQuery(empName(emp));
    setSelectedEmployee(emp.id);
    setSelectedRecordIds([record.id as string]);
    setPayForm({ date: todayIso(), bonus: 0, bonusNote: '', discount: 0, discountNote: '', status: 'Pending' });
  };

  // ⭐ Seleccionar/deseleccionar todas las casas pendientes de UN equipo.
  const toggleTeamSelected = (records: PayrollRecordExt[]) => {
    const ids = records.filter(r => r.id && r.status !== 'Paid').map(r => r.id as string);
    if (ids.length === 0) return;
    const allIn = ids.every(id => selectedRecordIds.includes(id));
    setSelectedRecordIds(prev =>
      allIn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  };
  const selectedRecords = records.filter(r => r.id && selectedRecordIds.includes(r.id as string));
  const selectedSubtotal = selectedRecords.reduce((s, r) => s + getPayrollTotal(r), 0);
  const allPendingSelected = selectableRecords.length > 0 && selectableRecords.every(r => selectedRecordIds.includes(r.id as string));

  const toggleRecordSelected = (r: PayrollRecordExt) => {
    if (!r.id) return;
    const id = r.id as string;
    setSelectedRecordIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    setSelectedRecordIds(allPendingSelected ? [] : selectableRecords.map(r => r.id as string));
  };

  // La selección se limpia al cambiar de empleado o de sub-pestaña (en el
  // handler que hace el cambio, no en un efecto).
  const changeAssignView = (view: typeof assignView) => {
    if (view !== assignView) setSelectedRecordIds([]);
    setAssignView(view);
  };

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
    const paidAt = isPaid ? todayIso() : '';
    const batchId = `batch_${Date.now()}`;
    setIsSaving(true);
    try {
      // ⭐ Casas + ajuste en UN batch: o queda todo el pago o nada (antes, si
      //    fallaba el ajuste, las casas quedaban en nómina sin el bonus).
      const ops: BatchOp[] = selectedRecords.map(r => (b) => payrollService.batchUpdate(b, r.id as string, {
        batchId, paymentDate: payForm.date, status: payForm.status, paidAt, paidBy,
      }));
      if (bonus > 0 || discount > 0) {
        const ajuste: PayrollRecordExt = {
          propertyId: '', employeeId: selectedEmployee, date: payForm.date,
          baseAmount: 0,
          extraAmount: bonus, extraNote: payForm.bonusNote || (bonus > 0 ? 'Bonus del pago consolidado' : ''),
          discountAmount: discount, discountNote: payForm.discountNote || (discount > 0 ? 'Descuento del pago consolidado' : ''),
          totalAmount: bonus - discount, status: payForm.status,
          paidAt, paidBy, batchId, paymentDate: payForm.date,
        };
        ops.push((b) => payrollService.batchCreate(b, ajuste));
      }
      await commitOps(ops);
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
  // pagado = casas en nómina pagadas; pendiente = casas aún sin asignar a
  // ninguna nómina. (La tarjeta "Total en nómina" se quitó a pedido de Omar;
  // lo asignado sin pagar se ve en la sub-pestaña "En nómina".)
  const { totalPaid, totalPending } = useMemo(() => ({
    totalPaid: baseFiltered.filter(r => classifyRecord(r) === 'paid').reduce((sum, r) => sum + getPayrollTotal(r), 0),
    totalPending: baseFiltered.filter(r => classifyRecord(r) === 'pending').reduce((sum, r) => sum + getPayrollTotal(r), 0),
  }), [baseFiltered]);

  const handleMarkAsPaid = async (record: PayrollRecordExt) => {
    if (!record.id) return;
    if (!window.confirm("Mark this record as Paid?")) return;
    const paidBy = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
    const paidAt = todayIso(); // fecha en que se pagó (YYYY-MM-DD)
    try {
      // ⭐ Update directo a Firestore (merge parcial garantizado, sin depender del service)
      await updateDoc(doc(db, 'payroll', record.id), { status: 'Paid', paidAt, paidBy });
    } catch (caught) {
      const error = caught as { code?: string; message?: string };
      console.error("Error updating status", error);
      alert(`No se pudo marcar como pagado: ${error?.message || error?.code || 'error desconocido'}`);
    }
  };

  // ⭐ Hourly y Fixed pay: marcar pagado / regresar a Pending (con Activity Log; ver payrollPaymentStatus.ts).
  const handleMarkPaymentPaid = async (payment: PayrollRecord) => {
    const employeeName = getEmployeeName(payment.employeeId);
    if (!window.confirm(`Mark the payment of ${employeeName} (${money(payment.totalAmount)}) as paid?`)) return;
    try {
      await markPayrollPaymentPaid(payment, employeeName, currentUser);
    } catch (error) {
      console.error('Error marking the payment as paid:', error);
      alert('Could not mark the payment as paid. Check your connection and try again.');
    }
  };

  const handleMarkPaymentPending = async (payment: PayrollRecord) => {
    const employeeName = getEmployeeName(payment.employeeId);
    if (!window.confirm(`Change the payment of ${employeeName} (${money(payment.totalAmount)}) back to Pending?`)) return;
    try {
      await markPayrollPaymentPending(payment, employeeName, currentUser);
    } catch (error) {
      console.error('Error changing the payment to Pending:', error);
      alert('Could not change the payment to Pending. Check your connection and try again.');
    }
  };

  const handleDeleteHourlyPayment = async (payment: PayrollRecord) => {
    const employeeName = getEmployeeName(payment.employeeId);
    const paidWarning = payment.status === 'Paid' ? ` It is already marked as paid (${formatDate(payment.paidAt)}).` : '';
    const confirmMessage = `Delete the hourly payment of ${employeeName} (${money(payment.totalAmount)})?${paidWarning} `
      + 'This cannot be undone.';
    if (!window.confirm(confirmMessage)) return;
    try {
      await deleteHourlyPayment(payment, employeeName, currentUser);
    } catch (error) {
      console.error('Error deleting the hourly payment:', error);
      alert('Could not delete the payment. Check your connection and try again.');
    }
  };

  const handleDeleteFixedPayment = async (payment: PayrollRecord) => {
    const employeeName = getEmployeeName(payment.employeeId);
    const paidWarning = payment.status === 'Paid' ? ` It is already marked as paid (${formatDate(payment.paidAt)}).` : '';
    const confirmMessage = `Delete the fixed payment of ${employeeName} for ${formatDate(payment.date)} (${money(payment.totalAmount)})?`
      + `${paidWarning} It will not be created again.`;
    if (!window.confirm(confirmMessage)) return;
    try {
      await deleteFixedPayment(payment, employeeName, currentUser);
    } catch (error) {
      console.error('Error deleting the fixed payment:', error);
      alert('Could not delete the payment. Check your connection and try again.');
    }
  };

  const handleMarkAsPending = async (record: PayrollRecordExt) => {
    if (!record.id) return;
    if (!window.confirm("Change status back to Pending?")) return;
    try {
      await updateDoc(doc(db, 'payroll', record.id), { status: 'Pending', paidAt: '', paidBy: '' });
    } catch (caught) {
      const error = caught as { code?: string; message?: string };
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
    // ⭐ Solo los campos que este modal edita. Antes se reescribía el pago
    //    completo con la copia del modal: si alguien lo marcaba Paid mientras
    //    tanto (p. ej. un pago consolidado), el status volvía a Pending.
    const finalData: Partial<PayrollRecord> = {
      baseAmount: Number(editForm.baseAmount || 0),
      extraAmount: Number(editForm.extraAmount || 0),
      extraNote: editForm.extraNote || '',
      discountAmount: Number(editForm.discountAmount || 0),
      discountNote: editForm.discountNote || '',
      totalAmount: total,
    };

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

  // Total del formulario de edición, calculado en el render (handleSaveEdit
  // lo vuelve a calcular igual al guardar).
  const editFormTotal = editForm
    ? Number(editForm.baseAmount || 0) + Number(editForm.extraAmount || 0) - Number(editForm.discountAmount || 0)
    : 0;


  // Filas de la tabla (cabecera de equipo + registros), dibujadas por ventana:
  // Paid trae miles y con todas en el DOM la pestaña se congelaba segundos.
  const renderGroupRow = (group: (typeof groupedByTeam)[number]) => {
    const isCollapsed = collapsedTeams.includes(group.teamId);
    const groupPendingIds = group.records
      .filter(r => r.id && r.status !== 'Paid')
      .map(r => r.id as string);
    const groupAllSelected =
      groupPendingIds.length > 0 &&
      groupPendingIds.every(id => selectedRecordIds.includes(id));

    return (
      <tr key={`team:${group.teamId}`} className="pv-group-row">
        {selectedEmployee && assignView === 'pending' && (
          <td className="pv-td check" onClick={(e) => e.stopPropagation()}>
            {groupPendingIds.length > 0 && (
              <input
                type="checkbox"
                className="pv-row-check"
                checked={groupAllSelected}
                onChange={() => toggleTeamSelected(group.records)}
                aria-label={`Seleccionar las casas de ${group.teamName}`}
              />
            )}
          </td>
        )}
        <td
          className="pv-group-cell"
          colSpan={selectedEmployee && assignView === 'pending' ? 5 : 5}
          onClick={() => toggleTeamCollapsed(group.teamId)}
        >
          <div className="pv-group-inner">
            <span className="pv-group-chevron">
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </span>
            <span
              className="pv-group-dot"
              style={{ '--team-color': group.teamColor } as CSSProperties}
            />
            <span className="pv-group-name">{group.teamName}</span>
            <span className="pv-group-count">{group.records.length} casa(s)</span>
            <span className="pv-group-total">${group.subtotal.toFixed(2)}</span>
          </div>
        </td>
      </tr>
    );
  };

  const renderRecordRow = (record: PayrollRecordExt) => {
    const emp = employees.find(e => e.id === record.employeeId);
    const prop = propById.get(record.propertyId);
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

        <td className="pv-td strong">{usersLive.loaded ? empName(emp) || 'Unknown' : '…'}</td>

        <td className="pv-td amount">${getPayrollTotal(record).toFixed(2)}</td>

        {/* ⭐ Acciones al final de la fila (el status ahora se gestiona al pagar
            y desde la pestaña Nóminas, ya no con Mark Paid aquí) */}
        <td className="pv-td right" onClick={(e) => e.stopPropagation()}>
          <div className="pv-row-actions end">
            {canSeeAllPayroll && record.status !== 'Paid' && (
              <button
                type="button"
                onClick={() => startPayFor(record)}
                className="pv-pay-btn"
                title={record.batchId ? 'Marcar como pagada' : 'Pagar esta casa'}
              >
                <Wallet size={14} /> Pagar
              </button>
            )}
            {/* ⭐ Abre el FORMULARIO DE EDICIÓN de la casa (el de Houses) para rectificar información */}
            {prop && <button onClick={() => onOpenHouseEdit(prop)} className="pv-icon-btn edit" title="Editar casa"><Home size={16} /></button>}
            <button onClick={() => handleOpenEditModal(record)} className="pv-icon-btn edit" title="Editar pago"><Edit2 size={16} /></button>
            <button onClick={() => handleDeletePayroll(record.id as string)} className="pv-icon-btn delete" title="Eliminar"><Trash2 size={16} /></button>
          </div>
        </td>

      </tr>
    );
  };

  return (
    <div className="fade-in pv-page">

      {/* HEADER */}
      <header className="main-header dashboard-header-container pv-header">
        <div className="view-header-title-group">
<MenuButton onClick={onOpenMenu} />
          <div>
            <h1 className="pv-title">Payroll & Payments</h1>
            <p className="pv-subtitle">Manage employee payments and debts</p>
          </div>
        </div>
        {/* ⭐ Corrección de fechas mal capturadas (solo alcance 'All') */}
        {canSeeAllPayroll && (
          <PropertyDateFixTool properties={properties} getClientName={getClientName} />
        )}
      </header>

      <HistoryWindowNotice />

      {/* PESTAÑAS: Asignar nómina (registros de Pay) | Nóminas (semanal por empleado) */}
      <div className="pv-tabbar">
        <button className={`pv-tab-btn${tab === 'asignar' ? ' active' : ''}`} onClick={() => setTab('asignar')}>
          <ClipboardList size={16} /> Asignar nómina
        </button>
        <button className={`pv-tab-btn${tab === 'nominas' ? ' active' : ''}`} onClick={() => setTab('nominas')}>
          <Wallet size={16} /> Nóminas
        </button>
        <button className={`pv-tab-btn${tab === 'hourly' ? ' active' : ''}`} onClick={() => setTab('hourly')}>
          <Timer size={16} /> Hourly
        </button>
        <button className={`pv-tab-btn${tab === 'fixed' ? ' active' : ''}`} onClick={() => setTab('fixed')}>
          <CalendarClock size={16} /> Fixed pay
        </button>
      </div>

      {/* ═══════════ PESTAÑA FIXED PAY: sueldos fijos quincenales (features/payroll) ═══════════ */}
      {tab === 'fixed' && (<>
        {canSeeAllPayroll && (
          <FixedSalaryList
            salaries={fixedSalariesLive.data}
            employees={employees}
            isLoading={!fixedSalariesLive.loaded}
            canEdit={canEditFixedPay}
            canDelete={canDeleteFixedPay}
            getEmployeeName={getEmployeeName}
            currentUser={currentUser}
            onNewSalary={() => setFixedSalaryForm({ salary: null })}
            onEdit={(salary) => setFixedSalaryForm({ salary })}
            onOpenDetail={(salary) => setOpenedFixedSalaryEmployeeId(salary.employeeId)}
          />
        )}
        {canSeeAllPayroll && openedFixedSalary && (
          <FixedSalaryDetail
            salary={openedFixedSalary}
            employeeName={getEmployeeName(openedFixedSalary.employeeId)}
            payments={openedFixedSalaryPayments}
            onClose={() => setOpenedFixedSalaryEmployeeId('')}
          />
        )}
        {canEditFixedPay && fixedSalaryForm && (
          <FixedSalaryForm
            key={fixedSalaryForm.salary?.employeeId ?? 'new'}
            employees={employees}
            salaries={fixedSalariesLive.data}
            currentUser={currentUser}
            salary={fixedSalaryForm.salary}
            onClose={() => setFixedSalaryForm(null)}
          />
        )}
        <FixedPaymentList
          payments={fixedPayments}
          isLoading={isLoading}
          getEmployeeName={getEmployeeName}
          canMarkPaid={canSeeAllPayroll}
          onMarkPaid={handleMarkPaymentPaid}
          onMarkPending={handleMarkPaymentPending}
          onEdit={canEditFixedPay ? (payment) => setEditingFixedPaymentId(payment.id ?? '') : undefined}
          onDelete={canDeleteFixedPay ? handleDeleteFixedPayment : undefined}
          onOpenDetail={(payment) => setOpenedFixedPaymentId(payment.id ?? '')}
        />
        {openedFixedPayment && (
          <FixedPaymentDetail
            payment={openedFixedPayment}
            employeeName={getEmployeeName(openedFixedPayment.employeeId)}
            onClose={() => setOpenedFixedPaymentId('')}
          />
        )}
        {canEditFixedPay && editingFixedPayment && (
          <FixedPaymentForm
            key={editingFixedPayment.id}
            payment={editingFixedPayment}
            employeeName={getEmployeeName(editingFixedPayment.employeeId)}
            currentUser={currentUser}
            onClose={() => setEditingFixedPaymentId('')}
          />
        )}
      </>)}

      {/* ═══════════ PESTAÑA HOURLY: pagos por horas (features/payroll) ═══════════ */}
      {tab === 'hourly' && (<>
        <HourlyPayList
          payments={hourlyPayments}
          isLoading={isLoading}
          getEmployeeName={getEmployeeName}
          canMarkPaid={canSeeAllPayroll}
          onMarkPaid={handleMarkPaymentPaid}
          onMarkPending={handleMarkPaymentPending}
          onNewPayment={canSeeAllPayroll ? () => setHourlyForm({ paymentId: null }) : undefined}
          onEdit={canSeeAllPayroll ? (payment) => setHourlyForm({ paymentId: payment.id ?? null }) : undefined}
          onDelete={canSeeAllPayroll ? handleDeleteHourlyPayment : undefined}
          onOpenDetail={(payment) => setHourlyDetailId(payment.id ?? '')}
        />
        {hourlyDetailPayment && (
          <HourlyPayDetail
            payment={hourlyDetailPayment}
            employeeName={getEmployeeName(hourlyDetailPayment.employeeId)}
            onClose={() => setHourlyDetailId('')}
          />
        )}
        {canSeeAllPayroll && isHourlyFormOpen && (
          <HourlyPaymentForm
            key={hourlyForm?.paymentId ?? 'new'}
            employees={employees}
            payrollRecords={records}
            hourlyRates={hourlyRatesLive.data}
            currentUser={currentUser}
            payment={editingHourlyPayment}
            onClose={() => setHourlyForm(null)}
          />
        )}
      </>)}

      {/* ═══════════ PESTAÑA 1: ASIGNAR NÓMINA (registros creados desde "Pay" en Houses) ═══════════ */}
      {tab === 'asignar' && (<>

      {/* FILTROS: periodo (Schedule Date) y, debajo, el empleado */}
      <div className="pv-period">
        <PeriodBar period={assignPeriod} onChange={setAssignPeriod}>
        {/* ⭐ El filtro de empleado SOLO existe con alcance 'All'. Con 'Own' se
            oculta para que nadie vea la nómina de sus compañeros. */}
        {canSeeAllPayroll && (
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
                const match = perHouseEmployees.find(emp => empName(emp).toLowerCase() === v.toLowerCase().trim());
                const next = match ? match.id : '';
                if (next !== selectedEmployee) setSelectedRecordIds([]);
                setSelectedEmployee(next);
              }}
            />
            <datalist id="pv-employee-list">
              {perHouseEmployees.map(emp => <option key={emp.id} value={empName(emp)} />)}
            </datalist>
          </div>
        </div>
        )}
        </PeriodBar>
      </div>

      {/* ⭐ SUB-PESTAÑAS (sustituyen al filtro de Status): estado de cada casa
          respecto a la nómina */}
      <div className="pva-subtabs">
        <button className={`pva-subtab${assignView === 'pending' ? ' active' : ''}`} onClick={() => changeAssignView('pending')}>
          Pending ({viewCounts.pending})
        </button>
        <button className={`pva-subtab ennomina${assignView === 'ennomina' ? ' active' : ''}`} onClick={() => changeAssignView('ennomina')}>
          En nómina ({viewCounts.ennomina})
        </button>
        <button className={`pva-subtab paid${assignView === 'paid' ? ' active' : ''}`} onClick={() => changeAssignView('paid')}>
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
            onClick={() => setPayForm({ date: todayIso(), bonus: 0, bonusNote: '', discount: 0, discountNote: '', status: 'Pending' })}
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
          {isLoading || records.length === 0 || filteredRecords.length === 0 ? (
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}><td colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5} className="pv-td"><div className="skel-line skel-row-main" /></td></tr>
                ))
              ) : records.length === 0 ? (
                // ⭐ Distinguir entre "BD vacía" y "filtros excluyen todo"
                <tr><td colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5} className="pv-empty-cell">No payroll records in database yet. Register payments from the Houses view.</td></tr>
              ) : (
                <tr><td colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5} className="pv-empty-cell italic">
                  {assignView === 'pending'
                    ? 'No hay casas pendientes de asignar con los filtros actuales.'
                    : assignView === 'ennomina'
                      ? 'No hay casas en nómina sin pagar con los filtros actuales.'
                      : 'No hay casas pagadas con los filtros actuales.'}
                </td></tr>
              )}
            </tbody>
          ) : (
            // ⭐ AGRUPADO POR EQUIPO: cada equipo abre con una fila de cabecera
            //    (nombre, numero de casas y subtotal) y se puede colapsar.
            <VirtualItems
              items={tableRows}
              estimate={72}
              colSpan={selectedEmployee && assignView === 'pending' ? 6 : 5}
              renderItem={item => item.record ? renderRecordRow(item.record) : renderGroupRow(item.group)}
            />
          )}
        </table>
      </div>

      </>)}

      {/* ═══════════ PESTAÑA 2: NÓMINAS SEMANALES POR EMPLEADO ═══════════ */}
      {tab === 'nominas' && (
        <>
          {/* Semana (PeriodBar solo Week); sin búsqueda ni orden: la tabla va directo debajo (pedido de Omar). */}
          <div className="pnw-period">
            <PeriodBar period={payrollWeekPeriod} onChange={setPayrollWeekPeriod} allowedKinds={['week']} />
          </div>

          {weekStartIso && (
            <WeeklyPayrollTable
              rows={visibleWeeklyRows}
              weekStart={weekStartIso}
              isLoading={isLoading || !usersLive.loaded}
              isBusy={isSaving}
              getEmployeeName={getEmployeeName}
              onOpenDetail={row => setDetailEmployeeId(row.employeeId)}
              onSetSent={canManagePayroll ? handleSetSent : undefined}
              onPayWeek={canManagePayroll ? () => setPayTarget('all') : undefined}
              onMarkWeekPending={canManagePayroll && recordsPaidThisWeek.length > 0 ? handleMarkWeekPending : undefined}
            />
          )}
          {detailRow && weekStartIso && (
            <WeeklyPayrollDetail
              row={detailRow}
              employeeName={getEmployeeName(detailRow.employeeId)}
              weekStart={weekStartIso}
              getWorkDay={getRecordWorkDay}
              getHouseInfo={propertyId => {
                const house = propById.get(propertyId);
                return house ? { client: getClientName(house.client), address: house.address } : null;
              }}
              onOpenHouse={propertyId => setSelectedHouse(propById.get(propertyId) ?? null)}
              onAdjust={canManagePayroll ? row => setAdjustingEmployeeId(row.employeeId) : undefined}
              canEditHouses={canManagePayroll}
              onPay={canManagePayroll ? row => setPayTarget(row.employeeId) : undefined}
              currentUser={currentUser}
              onClose={() => setDetailEmployeeId('')}
            />
          )}
          {canManagePayroll && payTarget && payRows.length > 0 && weekStartIso && (
            <WeeklyPayForm
              key={payTarget}
              weekStart={weekStartIso}
              pendingRows={payRows}
              isSingleEmployee={payTarget !== 'all'}
              getEmployeeName={getEmployeeName}
              currentUser={currentUser}
              onClose={() => setPayTarget(null)}
            />
          )}
          {canManagePayroll && adjustingRow && weekStartIso && (
            <WeeklyAdjustmentForm
              row={adjustingRow}
              employeeName={getEmployeeName(adjustingRow.employeeId)}
              weekStart={weekStartIso}
              currentUser={currentUser}
              onClose={() => setAdjustingEmployeeId('')}
            />
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
                      <DateInput className="pv-input pvp-input-plain" value={payForm.date} onChange={iso => setPayForm({ ...payForm, date: iso })} />
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
                        const prop = propById.get(rec.propertyId);
                        return (
                          <li key={rec.id} className="pvp-house">
                            <div className="pvp-house-info">
                              <div className="pv-client-name">{prop ? getClientName(prop.client) : 'Unknown Property'}</div>
                              <div className="pv-client-address"><MapPin size={12} /> {prop?.address || '—'} · {fmtDate(prop?.scheduleDate || rec.date)}</div>
                            </div>
                            <div className="pvp-house-amount">${getPayrollTotal(rec).toFixed(2)}</div>
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
                const prop = propById.get(selectedPayroll.propertyId);
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
                        <span className="pv-amount-value total">${getPayrollTotal(selectedPayroll).toFixed(2)}</span>
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
                  <span className="pv-total-value">${editFormTotal.toFixed(2)}</span>
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
                  <span className="pv-detail-value">{fmtDate(selectedHouse.receiveDate) || '-'}</span>
                </div>
                <div className="pv-detail-item">
                  <span className="pv-detail-label"><CalendarDays size={14} /> SCHEDULE DATE</span>
                  <span className="pv-detail-value">{fmtDate(selectedHouse.scheduleDate) || '-'}</span>
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

      {/* ══════════ MODAL: REVISAR Y CORREGIR FECHAS ══════════ */}

    </div>
  );
}