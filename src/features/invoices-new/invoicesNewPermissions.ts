// src/features/invoices-new/invoicesNewPermissions.ts
// ============================================================================
// Permisos de Invoices New (módulo "Invoices New" en Roles & Permissions).
//
// · Módulo NUEVO sin herencia (decisión de Omar): nadie lo ve hasta que se
//   active en Roles. A diferencia de Clients Report, NO hereda de "Invoices".
// · View = lista, detalle, PDF y Activity. Add = crear. Edit = editar, notas,
//   fotos, enviar y registrar pagos. Delete = mandar a la papelera y restaurar
//   (nunca un pagado; el invoice no se borra de Firestore, ver code-notes.md).
// · Scope Own no aplica en v1: el invoice no tiene trabajadores asignados.
// ============================================================================
import type { InvoicesNewRights, Permission, Role } from '../../types/index';

/** Nombre del módulo en Roles, en la guardia de App.tsx y en la bitácora.
 *  Se guarda en los roles: cambiarlo obliga a migrarlos. */
export const INVOICES_NEW_MODULE = 'Invoices New';

const NO_RIGHTS: InvoicesNewRights = { canView: false, canCreate: false, canEdit: false, canDelete: false };

export function getInvoicesNewRights(role: Role | null | undefined, isSuperAdmin: boolean): InvoicesNewRights {
  if (isSuperAdmin) return { canView: true, canCreate: true, canEdit: true, canDelete: true };
  const permission = role?.permissions?.find((rolePermission: Permission) => rolePermission.module === INVOICES_NEW_MODULE);
  if (!permission?.canView) return NO_RIGHTS;
  return {
    canView: true, canCreate: !!permission.canAdd, canEdit: !!permission.canEdit, canDelete: !!permission.canDelete,
  };
}
