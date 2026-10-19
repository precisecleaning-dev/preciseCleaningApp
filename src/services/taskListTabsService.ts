// src/services/taskListTabsService.ts
// ============================================================================
// Documento app_settings/task_list_tabs: el orden de las pestañas del Task list
// (Overdue, Daily, Needs Approval…), el mismo para todos. Lo escribe quien
// tiene Edit en Task List (regla en security/firestore.rules). Tipo en
// src/types/userTasks.ts (TaskListTabsSettings).
//
//   watch · save
// ============================================================================
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../lib/firebase/collections';
import type { Actor, TaskListTabId, TaskListTabsSettings } from '../types/index';

const taskListTabsRef = doc(db, COLLECTIONS.appSettings, 'task_list_tabs');

export const taskListTabsService = {
  /** Escucha el documento. `null` = todavía nadie guardó un orden (se usa el de fábrica). */
  watch(
    onSettingsChange: (settings: TaskListTabsSettings | null) => void,
    onWatchError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      taskListTabsRef,
      (snapshot) => onSettingsChange(snapshot.exists() ? (snapshot.data() as TaskListTabsSettings) : null),
      onWatchError,
    );
  },

  /** Guarda el orden para todos. */
  async save(tabOrder: TaskListTabId[], actor: Actor): Promise<void> {
    const settings: TaskListTabsSettings = {
      tabOrder,
      updatedAt: new Date().toISOString(),
      updatedByUserId: actor.id,
      updatedByUserName: actor.name,
    };
    await setDoc(taskListTabsRef, settings);
  },
};
