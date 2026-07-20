import { useState, useEffect, useRef } from 'react';
import {
  Route, X, MapPin, Navigation, LocateFixed, Search, Loader2,
  ArrowUp, ArrowDown, Trash2, Save, Wand2, Clock, ExternalLink,
  Maximize2, Minimize2, Radio, Share2, Copy, ListOrdered
} from 'lucide-react';
import type { SystemUser } from '../types/index';
import { db } from '../config/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { escapeHtml } from '../utils/escapeHtml';
import { type LatLng, haversineKm, geocodeAddress, getCurrentPosition, ensureLeaflet, fetchOSRMRoute } from '../utils/routing';
import { geocodeAddressForced } from '../utils/geocodeForce';
import { useLiveRoute, liveDivIcon, shareRouteLink, type LiveUserPosition } from '../utils/liveRoute';
import './QCRouteDrawer.css';

// ============================================================================
//  QCRouteDrawer — menú lateral de "ruta de inspección" (estilo LOOP).
//
//  Se abre desde QualityCheckView: las tarjetas de casas pendientes/recall
//  tienen un botón "Agregar a ruta"; este drawer muestra el mapa (Leaflet)
//  con cada parada marcada con su número, la ruta real de manejo (OSRM),
//  el punto de inicio (tu ubicación GPS por defecto, editable escribiendo
//  otra dirección) y la lista ordenable de paradas. Puede expandirse a
//  pantalla ancha con el botón del encabezado.
//
//  NO duplica el motor de ruteo: geocoding (Nominatim cacheado), GPS,
//  Leaflet y OSRM vienen de src/utils/routing.ts — el mismo motor que usa
//  QCRouteView.tsx. "Guardar en QC Route" escribe en la colección
//  `qc_routes` con la misma forma de documento que usa QCRouteView (y
//  actualiza el mismo documento en guardados posteriores), así la ruta
//  armada aquí queda disponible también en esa vista.
//
//  Seguimiento GPS en vivo: vía utils/liveRoute.ts (compartido con
//  QCRouteView). Al activar "Seguir con GPS" tu posición se publica en el
//  documento de la ruta guardada y cualquier usuario que tenga esa ruta
//  abierta (aquí o en QC Route) ve tu marcador moverse, y tú ves los suyos.
// ============================================================================

export interface RouteDrawerHouse {
  id: string;
  client: string;   // nombre de cliente ya resuelto por el padre
  address: string;
  lat: number | null; // coordenadas pre-guardadas si la casa las trae
  lng: number | null;
}

interface Stop {
  houseId: string;
  client: string;
  address: string;
  lat: number | null;
  lng: number | null;
  legKm: number;   // km desde la parada anterior (o desde el inicio)
  etaMin: number;  // minutos estimados de ese tramo
}

interface Props {
  open: boolean;
  onClose: () => void;
  houses: RouteDrawerHouse[];               // casas agregadas a la ruta (en orden de agregado)
  onRemove: (houseId: string) => void;      // avisa al padre para des-marcar la tarjeta
  currentUser?: SystemUser | null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ⭐ Helpers locales espejo de los de QCRouteView.tsx (fmtMin / orden "más cercana
//    primero"). utils/routing.ts podría ya exportar equivalentes (fmtMinutes /
//    nearestNeighborOrder según code-notes.md) — si las firmas coinciden, unificar
//    en una ronda posterior; se dejan locales para no adivinar firmas sin ver el archivo.
const fmtMin = (m: number): string => {
  if (!m || m <= 0) return '0 min';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h} h ${mm} min` : `${mm} min`;
};

const orderNearestFirst = (orig: LatLng | null, list: Stop[]): Stop[] => {
  const withCoords = list.filter(s => s.lat != null && s.lng != null);
  const without = list.filter(s => s.lat == null || s.lng == null);
  const remaining = [...withCoords];
  const out: Stop[] = [];
  let cur: LatLng | null = orig || (remaining[0] ? { lat: remaining[0].lat as number, lng: remaining[0].lng as number } : null);
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    remaining.forEach((s, i) => {
      const d = cur ? haversineKm(cur, { lat: s.lat as number, lng: s.lng as number }) : 0;
      if (d < bd) { bd = d; bi = i; }
    });
    const nx = remaining.splice(bi, 1)[0];
    out.push(nx);
    cur = { lat: nx.lat as number, lng: nx.lng as number };
  }
  return [...out, ...without];
};

const recomputeLegs = (orig: LatLng | null, list: Stop[], speed: number): Stop[] => {
  let prev: LatLng | null = orig;
  return list.map(s => {
    let legKm = 0;
    if (prev && s.lat != null && s.lng != null) legKm = haversineKm(prev, { lat: s.lat, lng: s.lng });
    const etaMin = legKm > 0 && speed > 0 ? Math.round(legKm / speed * 60) : 0;
    if (s.lat != null && s.lng != null) prev = { lat: s.lat, lng: s.lng };
    return { ...s, legKm: Math.round(legKm * 10) / 10, etaMin };
  });
};

export default function QCRouteDrawer({ open, onClose, houses, onRemove, currentUser }: Props) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [originLabel, setOriginLabel] = useState('');       // "Mi ubicación actual" o la dirección escrita
  const [originInput, setOriginInput] = useState('');
  const [avgSpeed, setAvgSpeed] = useState(40);
  const [routeName, setRouteName] = useState('');
  const [expanded, setExpanded] = useState(false);          // panel ancho (mapa grande)

  const [building, setBuilding] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);
  // Id del documento en qc_routes una vez guardada la ruta (para actualizar en vez de
  // duplicar, y para que el seguimiento GPS en vivo tenga dónde publicar).
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);

  // Distancia/tiempo reales de manejo (OSRM); si no responde, se muestra el estimado Haversine.
  const [realDistanceKm, setRealDistanceKm] = useState<number | null>(null);
  const [realDurationMin, setRealDurationMin] = useState<number | null>(null);

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);   // instancia Leaflet (lib externa sin tipos en el proyecto)
  const mapLayerRef = useRef<any>(null);      // capa de la ruta (marcadores numerados + polyline)
  const liveLayerRef = useRef<any>(null);     // capa de posiciones en vivo (separada, no re-encuadra el mapa)
  const stopsRef = useRef<Stop[]>([]);
  const triedGeoRef = useRef(false);

  // ⭐ Seguimiento GPS en vivo (compartido con QCRouteView vía utils/liveRoute.ts)
  const { tracking, startTracking, stopTracking, myPos, others } = useLiveRoute(savedRouteId, currentUser);
  const othersCount = Object.keys(others).length;

  useEffect(() => { stopsRef.current = stops; }, [stops]);

  // ---------- inicio: intenta GPS la primera vez que se abre ----------
  useEffect(() => {
    if (!open || triedGeoRef.current) return;
    triedGeoRef.current = true;
    (async () => {
      try {
        const p = await getCurrentPosition();
        setOrigin(p);
        setOriginLabel('Mi ubicación actual');
      } catch {
        setOriginLabel('');
      }
    })();
  }, [open]);

  // ---------- bloquea el scroll vertical de la página mientras el drawer está abierto ----------
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  // ---------- al cerrar el drawer, detiene el seguimiento GPS ----------
  useEffect(() => {
    if (!open && tracking) stopTracking();
    // stopTracking se recrea por render pero solo usa refs internas del hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tracking]);

  // ---------- sincroniza casas agregadas/quitadas → paradas (geocodifica las nuevas) ----------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // 1) conserva el orden actual quitando las casas que ya no están en la ruta
      const current = stopsRef.current.filter(s => houses.some(h => h.id === s.houseId));
      // 2) geocodifica las nuevas y las agrega al final
      const missing = houses.filter(h => !current.some(s => s.houseId === h.id));
      if (missing.length === 0) {
        if (current.length !== stopsRef.current.length) setStops(recomputeLegs(origin, current, avgSpeed));
        return;
      }
      setBuilding(true);
      try {
        const added: Stop[] = [];
        for (let i = 0; i < missing.length; i++) {
          const h = missing[i];
          setGeoStatus(`Ubicando direcciones ${i + 1}/${missing.length}...`);
          let coords: LatLng | null = (h.lat != null && h.lng != null) ? { lat: h.lat, lng: h.lng } : null;
          if (!coords) {
            coords = await geocodeAddressForced(h.address || '');
            await sleep(1100); // respeta el límite de Nominatim (1/seg)
          }
          if (cancelled) return;
          added.push({
            houseId: h.id, client: h.client, address: h.address || '',
            lat: coords?.lat ?? null, lng: coords?.lng ?? null, legKm: 0, etaMin: 0,
          });
        }
        if (!cancelled) setStops(recomputeLegs(origin, [...current, ...added], avgSpeed));
      } finally {
        if (!cancelled) { setBuilding(false); setGeoStatus(''); }
      }
    })();
    return () => { cancelled = true; };
    // origin/avgSpeed quedan fuera a propósito: el efecto de abajo recalcula los tramos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, houses]);

  // ---------- recalcula tramos cuando cambia el inicio o la velocidad ----------
  useEffect(() => {
    if (!open) return;
    setStops(prev => recomputeLegs(origin, prev, avgSpeed));
  }, [open, origin, avgSpeed]);

  // ---------- cambiar el punto de inicio ----------
  const useMyLocation = async () => {
    setBuilding(true);
    setGeoStatus('Obteniendo tu ubicación actual...');
    try {
      const p = await getCurrentPosition();
      setOrigin(p);
      setOriginLabel('Mi ubicación actual');
      setOriginInput('');
    } catch {
      alert('No se pudo obtener tu ubicación (activa el permiso de ubicación).');
    } finally {
      setBuilding(false); setGeoStatus('');
    }
  };

  const searchOriginAddress = async () => {
    const q = originInput.trim();
    if (!q) return;
    setBuilding(true);
    setGeoStatus('Ubicando dirección de inicio...');
    try {
      const coords = await geocodeAddress(q);
      if (coords) {
        setOrigin(coords);
        setOriginLabel(q);
      } else {
        alert('No se pudo ubicar esa dirección. Intenta con más detalle (calle, ciudad).');
      }
    } finally {
      setBuilding(false); setGeoStatus('');
    }
  };

  // ---------- reordenar / quitar / optimizar ----------
  const moveStop = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const arr = [...stops];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setStops(recomputeLegs(origin, arr, avgSpeed));
  };

  const removeStop = (stop: Stop) => {
    setStops(prev => recomputeLegs(origin, prev.filter(s => s.houseId !== stop.houseId), avgSpeed));
    onRemove(stop.houseId);
  };

  // ⭐ Copiar/pegar direcciones (flujo con IA): "Copiar direcciones" saca la lista
  //    numerada al portapapeles; el usuario la reordena afuera (p. ej. con una IA) y
  //    la pega en el panel — cada línea se reconoce contra las paradas existentes
  //    (contención normalizada o mismo prefijo) y la ruta se reordena dinámicamente.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const copyAddresses = async () => {
    if (stops.length === 0) { alert('No hay paradas que copiar.'); return; }
    const txt = stops.map((s, i) => `${i + 1}. ${s.address || s.client}`).join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      alert(`${stops.length} dirección(es) copiadas al portapapeles.`);
    } catch {
      // navegadores sin permiso de clipboard: mostrarlas para copiar a mano
      window.prompt('Copia las direcciones:', txt);
    }
  };

  // normaliza para comparar: minúsculas, sin numeración inicial ("1." / "2)"),
  // sin puntuación y con espacios colapsados. La numeración exige delimitador
  // para NO comerse el número de la casa ("2500 Westcliff" queda intacto).
  const normAddr = (s: string): string =>
    s.toLowerCase()
      .replace(/^\s*\d{1,3}[\).\-:]\s*/, '')
      .replace(/[.,#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const applyPastedOrder = () => {
    const lines = pasteText.split('\n').map(normAddr).filter(Boolean);
    if (lines.length === 0) { alert('Pega primero la lista de direcciones (una por línea).'); return; }
    const remaining = [...stops];
    const ordered: Stop[] = [];
    lines.forEach(line => {
      const idx = remaining.findIndex(s => {
        const addr = normAddr(s.address || s.client || '');
        if (!addr) return false;
        return addr.includes(line) || line.includes(addr) || addr.slice(0, 14) === line.slice(0, 14);
      });
      if (idx !== -1) ordered.push(...remaining.splice(idx, 1));
    });
    if (ordered.length === 0) {
      alert('No reconocí ninguna dirección de la lista pegada. Verifica que sean las mismas direcciones de la ruta.');
      return;
    }
    // las no reconocidas conservan su lugar al final para no perder paradas
    setStops(recomputeLegs(origin, [...ordered, ...remaining], avgSpeed));
    alert(`Orden aplicado: ${ordered.length} reconocida(s)${remaining.length > 0 ? `, ${remaining.length} sin reconocer (quedaron al final)` : ''}.`);
    setPasteText('');
    setPasteOpen(false);
  };

  const optimizeOrder = () => {
    setStops(prev => recomputeLegs(origin, orderNearestFirst(origin, prev), avgSpeed));
  };

  // ---------- guardar en qc_routes (misma colección/forma que QCRouteView) ----------
  const saveToQcRoutes = async () => {
    if (stops.length === 0) { alert('No hay paradas para guardar.'); return; }
    setSavingRoute(true);
    try {
      const payload = {
        name: routeName.trim() || `Ruta ${new Date().toLocaleDateString('es-MX')}`,
        origin: origin || null,
        avgSpeed,
        stops: stops.map(s => ({ ...s, arrived: false, arrivedAt: null })),
        createdBy: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'Unknown',
        createdAt: new Date().toISOString(),
      };
      if (savedRouteId) {
        await updateDoc(doc(db, 'qc_routes', savedRouteId), { ...payload, updatedAt: new Date().toISOString() });
        alert('Ruta actualizada. También la verás en la vista QC Route.');
      } else {
        const ref = await addDoc(collection(db, 'qc_routes'), payload);
        setSavedRouteId(ref.id);
        alert('Ruta guardada. También la verás en la vista QC Route.');
      }
    } catch (e) {
      console.error('Error guardando la ruta:', e);
      alert('No se pudo guardar la ruta.');
    } finally {
      setSavingRoute(false);
    }
  };

  // ---------- mapa (Leaflet) con marcadores numerados + ruta OSRM ----------
  const renderMap = async (orig: LatLng | null, orderedStops: Stop[], geometry: any) => {
    try {
      const L = await ensureLeaflet();
      if (!mapElRef.current) return;
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapElRef.current, { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapInstanceRef.current);
        // El drawer entra con animación: fuerza a Leaflet a medir el contenedor ya visible.
        setTimeout(() => { try { mapInstanceRef.current?.invalidateSize(); } catch { /* noop */ } }, 250);
      }
      const map = mapInstanceRef.current;
      if (mapLayerRef.current) { map.removeLayer(mapLayerRef.current); mapLayerRef.current = null; }
      const layerGroup = L.layerGroup().addTo(map);
      mapLayerRef.current = layerGroup;

      const numIcon = (label: string, extraClass: string) => L.divIcon({
        className: 'qcrd-div-icon',
        html: `<div class="qcrd-marker${extraClass}">${label}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const points: LatLng[] = [];
      if (orig) {
        L.marker([orig.lat, orig.lng], { icon: numIcon('★', ' origin'), title: 'Inicio' })
          .bindPopup(`Inicio: ${escapeHtml(originLabel || 'punto de partida')}`)
          .addTo(layerGroup);
        points.push(orig);
      }
      orderedStops.forEach((s, i) => {
        if (s.lat == null || s.lng == null) return;
        L.marker([s.lat, s.lng], { icon: numIcon(String(i + 1), ''), title: s.client })
          .bindPopup(`${i + 1}. ${escapeHtml(s.client)}<br>${escapeHtml(s.address)}`)
          .addTo(layerGroup);
        points.push({ lat: s.lat, lng: s.lng });
      });

      const geom = geometry as { coordinates?: [number, number][] } | null;
      if (geom?.coordinates) {
        const latlngs = geom.coordinates.map((c) => [c[1], c[0]]);
        L.polyline(latlngs, { color: '#4338ca', weight: 4, opacity: 0.8 }).addTo(layerGroup);
      } else if (points.length >= 2) {
        L.polyline(points.map(p => [p.lat, p.lng]), { color: '#94a3b8', weight: 3, dashArray: '6 6' }).addTo(layerGroup);
      }

      if (points.length > 0) {
        map.fitBounds(points.map(p => [p.lat, p.lng]), { padding: [30, 30] });
      }
    } catch (e) { console.error('No se pudo dibujar el mapa:', e); }
  };

  useEffect(() => {
    if (!open) return;
    const withCoords = stops.filter(s => s.lat != null && s.lng != null);
    if (withCoords.length === 0 && !origin) {
      setRealDistanceKm(null); setRealDurationMin(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const points: LatLng[] = [
        ...(origin ? [origin] : []),
        ...withCoords.map(s => ({ lat: s.lat as number, lng: s.lng as number })),
      ];
      const osrm = points.length >= 2 ? await fetchOSRMRoute(points) : null;
      if (cancelled) return;
      if (osrm) {
        setRealDistanceKm(Math.round(osrm.distanceKm * 10) / 10);
        setRealDurationMin(Math.round(osrm.durationMin));
      } else {
        setRealDistanceKm(null); setRealDurationMin(null);
      }
      await renderMap(origin, withCoords, osrm?.geometry ?? null);
    })();
    return () => { cancelled = true; };
    // renderMap es estable a efectos prácticos (solo usa refs/estado leído en el momento).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stops, origin]);

  // ---------- capa de posiciones en vivo (mi GPS + otros usuarios) ----------
  // Separada de la capa de la ruta para no redibujar todo ni mover el encuadre
  // con cada actualización de posición.
  useEffect(() => {
    const clear = () => {
      if (liveLayerRef.current && mapInstanceRef.current) {
        try { mapInstanceRef.current.removeLayer(liveLayerRef.current); } catch { /* noop */ }
      }
      liveLayerRef.current = null;
    };
    if (!open || (!myPos && Object.keys(others).length === 0)) { clear(); return; }
    let cancelled = false;
    (async () => {
      try {
        const L = await ensureLeaflet();
        if (cancelled || !mapInstanceRef.current) return;
        clear();
        const layer = L.layerGroup().addTo(mapInstanceRef.current);
        liveLayerRef.current = layer;
        if (myPos) {
          L.marker([myPos.lat, myPos.lng], { icon: liveDivIcon(L, 'Yo', true), zIndexOffset: 1000 }).addTo(layer);
        }
        Object.values(others).forEach((o: LiveUserPosition) => {
          L.marker([o.lat, o.lng], { icon: liveDivIcon(L, o.name, false), zIndexOffset: 900 })
            .bindPopup(escapeHtml(o.name))
            .addTo(layer);
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [open, myPos, others]);

  // Al expandir/contraer el panel, el mapa debe re-medir su contenedor.
  useEffect(() => {
    const t = setTimeout(() => { try { mapInstanceRef.current?.invalidateSize(); } catch { /* noop */ } }, 250);
    return () => clearTimeout(t);
  }, [expanded]);

  // Al cerrar el drawer (el contenedor del mapa se desmonta), destruye la instancia Leaflet.
  useEffect(() => {
    if (open) return;
    try { mapInstanceRef.current?.remove(); } catch { /* noop */ }
    mapInstanceRef.current = null;
    mapLayerRef.current = null;
    liveLayerRef.current = null;
  }, [open]);

  useEffect(() => {
    return () => { try { mapInstanceRef.current?.remove(); mapInstanceRef.current = null; } catch { /* noop */ } };
  }, []);

  // ---------- enlaces a Google Maps ----------
  const mapsAllUrl = (): string => {
    if (stops.length === 0) return '#';
    const dest = encodeURIComponent(stops[stops.length - 1].address);
    const wps = stops.slice(0, -1).map(s => encodeURIComponent(s.address)).filter(Boolean).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest}`;
    if (origin) url += `&origin=${origin.lat},${origin.lng}`;
    if (wps) url += `&waypoints=${wps}`;
    return url;
  };
  const mapsStopUrl = (s: Stop): string =>
    `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(s.address)}`;

  const estimatedKm = Math.round(stops.reduce((a, s) => a + (s.legKm || 0), 0) * 10) / 10;
  const estimatedMin = stops.reduce((a, s) => a + (s.etaMin || 0), 0);
  const displayKm = realDistanceKm ?? estimatedKm;
  const displayMin = realDurationMin ?? estimatedMin;
  const isRealRoute = realDistanceKm != null;

  if (!open) return null;

  return (
    <>
      <div className="qcrd-overlay" onClick={onClose} />
      <aside className={`qcrd-drawer${expanded ? ' expanded' : ''}`} aria-label="Ruta de inspección">

        <div className="qcrd-header">
          <h2 className="qcrd-title"><Route size={20} /> Ruta de inspección</h2>
          <div className="qcrd-header-actions">
            <button
              onClick={() => setExpanded(e => !e)}
              aria-label={expanded ? 'Contraer panel' : 'Expandir panel'}
              title={expanded ? 'Contraer panel' : 'Expandir panel'}
              className="qcrd-icon-btn"
            >
              {expanded ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>
            <button onClick={onClose} aria-label="Cerrar" title="Cerrar" className="qcrd-icon-btn">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="qcrd-body">

          {building && (
            <div className="qcrd-building-banner">
              <Loader2 size={16} className="qcrd-spin" /> {geoStatus || 'Procesando...'}
            </div>
          )}

          {/* Punto de inicio: GPS por defecto, editable con otra dirección */}
          <div className="qcrd-origin-panel">
            <span className="qcrd-field-label">Punto de inicio</span>
            <div className="qcrd-origin-current">
              <LocateFixed size={15} className="qcrd-shrink-0" />
              <span className="qcrd-ellipsis">{origin ? (originLabel || 'Punto de partida definido') : 'Sin punto de inicio (la ruta empieza en la primera parada)'}</span>
            </div>
            <div className="qcrd-origin-row">
              <div className="qcrd-origin-search">
                <Search size={15} color="#9ca3af" className="qcrd-shrink-0" />
                <input
                  value={originInput}
                  onChange={e => setOriginInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') searchOriginAddress(); }}
                  placeholder="Cambiar inicio: escribe una dirección..."
                />
              </div>
              <button className="qcrd-btn soft" onClick={searchOriginAddress} disabled={building || !originInput.trim()}>Buscar</button>
              <button className="qcrd-btn ghost" onClick={useMyLocation} disabled={building} title="Usar mi ubicación actual">
                <LocateFixed size={15} /> Mi ubicación
              </button>
            </div>
          </div>

          {/* Resumen */}
          <div className="qcrd-summary-grid">
            <div className="qcrd-summary-box">
              <div className="qcrd-summary-value">{stops.length}</div>
              <div className="qcrd-summary-label">Paradas</div>
            </div>
            <div className="qcrd-summary-box">
              <div className="qcrd-summary-value">{displayKm}<span className="qcrd-summary-unit"> km</span></div>
              <div className="qcrd-summary-label">Distancia{isRealRoute ? ' real' : ' est.'}</div>
            </div>
            <div className="qcrd-summary-box">
              <div className="qcrd-summary-value time">{fmtMin(displayMin)}</div>
              <div className="qcrd-summary-label">Tiempo{isRealRoute ? ' real' : ' est.'}</div>
            </div>
          </div>

          {/* Mapa: cada parada con su número + ruta real de manejo + posiciones en vivo */}
          <div className="qcrd-map" ref={mapElRef} />

          {/* Acciones sobre la ruta */}
          <div className="qcrd-actions-row">
            <button className="qcrd-btn soft" onClick={optimizeOrder} disabled={building || stops.length < 2}>
              <Wand2 size={15} /> Optimizar orden
            </button>
            <button
              className={`qcrd-btn ghost${tracking ? ' live' : ''}`}
              onClick={tracking ? stopTracking : startTracking}
              title="Comparte tu posición en esta ruta y ve la de otros usuarios en el mapa"
            >
              <Radio size={15} /> {tracking ? 'Detener GPS' : 'Seguir con GPS'}{othersCount > 0 ? ` · ${othersCount} en ruta` : ''}
            </button>
            <a className={`qcrd-btn ghost qcrd-maps-link${stops.length === 0 ? ' disabled' : ''}`} href={mapsAllUrl()} target="_blank" rel="noopener noreferrer">
              <Navigation size={15} /> Abrir en Maps
            </a>
            <div className="qcrd-speed-field">
              <label className="qcrd-field-label" htmlFor="qcrd-speed">Vel. (km/h)</label>
              <input id="qcrd-speed" type="number" min={5} value={avgSpeed} onChange={e => setAvgSpeed(parseInt(e.target.value) || 40)} className="qcrd-input" />
            </div>
            {/* ⭐ Copiar direcciones + pegar el orden externo (IA) */}
            <button className="qcrd-btn soft" onClick={copyAddresses} disabled={stops.length === 0} title="Copia la lista numerada de direcciones al portapapeles">
              <Copy size={15} /> Copiar direcciones
            </button>
            <button className={`qcrd-btn soft${pasteOpen ? ' live' : ''}`} onClick={() => setPasteOpen(v => !v)} disabled={stops.length === 0} title="Pega la lista reordenada y la ruta se reordena sola">
              <ListOrdered size={15} /> Pegar orden
            </button>
          </div>

          {pasteOpen && (
            <div className="qcrd-paste-panel">
              <label className="qcrd-field-label" htmlFor="qcrd-paste">
                Pega las direcciones en el nuevo orden (una por línea; se aceptan con o sin numeración)
              </label>
              <textarea
                id="qcrd-paste"
                className="qcrd-paste-textarea"
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={'1. 2500 Westcliff Rd A Killeen, TX 76543\n2. 618 N 22nd St Killeen, TX 76541\n3. ...'}
              />
              <div className="qcrd-paste-actions">
                <button className="qcrd-btn" onClick={applyPastedOrder}>
                  <ListOrdered size={15} /> Aplicar orden
                </button>
                <button className="qcrd-btn soft" onClick={() => { setPasteOpen(false); setPasteText(''); }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Aviso: para que otros usuarios te sigan, la ruta debe estar guardada */}
          {tracking && !savedRouteId && (
            <div className="qcrd-live-hint">
              Tu posición se ve solo en tu mapa. Guarda la ruta ("Guardar en QC Route") para
              compartirla: quien la abra aquí o en QC Route verá tu ubicación en vivo.
            </div>
          )}

          {/* Lista de paradas numeradas */}
          {stops.length === 0 ? (
            <div className="qcrd-empty-box">
              Aún no hay paradas. Usa "Agregar a ruta" en las tarjetas de casas pendientes o en Recall.
            </div>
          ) : (
            <ul className="qcrd-stops-list">
              {stops.map((s, i) => (
                <li key={s.houseId} className="qcrd-stop-card">
                  <div className="qcrd-stop-num">{i + 1}</div>
                  <div className="qcrd-stop-body">
                    <div className="qcrd-stop-client">{s.client}</div>
                    <div className="qcrd-stop-address-row">
                      <MapPin size={13} color="#94a3b8" className="qcrd-shrink-0" />
                      <span className="qcrd-ellipsis">{s.address || '—'}</span>
                    </div>
                    <div className="qcrd-stop-meta-row">
                      {s.lat == null ? (
                        <span className="qcrd-stop-no-location">Sin ubicación (no se pudo geolocalizar)</span>
                      ) : (
                        <>
                          <span className="qcrd-stop-eta"><Clock size={12} /> {fmtMin(s.etaMin)}</span>
                          <span>{s.legKm} km</span>
                          <a href={mapsStopUrl(s)} target="_blank" rel="noopener noreferrer" className="qcrd-stop-nav-link">
                            <ExternalLink size={12} /> Navegar
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="qcrd-stop-order-col">
                    <button onClick={() => moveStop(i, -1)} disabled={i === 0} title="Subir" aria-label="Subir parada" className="qcrd-order-btn"><ArrowUp size={17} /></button>
                    <button onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} title="Bajar" aria-label="Bajar parada" className="qcrd-order-btn"><ArrowDown size={17} /></button>
                    <button onClick={() => removeStop(s)} title="Quitar de la ruta" aria-label="Quitar de la ruta" className="qcrd-remove-btn"><Trash2 size={17} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Guardar/actualizar la ruta en qc_routes (aparece también en la vista QC Route) */}
        <div className="qcrd-footer">
          <input
            value={routeName}
            onChange={e => setRouteName(e.target.value)}
            placeholder={`Ruta ${new Date().toLocaleDateString('es-MX')}`}
            className="qcrd-input qcrd-footer-name"
          />
          <button
            className="qcrd-btn primary"
            onClick={() => savedRouteId && shareRouteLink(savedRouteId, routeName.trim() || 'Ruta QC')}
            disabled={!savedRouteId}
            title={savedRouteId ? 'Compartir el link de esta ruta' : 'Guarda la ruta primero para poder compartirla'}
          >
            <Share2 size={15} /> Compartir
          </button>
          <button className="qcrd-btn primary" onClick={saveToQcRoutes} disabled={savingRoute || stops.length === 0}>
            {savingRoute ? <Loader2 size={15} className="qcrd-spin" /> : <Save size={15} />} {savedRouteId ? 'Actualizar ruta' : 'Guardar en QC Route'}
          </button>
        </div>
      </aside>
    </>
  );
}