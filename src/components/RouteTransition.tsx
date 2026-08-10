import './RouteTransition.css';

// ============================================================================
// ⭐ TRANSICIÓN ENTRE VISTAS
//
// Antes el cambio de pestaña era un corte seco: el contenido viejo desaparecía
// y el nuevo aparecía en el mismo fotograma. Esa discontinuidad es lo que hace
// que una interfaz se lea como "página web que se recarga" en vez de como una
// app.
//
// Las apps nativas resuelven esto con una transición corta que le dice al ojo
// "esto es lo mismo, cambió de estado". La clave es que sea BREVE: por encima
// de ~220 ms la animación deja de ayudar y empieza a sentirse lenta, que es el
// error opuesto y más común.
//
// Se usa una animación de entrada solamente (no de salida). Animar la salida
// obligaría a mantener la vista anterior montada mientras se desvanece, lo que
// duplicaría los listeners de Firestore durante la transición.
// ============================================================================

interface RouteTransitionProps {
  /** Cambia con cada navegación: dispara la animación. */
  routeKey: string;
  children: React.ReactNode;
}

export default function RouteTransition({ routeKey, children }: RouteTransitionProps) {
  // `key` es todo el mecanismo: al cambiar, React descarta el div anterior y
  // monta uno nuevo, lo que reinicia la animación CSS. No hace falta estado ni
  // efectos — y eso importa, porque cualquier render extra ocurriría justo
  // cuando el hilo principal está montando la vista nueva, que es el momento
  // con menos margen de toda la navegación.
  return (
    <div key={routeKey} className="route-transition">
      {children}
    </div>
  );
}

// ============================================================================
// ⭐ ESQUELETO DE CARGA
//
// Reemplaza al spinner con texto ("Cargando módulo..."). Un spinner centrado en
// una pantalla vacía no da ninguna información y hace que la espera se perciba
// más larga de lo que es. Un esqueleto que dibuja la FORMA de lo que viene
// reduce la espera percibida y evita el salto de layout cuando el contenido
// real aparece.
//
// Con la precarga en reposo (viewPrefetch.ts) este esqueleto casi nunca llega a
// verse; existe para la primera visita a un módulo poco usado y para conexiones
// lentas.
// ============================================================================

export function ViewSkeleton() {
  return (
    <div className="skel-page" role="status" aria-busy="true" aria-live="polite">
      <span className="u-sr-only">Cargando…</span>

      <div className="skel-header">
        <div className="skel-line skel-title" />
        <div className="skel-line skel-subtitle" />
      </div>

      <div className="skel-stats">
        <div className="skel-card" />
        <div className="skel-card" />
        <div className="skel-card" />
      </div>

      <div className="skel-block">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skel-row">
            <div className="skel-line skel-row-main" />
            <div className="skel-line skel-row-side" />
          </div>
        ))}
      </div>
    </div>
  );
}
