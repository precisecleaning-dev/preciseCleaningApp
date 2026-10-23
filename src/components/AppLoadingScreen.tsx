// Pantalla mientras la app arranca. Con sesión guardada (o mientras llegan
// roles y perfil, que deciden el menú y los permisos) se dibuja la forma de la
// app: barra lateral y esqueleto de la vista, lo mismo que pinta index.html.
// Sin sesión guardada, "Verificando sesión...".
import { ViewSkeleton } from './RouteTransition';

interface AppLoadingScreenProps {
  isSidebarOpen: boolean;
  /** true = barra lateral + esqueleto; false = "Verificando sesión...". */
  isSkeleton: boolean;
}

const AppLoadingScreen = ({ isSidebarOpen, isSkeleton }: AppLoadingScreenProps) => {
  if (!isSkeleton) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-spinner" />
        <div className="app-loading-text">Verificando sesión...</div>
      </div>
    );
  }
  return (
    <div className="app-container">
      <aside className={`sidebar-container ${isSidebarOpen ? 'open' : 'closed'}`} aria-hidden="true" />
      <main className="main-content"><ViewSkeleton /></main>
    </div>
  );
};

export default AppLoadingScreen;
