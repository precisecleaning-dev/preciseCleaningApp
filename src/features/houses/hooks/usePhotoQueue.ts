// src/features/houses/hooks/usePhotoQueue.ts
// ============================================================================
// ⭐ COLA DE FOTOS SIN CONEXIÓN de Houses (utils/offlinePhotoQueue): subir o
//    encolar, sincronizar al volver la conexión, contador global de pendientes
//    y la barra de progreso de la subida. Lo abre HousesView una vez y lo usan
//    la lista (contador), el detalle y el formulario (subidas).
//    usePendingForHouse(): fotos pendientes de UNA casa (para su sección).
//    Extraído de HousesView sin cambiar la lógica.
// ============================================================================
import { useEffect, useState } from "react";
import { propertiesService } from "../../../services/propertiesService";
import { storageService } from "../../../services/storageService";
import {
  enqueuePhotos,
  getAllPending,
  getPendingByProperty,
  removePending,
  countPending,
  makePendingId,
  type PendingPhoto,
} from "../../../utils/offlinePhotoQueue";
import type { UploadProgress } from "../components/PhotoUploadToast";

export function usePhotoQueue() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingTotal, setPendingTotal] = useState(0);
  // Cambia cada vez que se sincroniza la cola: las secciones de fotos de la
  // casa abierta vuelven a contar sus pendientes.
  const [syncVersion, setSyncVersion] = useState(0);
  // ⭐ PROGRESO DE SUBIDA DE FOTOS: barra visible mientras las fotos viajan.
  //    { label, done, total, percent } — null cuando no hay subida activa.
  const [photoUpload, setPhotoUpload] = useState<UploadProgress | null>(null);

  const refreshTotal = async () => {
    try {
      setPendingTotal(await countPending());
    } catch (e) {
      console.error(e);
    }
  };

  const syncPendingPhotos = async () => {
    if (!navigator.onLine) return;
    let pending: PendingPhoto[] = [];
    try {
      pending = await getAllPending();
    } catch {
      return;
    }
    if (pending.length === 0) return;
    const groups = new Map<string, PendingPhoto[]>();
    pending.forEach((p) => {
      const k = `${p.propertyId}__${p.type}`;
      groups.set(k, [...(groups.get(k) || []), p]);
    });
    for (const [, items] of groups) {
      const { propertyId, type, clientName, address } = items[0];
      try {
        const files = items.map(
          (it) =>
            new File([it.blob], it.fileName, {
              type: it.blob.type || "image/jpeg",
            }),
        );
        const urls = await storageService.uploadMultiplePropertyPhotos(
          files,
          clientName,
          address,
          type,
        );
        // ⭐ arrayUnion: sin leer la casa antes (una lectura menos) y sin
        //    pisar las fotos que otra persona haya agregado entretanto.
        const field = type === "before" ? "beforePhotos" : "afterPhotos";
        await propertiesService.arrayChange(propertyId, "add", { [field]: urls });
        for (const it of items) await removePending(it.id);
      } catch (err) {
        console.error("Error sincronizando fotos pendientes:", err);
      }
    }
    await refreshTotal();
    // Las fotos pendientes de la casa abierta se vuelven a contar.
    setSyncVersion((v) => v + 1);
  };

  const uploadOrQueue = async (
    files: File[],
    clientName: string,
    address: string,
    type: "before" | "after",
    propertyId: string,
  ): Promise<{ urls: string[]; queued: number }> => {
    if (files.length === 0) return { urls: [], queued: 0 };
    if (navigator.onLine) {
      try {
        // ⭐ Barra de progreso: el motor reporta bytes reales por foto.
        const label = type === "before" ? "fotos Before" : "fotos After";
        setPhotoUpload({ label, done: 0, total: files.length, percent: 0 });
        const urls = await storageService.uploadMultiplePropertyPhotos(
          files,
          clientName,
          address,
          type,
          (p) => setPhotoUpload({ label, done: p.done, total: p.total, percent: p.percent }),
        );
        setPhotoUpload(null);
        return { urls, queued: 0 };
      } catch (e) {
        // ⭐ CORRECCION "no se pueden guardar": antes CUALQUIER error de subida
        //    se encolaba en silencio, incluso los PERMANENTES (reglas de Storage,
        //    CORS, cuota). La foto quedaba "pendiente" para siempre y nunca se
        //    guardaba, sin decirle al usuario el motivo real. Ahora solo se
        //    encola cuando el fallo es de CONEXION; los demás se reportan con
        //    su código para poder corregir la causa (ver alert del caller).
        setPhotoUpload(null);
        const code = String((e as { code?: string })?.code || "");
        const isConnectivity =
          !navigator.onLine || code === "storage/retry-limit-exceeded" ||
          code === "storage/canceled";
        if (!isConnectivity) throw e;
        console.error("Subida online falló por conexión, se encola:", e);
      }
    }
    const entries: PendingPhoto[] = files.map((f) => ({
      id: makePendingId(),
      propertyId,
      clientName,
      address,
      type,
      blob: f,
      fileName: f.name || `${type}-${Date.now()}.jpg`,
      inReport: true,
      createdAt: Date.now(),
    }));
    await enqueuePhotos(entries);
    return { urls: [], queued: entries.length };
  };

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      syncPendingPhotos();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    refreshTotal();
    if (navigator.onLine) syncPendingPhotos();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOnline, pendingTotal, photoUpload, uploadOrQueue, refreshTotal, syncVersion };
}

export type PhotoQueue = ReturnType<typeof usePhotoQueue>;

const NO_PENDING = { before: 0, after: 0 };

/**
 * Fotos Before/After de una casa que siguen en la cola (sin subir). Se cuentan
 * al abrirla, después de cada sincronización (`syncVersion`) y con reload().
 * Un resultado que llega tarde de otra casa no se mezcla con la actual.
 */
export function usePendingForHouse(houseId: string | null, syncVersion: number) {
  const [counts, setCounts] = useState<{ id: string; before: number; after: number } | null>(null);
  useEffect(() => {
    if (!houseId) return;
    let live = true;
    getPendingByProperty(houseId)
      .then((list) => {
        if (live) setCounts(countsOf(houseId, list));
      })
      .catch((error) => console.error("Error fetching pending photos:", error));
    return () => {
      live = false;
    };
  }, [houseId, syncVersion]);
  const reload = async () => {
    if (!houseId) return;
    try {
      setCounts(countsOf(houseId, await getPendingByProperty(houseId)));
    } catch (error) {
      console.error("Error fetching pending photos:", error);
    }
  };
  const shown = houseId && counts?.id === houseId ? counts : NO_PENDING;
  return { before: shown.before, after: shown.after, reload };
}

const countsOf = (id: string, list: PendingPhoto[]) => ({
  id,
  before: list.filter((p) => p.type === "before").length,
  after: list.filter((p) => p.type === "after").length,
});
