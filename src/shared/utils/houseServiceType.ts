// src/shared/utils/houseServiceType.ts
// Tipos de servicio de una casa ("Service Type" del formulario, se pueden
// elegir varios): Carpet, Normal y Cavalry, y las reglas que dependen de ellos.
import type { HouseServiceType, Property } from '../../types/index';

export const HOUSE_SERVICE_TYPES: readonly HouseServiceType[] = ['Carpet', 'Normal', 'Cavalry'];

/** La lista con `serviceType` agregado o quitado, siempre en el orden de HOUSE_SERVICE_TYPES. */
export const toggleServiceType = (
  selectedTypes: readonly HouseServiceType[] | undefined,
  serviceType: HouseServiceType,
): HouseServiceType[] => {
  const isSelected = selectedTypes?.includes(serviceType) ?? false;
  return HOUSE_SERVICE_TYPES.filter((type) =>
    type === serviceType ? !isSelected : (selectedTypes?.includes(type) ?? false));
};

/** "Carpet, Normal" para mostrar; '' si no tiene ninguno. */
export const formatServiceTypes = (house: Pick<Property, 'serviceTypes'>): string =>
  (house.serviceTypes ?? []).join(', ');
