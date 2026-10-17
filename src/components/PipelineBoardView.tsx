import { useState } from 'react';
import type { Priority, Property, Status, Team } from '../types/index';
import { dateSortValue } from '../utils/dateFormat';
import { getRelationColor, getRelationName } from '../utils/relations';
import StatusChangeModal, { type StatusModalConfig } from './StatusChangeModal';
import PipelineColumn from './PipelineColumn';
import PipelineJobCard from './PipelineJobCard';
import './PipelineBoardView.css';

/* ------------------------------------------------------------------
   PipelineBoardView.tsx — Tablero tipo Kanban de Houses (Pipeline):
   una columna por status (PipelineColumn) con una tarjeta por trabajo
   (PipelineJobCard). El status se cambia desde la pastilla de la
   tarjeta con el modal central. Los mismos componentes sirven para
   Normal y Cavalry: HouseList le pasa los status y las casas de la
   empresa elegida.
   Presentacional: recibe datos y callbacks por props (no toca Firebase).
   Sin filtro de fechas: cada columna va de la fecha más reciente a la
   más vieja (scheduleDate; si no hay, receiveDate).
   ------------------------------------------------------------------ */

interface PipelineBoardViewProps {
  properties: Property[];
  statuses: Status[];
  teams: Team[];
  priorities?: Priority[];
  getClientName: (idOrName?: string | null) => string;
  onOpenDetail: (house: Property) => void;
  onQuickStatusChange: (propertyId: string, newStatusId: string) => void;
  canEdit?: boolean;
  /** Opcional: monto facturado por casa; se muestra en la tarjeta y se suma por columna. */
  getAmount?: (house: Property) => number;
  /** Mostrar las NOTAS DE OFICINA en la tarjeta. Lo decide HouseList (permiso
   *  "Office Notes" + Configure Fields); el tablero solo obedece. */
  showOfficeNote?: boolean;
}

const DEFAULT_TEAM_COLOR = '#64748b';

/** Más reciente primero: scheduleDate o, si no tiene, receiveDate. */
const compareByDateDescending = (firstHouse: Property, secondHouse: Property) =>
  dateSortValue(secondHouse.scheduleDate || secondHouse.receiveDate)
  - dateSortValue(firstHouse.scheduleDate || firstHouse.receiveDate);

const PipelineBoardView = ({
  properties, statuses, teams, priorities = [], getClientName,
  onOpenDetail, onQuickStatusChange, canEdit = false, getAmount,
  showOfficeNote = false,
}: PipelineBoardViewProps) => {
  // Modal central de cambio de estado (null = cerrado)
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  // Columnas = todos los status menos "Invoice" (igual que la tabla). Las casas
  // SIN status no salen: viven en su propio módulo ("No Status").
  const boardColumns = statuses.filter((status) => status.name?.toLowerCase() !== 'invoice');

  const getHousesForStatus = (status: Status) => properties
    .filter((house) => house.statusId === status.id || house.statusId === status.name)
    .sort(compareByDateDescending);

  const isHighPriority = (house: Property) => {
    const housePriority = priorities.find((priority) => priority.id === house.priorityId || priority.name === house.priorityId);
    return housePriority?.name?.toLowerCase() === 'high' || String(house.priorityId).toLowerCase() === 'high';
  };

  const handleRequestStatusChange = (house: Property) => setStatusModal({
    currentId: house.statusId,
    onSelect: (newStatusId) => onQuickStatusChange(house.id, newStatusId),
    title: getClientName(house.client),
    subtitle: house.address,
  });

  return (
    <div className="pipeline-board-wrap">
      <div className="pipeline-board">
        {boardColumns.map((status) => {
          const columnHouses = getHousesForStatus(status);
          const columnTotal = getAmount
            ? columnHouses.reduce((totalAmount, house) => totalAmount + (getAmount(house) || 0), 0)
            : null;
          return (
            <PipelineColumn key={status.id} status={status} jobCount={columnHouses.length} totalAmount={columnTotal}>
              {columnHouses.map((house) => (
                <PipelineJobCard
                  key={house.id}
                  house={house}
                  clientName={getClientName(house.client)}
                  teamName={getRelationName(teams, house.teamId, 'Unassigned')}
                  teamColor={getRelationColor(teams, house.teamId) || DEFAULT_TEAM_COLOR}
                  isHighPriority={isHighPriority(house)}
                  showOfficeNote={showOfficeNote}
                  amount={getAmount ? getAmount(house) || 0 : null}
                  statuses={statuses}
                  canChangeStatus={canEdit}
                  onOpenDetail={onOpenDetail}
                  onRequestStatusChange={handleRequestStatusChange}
                />
              ))}
            </PipelineColumn>
          );
        })}
      </div>

      {/* Modal central de cambio de estado */}
      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={statuses}
          onClose={() => setStatusModal(null)}
        />
      )}
    </div>
  );
};

export default PipelineBoardView;
