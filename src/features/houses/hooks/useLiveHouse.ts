// src/features/houses/hooks/useLiveHouse.ts
// ============================================================================
// ⭐ DATOS EN VIVO DE UNA CASA ABIERTA (fix "tener que recargar", 10/2026).
//
// Antes el detalle de una casa trabajaba sobre una COPIA tomada al abrirlo:
// lo que cambiaba después (otra persona, Quality Check, Invoices, la propia
// pestaña en otra ventana) no aparecía hasta cerrar y volver a abrir, y cada
// handler parchaba esa copia a mano. Ahora:
//   · useLiveHouse(): la casa se toma SIEMPRE del listener global (la lista
//     `properties` que llega de App.tsx). Si la casa no está en la lista
//     (fuera de la ventana de 12 meses o de lo visible para el rol), se abre
//     un listener de ese único documento mientras siga abierta.
//   · useHouseRecords(): servicios cobrados y pagos de ESA casa con un
//     listener acotado por `propertyId` (consulta de un solo campo, sin
//     índice). No se usa el store completo de billing_services/payroll: para
//     ver 2–5 documentos bajaría miles.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import type { PayrollRecord, Property, ServiceRecord } from '../../../types/index';
import { dateSortValue } from '../../../utils/dateFormat';

/** Documento suelto de `properties` en vivo (null = sin id, borrada o cargando). */
function useHouseDoc(id: string | null): Property | null {
  const [state, setState] = useState<{ id: string; house: Property | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, COLLECTIONS.properties, id),
      (snap) => setState({ id, house: snap.exists() ? ({ id: snap.id, ...snap.data() } as Property) : null }),
      (err) => console.error('Error escuchando la casa abierta:', err),
    );
  }, [id]);
  // Un resultado de otra casa (id anterior) no se mezcla con la actual.
  return id && state?.id === id ? state.house : null;
}

/**
 * Versión en vivo de `snapshot` (la casa que se abrió). Devuelve la de la
 * lista global si está; si no, la del listener propio; mientras ninguno
 * responde, la copia original.
 */
export function useLiveHouse(snapshot: Property | null, properties: Property[]): Property | null {
  const id = snapshot?.id || '';
  const fromList = useMemo(
    () => (id ? properties.find((p) => p.id === id) ?? null : null),
    [id, properties],
  );
  // Solo se abre el listener propio cuando la lista no la trae.
  const fromDoc = useHouseDoc(id && !fromList ? id : null);
  if (!snapshot) return null;
  return fromList ?? fromDoc ?? snapshot;
}

export interface HouseRecords {
  services: ServiceRecord[];
  payroll: PayrollRecord[];
  /** id de la casa a la que pertenecen (evita mostrar los de la anterior). */
  houseId: string | null;
  /** true cuando ya llegaron servicios Y pagos de esa casa. */
  loaded: boolean;
}

const NO_RECORDS: HouseRecords = { services: [], payroll: [], houseId: null, loaded: false };

/**
 * Servicios cobrados y pagos de una casa, en vivo. Con `houseId = null` no
 * escucha nada. Los pagos llegan del más reciente al más viejo (igual que antes).
 */
export function useHouseRecords(houseId: string | null): HouseRecords {
  const [services, setServices] = useState<{ id: string; list: ServiceRecord[] } | null>(null);
  const [payroll, setPayroll] = useState<{ id: string; list: PayrollRecord[] } | null>(null);

  useEffect(() => {
    if (!houseId) return;
    const unsubServices = onSnapshot(
      query(collection(db, COLLECTIONS.billingServices), where('propertyId', '==', houseId)),
      (snap) => setServices({ id: houseId, list: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceRecord) }),
      (err) => console.error('Error escuchando los servicios de la casa:', err),
    );
    const unsubPayroll = onSnapshot(
      query(collection(db, COLLECTIONS.payroll), where('propertyId', '==', houseId)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PayrollRecord);
        list.sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
        setPayroll({ id: houseId, list });
      },
      (err) => console.error('Error escuchando los pagos de la casa:', err),
    );
    return () => {
      unsubServices();
      unsubPayroll();
    };
  }, [houseId]);

  return useMemo(() => {
    if (!houseId) return NO_RECORDS;
    const srvReady = services?.id === houseId;
    const payReady = payroll?.id === houseId;
    return {
      houseId,
      services: srvReady ? services.list : [],
      payroll: payReady ? payroll.list : [],
      loaded: srvReady && payReady,
    };
  }, [houseId, services, payroll]);
}
