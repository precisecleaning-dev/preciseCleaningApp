// Motor de ruteo compartido: geocoding (Nominatim), distancia en línea recta (Haversine),
// ordenamiento por vecino más cercano, ruta real de manejo (OSRM) y carga de Leaflet (mapa).
// Todo gratuito y sin API key; Leaflet se carga bajo demanda desde CDN.
//
// Antes vivía duplicado con distinta sofisticación en QCRouteView.tsx (solo Haversine) y en
// el drawer "Route" embebido en QualityCheckView.tsx (Haversine + OSRM + mapa Leaflet). Se
// unificó tomando la versión más completa (la del drawer) como base.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Distancia en línea recta entre dos coordenadas (fórmula de Haversine), en km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
//  Caché de geocodificación en localStorage: UNA clave versionada, con tope de
//  entradas y vencimiento. Antes era una clave suelta por dirección
//  (`geo_v1__…`) que nunca se borraba. Las claves viejas se migran una vez a la
//  nueva (no se vuelve a pedir a Nominatim lo que ya se sabía).
//  · El tope (5,000) está por encima del número de casas, para que el uso
//    normal nunca expulse direcciones: cada fallo cuesta ≥1 s en QC Route.
//  · Vence lo que lleva un año SIN USARSE (cada uso renueva la fecha).
//  · Las escrituras se agrupan: armar una ruta con 30 casas guarda una vez.
// ---------------------------------------------------------------------------
const GEO_CACHE_KEY = 'app:v2:geocode';
const GEO_LEGACY_PREFIX = 'geo_v1__';
const GEO_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const GEO_MAX_ENTRIES = 5000;
const GEO_SAVE_DELAY_MS = 1500;

interface GeoEntry extends LatLng {
  t: number; // último uso (ms)
}

let geoCache: Map<string, GeoEntry> | null = null;
let geoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function loadGeoCache(): Map<string, GeoEntry> {
  if (geoCache) return geoCache;
  const map = new Map<string, GeoEntry>();
  const now = Date.now();
  let migrated = false;
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    const saved = raw ? (JSON.parse(raw) as [string, GeoEntry][]) : [];
    saved.forEach(([k, v]) => { if (v && typeof v.lat === 'number' && now - v.t < GEO_TTL_MS) map.set(k, v); });
    // Migración de las claves sueltas de la versión anterior.
    const legacy: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(GEO_LEGACY_PREFIX)) legacy.push(k);
    }
    legacy.forEach((k) => {
      try {
        const v = JSON.parse(localStorage.getItem(k) || 'null') as LatLng | null;
        const addr = k.slice(GEO_LEGACY_PREFIX.length);
        if (v && typeof v.lat === 'number' && !map.has(addr)) map.set(addr, { lat: v.lat, lng: v.lng, t: now });
      } catch { /* entrada corrupta: se descarta */ }
      localStorage.removeItem(k);
      migrated = true;
    });
  } catch { /* sin storage */ }
  geoCache = map;
  if (migrated) saveGeoCacheNow();
  return map;
}

function saveGeoCacheNow(): void {
  if (!geoCache) return;
  if (geoCache.size > GEO_MAX_ENTRIES) {
    // Fuera las que llevan más tiempo sin usarse.
    const byAge = [...geoCache.entries()].sort((a, b) => a[1].t - b[1].t);
    byAge.slice(0, geoCache.size - GEO_MAX_ENTRIES).forEach(([k]) => geoCache!.delete(k));
  }
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify([...geoCache.entries()]));
  } catch { /* sin storage o lleno */ }
}

function scheduleGeoSave(): void {
  if (geoSaveTimer) clearTimeout(geoSaveTimer);
  geoSaveTimer = setTimeout(() => { geoSaveTimer = null; saveGeoCacheNow(); }, GEO_SAVE_DELAY_MS);
}

/** Geocodifica una dirección con Nominatim (OpenStreetMap). Cachea en localStorage. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const clean = (address || '').trim();
  if (!clean) return null;
  const key = clean.toLowerCase();
  const hit = loadGeoCache().get(key);
  if (hit) {
    hit.t = Date.now(); // usada: no vence ni sale primero
    scheduleGeoSave();
    return { lat: hit.lat, lng: hit.lng };
  }
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(clean);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (Array.isArray(arr) && arr.length > 0) {
      const p = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
      loadGeoCache().set(key, { ...p, t: Date.now() });
      scheduleGeoSave();
      return p;
    }
  } catch (e) { console.warn('Geocode falló:', clean, e); }
  return null;
}

/** Pide a OSRM (servidor demo) la ruta real de manejo por los puntos en orden. */
export async function fetchOSRMRoute(points: LatLng[]): Promise<{ distanceKm: number; durationMin: number; geometry: unknown } | null> {
  if (points.length < 2) return null;
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data && data.routes && data.routes[0];
    if (!r) return null;
    return { distanceKm: r.distance / 1000, durationMin: r.duration / 60, geometry: r.geometry };
  } catch (e) { console.warn('OSRM falló:', e); return null; }
}

/** Obtiene la ubicación actual del dispositivo (GPS del navegador). */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new Error('Geolocalización no disponible en este dispositivo.')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// ⭐ Leaflet llega desde un CDN en tiempo de ejecución y el proyecto no tiene
//    `@types/leaflet` (instalarlo sería una dependencia nueva). Todo el código
//    del mapa (namespace `L`, el mapa, sus capas) usa ESTE alias, el único
//    `any` documentado para Leaflet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Leaflet = any;

const windowLeaflet = (): Leaflet | undefined =>
  typeof window !== 'undefined' ? (window as Window & { L?: Leaflet }).L : undefined;

// Carga Leaflet (mapa) desde CDN una sola vez y devuelve window.L
let leafletPromise: Promise<Leaflet> | null = null;
export function ensureLeaflet(): Promise<Leaflet> {
  if (windowLeaflet()) return Promise.resolve(windowLeaflet());
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    try {
      const cssId = 'leaflet-css';
      if (!document.getElementById(cssId)) {
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const scriptId = 'leaflet-js';
      const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(windowLeaflet()));
        return;
      }
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      s.onload = () => resolve(windowLeaflet());
      s.onerror = () => reject(new Error('No se pudo cargar el mapa (Leaflet).'));
      document.body.appendChild(s);
    } catch (e) { reject(e); }
  });
  return leafletPromise;
}
