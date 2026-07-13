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

/** Geocodifica una dirección con Nominatim (OpenStreetMap). Cachea en localStorage. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const clean = (address || '').trim();
  if (!clean) return null;
  const key = 'geo_v1__' + clean.toLowerCase();
  try {
    const cached = localStorage.getItem(key);
    if (cached) { const j = JSON.parse(cached); if (j && typeof j.lat === 'number') return j; }
  } catch { /* sin storage */ }
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(clean);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (Array.isArray(arr) && arr.length > 0) {
      const p = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
      try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* sin storage */ }
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

/** Ordena por "vecino más cercano" empezando desde `start` (heurística de ruta). */
export function nearestNeighborOrder<T extends LatLng>(start: LatLng, items: T[]): T[] {
  const remaining = items.slice();
  const ordered: T[] = [];
  let cur: LatLng = start;
  while (remaining.length) {
    let bestIdx = 0, bestD = Infinity;
    remaining.forEach((it, i) => { const d = haversineKm(cur, it); if (d < bestD) { bestD = d; bestIdx = i; } });
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
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

// Carga Leaflet (mapa) desde CDN una sola vez y devuelve window.L
let leafletPromise: Promise<any> | null = null;
export function ensureLeaflet(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).L) return Promise.resolve((window as any).L);
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
        existing.addEventListener('load', () => resolve((window as any).L));
        return;
      }
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      s.onload = () => resolve((window as any).L);
      s.onerror = () => reject(new Error('No se pudo cargar el mapa (Leaflet).'));
      document.body.appendChild(s);
    } catch (e) { reject(e); }
  });
  return leafletPromise;
}
