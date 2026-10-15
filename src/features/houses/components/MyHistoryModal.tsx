// ⭐ MI HISTORIAL — casas que le fueron ASIGNADAS al usuario para trabajar
//    (por assignedWorkers o por su equipo), de la más reciente a la más
//    antigua. Se habilita por rol con "btn_myHistory" (Configure Fields).
//    Extraído de HousesView; la lista solo se calcula con el panel abierto.
import { useMemo, type CSSProperties } from "react";
import { CalendarDays, Clock, MapPin, X } from "lucide-react";
import type { Property, Status, SystemUser } from "../../../types/index";
import { dateSortValue, formatDate } from "../../../utils/dateFormat";

interface MyHistoryModalProps {
  properties: Property[];
  currentUser?: SystemUser | null;
  statuses: Status[];
  getClientName: (idOrName?: string | null) => string;
  onOpenHouse: (house: Property) => void;
  onClose: () => void;
}

export default function MyHistoryModal({ properties, currentUser, statuses, getClientName, onOpenHouse, onClose }: MyHistoryModalProps) {
  const myHistoryHouses = useMemo(
    () =>
      properties
        .filter((p) => {
          if (!currentUser) return false;
          const assigned = p.assignedWorkers?.includes(currentUser.id);
          const sameTeam =
            !!currentUser.teamId && p.teamId === currentUser.teamId;
          return !!assigned || sameTeam;
        })
        .sort(
          (a, b) =>
            dateSortValue(b.scheduleDate || b.receiveDate) -
            dateSortValue(a.scheduleDate || a.receiveDate),
        ),
    [properties, currentUser],
  );

  return (
    <div
      className="modal-overlay-centered"
      onClick={onClose}
    >
      <div
        className="hv-history-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hv-history-header">
          <h3 className="hv-history-title">
            <Clock size={18} /> Mi historial de casas asignadas
          </h3>
          <button
            onClick={onClose}
            className="hv-history-close"
          >
            <X size={22} />
          </button>
        </header>
        <p className="hv-history-sub">
          {myHistoryHouses.length} casa(s) asignadas a ti (por trabajador o
          por tu equipo), de la más reciente a la más antigua.
        </p>
        <div className="hv-history-body">
          {myHistoryHouses.length === 0 ? (
            <div className="hv-history-empty">
              No tienes casas asignadas en el historial.
            </div>
          ) : (
            <ul className="hv-history-list">
              {myHistoryHouses.map((p) => {
                const st = statuses.find(
                  (s) => s.id === p.statusId || s.name === p.statusId,
                );
                return (
                  <li
                    key={p.id}
                    className="hv-history-card"
                    onClick={() => onOpenHouse(p)}
                    title="Ver detalle de la casa"
                  >
                    <div className="hv-history-main">
                      <div className="hv-history-client">
                        {getClientName(p.client)}
                      </div>
                      <div className="hv-history-address">
                        <MapPin size={12} /> {p.address || "—"}
                      </div>
                    </div>
                    <div className="hv-history-meta">
                      <span className="hv-history-date">
                        <CalendarDays size={12} />{" "}
                        {p.scheduleDate
                          ? formatDate(p.scheduleDate)
                          : "Sin fecha"}
                      </span>
                      <span
                        className="hv-history-status"
                        style={
                          {
                            "--hst-color": st?.color || "#64748b",
                          } as CSSProperties
                        }
                      >
                        {st?.name || "—"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
