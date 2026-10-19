// Pestaña "Done" del Task list: las tareas hechas, de la más reciente a la más
// vieja, una página de 20 a la vez (Previous / Next). Una fila por tarea
// (TaskRow sin casilla, con la fecha en que se hizo); tocarla abre el panel,
// donde se puede reabrir. Si Firestore rechaza la consulta, dice POR QUÉ
// (falta el índice, permisos, sin señal) en vez de "revisa la conexión".
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { UserTask } from '../../../types/index';
import ActionButton from './ActionButton';
import TaskRow from './TaskRow';

interface DoneTaskListProps {
  tasks: UserTask[];
  pageNumber: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  isLoading: boolean;
  isLoadingPage: boolean;
  /** Error de Firestore al pedir las hechas (con su `code`), o null. */
  loadError: Error | null;
  /** No se pudo traer la página siguiente: se sigue viendo la actual y se avisa abajo. */
  nextPageError: Error | null;
  /** Hoy, AAAA-MM-DD. */
  todayIsoDate: string;
  selectedTaskId: string | null;
  getProjectTitle: (task: UserTask) => string | null;
  getProjectColor: (task: UserTask) => string;
  getAssigneesLabel: (task: UserTask) => string;
  getAssignedByName: (task: UserTask) => string | null;
  onOpen: (task: UserTask) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onRetry: () => void;
}

/** Link de la consola para crear el índice que falta (viene en el mensaje de Firestore). */
const INDEX_LINK_PATTERN = /https:\/\/console\.firebase\.google\.com\/\S+/;

/** ¿Falló por falta de señal? (el navegador está sin red o Firestore dice "unavailable"). */
const isOfflineError = (error: Error & { code?: string }): boolean =>
  (typeof navigator !== 'undefined' && !navigator.onLine) || error.code === 'unavailable';

/** Por qué no se pudieron leer las hechas, según el código del error de Firestore. */
const getLoadErrorMessage = (loadError: Error & { code?: string }): string => {
  if (isOfflineError(loadError)) return "You're offline. Done tasks will load when the connection is back.";
  if (loadError.code === 'failed-precondition') {
    return 'Done tasks need a Firestore index that is missing or still being built. Create it with the link and wait until its status is "Enabled".';
  }
  if (loadError.code === 'permission-denied') {
    return "Firestore rules don't let this role read done tasks (permission-denied). Publish the user_tasks rules from security/firestore.rules in the Firebase console.";
  }
  return `Could not load the done tasks${loadError.code ? ` (${loadError.code})` : ''}.`;
};

/** Aviso cuando no llega la página siguiente (se sigue viendo la actual). */
const getNextPageErrorMessage = (nextPageError: Error & { code?: string }): string => {
  if (isOfflineError(nextPageError)) return "You're offline. Tap Next again when the connection is back.";
  return `Could not load the next page${nextPageError.code ? ` (${nextPageError.code})` : ''}. Tap Next to try again.`;
};

const DoneTaskList = ({
  tasks, pageNumber, hasPreviousPage, hasNextPage, isLoading, isLoadingPage, loadError, nextPageError, todayIsoDate,
  selectedTaskId,
  getProjectTitle, getProjectColor, getAssigneesLabel, getAssignedByName, onOpen, onPreviousPage, onNextPage, onRetry,
}: DoneTaskListProps) => {
  if (loadError) {
    const createIndexUrl = loadError.message.match(INDEX_LINK_PATTERN)?.[0] ?? null;
    return (
      <div className="error otl-done-error otl-empty" role="alert">
        <p className="otl-done-error-text">{getLoadErrorMessage(loadError)}</p>
        <span className="otl-done-error-actions">
          {createIndexUrl && (
            <a className="otl-done-error-link" href={createIndexUrl} target="_blank" rel="noreferrer">Create the index</a>
          )}
          <ActionButton variant="outline" size="sm" onClick={onRetry}>Try again</ActionButton>
        </span>
      </div>
    );
  }
  if (isLoading) return <p className="otl-empty"><Loader2 size={16} className="otl-spin" /> Loading done tasks…</p>;
  const hasPagination = hasPreviousPage || hasNextPage;
  if (tasks.length === 0 && !hasPagination) return <p className="otl-empty">No done tasks yet.</p>;

  return (
    <section className="otl-section" aria-label="Done">
      <h2 className="done otl-section-title">Done · {tasks.length}</h2>
      <ul className="otl-rows">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            todayIsoDate={todayIsoDate}
            assigneesLabel={getAssigneesLabel(task)}
            assignedByName={getAssignedByName(task)}
            projectTitle={getProjectTitle(task)}
            projectColor={getProjectColor(task)}
            isSelected={task.id === selectedTaskId}
            isBusy={false}
            onOpen={onOpen}
            isDoneRow
          />
        ))}
      </ul>
      {hasPagination && (
        <nav className="otl-pagination" aria-label="Done pages">
          <ActionButton variant="outline" size="sm" icon={<ChevronLeft size={14} />}
            disabled={!hasPreviousPage || isLoadingPage} onClick={onPreviousPage}>
            Previous
          </ActionButton>
          <span className="otl-pagination-page">Page {pageNumber}</span>
          <ActionButton variant="outline" size="sm" trailingIcon={<ChevronRight size={14} />}
            disabled={!hasNextPage || isLoadingPage} onClick={onNextPage}>
            {isLoadingPage ? 'Loading…' : 'Next'}
          </ActionButton>
        </nav>
      )}
      {nextPageError && (
        <p className="error otl-pagination-error" role="alert">{getNextPageErrorMessage(nextPageError)}</p>
      )}
    </section>
  );
};

export default DoneTaskList;
