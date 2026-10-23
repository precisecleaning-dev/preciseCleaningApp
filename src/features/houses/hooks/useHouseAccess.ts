// ⭐ Permisos y visibilidad de Houses para el rol activo (Roles & Permissions
//    + "Configure Fields"). Lo calcula HousesView una vez y lo reciben la lista,
//    el detalle y el formulario. Extraído de HousesView sin cambiar las reglas.
import type { Property, Role, SystemUser } from '../../../types/index';
import type { FormVisibilityConfig } from '../houseFieldConfig';

type PermissionExt = {
  module: string;
  canView?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  scope?: 'All' | 'Own';
  allowedStatusIds?: string[];
  hiddenGroups?: string[];
  readOnlyFields?: string[];
};

interface AccessInput {
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  currentUser?: SystemUser | null;
  formConfig: FormVisibilityConfig;
}

export function useHouseAccess({ activeRole, isSuperAdmin, currentUser, formConfig }: AccessInput) {
  const housePermission = activeRole?.permissions?.find((p) => p.module === 'Houses') as PermissionExt | undefined;
  const canAdd = !!isSuperAdmin || !!housePermission?.canAdd;
  const canEdit = !!isSuperAdmin || !!housePermission?.canEdit;
  const canDelete = !!isSuperAdmin || !!housePermission?.canDelete;
  const userScope = isSuperAdmin ? 'All' : housePermission?.scope || 'Own';
  const allowedStatusIds: string[] = housePermission?.allowedStatusIds || [];
  const hiddenGroups: string[] = housePermission?.hiddenGroups || [];
  // ⭐ Campos en SOLO LECTURA del rol (Roles & Permissions → "Houses Form Fields";
  //    los ids coinciden con HOUSES_FORM_FIELDS de RolesView.tsx).
  const roleReadOnlyFields: string[] = housePermission?.readOnlyFields || [];

  // ============================================================================
  // ⭐ REGLA para el rol EMPLEADO (sin permiso de Edit del módulo Houses): el
  //    apartado de FOTOS solo se muestra DESPUÉS de presionar Start Job. Se
  //    desbloquea también si el trabajo ya inició/terminó o la casa YA TIENE
  //    fotos (ocultar fotos existentes no protege nada).
  // ============================================================================
  const isEmployeeRole = !isSuperAdmin && !canEdit;
  const photosUnlockedFor = (house: Property | null): boolean =>
    !isEmployeeRole ||
    !!house?.employeeStartedBy ||
    !!house?.employeeFinishedBy ||
    (house?.beforePhotos?.length || 0) + (house?.afterPhotos?.length || 0) > 0;

  // ⭐ Solo lectura si lo marca el rol (Roles & Permissions) o el modal "Field &
  //    Button Visibility" (app_settings/houses_form_config.readOnly). El super
  //    admin siempre edita todo.
  const isFieldRO = (fieldId: string): boolean => {
    if (isSuperAdmin) return false;
    if (roleReadOnlyFields.includes(fieldId)) return true;
    const roRoles = formConfig?.readOnly?.[fieldId] || [];
    return !!currentUser?.roleId && roRoles.includes(currentUser.roleId);
  };

  const isVisible = (groupId: string): boolean => !!isSuperAdmin || !hiddenGroups.includes(groupId);

  const isElementVisible = (elementId: string): boolean => {
    if (isSuperAdmin) return true;
    const userRoleId = currentUser?.roleId;
    if (!userRoleId) return true;
    return !(formConfig?.visibility?.[elementId] || []).includes(userRoleId);
  };

  // ⭐ Notas de oficina: hace falta el permiso "Office Notes" Y el elemento
  //    activo en Configure Fields (doble candado a propósito).
  const canSeeOfficeNotes = (): boolean => {
    if (!isElementVisible('officeNote')) return false;
    if (isSuperAdmin) return true;
    return !!activeRole?.permissions?.find((p) => p.module === 'Office Notes')?.canView;
  };

  // ⭐ Pestaña "Quality check" del detalle (reportes de la casa y su PDF): hace
  //    falta View en el módulo "Quality Check" (Roles) Y el tab activo en
  //    Configure Fields (doble candado, como las notas de oficina). El personal
  //    de campo sin ese permiso no la ve (decisión de Omar, 10/2026).
  const canSeeQualityCheckTab = (): boolean => {
    if (!isElementVisible('btn_tabQualityCheck')) return false;
    if (isSuperAdmin) return true;
    return !!activeRole?.permissions?.find((permission) => permission.module === 'Quality Check')?.canView;
  };

  /** ¿Alguno de estos elementos es visible? (oculta tarjetas completas del detalle). */
  const anyVisible = (...elementIds: string[]): boolean => elementIds.some((id) => isElementVisible(id));

  /** ¿El rol ve esta columna/status en Pipeline y Overview? (elemento "status_<id>"). */
  const isStatusVisibleForRole = (statusId: string): boolean => isElementVisible(`status_${statusId}`);

  /** Botón "Configure Fields" del formulario: Edit en Roles & Permissions. */
  const canConfigureFields =
    !!isSuperAdmin || !!activeRole?.permissions?.find((p) => p.module === 'Roles & Permissions')?.canEdit;

  /** "Notes & Photos" del detalle (la pestaña por defecto) disponible para esta casa. */
  const mediaTabAvailable = (house: Property | null): boolean =>
    isVisible('media') && isElementVisible('btn_tabMedia') && photosUnlockedFor(house);

  return {
    canAdd, canEdit, canDelete, userScope, allowedStatusIds, isEmployeeRole, photosUnlockedFor,
    isFieldRO, isVisible, isElementVisible, canSeeOfficeNotes, canSeeQualityCheckTab, anyVisible, isStatusVisibleForRole, mediaTabAvailable,
    canConfigureFields,
  };
}

export type HouseAccess = ReturnType<typeof useHouseAccess>;
