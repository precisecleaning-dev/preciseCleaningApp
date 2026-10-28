// src/shared/hooks/useConnectivityStatus.ts
// ¿Mostrar el aviso "Sin conexión"? El navegador avisa con los eventos online /
// offline y `navigator.onLine`, pero a veces dice "sin conexión" teniendo
// internet. Antes de mostrar el aviso se confirma con isDeviceOffline()
// (shared/utils/connectivity.ts), así el aviso solo sale si de verdad no hay
// conexión y nadie repite un trabajo que sí se guardó.
// Lo usan el aviso de Quality Check y el de Houses (usePhotoQueue).
import { useEffect, useRef, useState } from 'react';
import { isDeviceOffline } from '../utils/connectivity';
import { useStableCallback } from './useStableCallback';

/** Mientras el navegador diga "sin conexión" o el aviso esté puesto, se vuelve
 *  a confirmar cada tanto (el aviso se quita aunque no llegue el evento online). */
const OFFLINE_RECHECK_MS = 30_000;

/** true si hay conexión (lo que diga el navegador, confirmado con el servidor). */
export const useConnectivityStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState(true);
  // Cada revisión lleva un número y solo la más reciente cambia el aviso: una
  // revisión vieja ("sin conexión") que termina después de una nueva ("hay
  // conexión") ya no deja el aviso pegado.
  const latestCheckIdRef = useRef(0);

  const refreshConnectivityStatus = useStableCallback(async () => {
    latestCheckIdRef.current += 1;
    const checkId = latestCheckIdRef.current;
    const isOffline = await isDeviceOffline();
    if (checkId === latestCheckIdRef.current) setIsOnline(!isOffline);
  });

  // Revisa solo si hay algo que confirmar: el navegador dice "sin conexión" o
  // el aviso está puesto. Con las dos cosas en "hay conexión" no consulta nada.
  const recheckIfNeeded = useStableCallback(() => {
    if (navigator.onLine && isOnline) return;
    void refreshConnectivityStatus();
  });

  // Eventos online / offline del navegador (y la primera revisión al montar).
  useEffect(() => {
    const handleConnectivityChange = () => void refreshConnectivityStatus();
    handleConnectivityChange();
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      // Una revisión que termine después de desmontar ya no cambia el aviso.
      latestCheckIdRef.current += 1;
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, [refreshConnectivityStatus]);

  // Revisión periódica (no consulta nada si no hace falta: recheckIfNeeded).
  useEffect(() => {
    const intervalId = window.setInterval(recheckIfNeeded, OFFLINE_RECHECK_MS);
    return () => window.clearInterval(intervalId);
  }, [recheckIfNeeded]);

  return isOnline;
};
