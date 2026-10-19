// src/features/ops/hooks/useTaskListTabOrder.ts
// Orden de las pestañas del Task list (app_settings/task_list_tabs), en vivo.
// Mientras llega, si nadie guardó uno o si no se pudo leer, se usa el de
// fábrica (DEFAULT_TAB_ORDER): la lista nunca se queda sin pestañas.
import { useEffect, useState } from 'react';
import type { TaskListTabId } from '../../../types/index';
import { taskListTabsService } from '../../../services/taskListTabsService';
import { DEFAULT_TAB_ORDER, normalizeTabOrder } from '../taskListTabs';

export const useTaskListTabOrder = (): TaskListTabId[] => {
  const [tabOrder, setTabOrder] = useState<TaskListTabId[]>(DEFAULT_TAB_ORDER);

  useEffect(() => taskListTabsService.watch(
    (settings) => setTabOrder(normalizeTabOrder(settings?.tabOrder)),
    (error) => {
      console.error('Error TaskListTabs:', error);
      setTabOrder(DEFAULT_TAB_ORDER);
    },
  ), []);

  return tabOrder;
};
