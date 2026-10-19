// Encabezado del Task list: botón de menú, la persona que se mira (avatar,
// "Sandy's tasks" y su rol), el resumen "3 open · 1 overdue", el selector de
// persona (solo con Scope "All") y el botón "Projects".
import { FolderKanban } from 'lucide-react';
import type { AssignableUser } from '../../../types/index';
import MenuButton from '../../../shared/components/MenuButton';
import ActionButton from './ActionButton';
import OpsAvatar from './OpsAvatar';

interface TaskListHeaderProps {
  onOpenMenu: () => void;
  /** Id de la persona que se mira (o ALL_USERS con "Everyone"). */
  viewedUserId: string;
  /** Id que lleva la opción "Everyone" del selector. */
  everyoneOptionId: string;
  isEveryoneView: boolean;
  /** "Sandy's tasks" / "Everyone's tasks". */
  title: string;
  /** Nombre completo para el avatar. */
  viewedUserName: string;
  viewedRoleName: string;
  /** "3 open · 1 overdue" ('…' mientras carga). */
  openSummary: string;
  currentUserId: string;
  /** Con esto se muestra el selector de persona (Scope "All"). */
  canChoosePerson: boolean;
  assignableUsers: AssignableUser[];
  onViewedUserChange: (personId: string) => void;
  canViewProjects: boolean;
  onManageProjects: () => void;
}

const TaskListHeader = ({
  onOpenMenu, viewedUserId, everyoneOptionId, isEveryoneView, title, viewedUserName, viewedRoleName, openSummary,
  currentUserId, canChoosePerson, assignableUsers, onViewedUserChange, canViewProjects, onManageProjects,
}: TaskListHeaderProps) => (
  <header className="main-header otl-header">
    <div className="view-header-title-group">
      <MenuButton onClick={onOpenMenu} />
      <div className="otl-who">
        <OpsAvatar id={isEveryoneView ? 'everyone' : viewedUserId} name={viewedUserName} size="lg" />
        <div>
          <h1 className="otl-title">{title}</h1>
          {viewedRoleName && <p className="otl-sub">{viewedRoleName}</p>}
        </div>
      </div>
    </div>
    <div className="otl-head-actions">
      <span className="otl-open">{openSummary}</span>
      {canChoosePerson && (
        <select className="otl-select" value={viewedUserId}
          onChange={(event) => onViewedUserChange(event.target.value)} aria-label="Whose tasks">
          {assignableUsers.map((person) => (
            <option key={person.id} value={person.id}>{person.id === currentUserId ? 'My tasks' : person.name}</option>
          ))}
          <option value={everyoneOptionId}>Everyone</option>
        </select>
      )}
      {canViewProjects && (
        <ActionButton variant="outline" icon={<FolderKanban size={16} />} onClick={onManageProjects}>
          Projects
        </ActionButton>
      )}
    </div>
  </header>
);

export default TaskListHeader;
