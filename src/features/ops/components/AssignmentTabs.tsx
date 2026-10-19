// Pestañas de arriba del Task list: "Assigned to …" (las que le asignaron a la
// persona) y "Assigned by …" (las que ella asignó a otros), con su total de
// pendientes ('…' mientras carga).
import type { AssignmentTab } from '../../../types/index';

interface AssignmentTabsProps {
  selectedTab: AssignmentTab;
  /** "Assigned to me" / "Assigned to Sandy". */
  assignedToLabel: string;
  assignedByLabel: string;
  /** null = todavía cargando. */
  assignedToCount: number | null;
  assignedByCount: number | null;
  onSelectTab: (tab: AssignmentTab) => void;
}

const AssignmentTabs = ({
  selectedTab, assignedToLabel, assignedByLabel, assignedToCount, assignedByCount, onSelectTab,
}: AssignmentTabsProps) => {
  const tabs: { tab: AssignmentTab; label: string; count: number | null }[] = [
    { tab: 'assignedTo', label: assignedToLabel, count: assignedToCount },
    { tab: 'assignedBy', label: assignedByLabel, count: assignedByCount },
  ];
  return (
    <div className="otl-tabs" role="tablist" aria-label="Tasks">
      {tabs.map(({ tab, label, count }) => (
        <button key={tab} type="button" role="tab" aria-selected={selectedTab === tab}
          className={`otl-tab${selectedTab === tab ? ' active' : ''}`}
          onClick={() => onSelectTab(tab)}>
          {label}
          <span className="otl-tab-count">{count ?? '…'}</span>
        </button>
      ))}
    </div>
  );
};

export default AssignmentTabs;
