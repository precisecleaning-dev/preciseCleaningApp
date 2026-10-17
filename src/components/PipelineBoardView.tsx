import { useState } from 'react';
import type { Priority, Property, Status, Team } from '../types/index';
import { dateSortValue } from '../utils/dateFormat';
import { getRelationColor, getRelationName, matchesRelation } from '../utils/relations';
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
  onOpenPropertyDetail: (property: Property) => void;
  onStatusChange: (propertyId: string, statusId: string) => void;
  canChangeStatus?: boolean;
  /** Opcional: monto facturado por casa; se muestra en la tarjeta y se suma por columna. */
  getPropertyAmount?: (property: Property) => number;
  /** Mostrar las NOTAS DE OFICINA en la tarjeta. Lo decide HouseList (permiso
   *  "Office Notes" + Configure Fields); el tablero solo obedece. */
  isOfficeNoteVisible?: boolean;
}

const DEFAULT_TEAM_COLOR = '#64748b';

/** Más reciente primero: scheduleDate o, si no tiene, receiveDate. */
const compareByDateDescending = (firstProperty: Property, secondProperty: Property) =>
  dateSortValue(secondProperty.scheduleDate || secondProperty.receiveDate)
  - dateSortValue(firstProperty.scheduleDate || firstProperty.receiveDate);

const PipelineBoardView = ({
  properties, statuses, teams, priorities = [], getClientName,
  onOpenPropertyDetail, onStatusChange, canChangeStatus = false, getPropertyAmount,
  isOfficeNoteVisible = false,
}: PipelineBoardViewProps) => {
  // Modal central de cambio de estado (null = cerrado)
  const [statusModalConfig, setStatusModalConfig] = useState<StatusModalConfig | null>(null);

  // Columnas = todos los status menos "Invoice" (igual que la tabla). Las casas
  // SIN status no salen: viven en su propio módulo ("No Status").
  const columnStatuses = statuses.filter((status) => status.name?.toLowerCase() !== 'invoice');

  // Id o nombre (casas viejas), sin mayúsculas ni espacios de más: la misma regla
  // que la pastilla y los conteos de HouseList, para que ninguna casa "desaparezca".
  const getPropertiesForStatus = (status: Status) => properties
    .filter((property) => matchesRelation(status, property.statusId))
    .sort(compareByDateDescending);

  const isHighPriority = (property: Property) => {
    const propertyPriority = priorities.find((priority) => priority.id === property.priorityId || priority.name === property.priorityId);
    return propertyPriority?.name?.toLowerCase() === 'high' || String(property.priorityId).toLowerCase() === 'high';
  };

  const handleRequestStatusChange = (property: Property) => setStatusModalConfig({
    currentId: property.statusId,
    onSelect: (statusId) => onStatusChange(property.id, statusId),
    title: getClientName(property.client),
    subtitle: property.address,
  });

  return (
    <div className="pipeline-board-wrap">
      <div className="pipeline-board">
        {columnStatuses.map((status) => {
          const columnProperties = getPropertiesForStatus(status);
          const columnTotalAmount = getPropertyAmount
            ? columnProperties.reduce((runningTotal, property) => runningTotal + (getPropertyAmount(property) || 0), 0)
            : null;
          return (
            <PipelineColumn key={status.id} status={status} jobCount={columnProperties.length} totalAmount={columnTotalAmount}>
              {columnProperties.map((property) => (
                <PipelineJobCard
                  key={property.id}
                  property={property}
                  clientName={getClientName(property.client)}
                  teamName={getRelationName(teams, property.teamId, 'Unassigned')}
                  teamColor={getRelationColor(teams, property.teamId) ?? DEFAULT_TEAM_COLOR}
                  isHighPriority={isHighPriority(property)}
                  isOfficeNoteVisible={isOfficeNoteVisible}
                  propertyAmount={getPropertyAmount ? getPropertyAmount(property) || 0 : null}
                  statuses={statuses}
                  canChangeStatus={canChangeStatus}
                  onOpenPropertyDetail={onOpenPropertyDetail}
                  onRequestStatusChange={handleRequestStatusChange}
                />
              ))}
            </PipelineColumn>
          );
        })}
      </div>

      {/* Modal central de cambio de estado */}
      {statusModalConfig && (
        <StatusChangeModal
          config={statusModalConfig}
          statuses={statuses}
          onClose={() => setStatusModalConfig(null)}
        />
      )}
    </div>
  );
};

export default PipelineBoardView;
