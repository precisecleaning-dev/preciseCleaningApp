// src/shared/hooks/useConnectivityStatus.ts
// ¿Mostrar el aviso "Sin conexión"? El navegador avisa con los eventos online /
// offline y `navigator.onLine`, pero a veces dice "sin conexión" teniendo
// internet. Antes de mostrar el aviso se confirma con isDeviceOffline()
// (shared/utils/connectivity.ts), así el aviso solo sale si de verdad no hay
// conexión y nadie repite un trabajo que sí se guardó.
// Lo usan el aviso de Quality Check y el de Houses (usePhotoQueue).
import { useEffect, useState } from 'react';
import { isDeviceOffline } from '../utils/connectivity';

/** Mientras el navegador diga "sin conexión" se vuelve a confirmar cada tanto
 *  (si el aviso era falso, se quita aunque no llegue el evento online). */
const OFFLINE_RECHECK_MS = 30_000;

/** true si hay conexión (lo que diga el navegador, confirmado con el servidor). */
export const useConnectivityStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState(true);

  // Eventos online / offline del navegador (y la primera revisión al montar).
  useEffect(() => {
    let isActive = true;
    const handleConnectivityChange = async () => {
      const isOffline = await isDeviceOffline();
      if (isActive) setIsOnline(!isOffline);
    };
    void handleConnectivityChange();
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    return () => {
      isActive = false;
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, []);

  // Revisión periódica: solo consulta al servidor si el navegador dice "sin conexión".
  useEffect(() => {
    let isActive = true;
    const intervalId = window.setInterval(async () => {
      if (navigator.onLine) return;
      const isOffline = await isDeviceOffline();
      if (isActive) setIsOnline(!isOffline);
    }, OFFLINE_RECHECK_MS);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return isOnline;
};
