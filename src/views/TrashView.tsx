// ============================================================================
// ⭐ RECYCLE BIN (Papelera de reciclaje).
// Todo lo que se "borra" en la app llega aquí en lugar de destruirse. Cada
// registro muestra QUIÉN lo borró, CUÁNDO y el MOTIVO obligatorio que
// escribió, y ofrece dos acciones: Restaurar (regresa el documento íntegro,
// con su mismo id y sus registros relacionados) o Eliminar definitivamente.
// Ambas acciones quedan en la bitácora (Activity Log).
// ============================================================================
import { useEffect, useState } from 'react';
import {
  Trash2,
  RotateCcw,
  Menu,
  RefreshCw,
  Search,
} from 'lucide-react';
import { trashService } from '../services/trashService';
import type { TrashEntry } from '../services/trashService';
import { logActivity } from '../services/activityLogService';
import type { SystemUser } from '../types';
import './TrashView.css';

interface TrashViewProps {
  onOpenMenu: () => void;
  currentUser: SystemUser;
}

const formatWhen = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function TrashView({ onOpenMenu, currentUser }: TrashViewProps) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      setEntries(await trashService.getAll());
    } catch (error) {
      console.error('Error loading trash:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRestore = async (entry: TrashEntry) => {
    if (
      !window.confirm(
        `¿Restaurar "${entry.targetLabel || entry.originalId}" al módulo ${entry.moduleLabel}?\n\nSe recupera íntegro: mismo id, mismos datos y sus ${entry.related.length} registro(s) relacionado(s).`,
      )
    )
      return;
    setIsWorking(true);
    try {
      await trashService.restore(entry);
      // ⭐ Bitácora: restauración desde la papelera.
      logActivity({
        action: 'create',
        module: entry.moduleLabel,
        user: currentUser,
        targetId: entry.originalId,
        targetLabel: entry.targetLabel,
        detail: `Restaurado desde la papelera (borrado por ${entry.deletedByName} el ${formatWhen(entry.deletedAt)} — motivo: "${entry.reason}")`,
      });
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (error) {
      console.error('Error restoring:', error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `No se pudo restaurar.\n\nCódigo: ${fbErr.code || 'desconocido'}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handlePurge = async (entry: TrashEntry) => {
    if (
      !window.confirm(
        `¿Eliminar DEFINITIVAMENTE "${entry.targetLabel || entry.originalId}"?\n\nEsta acción no se puede deshacer: el registro y sus relacionados se pierden para siempre.`,
      )
    )
      return;
    setIsWorking(true);
    try {
      await trashService.purge(entry.id);
      // ⭐ Bitácora: eliminación definitiva.
      logActivity({
        action: 'delete',
        module: entry.moduleLabel,
        user: currentUser,
        targetId: entry.originalId,
        targetLabel: entry.targetLabel,
        detail: `Eliminado DEFINITIVAMENTE desde la papelera (llegó borrado por ${entry.deletedByName} — motivo: "${entry.reason}")`,
      });
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (error) {
      console.error('Error purging:', error);
      const fbErr = error as { code?: string; message?: string };
      alert(
        `No se pudo eliminar.\n\nCódigo: ${fbErr.code || 'desconocido'}\nDetalle: ${fbErr.message || String(error)}`,
      );
    } finally {
      setIsWorking(false);
    }
  };

  const visible = entries.filter((e) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (e.targetLabel || '').toLowerCase().includes(q) ||
      (e.moduleLabel || '').toLowerCase().includes(q) ||
      (e.deletedByName || '').toLowerCase().includes(q) ||
      (e.reason || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="tv-page fade-in">
      <header className="tv-header">
        <div className="tv-header-left">
          <button className="tv-menu-btn" onClick={onOpenMenu} aria-label="Menu">
            <Menu size={22} />
          </button>
          <div>
            <h2 className="tv-title">
              <Trash2 size={22} /> Recycle Bin
            </h2>
            <p className="tv-subtitle">
              Nada se destruye al borrar: aquí se restaura íntegro o se elimina
              definitivamente. Cada registro guarda quién lo borró, cuándo y por
              qué.
            </p>
          </div>
        </div>
        <button className="tv-refresh-btn" onClick={load} disabled={isLoading}>
          <RefreshCw size={15} className={isLoading ? 'tv-spin' : ''} /> Refrescar
        </button>
      </header>

      <div className="tv-search-wrap">
        <Search size={15} className="tv-search-icon" />
        <input
          className="tv-search"
          placeholder="Buscar por registro, módulo, usuario o motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="tv-empty">Cargando papelera…</div>
      ) : visible.length === 0 ? (
        <div className="tv-empty">
          {entries.length === 0
            ? 'La papelera está vacía.'
            : 'Ningún registro coincide con la búsqueda.'}
        </div>
      ) : (
        <div className="tv-table-wrap">
          <table className="tv-table">
            <thead>
              <tr>
                <th className="tv-th">Borrado el</th>
                <th className="tv-th">Módulo</th>
                <th className="tv-th">Registro</th>
                <th className="tv-th">Borrado por</th>
                <th className="tv-th">Motivo</th>
                <th className="tv-th center">Relacionados</th>
                <th className="tv-th right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="tv-tr">
                  <td className="tv-td nowrap">{formatWhen(e.deletedAt)}</td>
                  <td className="tv-td">
                    <span className="tv-module-badge">{e.moduleLabel}</span>
                  </td>
                  <td className="tv-td strong">{e.targetLabel || e.originalId}</td>
                  <td className="tv-td">{e.deletedByName || '—'}</td>
                  <td className="tv-td tv-reason">{e.reason}</td>
                  <td className="tv-td center">{e.related.length}</td>
                  <td className="tv-td right">
                    <div className="tv-actions">
                      <button
                        className="tv-btn restore"
                        onClick={() => handleRestore(e)}
                        disabled={isWorking}
                        title="Restaurar íntegramente"
                      >
                        <RotateCcw size={14} /> Restaurar
                      </button>
                      <button
                        className="tv-btn purge"
                        onClick={() => handlePurge(e)}
                        disabled={isWorking}
                        title="Eliminar definitivamente"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
