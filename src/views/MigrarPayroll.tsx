import { useState } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import './MigrarPayroll.css';

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE TEMPORAL — MIGRACIÓN ÚNICA payroll_records → payroll
//
// Uso:
//   1. Importar y renderizar temporalmente en cualquier vista de admin:
//        import { MigrarPayroll } from './views/MigrarPayroll';
//        ...
//        <MigrarPayroll />
//   2. Presionar "Iniciar migración" y esperar el resumen.
//   3. Verificar en PayrollView que aparezcan los pagos migrados.
//   4. QUITAR el import y el componente, y borrar estos dos archivos.
//   5. Cuando todo esté confirmado, borrar la colección 'payroll_records'
//      manualmente desde Firebase Console (queda como respaldo mientras tanto).
//
// Seguridad:
//   - Copia cada documento CONSERVANDO SU MISMO ID (batch.set), así re-ejecutar
//     la migración NO crea duplicados: solo re-escribe los mismos documentos.
//   - NO borra nada de 'payroll_records'.
//   - Escribe en lotes de 400 (límite de Firestore: 500 por batch).
// ═══════════════════════════════════════════════════════════════════════════

const ORIGEN = 'payroll_records';
const DESTINO = 'payroll';
const TAMANO_LOTE = 400;

type Estado = 'listo' | 'migrando' | 'terminado' | 'error';

export const MigrarPayroll = () => {
  const [estado, setEstado] = useState<Estado>('listo');
  const [progreso, setProgreso] = useState('');
  const [resumen, setResumen] = useState('');

  const migrar = async () => {
    if (!window.confirm(`¿Copiar TODOS los documentos de '${ORIGEN}' a '${DESTINO}'?\n\nEs seguro re-ejecutarla: conserva los IDs y no duplica.`)) return;
    setEstado('migrando');
    setResumen('');
    try {
      setProgreso(`Leyendo '${ORIGEN}'...`);
      const snap = await getDocs(collection(db, ORIGEN));
      const docs = snap.docs;
      if (docs.length === 0) {
        setEstado('terminado');
        setResumen(`'${ORIGEN}' está vacía. Nada que migrar.`);
        return;
      }

      let copiados = 0;
      for (let i = 0; i < docs.length; i += TAMANO_LOTE) {
        const lote = docs.slice(i, i + TAMANO_LOTE);
        const batch = writeBatch(db);
        lote.forEach(d => {
          // Mismo ID en la colección destino => migración idempotente (sin duplicados)
          batch.set(doc(db, DESTINO, d.id), d.data());
        });
        await batch.commit();
        copiados += lote.length;
        setProgreso(`Copiados ${copiados} de ${docs.length}...`);
      }

      // Verificación: confirmar que cada ID de origen existe en destino
      setProgreso('Verificando...');
      const destinoSnap = await getDocs(collection(db, DESTINO));
      const idsDestino = new Set(destinoSnap.docs.map(d => d.id));
      const faltantes = docs.filter(d => !idsDestino.has(d.id)).length;

      if (faltantes > 0) {
        setEstado('error');
        setResumen(`⚠ Migración incompleta: faltan ${faltantes} documentos. Vuelve a ejecutarla (es seguro).`);
      } else {
        setEstado('terminado');
        setResumen(`✅ Migración completa: ${docs.length} documentos copiados a '${DESTINO}' (total en destino: ${destinoSnap.size}). '${ORIGEN}' quedó intacta como respaldo. Ya puedes quitar este componente.`);
      }
      setProgreso('');
    } catch (error) {
      console.error('[MigrarPayroll] Error:', error);
      setEstado('error');
      setResumen('Error durante la migración. Revisa la consola. Es seguro volver a intentarla.');
      setProgreso('');
    }
  };

  return (
    <div className="migrar-payroll-box">
      <h3 className="migrar-payroll-title">Migración única: {ORIGEN} → {DESTINO}</h3>
      <p className="migrar-payroll-desc">
        Copia los pagos históricos a la colección unificada conservando sus IDs.
        No borra la colección de origen. Re-ejecutable sin riesgo de duplicados.
      </p>
      <button
        className="migrar-payroll-btn"
        onClick={migrar}
        disabled={estado === 'migrando'}
      >
        {estado === 'migrando' ? 'Migrando...' : 'Iniciar migración'}
      </button>
      {progreso && <p className="migrar-payroll-progreso">{progreso}</p>}
      {resumen && (
        <p className={estado === 'error' ? 'migrar-payroll-resumen error' : 'migrar-payroll-resumen ok'}>
          {resumen}
        </p>
      )}
      <CorregirFechas />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — CORRECCIÓN DE FECHAS DÍA↔MES INVERTIDAS
//
// Problema: el Data Import guardó fechas en formato DÍA/MES (12/05/2026 =
// 12 de mayo), pero la app las interpreta como MES/DÍA (5 de diciembre).
// Resultado: trabajos de mayo aparecen como si fueran de noviembre/diciembre.
//
// Regla (definida por el negocio): toda fecha que al interpretarse como MM/DD
// quede EN EL FUTURO se considera invertida y se corrige intercambiando
// día↔mes, siempre que:
//   1. El intercambio produzca una fecha válida (la parte de día debe ser ≤ 12
//      para poder usarse como mes — 07/31 jamás se toca porque 31 no es mes).
//   2. La fecha corregida quede HOY O EN EL PASADO (si sigue en el futuro,
//      el intercambio no explica el error: se reporta para revisión manual).
//
// Flujo en dos pasos: ANALIZAR (solo lectura, muestra qué cambiaría) y luego
// APLICAR (escribe en lotes). Nada se modifica sin pasar por el análisis.
//
// Campos cubiertos: properties.scheduleDate y payroll.date.
// ═══════════════════════════════════════════════════════════════════════════

interface PropuestaFecha {
  coleccion: string;
  id: string;
  campo: string;
  etiqueta: string; // nombre de la casa / referencia legible
  antes: string;
  despues: string;
}

const CorregirFechas = () => {
  const [estado, setEstado] = useState<Estado>('listo');
  const [progreso, setProgreso] = useState('');
  const [resumen, setResumen] = useState('');
  const [propuestas, setPropuestas] = useState<PropuestaFecha[]>([]);
  const [manuales, setManuales] = useState(0);

  // Devuelve la cadena corregida (mismo estilo que la original) o null si no aplica.
  const corregirSiInvertida = (valor: unknown): string | null => {
    if (typeof valor !== 'string') return null; // Timestamps u otros tipos: no tocar
    const s = valor.trim();
    let y = 0, m = 0, d = 0, estilo: 'iso' | 'slash' | null = null;
    let sep = '/';
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const slash = s.match(/^(\d{1,2})([/-])(\d{1,2})[/-](\d{4})$/);
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; estilo = 'iso'; }
    else if (slash) { m = +slash[1]; d = +slash[3]; y = +slash[4]; sep = slash[2]; estilo = 'slash'; }
    if (!estilo) return null;

    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const interpretada = new Date(y, m - 1, d); // interpretación MM/DD actual de la app
    if (isNaN(interpretada.getTime())) return null;
    if (interpretada <= hoy) return null;       // no está en el futuro: no se toca
    if (d > 12) return null;                    // el día no puede ser mes: no invertible
    if (m === d) return null;                   // 05/05: invertirla no cambia nada

    const invertida = new Date(y, d - 1, m);    // día↔mes
    if (isNaN(invertida.getTime())) return null;
    if (invertida > hoy) return 'MANUAL';       // sigue futura: revisar a mano

    const pad = (n: number) => String(n).padStart(2, '0');
    return estilo === 'iso'
      ? `${y}-${pad(d)}-${pad(m)}`
      : `${pad(d)}${sep}${pad(m)}${sep}${y}`;   // estilo slash: quedará como MM/DD correcto
  };

  const analizar = async () => {
    setEstado('migrando');
    setResumen('');
    setPropuestas([]);
    setManuales(0);
    try {
      const nuevas: PropuestaFecha[] = [];
      let revisarManual = 0;

      setProgreso("Leyendo 'properties'...");
      const propsSnap = await getDocs(collection(db, 'properties'));
      propsSnap.docs.forEach(docu => {
        const data = docu.data() as { scheduleDate?: unknown; client?: unknown; address?: unknown };
        const res = corregirSiInvertida(data.scheduleDate);
        if (res === 'MANUAL') revisarManual++;
        else if (res) nuevas.push({ coleccion: 'properties', id: docu.id, campo: 'scheduleDate', etiqueta: String(data.address || docu.id), antes: String(data.scheduleDate), despues: res });
      });

      setProgreso("Leyendo 'payroll'...");
      const paySnap = await getDocs(collection(db, 'payroll'));
      paySnap.docs.forEach(docu => {
        const data = docu.data() as { date?: unknown };
        const res = corregirSiInvertida(data.date);
        if (res === 'MANUAL') revisarManual++;
        else if (res) nuevas.push({ coleccion: 'payroll', id: docu.id, campo: 'date', etiqueta: docu.id, antes: String(data.date), despues: res });
      });

      setPropuestas(nuevas);
      setManuales(revisarManual);
      setEstado('listo');
      setProgreso('');
      setResumen(nuevas.length === 0
        ? `No se detectaron fechas invertidas.${revisarManual ? ` ${revisarManual} fechas futuras no invertibles requieren revisión manual.` : ''}`
        : `Análisis listo: ${nuevas.length} fechas por corregir (${nuevas.filter(p => p.coleccion === 'properties').length} en casas, ${nuevas.filter(p => p.coleccion === 'payroll').length} en payroll).${revisarManual ? ` Además, ${revisarManual} fechas futuras NO invertibles quedan para revisión manual.` : ''} Revisa los ejemplos y presiona Aplicar.`);
    } catch (error) {
      console.error('[CorregirFechas] Error analizando:', error);
      setEstado('error');
      setResumen('Error durante el análisis. Revisa la consola.');
      setProgreso('');
    }
  };

  const aplicar = async () => {
    if (propuestas.length === 0) return;
    if (!window.confirm(`¿Aplicar ${propuestas.length} correcciones de fecha?\n\nproperties.scheduleDate y payroll.date se actualizarán intercambiando día↔mes.`)) return;
    setEstado('migrando');
    try {
      let aplicadas = 0;
      for (let i = 0; i < propuestas.length; i += TAMANO_LOTE) {
        const lote = propuestas.slice(i, i + TAMANO_LOTE);
        const batch = writeBatch(db);
        lote.forEach(p => {
          batch.update(doc(db, p.coleccion, p.id), { [p.campo]: p.despues });
        });
        await batch.commit();
        aplicadas += lote.length;
        setProgreso(`Aplicadas ${aplicadas} de ${propuestas.length}...`);
      }
      setEstado('terminado');
      setProgreso('');
      setResumen(`✅ ${aplicadas} fechas corregidas. Verifica Payroll y Houses; las fechas de mayo ya no deben aparecer como noviembre/diciembre.`);
      setPropuestas([]);
    } catch (error) {
      console.error('[CorregirFechas] Error aplicando:', error);
      setEstado('error');
      setResumen('Error al aplicar. Revisa la consola. Puedes volver a Analizar y reintentar.');
      setProgreso('');
    }
  };

  return (
    <div className="migrar-payroll-box seccion-fechas">
      <h3 className="migrar-payroll-title">Corrección de fechas invertidas (día↔mes)</h3>
      <p className="migrar-payroll-desc">
        Detecta fechas del Data Import guardadas como día/mes pero leídas como mes/día
        (ej: 12/05/2026 mostrado como 5 de diciembre cuando era 12 de mayo).
        Solo corrige fechas futuras cuyo intercambio dé una fecha válida en el pasado.
        Primero Analizar (no modifica nada), luego Aplicar.
      </p>
      <div className="migrar-payroll-btn-row">
        <button className="migrar-payroll-btn" onClick={analizar} disabled={estado === 'migrando'}>
          {estado === 'migrando' ? 'Trabajando...' : '1. Analizar'}
        </button>
        <button className="migrar-payroll-btn aplicar" onClick={aplicar} disabled={estado === 'migrando' || propuestas.length === 0}>
          2. Aplicar {propuestas.length > 0 ? `(${propuestas.length})` : ''}
        </button>
      </div>
      {progreso && <p className="migrar-payroll-progreso">{progreso}</p>}
      {resumen && (
        <p className={estado === 'error' ? 'migrar-payroll-resumen error' : 'migrar-payroll-resumen ok'}>
          {resumen}
        </p>
      )}
      {propuestas.length > 0 && (
        <div className="migrar-payroll-preview">
          {propuestas.slice(0, 15).map(p => (
            <div key={`${p.coleccion}-${p.id}`} className="migrar-payroll-preview-row">
              <span className="migrar-payroll-preview-col">{p.coleccion}</span>
              <span className="migrar-payroll-preview-label">{p.etiqueta}</span>
              <span className="migrar-payroll-preview-change">{p.antes} → {p.despues}</span>
            </div>
          ))}
          {propuestas.length > 15 && <p className="migrar-payroll-progreso">...y {propuestas.length - 15} más.</p>}
        </div>
      )}
      {manuales > 0 && propuestas.length === 0 && (
        <p className="migrar-payroll-progreso">Fechas futuras no invertibles (revisión manual): {manuales}</p>
      )}
    </div>
  );
};