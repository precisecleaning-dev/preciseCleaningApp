// src/features/houses/components/PropertyDateFixTool.tsx
// ============================================================================
// ⭐ "REVISAR FECHAS": corrige el Schedule Date de las casas guardado en un
//    formato viejo con barras (MM/DD o DD/MM, a veces ambiguo) y lo deja en el
//    formato interno AAAA-MM-DD. En pantalla toda fecha se ve MM/DD/AAAA.
//    Antes vivía solo dentro de PayrollView; ahora también está en el Overview.
//    Con la ventana de 12 meses (shared/data/propertiesWindow.ts) estas casas se
//    cargan siempre hasta corregirlas: corregirlas también baja lecturas.
// ============================================================================
import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { CalendarDays, Search, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { Property } from '../../../types/index';
import { commitInChunks } from '../../../shared/data/batchWrites';
import { formatDate } from '../../../utils/dateFormat';
import './PropertyDateFixTool.css';

// ══════════════════════════════════════════════════════════════════════════
// ⭐ ANÁLISIS DE FECHAS GUARDADAS (herramienta "Revisar fechas").
//    El problema: en Firestore conviven fechas escritas como MM/DD/YYYY y como
//    DD/MM/YYYY. Cuando ambas partes son <= 12 (p. ej. "08/12/2026") NO hay forma
//    de saber cuál es cuál leyendo el texto: puede ser 12 de agosto o 8 de
//    diciembre. Por eso la corrección necesita una decisión humana.
//    La solución definitiva es guardar todo en ISO (YYYY-MM-DD), que no es
//    ambiguo nunca. Este analizador clasifica cada fecha para la herramienta.
type DateKind = 'iso' | 'ambiguous' | 'mmdd' | 'ddmm' | 'invalid' | 'empty';
type DateAnalysis = {
  kind: DateKind;
  raw: string;
  a?: number; // primer número tal como está guardado
  b?: number; // segundo número
  y?: number;
  asMMDD?: string; // ISO si se lee MM/DD
  asDDMM?: string; // ISO si se lee DD/MM
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, mon: number, day: number) => `${y}-${pad2(mon)}-${pad2(day)}`;

const analyzeDate = (val: unknown): DateAnalysis => {
  const raw = val === null || val === undefined ? '' : String(val).trim();
  if (!raw) return { kind: 'empty', raw };
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) return { kind: 'iso', raw };
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!m) return { kind: 'invalid', raw };
  const a = +m[1], b = +m[2], y = +m[3];
  const mmddOk = a >= 1 && a <= 12 && b >= 1 && b <= 31;
  const ddmmOk = b >= 1 && b <= 12 && a >= 1 && a <= 31;
  const asMMDD = mmddOk ? isoOf(y, a, b) : undefined;
  const asDDMM = ddmmOk ? isoOf(y, b, a) : undefined;
  if (mmddOk && ddmmOk && a !== b) return { kind: 'ambiguous', raw, a, b, y, asMMDD, asDDMM };
  if (mmddOk) return { kind: 'mmdd', raw, a, b, y, asMMDD, asDDMM };
  if (ddmmOk) return { kind: 'ddmm', raw, a, b, y, asMMDD, asDDMM };
  return { kind: 'invalid', raw, a, b, y };
};

/** Lectura propuesta para elegir: día de la semana + MM/DD/AAAA (ayuda a decidir). */
const optionLabel = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
  return `${wd} ${formatDate(iso)}`;
};

interface PropertyDateFixToolProps {
  properties: Property[];
  setProperties: Dispatch<SetStateAction<Property[]>>;
  getClientName: (idOrName?: string | null) => string;
  /** El Overview solo muestra el botón si hay fechas por corregir. */
  hideWhenClean?: boolean;
}

export default function PropertyDateFixTool({ properties, setProperties, getClientName, hideWhenClean = false }: PropertyDateFixToolProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dateFixTab, setDateFixTab] = useState<'ambiguous' | 'ddmm' | 'all'>('ambiguous');
  const [savingDateId, setSavingDateId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [dateFixSearch, setDateFixSearch] = useState('');

  // ══════════════════════════════════════════════════════════════════════════
  // ⭐ HERRAMIENTA "REVISAR FECHAS": lista las casas cuyo scheduleDate NO está
  //    en ISO y permite convertirlo con un clic eligiendo la lectura correcta.
  //    Al guardar en ISO (YYYY-MM-DD) la ambigüedad desaparece para siempre y
  //    todas las vistas (Payroll, Invoices, Houses) leen la misma fecha.
  // ══════════════════════════════════════════════════════════════════════════
  const dateFixRows = useMemo(() => {
    const q = dateFixSearch.toLowerCase().trim();
    return properties
      .map(prop => ({ prop, an: analyzeDate(prop.scheduleDate) }))
      .filter(({ an }) => an.kind !== 'iso' && an.kind !== 'empty')
      .filter(({ an }) =>
        dateFixTab === 'all' ? true
          : dateFixTab === 'ambiguous' ? an.kind === 'ambiguous'
            : an.kind === 'ddmm' || an.kind === 'invalid')
      .filter(({ prop }) => !q
        || String(prop.address || '').toLowerCase().includes(q)
        || getClientName(prop.client).toLowerCase().includes(q))
      .sort((x, y) => String(x.prop.address || '').localeCompare(String(y.prop.address || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, dateFixTab, dateFixSearch]);

  const dateFixCounts = useMemo(() => {
    let ambiguous = 0, ddmm = 0, total = 0;
    properties.forEach(prop => {
      const an = analyzeDate(prop.scheduleDate);
      if (an.kind === 'iso' || an.kind === 'empty') return;
      total++;
      if (an.kind === 'ambiguous') ambiguous++;
      if (an.kind === 'ddmm' || an.kind === 'invalid') ddmm++;
    });
    return { ambiguous, ddmm, total };
  }, [properties]);

  // Guarda UNA fecha ya normalizada a ISO
  const applyDateFix = async (propertyId: string, iso?: string) => {
    if (!iso) return;
    setSavingDateId(propertyId);
    try {
      await updateDoc(doc(db, 'properties', propertyId), { scheduleDate: iso });
      setProperties(prev => prev.map(pr => (pr.id === propertyId ? { ...pr, scheduleDate: iso } : pr)));
    } catch (err) {
      console.error('Error corrigiendo la fecha:', err);
      const e = err as { code?: string; message?: string };
      alert(`No se pudo guardar la fecha.\n\nCódigo: ${e.code || 'desconocido'}\nDetalle: ${e.message || String(err)}`);
    } finally {
      setSavingDateId(null);
    }
  };

  // Aplica la MISMA lectura a todas las filas visibles (en lotes)
  const applyBulkDateFix = async (reading: 'mmdd' | 'ddmm') => {
    const rows = dateFixRows
      .map(({ prop, an }) => ({ id: prop.id, iso: reading === 'mmdd' ? an.asMMDD : an.asDDMM }))
      .filter(r => !!r.iso) as { id: string; iso: string }[];
    if (rows.length === 0) {
      alert('No hay filas visibles que se puedan convertir con esa lectura.');
      return;
    }
    if (!window.confirm(
      `Se convertirán ${rows.length} fecha(s) leyéndolas como ${reading === 'mmdd' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'} y se guardarán corregidas (en pantalla se verán MM/DD/AAAA).\n\n¿Continuar?`,
    )) return;
    setBulkSaving(true);
    // ⭐ En batches de hasta 500 (un viaje al servidor por tanda, no uno por casa).
    const { ok, failed } = await commitInChunks(rows, (b, r) =>
      b.update(doc(db, 'properties', r.id), { scheduleDate: r.iso }),
    );
    const savedIso = new Map(ok.map(r => [r.id, r.iso]));
    setProperties(prev => prev.map(pr => {
      const iso = savedIso.get(pr.id);
      return iso ? { ...pr, scheduleDate: iso } : pr;
    }));
    setBulkSaving(false);
    alert(`Listo.\n\nCorregidas: ${ok.length}${failed.length ? `\nFallidas: ${failed.length} (revisa la consola)` : ''}`);
  };

  if (hideWhenClean && dateFixCounts.total === 0 && !isOpen) return null;

  return (
    <>
  <button
    className={`dfx-btn${dateFixCounts.total > 0 ? ' warn' : ''}`}
    onClick={() => { setDateFixTab(dateFixCounts.ambiguous > 0 ? 'ambiguous' : dateFixCounts.ddmm > 0 ? 'ddmm' : 'all'); setIsOpen(true); }}
    title="Revisar y corregir las fechas guardadas en formato ambiguo"
  >
    <CalendarDays size={16} /> Revisar fechas
    {dateFixCounts.total > 0 && (
      <span className="dfx-count">{dateFixCounts.total}</span>
    )}
  </button>
  {isOpen && (
    <div className="modal-overlay-centered" onClick={() => !bulkSaving && setIsOpen(false)}>
      <div className="dfx-modal" onClick={e => e.stopPropagation()}>
        <header className="dfx-header">
          <div>
            <h3 className="dfx-title">
              <CalendarDays size={18} /> Revisar y corregir fechas
            </h3>
            <p className="dfx-sub">
              Estas casas tienen el Schedule Date guardado con barras (MM/DD o DD/MM).
              Al corregirlas se guardan en el formato interno AAAA-MM-DD, que nunca es
              ambiguo; en pantalla todas las fechas se ven siempre como MM/DD/AAAA.
            </p>
          </div>
          <button className="dfx-close" onClick={() => setIsOpen(false)} disabled={bulkSaving}>
            <X size={22} />
          </button>
        </header>

        <div className="dfx-toolbar">
          <div className="dfx-tabs">
            <button className={`dfx-tab${dateFixTab === 'ambiguous' ? ' active' : ''}`} onClick={() => setDateFixTab('ambiguous')}>
              Ambiguas ({dateFixCounts.ambiguous})
            </button>
            <button className={`dfx-tab${dateFixTab === 'ddmm' ? ' active' : ''}`} onClick={() => setDateFixTab('ddmm')}>
              Solo DD/MM ({dateFixCounts.ddmm})
            </button>
            <button className={`dfx-tab${dateFixTab === 'all' ? ' active' : ''}`} onClick={() => setDateFixTab('all')}>
              Todas ({dateFixCounts.total})
            </button>
          </div>
          <div className="dfx-search">
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              value={dateFixSearch}
              onChange={e => setDateFixSearch(e.target.value)}
              placeholder="Buscar por cliente o dirección..."
            />
          </div>
        </div>

        <div className="dfx-bulk">
          <span className="dfx-bulk-label">
            Aplicar a las {dateFixRows.length} fila(s) visibles:
          </span>
          <button className="dfx-bulk-btn mmdd" disabled={bulkSaving || dateFixRows.length === 0} onClick={() => applyBulkDateFix('mmdd')}>
            {bulkSaving ? 'Guardando…' : 'Leer todas como MM/DD'}
          </button>
          <button className="dfx-bulk-btn ddmm" disabled={bulkSaving || dateFixRows.length === 0} onClick={() => applyBulkDateFix('ddmm')}>
            {bulkSaving ? 'Guardando…' : 'Leer todas como DD/MM'}
          </button>
        </div>

        <div className="dfx-body">
          {dateFixRows.length === 0 ? (
            <div className="dfx-empty">
              {dateFixCounts.total === 0
                ? '✅ Todas las fechas ya están corregidas. No hay nada que corregir.'
                : 'No hay filas en esta pestaña con el filtro actual.'}
            </div>
          ) : (
            <table className="dfx-table">
              <thead>
                <tr>
                  <th className="dfx-th">Cliente / Dirección</th>
                  <th className="dfx-th">Guardado</th>
                  <th className="dfx-th">Si es MM/DD</th>
                  <th className="dfx-th">Si es DD/MM</th>
                </tr>
              </thead>
              <tbody>
                {dateFixRows.map(({ prop, an }) => (
                  <tr key={prop.id}>
                    <td className="dfx-td">
                      <div className="dfx-client">{getClientName(prop.client)}</div>
                      <div className="dfx-address">{prop.address || '—'}</div>
                    </td>
                    <td className="dfx-td">
                      <span className={`dfx-raw ${an.kind}`}>{an.raw}</span>
                    </td>
                    <td className="dfx-td">
                      {an.asMMDD ? (
                        <button
                          className="dfx-opt"
                          disabled={savingDateId === prop.id || bulkSaving}
                          onClick={() => applyDateFix(prop.id, an.asMMDD)}
                          title="Guardar con esta lectura"
                        >
                          {optionLabel(an.asMMDD)}
                        </button>
                      ) : (
                        <span className="dfx-na">no válido</span>
                      )}
                    </td>
                    <td className="dfx-td">
                      {an.asDDMM ? (
                        <button
                          className="dfx-opt"
                          disabled={savingDateId === prop.id || bulkSaving}
                          onClick={() => applyDateFix(prop.id, an.asDDMM)}
                          title="Guardar con esta lectura"
                        >
                          {optionLabel(an.asDDMM)}
                        </button>
                      ) : (
                        <span className="dfx-na">no válido</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )}
    </>
  );
}
