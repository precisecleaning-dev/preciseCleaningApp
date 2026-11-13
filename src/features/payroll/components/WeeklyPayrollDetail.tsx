// src/features/payroll/components/WeeklyPayrollDetail.tsx
// Detalle de la nómina semanal de un empleado (clic en su fila de la pestaña
// Nóminas): resumen (casas, días, subtotal y total), lo que ganó cada día de
// lunes a domingo, sus casas (día, cliente, dirección, base, extra, descuento,
// total y estado; clic en la casa abre su detalle), su bono / descuento con
// las notas y los datos del pago. La vista le pasa la fila EN VIVO.
// Con permiso, el pago de una casa sin pagar se edita AQUÍ MISMO (lápiz de la
// fila: base, extra y descuento con sus notas; Enter guarda, Escape cancela),
// para corregir rápido sin salir de la semana.
import { useState, type KeyboardEvent } from 'react';
import { Check, CheckCircle, Home, Pencil, Plus, Wallet, X } from 'lucide-react';
import type { SystemUser } from '../../../types/index';
import { formatDate, formatDateRange, todayIso } from '../../../utils/dateFormat';
import { getPayrollTotal, money, roundToCents } from '../../../utils/jobFinancials';
import {
  WEEK_DAY_NAMES, getUnpaidTotal, getWeekDays, getWeekPayDay, parseOptionalAmount,
  type WeeklyPayrollRecord, type WeeklyPayrollRow,
} from '../weeklyPayroll';
import { updateHousePayment } from '../services/weeklyPayrollService';
import PayrollDialog from './PayrollDialog';
import './PayrollTable.css';
import './WeeklyPayrollDetail.css';

export interface WeeklyHouseInfo {
  client: string;
  address: string;
}

const getStatusBadge = (row: WeeklyPayrollRow) => {
  if (row.isPaid) return { text: 'Paid', className: 'ptbl-badge is-paid' };
  const hasPaidRecords = row.records.some((record) => record.status === 'Paid');
  return { text: hasPaidRecords ? 'Partially paid' : 'Pending', className: 'ptbl-badge' };
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

interface SummaryCardProps {
  label: string;
  value: string;
  isHighlighted?: boolean;
}

const SummaryCard = ({ label, value, isHighlighted = false }: SummaryCardProps) => (
  <div className={`wpd-stat${isHighlighted ? ' is-highlighted' : ''}`}>
    <span className="wpd-stat-label">{label}</span>
    <strong className="wpd-stat-value">{value}</strong>
  </div>
);

const amountText = (amount: number | undefined) => (Number(amount || 0) ? String(Number(amount)) : '');

interface HouseCellsProps {
  record: WeeklyPayrollRecord;
  day: string;
  info: WeeklyHouseInfo | null;
  onOpenHouse?: (propertyId: string) => void;
}

/** Día y casa (cliente y dirección); clic en el cliente abre la casa. */
const HouseCells = ({ record, day, info, onOpenHouse }: HouseCellsProps) => (
  <>
    <td className="wpd-nowrap">{formatDate(day)}</td>
    <td>
      {info && onOpenHouse ? (
        <button type="button" className="wpd-house-btn" onClick={() => onOpenHouse(record.propertyId)}>
          <Home size={14} aria-hidden="true" /> {info.client}
        </button>
      ) : (
        <span className="wpd-house-client">{info?.client ?? 'Unknown house'}</span>
      )}
      <span className="wpd-house-address">{info?.address || '—'}</span>
    </td>
  </>
);

const StatusBadge = ({ record }: { record: WeeklyPayrollRecord }) => (
  <span className={`ptbl-badge${record.status === 'Paid' ? ' is-paid' : ''}`}>{record.status === 'Paid' ? 'Paid' : 'Pending'}</span>
);

interface HouseEditRowProps extends HouseCellsProps {
  currentUser?: SystemUser | null;
  onDone: () => void;
}

/** Fila en edición: base, extra y descuento (con notas) en la misma tabla. */
const HouseEditRow = ({ record, day, info, onOpenHouse, currentUser, onDone }: HouseEditRowProps) => {
  const [baseText, setBaseText] = useState(() => amountText(record.baseAmount));
  const [extraText, setExtraText] = useState(() => amountText(record.extraAmount));
  const [extraNote, setExtraNote] = useState(record.extraNote || '');
  const [discountText, setDiscountText] = useState(() => amountText(record.discountAmount));
  const [discountNote, setDiscountNote] = useState(record.discountNote || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const baseAmount = parseOptionalAmount(baseText);
  const extraAmount = parseOptionalAmount(extraText);
  const discountAmount = parseOptionalAmount(discountText);
  const isValid = baseAmount !== null && extraAmount !== null && discountAmount !== null;
  const total = isValid ? roundToCents(baseAmount + extraAmount - discountAmount) : null;

  const handleSave = async () => {
    if (!isValid || isSaving) return;
    setIsSaving(true);
    setErrorText('');
    try {
      await updateHousePayment(record, {
        baseAmount, extraAmount, extraNote: extraNote.trim(), discountAmount, discountNote: discountNote.trim(),
      }, info?.address || info?.client || 'House payment', currentUser);
      onDone();
    } catch (error) {
      console.error('Error saving the house payment:', error);
      setErrorText('Could not save. Try again.');
      setIsSaving(false);
    }
  };

  // Enter guarda; Escape cancela solo la edición (preventDefault: el modal no se cierra).
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (!isSaving) onDone();
    }
  };

  const amountInput = (label: string, value: string, onChange: (text: string) => void, autoFocus = false) => (
    <input
      aria-label={label}
      autoFocus={autoFocus}
      className="pdlg-input wpd-edit-input"
      disabled={isSaving}
      inputMode="decimal"
      min="0"
      placeholder="0.00"
      step="0.01"
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
  const noteInput = (label: string, value: string, onChange: (text: string) => void) => (
    <input
      aria-label={label}
      className="pdlg-input wpd-edit-input wpd-edit-note"
      disabled={isSaving}
      placeholder="Note"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );

  return (
    <tr className="is-editing">
      <HouseCells record={record} day={day} info={info} onOpenHouse={onOpenHouse} />
      <td className="is-number">{amountInput('Base', baseText, setBaseText, true)}</td>
      <td className="is-number">
        {amountInput('Extra', extraText, setExtraText)}
        {noteInput('Extra note', extraNote, setExtraNote)}
      </td>
      <td className="is-number">
        {amountInput('Discount', discountText, setDiscountText)}
        {noteInput('Discount note', discountNote, setDiscountNote)}
      </td>
      <td className="is-number"><strong>{total === null ? '—' : money(total)}</strong></td>
      <td><StatusBadge record={record} /></td>
      <td>
        <span className="wpd-row-actions">
          <button
            type="button"
            className="wpd-icon-btn is-save"
            aria-label="Save house payment"
            title="Save (Enter)"
            disabled={!isValid || isSaving}
            onClick={handleSave}
          >
            <Check size={16} />
          </button>
          <button type="button" className="wpd-icon-btn" aria-label="Cancel" title="Cancel (Esc)" disabled={isSaving} onClick={onDone}>
            <X size={16} />
          </button>
        </span>
        {!isValid && <span className="wpd-row-error" role="alert">Amounts must be 0 or more.</span>}
        {errorText && <span className="wpd-row-error" role="alert">{errorText}</span>}
      </td>
    </tr>
  );
};

interface WeeklyPayrollDetailProps {
  row: WeeklyPayrollRow;
  employeeName: string;
  /** Lunes de la semana, AAAA-MM-DD. */
  weekStart: string;
  /** Día trabajado (AAAA-MM-DD) de un pago por casa: Schedule Date de la casa. */
  getWorkDay: (record: WeeklyPayrollRecord) => string;
  getHouseInfo: (propertyId: string) => WeeklyHouseInfo | null;
  onOpenHouse?: (propertyId: string) => void;
  /** Sin permiso de editar no hay botón de bono / descuento ni edición de las casas. */
  onAdjust?: (row: WeeklyPayrollRow) => void;
  canEditHouses?: boolean;
  /** "Pay" del pie: paga solo a este empleado (abre el modal de pago). */
  onPay?: (row: WeeklyPayrollRow) => void;
  currentUser?: SystemUser | null;
  onClose: () => void;
}

const WeeklyPayrollDetail = ({
  row, employeeName, weekStart, getWorkDay, getHouseInfo, onOpenHouse, onAdjust, canEditHouses = false, onPay, currentUser, onClose,
}: WeeklyPayrollDetailProps) => {
  const [editingRecordId, setEditingRecordId] = useState('');
  const weekDays = getWeekDays(weekStart);
  const today = todayIso();
  const status = getStatusBadge(row);
  const houses = row.records
    .filter((record) => record.propertyId)
    .map((record) => ({ record, day: getWorkDay(record), info: getHouseInfo(record.propertyId) }))
    .sort((houseA, houseB) => houseA.day.localeCompare(houseB.day)
      || (houseA.info?.client ?? '').localeCompare(houseB.info?.client ?? ''));
  const adjustments = row.records.filter((record) => !record.propertyId);
  const housesPerDay = weekDays.map((day) => houses.filter((house) => house.day === day).length);
  const daysWorked = row.dayTotals.filter((amount) => amount > 0).length;
  const paidRecord = row.records.find((record) => record.status === 'Paid');
  const unpaidTotal = getUnpaidTotal(row);
  const canAdjust = !!onAdjust && !row.isPaid;
  const hasAdjustment = row.bonus > 0 || row.discount > 0;

  const footer = (
    <>
      <button type="button" className="pdlg-secondary-btn" onClick={onClose}>
        Close
      </button>
      {canAdjust && (
        <button type="button" className="pdlg-secondary-btn" onClick={() => onAdjust(row)}>
          {hasAdjustment ? <Pencil size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {hasAdjustment ? 'Edit bonus / discount' : 'Add bonus / discount'}
        </button>
      )}
      {onPay && !row.isPaid && (
        <button type="button" className="btn-primary" onClick={() => onPay(row)}>
          <CheckCircle size={16} aria-hidden="true" /> Pay {money(unpaidTotal)}
        </button>
      )}
    </>
  );

  return (
    <PayrollDialog title="Weekly payroll" icon={Wallet} onClose={onClose} footer={footer} boxClassName="wpd-box">
      <div className="wpd-header">
        <div>
          <p className="wpd-employee">{employeeName}</p>
          <p className="wpd-week">Week {formatDateRange(weekDays[0], weekDays[6])}</p>
        </div>
        <span className={status.className}>{status.text}</span>
      </div>

      <div className="wpd-stats">
        <SummaryCard label="Houses" value={String(houses.length)} />
        <SummaryCard label="Days worked" value={`${daysWorked} / 7`} />
        <SummaryCard label="Houses total" value={money(row.housesTotal)} />
        <SummaryCard label="Total to pay" value={money(row.total)} isHighlighted />
      </div>

      <h4 className="wpd-section-title">By day</h4>
      <ol className="wpd-days">
        {WEEK_DAY_NAMES.map((dayName, dayIndex) => (
          <li
            key={dayName}
            className={`wpd-day${row.dayTotals[dayIndex] ? ' has-work' : ''}${weekDays[dayIndex] === today ? ' is-today' : ''}`}
          >
            <span className="wpd-day-name">{dayName.slice(0, 3)}</span>
            <span className="wpd-day-date">{formatDate(weekDays[dayIndex])}</span>
            <strong className="wpd-day-amount">{row.dayTotals[dayIndex] ? money(row.dayTotals[dayIndex]) : '—'}</strong>
            <span className="wpd-day-count">{housesPerDay[dayIndex] ? plural(housesPerDay[dayIndex], 'house') : 'Off'}</span>
          </li>
        ))}
      </ol>

      <h4 className="wpd-section-title">Houses ({houses.length})</h4>
      <div className="wpd-table-wrap">
        <table className="wpd-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>House</th>
              <th className="is-number">Base</th>
              <th className="is-number">Extra</th>
              <th className="is-number">Discount</th>
              <th className="is-number">Total</th>
              <th>Status</th>
              {canEditHouses && <th><span className="wpd-sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {houses.map(({ record, day, info }) => {
              const rowKey = record.id ?? `${record.propertyId}-${day}`;
              if (canEditHouses && record.id && record.id === editingRecordId) {
                return (
                  <HouseEditRow
                    key={rowKey}
                    record={record}
                    day={day}
                    info={info}
                    onOpenHouse={onOpenHouse}
                    currentUser={currentUser}
                    onDone={() => setEditingRecordId('')}
                  />
                );
              }
              return (
                <tr key={rowKey}>
                  <HouseCells record={record} day={day} info={info} onOpenHouse={onOpenHouse} />
                  <td className="is-number">{money(Number(record.baseAmount || 0))}</td>
                  <td className="is-number">
                    {Number(record.extraAmount || 0) ? <span className="wpd-plus">+{money(Number(record.extraAmount))}</span> : '—'}
                    {record.extraNote && <span className="wpd-note">{record.extraNote}</span>}
                  </td>
                  <td className="is-number">
                    {Number(record.discountAmount || 0) ? <span className="wpd-minus">−{money(Number(record.discountAmount))}</span> : '—'}
                    {record.discountNote && <span className="wpd-note">{record.discountNote}</span>}
                  </td>
                  <td className="is-number"><strong>{money(getPayrollTotal(record))}</strong></td>
                  <td><StatusBadge record={record} /></td>
                  {canEditHouses && (
                    <td>
                      {record.status !== 'Paid' && record.id && (
                        <button
                          type="button"
                          className="wpd-icon-btn"
                          aria-label={`Edit payment of ${info?.client ?? 'this house'}`}
                          title="Edit payment"
                          disabled={!!editingRecordId}
                          onClick={() => setEditingRecordId(record.id as string)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h4 className="wpd-section-title">Bonus &amp; discount</h4>
      {adjustments.length === 0 ? (
        <p className="wpd-empty">No bonus or discount this week.</p>
      ) : (
        <ul className="wpd-adjustments">
          {adjustments.map((adjustment) => (
            <li key={adjustment.id ?? adjustment.date} className="wpd-adjustment">
              {Number(adjustment.extraAmount || 0) > 0 && (
                <span className="wpd-adjustment-line">
                  <span className="wpd-plus">Bonus +{money(Number(adjustment.extraAmount))}</span>
                  {adjustment.extraNote && <span className="wpd-note">{adjustment.extraNote}</span>}
                </span>
              )}
              {Number(adjustment.discountAmount || 0) > 0 && (
                <span className="wpd-adjustment-line">
                  <span className="wpd-minus">Discount −{money(Number(adjustment.discountAmount))}</span>
                  {adjustment.discountNote && <span className="wpd-note">{adjustment.discountNote}</span>}
                </span>
              )}
              <span className={`ptbl-badge${adjustment.status === 'Paid' ? ' is-paid' : ''}`}>
                {adjustment.status === 'Paid' ? 'Paid' : 'Pending'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="wpd-section-title">Payment</h4>
      <dl className="pdlg-details wpd-payment">
        <div>
          <dt className="pdlg-detail-label">Pay day</dt>
          <dd className="pdlg-detail-value">Wednesday {formatDate(getWeekPayDay(weekStart))}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">{row.isPaid ? 'Paid' : 'Still to pay'}</dt>
          <dd className="pdlg-detail-value">{row.isPaid ? money(row.total) : money(unpaidTotal)}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Paid on</dt>
          <dd className="pdlg-detail-value">{paidRecord ? formatDate(paidRecord.paymentDate || paidRecord.paidAt) : '—'}</dd>
        </div>
        <div>
          <dt className="pdlg-detail-label">Paid by</dt>
          <dd className="pdlg-detail-value">{paidRecord?.paidBy || '—'}</dd>
        </div>
      </dl>
      {!row.isPaid && unpaidTotal !== roundToCents(row.total) && (
        <p className="pdlg-note">Part of this week was already paid with "Pagar seleccionadas".</p>
      )}
    </PayrollDialog>
  );
};

export default WeeklyPayrollDetail;
