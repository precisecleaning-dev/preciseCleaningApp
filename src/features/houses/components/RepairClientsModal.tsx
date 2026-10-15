// ⭐ REPARADOR DE VÍNCULOS CASA↔CLIENTE: casas cuyo `client` no resuelve a
//    ningún cliente (la auto-limpieza vieja borró la llave legacy), agrupadas
//    por id huérfano y re-vinculadas en lote al cliente correcto. Extraído de HousesView.
import { useState } from "react";
import { X } from "lucide-react";
import type { Customer, Property, SystemUser } from "../../../types/index";
import { propertiesService } from "../../../services/propertiesService";
import { logActivity } from "../../../services/activityLogService";

export interface OrphanClientGroup {
  id: string;
  count: number;
  sample: string;
}

interface RepairClientsModalProps {
  groups: OrphanClientGroup[];
  properties: Property[];
  customers: Customer[];
  currentUser?: SystemUser | null;
  onClose: () => void;
}

export default function RepairClientsModal({ groups, properties, customers, currentUser, onClose }: RepairClientsModalProps) {
  const [repairPick, setRepairPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const handleRepairGroup = async (orphanId: string) => {
    const customerId = repairPick[orphanId];
    if (!customerId || !currentUser) return alert("Selecciona el cliente correcto.");
    const target = customers.find((c) => c.id === customerId);
    const houses = properties.filter((p) => String(p.client || "").trim() === orphanId);
    if (!target || houses.length === 0) return;
    if (!window.confirm(`¿Vincular ${houses.length} casa(s) al cliente "${target.name}"?`)) return;
    setBusy(true);
    try {
      await Promise.all(
        houses.map((h) => propertiesService.update(h.id, { client: target.id } as Partial<Property>)),
      );
      logActivity({
        action: "update",
        module: "Houses",
        user: currentUser,
        targetId: orphanId,
        targetLabel: target.name,
        detail: `Reparador: ${houses.length} casa(s) re-vinculadas del id huérfano ${orphanId} al cliente "${target.name}"`,
      });
      alert(`✅ ${houses.length} casa(s) vinculadas a "${target.name}".`);
    } catch (error) {
      const fbErr = error as { code?: string; message?: string };
      alert(`No se pudo reparar.\n\nCódigo: ${fbErr.code || "desconocido"}\nDetalle: ${fbErr.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay-centered" onClick={onClose}>
      <div className="modal-80" onClick={(e) => e.stopPropagation()}>
        <header className="hv-modal-header">
          <h3 className="hv-modal-title">Reparar vínculos de clientes</h3>
          <button className="hv-gcal-close" aria-label="Cerrar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="hv-gcal-body">
          <p className="hv-gcal-hint">
            Estas casas guardan un id de cliente que ya no encuentra a su
            dueño (la llave legacy se borró al editar el cliente). Elige el
            cliente correcto y todas las casas del grupo se re-vinculan con
            su id definitivo — este arreglo es permanente.
          </p>
          {groups.length === 0 ? (
            <p className="hv-gcal-hint"><b>✅ No hay vínculos rotos.</b></p>
          ) : (
            <ul className="hv-drafts-list">
              {groups.map((g) => (
                <li key={g.id} className="hv-draft-item">
                  <div className="hv-draft-info">
                    <span className="hv-draft-label">Id huérfano: {g.id}</span>
                    <span className="hv-draft-when">
                      {g.count} casa(s) · ej: {g.sample.slice(0, 60) || "—"}
                    </span>
                  </div>
                  <div className="hv-draft-actions">
                    <select
                      className="hv-input hv-repair-select"
                      value={repairPick[g.id] || ""}
                      onChange={(e) => setRepairPick((prev) => ({ ...prev, [g.id]: e.target.value }))}
                    >
                      <option value="">Cliente correcto…</option>
                      {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      className="hv-draft-btn resume"
                      disabled={busy || !repairPick[g.id]}
                      onClick={() => handleRepairGroup(g.id)}
                    >
                      Vincular
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
