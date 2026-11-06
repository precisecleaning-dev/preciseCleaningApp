// Selector de los tipos de servicio de la casa (Carpet / Normal / Cavalry): se
// pueden marcar varios. Botones con aria-pressed: tocar uno lo marca o lo quita.
import type { HouseServiceType } from '../../../types/index';
import { HOUSE_SERVICE_TYPES, toggleServiceType } from '../../../shared/utils/houseServiceType';
import './ServiceTypePicker.css';

interface ServiceTypePickerProps {
  selectedTypes: readonly HouseServiceType[];
  isDisabled: boolean;
  onChange: (selectedTypes: HouseServiceType[]) => void;
}

const ServiceTypePicker = ({ selectedTypes, isDisabled, onChange }: ServiceTypePickerProps) => (
  <div className="stp-options" role="group" aria-label="Service Type">
    {HOUSE_SERVICE_TYPES.map((serviceType) => {
      const isSelected = selectedTypes.includes(serviceType);
      return (
        <button
          key={serviceType}
          type="button"
          aria-pressed={isSelected}
          disabled={isDisabled}
          className={`stp-option type-${serviceType.toLowerCase()}${isSelected ? ' is-selected' : ''}`}
          onClick={() => onChange(toggleServiceType(selectedTypes, serviceType))}
        >
          {serviceType}
        </button>
      );
    })}
  </div>
);

export default ServiceTypePicker;
