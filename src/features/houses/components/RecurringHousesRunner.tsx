// src/features/houses/components/RecurringHousesRunner.tsx
// Crea solas las órdenes de las casas recurrentes que ya tocan. No dibuja nada:
// App.tsx lo monta solo cuando hay alguna pendiente y el usuario puede crear
// casas (así los catálogos no se escuchan de más). Corre en el navegador de
// quien tenga la app abierta; la transacción de createNextVisit evita que dos
// personas creen la misma orden. Una a la vez: al crearla, el listener de
// casas la quita de `dueHouses` y sigue la siguiente.
import { useEffect, useRef, useState } from 'react';
import { useLiveCollection } from '../../../shared/data/liveCollections';
import { cavalryClientKeys, houseBusiness, statusesForBusiness } from '../../../shared/utils/businesses';
import type { Property, SystemUser } from '../../../types/index';
import { displayClientName } from '../../../utils/customerDocs';
import { getNextVisitStatusId } from '../houseRecurrence';
import { createNextVisit } from '../services/recurringHouses';

interface RecurringHousesRunnerProps {
  /** Casas recurrentes a las que ya les toca la orden de la siguiente visita. */
  dueHouses: readonly Property[];
  currentUser?: SystemUser | null;
}

const RecurringHousesRunner = ({ dueHouses, currentUser }: RecurringHousesRunnerProps) => {
  const { data: statuses, loaded: areStatusesLoaded } = useLiveCollection('statuses');
  const { data: customers, loaded: areCustomersLoaded } = useLiveCollection('customers');
  // Casas que ya se intentaron en esta sesión: si una falla, no se reintenta en bucle.
  const [attemptedHouseIds, setAttemptedHouseIds] = useState<readonly string[]>([]);
  const isCreatingRef = useRef(false);
  const isReady = areStatusesLoaded && areCustomersLoaded && statuses.length > 0;
  const nextHouse = isReady ? dueHouses.find((house) => !attemptedHouseIds.includes(house.id)) : undefined;

  useEffect(() => {
    if (!nextHouse || isCreatingRef.current) return;
    const createVisit = async () => {
      isCreatingRef.current = true;
      try {
        const business = houseBusiness(nextHouse, cavalryClientKeys(customers));
        const statusId = getNextVisitStatusId(statusesForBusiness(statuses, business), nextHouse.statusId);
        await createNextVisit(nextHouse, statusId, displayClientName(customers, nextHouse.client), currentUser);
      } catch (error) {
        console.error('Error creating the next recurring visit:', error);
      } finally {
        isCreatingRef.current = false;
        // Al marcarla como intentada se vuelve a dibujar y sigue la siguiente casa.
        setAttemptedHouseIds((previousIds) => [...previousIds, nextHouse.id]);
      }
    };
    void createVisit();
  }, [nextHouse, statuses, customers, currentUser]);

  return null;
};

export default RecurringHousesRunner;
