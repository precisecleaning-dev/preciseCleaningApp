// Atrapa el error de la pestaña activa (una vista diferida que no cargó por
// mala señal, o cualquier error al dibujarla) y muestra un aviso con "Reload"
// en vez de dejar la app en blanco. Solo culpa a la conexión si el error es de
// carga de archivos (`isChunkLoadError`); si es un error del código, lo dice y
// muestra el mensaje técnico para poder reportarlo (antes todo decía "revisa tu
// internet" y no había forma de saber qué falló). No recarga sola: si había un formulario sin
// guardar, el usuario decide. Si el archivo estaba guardado mal (HTML en vez de
// JS), index.html ya lo repara y recarga (window.pcRepairAssets).
//
// ⚠ Componente de CLASE a propósito: React solo atrapa errores de render con
// getDerivedStateFromError / componentDidCatch, que no existen como hooks.
// Es la excepción a "componentes como funciones flecha" (CLAUDE.md).
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import './ViewErrorBoundary.css';

/** Mensajes de los navegadores cuando no llega el archivo de una vista diferida (o su CSS). */
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;

const isChunkLoadError = (error: Error) => CHUNK_LOAD_ERROR_PATTERN.test(`${error.name}: ${error.message}`);

interface ViewErrorFallbackProps {
  error: Error;
  /** Pestaña donde pasó (resetKey), para el reporte. */
  screenName: string;
  onReload: () => void;
}

const ViewErrorFallback = ({ error, screenName, onReload }: ViewErrorFallbackProps) => {
  const isLoadError = isChunkLoadError(error);
  const title = isLoadError ? "This screen couldn't load" : 'This screen ran into an error';
  const text = isLoadError
    ? 'Check your internet connection and reload the app.'
    : 'Reload the app. If it happens again, send a screenshot of this message with the details open.';

  return (
    <div className="veb-panel" role="alert">
      <h2 className="veb-title">{title}</h2>
      <p className="veb-text">{text}</p>
      <button type="button" className="veb-reload-btn" onClick={onReload}>
        <RefreshCw size={16} aria-hidden="true" /> Reload
      </button>
      <details className="veb-details">
        <summary className="veb-details-summary">Details</summary>
        <code className="veb-details-text">{`Screen: ${screenName}\n${error.name}: ${error.message}`}</code>
      </details>
    </div>
  );
};

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

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    // Se puede lanzar cualquier cosa (un texto, un objeto): siempre se guarda como Error.
    return { error: error instanceof Error ? error : new Error(String(error)) };
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
    if (this.state.error) {
      return <ViewErrorFallback error={this.state.error} screenName={this.props.resetKey} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

export default ViewErrorBoundary;
