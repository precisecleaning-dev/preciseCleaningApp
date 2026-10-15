// ⭐ Catálogos que usan las piezas de Houses (lista, detalle, formulario y sus
//    modales), del store compartido (un listener por colección para toda la
//    app), con los índices y nombres que todas necesitan. Extraído de HousesView.
import { useMemo } from 'react';
import type { Product, Property, Role, Status } from '../../../types/index';
import { useLiveCollection, useLiveData } from '../../../shared/data/liveCollections';
import { customerNameIndex, displayClientNameIn } from '../../../utils/customerDocs';

/** Productos (settings_products): el tipo canónico Product + el color opcional. */
export type ProductRecord = Product & { color?: string };

export function useHouseCatalogs(rolesFallback: Role[] = []) {
  const { data: statusData, loaded: statusesLoaded } = useLiveCollection('statuses');
  const statuses = useMemo(() => [...statusData].sort((a, b) => Number(a.order) - Number(b.order)), [statusData]);
  const teams = useLiveData('teams');
  const priorities = useLiveData('priorities');
  const services = useLiveData('services');
  const products: ProductRecord[] = useLiveData('products'); // ⭐ settings_products (fuente de serviceId)
  const taxes = useLiveData('taxes');
  // ⭐ mapCustomerDoc ya lo aplica el store (id real + legacyId aparte).
  const customersList = useLiveData('customers');
  const employees = useLiveData('users');
  const liveRoles = useLiveData('roles');
  const rolesList = liveRoles.length ? liveRoles : rolesFallback;

  // ⭐ PERF: índice de statuses por id y por nombre (antes statuses.find() por fila).
  const statusIndex = useMemo(() => {
    const index = new Map<string, Status>();
    statuses.forEach((s) => {
      index.set(String(s.id), s);
      index.set(String(s.name), s);
    });
    return index;
  }, [statuses]);
  const findStatusOf = (p: { statusId?: string | null }): Status | undefined => statusIndex.get(String(p.statusId ?? ''));

  // ⭐ PERF: índice de clientes armado una vez por lista (antes, una búsqueda
  //    en la lista de clientes por cada fila). Un cliente BORRADO sale como
  //    "Cliente eliminado · xxxxxx", nunca el id crudo.
  const clientIndex = useMemo(() => customerNameIndex(customersList), [customersList]);
  const getClientName = (clientIdOrName?: string | null) => displayClientNameIn(clientIndex, clientIdOrName);

  // ⭐ Nombre del serviceId desde settings_products (con respaldo a settings_services).
  const getServiceName = (serviceId?: string | null): string => {
    if (!serviceId) return 'Unknown';
    const safe = String(serviceId).toLowerCase().trim();
    const same = (x: { id: string; name: string }) =>
      String(x.id).toLowerCase().trim() === safe || String(x.name).toLowerCase().trim() === safe;
    return products.find(same)?.name || services.find(same)?.name || 'Unknown';
  };

  // Estados que NO se muestran en las listas. `allowQC=true` (tablero Pipeline)
  // solo oculta Invoice, para que Quality Check SÍ aparezca en el tablero.
  const isHiddenPipelineStatus = (p: Property, allowQC = false) => {
    const name = String(findStatusOf(p)?.name || p.statusId || '').toLowerCase().trim();
    if (name === 'invoice') return true;
    if (allowQC) return false;
    return name === 'qc' || name.includes('quality check') || name.includes('quality-check');
  };

  // ⭐ Etiqueta legible de la casa para la bitácora (cliente — dirección).
  const logLabel = (p?: Property | null): string => {
    if (!p) return '';
    const cli = getClientName(p.client);
    return p.address ? `${cli} — ${p.address}` : cli;
  };

  return {
    statuses, statusesLoaded, teams, priorities, services, products, taxes, customersList, employees, rolesList,
    statusIndex, findStatusOf, getClientName, getServiceName, isHiddenPipelineStatus, logLabel,
  };
}

export type HouseCatalogs = ReturnType<typeof useHouseCatalogs>;
