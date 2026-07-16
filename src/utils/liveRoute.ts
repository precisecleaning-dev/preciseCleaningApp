import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { SystemUser } from '../types/index';
import type { LatLng } from './routing';
import { escapeHtml } from './escapeHtml';
import './liveRoute.css';

// ============================================================================
//  liveRoute — seguimiento GPS en vivo sobre una ruta guardada (qc_routes).
//
//  Compartido por QCRouteDrawer (QualityCheckView) y QCRouteView para no
//  duplicar la lógica. Cada usuario que activa "Seguir con GPS" publica su
//  posición (throttleada) en el campo `live.{userKey}` del documento de la
//  ruta; todos los que tengan esa misma ruta abierta ven las posiciones de
//  los demás en el mapa (suscripción onSnapshot). Las posiciones con más de
//  5 minutos sin actualizar se consideran obsoletas y no se muestran; al
//  detener el seguimiento (o desmontar) se borra la propia con deleteField.
// ============================================================================

export interface LiveUserPosition {
  name: string;
  lat: number;
  lng: number;
  updatedAt: string; // ISO
}

// ---------------------------------------------------------------------------
//  Link compartible de una ruta. QCRouteView lee el parámetro `?qcRoute=<id>`
//  al montar y abre esa ruta guardada automáticamente, así otra persona puede
//  seguirla (y activar su propio "Seguir con GPS") con solo abrir el link.
// ---------------------------------------------------------------------------
export const routeShareUrl = (routeId: string): string =>
  `${window.location.origin}${window.location.pathname}?qcRoute=${encodeURIComponent(routeId)}`;

export const shareRouteLink = async (routeId: string, name: string): Promise<void> => {
  const url = routeShareUrl(routeId);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Ruta QC: ${name}`, text: `Sigue la ruta "${name}" en la app`, url });
      return;
    } catch (e) {
      // El usuario canceló el diálogo nativo: no hacer nada más.
      if ((e as Error)?.name === 'AbortError') return;
      // Otro error: cae al portapapeles.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert('Link de la ruta copiado al portapapeles.');
  } catch {
    window.prompt('Copia el link de la ruta:', url);
  }
};

const STALE_MS = 5 * 60 * 1000;     // posición más vieja que esto = no se muestra
const PUBLISH_MIN_MS = 10 * 1000;   // no escribir en Firestore más de 1 vez cada 10 s

// Claves de campos anidados en Firestore no pueden llevar . / [ ] * ~
const sanitizeKey = (raw: string): string => raw.replace(/[.#$/[\]*~\s]/g, '_') || 'anon';

const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

/**
 * Ícono Leaflet (divIcon) para una posición en vivo. `mine` = mi propia
 * posición (azul, pulsante, etiqueta "YO"); otros usuarios van en naranja
 * con sus iniciales. `L` es la instancia de Leaflet (de ensureLeaflet()).
 */
export const liveDivIcon = (L: any, name: string, mine: boolean) => L.divIcon({
  className: 'qclive-div-icon',
  html: `<div class="qclive-marker${mine ? ' mine' : ''}" title="${escapeHtml(name)}">${mine ? 'YO' : escapeHtml(initials(name))}</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export function useLiveRoute(routeId: string | null, currentUser?: SystemUser | null) {
  const [tracking, setTracking] = useState(false);
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [others, setOthers] = useState<Record<string, LiveUserPosition>>({});

  const watchIdRef = useRef<number | null>(null);
  const lastPublishRef = useRef(0);
  const routeIdRef = useRef<string | null>(routeId);
  routeIdRef.current = routeId;

  const myName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Usuario';
  // ⭐ Tipo extendido local: los docs de users traen `id`, pero no está garantizado
  //    en el tipo global SystemUser; si falta, la clave cae al nombre.
  const myId = (currentUser as (SystemUser & { id?: string }) | null | undefined)?.id;
  const myKeyRef = useRef('');
  myKeyRef.current = sanitizeKey(myId ? String(myId) : myName);

  // ---------- suscripción a las posiciones de otros usuarios ----------
  useEffect(() => {
    if (!routeId) { setOthers({}); return; }
    const unsub = onSnapshot(doc(db, 'qc_routes', routeId), snap => {
      const data = snap.data() as { live?: Record<string, LiveUserPosition> } | undefined;
      const live = data?.live || {};
      const now = Date.now();
      const fresh: Record<string, LiveUserPosition> = {};
      Object.entries(live).forEach(([k, v]) => {
        if (k === myKeyRef.current) return; // la mía se dibuja aparte, desde el GPS local
        if (v && typeof v.lat === 'number' && typeof v.lng === 'number'
          && now - new Date(v.updatedAt || 0).getTime() < STALE_MS) {
          fresh[k] = v;
        }
      });
      setOthers(fresh);
    }, err => console.error('No se pudo suscribir a las posiciones en vivo:', err));
    return () => unsub();
  }, [routeId]);

  // ---------- publicar mi posición (throttleada) ----------
  const publish = (pos: LatLng) => {
    const id = routeIdRef.current;
    if (!id) return; // ruta sin guardar: el marcador es solo local
    const now = Date.now();
    if (now - lastPublishRef.current < PUBLISH_MIN_MS) return;
    lastPublishRef.current = now;
    updateDoc(doc(db, 'qc_routes', id), {
      [`live.${myKeyRef.current}`]: { name: myName, lat: pos.lat, lng: pos.lng, updatedAt: new Date().toISOString() },
    }).catch(e => console.error('No se pudo publicar la posición:', e));
  };

  const removeMyPosition = () => {
    const id = routeIdRef.current;
    if (!id) return;
    updateDoc(doc(db, 'qc_routes', id), { [`live.${myKeyRef.current}`]: deleteField() }).catch(() => { /* best effort */ });
  };

  // ---------- iniciar / detener el seguimiento ----------
  const startTracking = () => {
    if (watchIdRef.current != null) return;
    if (!('geolocation' in navigator)) {
      alert('Este dispositivo no soporta geolocalización.');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMyPos(pos);
        publish(pos);
      },
      err => {
        console.error('Error de GPS:', err);
        alert('No se pudo obtener tu ubicación (activa el permiso de ubicación).');
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    setTracking(true);
  };

  const stopTracking = () => {
    if (watchIdRef.current != null) {
      try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { /* noop */ }
      watchIdRef.current = null;
    }
    setTracking(false);
    setMyPos(null);
    lastPublishRef.current = 0;
    removeMyPosition();
  };

  // ---------- limpieza al desmontar ----------
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        try { navigator.geolocation.clearWatch(watchIdRef.current); } catch { /* noop */ }
        watchIdRef.current = null;
      }
      removeMyPosition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tracking, startTracking, stopTracking, myPos, others };
}