// Atrapa el error de la pestaña activa (una vista diferida que no cargó por
// mala señal, o cualquier error al dibujarla) y muestra un aviso con "Reload"
// en vez de dejar la app en blanco. No recarga sola: si había un formulario sin
// guardar, el usuario decide. Si el archivo estaba guardado mal (HTML en vez de
// JS), index.html ya lo repara y recarga (window.pcRepairAssets).
//
// ⚠ Componente de CLASE a propósito: React solo atrapa errores de render con
// getDerivedStateFromError / componentDidCatch, que no existen como hooks.
// Es la excepción a "componentes como funciones flecha" (CLAUDE.md).
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import './ViewErrorBoundary.css';

interface ViewErrorFallbackProps {
  onReload: () => void;
}

const ViewErrorFallback = ({ onReload }: ViewErrorFallbackProps) => (
  <div className="veb-panel" role="alert">
    <h2 className="veb-title">This screen couldn't load</h2>
    <p className="veb-text">Check your internet connection and reload the app.</p>
    <button type="button" className="veb-reload-btn" onClick={onReload}>
      <RefreshCw size={16} aria-hidden="true" /> Reload
    </button>
  </div>
);

interface ViewErrorBoundaryProps {
  /** Al cambiar (otra pestaña) se borra el error y se intenta dibujar de nuevo. */
  resetKey: string;
  children: ReactNode;
}

interface ViewErrorBoundaryState {
  error: Error | null;
}

class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('La vista no se pudo mostrar.', error, errorInfo.componentStack);
  }

  componentDidUpdate(previousProps: ViewErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) return <ViewErrorFallback onReload={this.handleReload} />;
    return this.props.children;
  }
}

export default ViewErrorBoundary;
