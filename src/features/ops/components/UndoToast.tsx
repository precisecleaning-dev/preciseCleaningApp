// Aviso "Done: … · Undo" que aparece unos segundos después de marcar una tarea
// hecha (Task list, Owner y Manager). El tiempo lo maneja useTaskActions.
import './UndoToast.css';

interface UndoToastProps {
  title: string;
  onUndo: () => void;
}

export default function UndoToast({ title, onUndo }: UndoToastProps) {
  return (
    <div className="otl-toast" role="status">
      <span className="otl-toast-text">Done: {title}</span>
      <button type="button" className="otl-toast-btn" onClick={onUndo}>Undo</button>
    </div>
  );
}
