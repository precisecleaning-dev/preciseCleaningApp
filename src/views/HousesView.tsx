// src/views/HousesView.tsx
// ============================================================================
// ⭐ HOUSES — orquestador. La página (HouseList), el detalle (HouseDetail) y el
//    formulario (HouseForm) viven en features/houses/components con su propio
//    estado; aquí queda lo que comparten:
//      · la casa abierta EN VIVO y sus servicios/pagos (un solo listener, así
//        "Edit" desde el detalle abre con los datos ya cargados);
//      · catálogos, permisos, "Configure Fields" y la cola de fotos sin conexión;
//      · borradores del formulario, papelera (borrado con motivo) y el modal
//        central de cambio de status;
//      · la apertura externa (Quality Check, Invoices, Calendar…) en modo
//        'modals-only'.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import type { HouseDetailTab, Property, SystemUser, Role } from "../types/index";
import StatusChangeModal, { type StatusModalConfig } from "../components/StatusChangeModal";
import { changeHouseStatus } from "../features/houses/services/houseStatus";
import { useHouseRecords, useLiveHouse } from "../features/houses/hooks/useLiveHouse";
import { useHouseCatalogs } from "../features/houses/hooks/useHouseCatalogs";
import { useHouseSettings } from "../features/houses/hooks/useHouseSettings";
import { useHouseAccess } from "../features/houses/hooks/useHouseAccess";
import { usePhotoQueue } from "../features/houses/hooks/usePhotoQueue";
import { useHouseTrash } from "../features/houses/hooks/useHouseTrash";
import { type HouseDraft, DRAFTS_MAX, loadDrafts, persistDrafts } from "../features/houses/houseDrafts";
import HouseList from "../features/houses/components/HouseList";
import HouseDetail, { type DetailTab } from "../features/houses/components/HouseDetail";
import HouseForm, { type HouseFormInit } from "../features/houses/components/HouseForm";
import DraftsModal from "../features/houses/components/DraftsModal";
import PhotoUploadToast from "../features/houses/components/PhotoUploadToast";
import DeleteHouseDialog from "../features/houses/components/DeleteHouseDialog";
import "./HousesView.css";

interface HousesViewProps {
  onOpenMenu: () => void;
  properties: Property[];
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
  roles?: Role[];
  viewMode?: "table" | "board";
  // ⭐ Apertura externa (p. ej. desde Quality Check):
  houseToOpenDetail?: Property | null; // abre el modal de DETALLE de esta casa
  clearHouseToOpenDetail?: () => void;
  // ⭐ Tab inicial del detalle al abrir vía houseToOpenDetail (p. ej. Invoices
  //    abre directo en "media" para exportar los PDF de fotos).
  detailInitialTab?: HouseDetailTab;
  houseToOpenEdit?: Property | null; // abre el FORMULARIO de edición de esta casa
  clearHouseToOpenEdit?: () => void;
  // ⭐ 'modals-only': no dibuja la página (header/tabla/tablero), solo los modales.
  //    Permite abrir el detalle/edición encima de OTRA vista (p. ej. Quality Check)
  //    sin sacar al usuario de donde está.
  renderMode?: "full" | "modals-only";
}

export default function HousesView({
  onOpenMenu,
  properties,
  currentUser,
  activeRole,
  isSuperAdmin,
  roles = [],
  viewMode = "table",
  houseToOpenDetail,
  clearHouseToOpenDetail,
  detailInitialTab,
  houseToOpenEdit,
  clearHouseToOpenEdit,
  renderMode = "full",
}: HousesViewProps) {
  // ⭐ Casa abierta (detalle/edición): se guarda la que se abrió y se MUESTRA
  //    su versión en vivo (useLiveHouse). Antes era una copia congelada que
  //    cada handler parchaba a mano: lo que cambiaba en otra vista o en otro
  //    equipo no aparecía hasta recargar.
  const [openedHouse, setSelectedHouse] = useState<Property | null>(null);
  const selectedHouse = useLiveHouse(openedHouse, properties);
  // Detalle y formulario abiertos. `seq` cambia en cada apertura: el componente
  // se monta de nuevo y arranca limpio (antes se reseteaba campo por campo).
  const openSeq = useRef(0);
  const [detail, setDetail] = useState<{ seq: number; tab?: DetailTab; camera?: "before" | "after" } | null>(null);
  const [form, setForm] = useState<{ seq: number; init: HouseFormInit } | null>(null);
  const isDetailModalOpen = !!detail;
  const isFormModalOpen = !!form;

  // Configuración del modal central de cambio de estado (null = cerrado).
  const [statusModal, setStatusModal] = useState<StatusModalConfig | null>(null);

  // ⭐ Catálogos del store compartido + índices y nombres (features/houses/hooks).
  const catalogs = useHouseCatalogs(roles);
  const { statuses, logLabel } = catalogs;
  // ⭐ app_settings: compresión de fotos y "Configure Fields" (un listener por documento).
  const { photoConfig, formConfig } = useHouseSettings();
  // ⭐ Permisos y visibilidad del rol activo (features/houses/hooks/useHouseAccess.ts).
  const access = useHouseAccess({ activeRole, isSuperAdmin, currentUser, formConfig });
  const { isFieldRO } = access;
  // ⭐ Fotos sin conexión: subir o encolar, sincronizar y contador (usePhotoQueue).
  const queue = usePhotoQueue();

  const [drafts, setDrafts] = useState<HouseDraft[]>(() => loadDrafts());
  const [isDraftsOpen, setIsDraftsOpen] = useState(false);

  // ⭐ Servicios y pagos de la casa abierta en vivo (listener acotado a la
  //    casa): el detalle los muestra y el formulario de edición los copia a su
  //    borrador al abrir.
  const records = useHouseRecords(
    (isDetailModalOpen || isFormModalOpen) && selectedHouse ? selectedHouse.id : null,
  );

  // ⭐ BORRADO CON MOTIVO OBLIGATORIO → PAPELERA (mismo flujo en Invoices,
  //    Calendar y Quality Check: features/houses/hooks/useHouseTrash.ts).
  const houseTrash = useHouseTrash({
    actor: currentUser,
    module: "Houses",
    labelOf: logLabel,
    liveOf: (id) => properties.find((p) => p.id === id),
    onDone: (house) => {
      setDetail(null);
      // Sin casa abierta: no queda escuchando el documento borrado.
      if (openedHouse?.id === house.id) setSelectedHouse(null);
    },
  });

  // ⭐ Status desde el detalle: casa + status_history en un batch y bitácora
  //    después (features/houses/services/houseStatus.ts). No bloquea nada:
  //    el listener muestra el cambio al instante; si falla, avisa.
  const handleQuickStatusChange = (propertyId: string, newStatusId: string) => {
    // ⭐ Respeta la config "Solo lectura" del campo Job Status para el rol activo.
    if (isFieldRO("statusId")) {
      alert("El status del trabajo es de SOLO LECTURA para tu rol.");
      return;
    }
    const prev = properties.find((p) => p.id === propertyId);
    changeHouseStatus({ id: propertyId, statusId: prev?.statusId ?? "" }, newStatusId, {
      statuses,
      actor: currentUser,
      source: "houses",
      module: "Houses",
      label: logLabel(prev),
    }).catch((error: unknown) => {
      console.error("Failed to update job status.", error);
      alert("Failed to update job status.");
    });
  };

  const handleOpenDetail = (house: Property, tab?: DetailTab, camera?: "before" | "after") => {
    setSelectedHouse(house);
    setDetail({ seq: ++openSeq.current, tab, camera });
  };

  // ⭐ Desde la TARJETA de Daily Jobs: abre el detalle en el tab de fotos y
  //    dispara la CÁMARA de inmediato en el modo correcto (Before o After).
  //    Al presionar "Guardar" en la cámara, las fotos se suben automáticamente
  //    a la sección correspondiente sin pasos adicionales.
  const handleOpenPhotosFromCard = (house: Property, which: "before" | "after") =>
    handleOpenDetail(house, "media", which);

  const openForm = (init: HouseFormInit) => setForm({ seq: ++openSeq.current, init });

  const handleOpenForm = (house?: Property) => {
    setSelectedHouse(house || null);
    setDetail(null);
    openForm(house ? { kind: "edit", house } : { kind: "new" });
  };

  const handleDuplicate = () => {
    if (!selectedHouse) return;
    setDetail(null);
    openForm({ kind: "duplicate", house: selectedHouse, services: records.services });
  };

  const handleCloseForm = () => {
    setForm(null);
    setSelectedHouse(null);
  };

  // Salir del formulario con cambios: el trabajo queda como borrador.
  const saveDraft = (draft: HouseDraft) => {
    const next = [draft, ...drafts].slice(0, DRAFTS_MAX);
    setDrafts(next);
    persistDrafts(next);
  };

  const restoreDraft = (draft: HouseDraft) => {
    // El borrador restaurado sale de la lista (si vuelve a salir, se re-crea).
    const next = drafts.filter((d) => d.id !== draft.id);
    setDrafts(next);
    persistDrafts(next);
    setIsDraftsOpen(false);
    openForm({ kind: "draft", draft });
  };

  const deleteDraft = (draftId: string) => {
    const next = drafts.filter((d) => d.id !== draftId);
    setDrafts(next);
    persistDrafts(next);
  };

  // Recibe la propiedad explícita (fila/tarjeta clickeada); sin argumento usa
  // la casa abierta. ⭐ El botón de borrar SOLO abre el diálogo que exige el
  // motivo. El movimiento real a la papelera ocurre al confirmar (useHouseTrash).
  const handleDelete = (house?: Property) => {
    const target = house || selectedHouse;
    if (!target) return;
    houseTrash.request(target);
  };

  // ⭐ Apertura EXTERNA (desde Quality Check u otras vistas):
  //    - houseToOpenDetail: abre el modal de detalle de esa casa.
  //    - houseToOpenEdit: abre el formulario de edición con sus campos guardados.
  //    Se usa siempre la versión más fresca de la casa (por si cambió en Firestore).
  useEffect(() => {
    if (!houseToOpenDetail) return;
    const fresh =
      properties.find((p) => p.id === houseToOpenDetail.id) ||
      houseToOpenDetail;
    // ⭐ Si la vista externa pidió un tab específico (p. ej. "media" desde
    //    Invoices para los PDF de fotos), se aplica sobre el default.
    handleOpenDetail(fresh, detailInitialTab);
    clearHouseToOpenDetail?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseToOpenDetail]);

  useEffect(() => {
    if (!houseToOpenEdit) return;
    const fresh =
      properties.find((p) => p.id === houseToOpenEdit.id) || houseToOpenEdit;
    handleOpenForm(fresh);
    clearHouseToOpenEdit?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseToOpenEdit]);

  return (
    <div
      className={
        renderMode === "modals-only"
          ? "hv-modals-only"
          : `fade-in houses-view${viewMode === "board" ? "" : " hv-unified-page"}`
      }
    >
      {renderMode === "full" && (
        <HouseList
          viewMode={viewMode}
          properties={properties}
          currentUser={currentUser}
          isSuperAdmin={isSuperAdmin}
          access={access}
          formConfig={formConfig}
          onOpenMenu={onOpenMenu}
          isOnline={queue.isOnline}
          pendingTotal={queue.pendingTotal}
          draftsCount={drafts.length}
          onOpenDrafts={() => setIsDraftsOpen(true)}
          onNewJob={() => handleOpenForm()}
          onOpenDetail={handleOpenDetail}
          onEdit={handleOpenForm}
          onDelete={handleDelete}
          onPhotosFromCard={handleOpenPhotosFromCard}
          onRequestStatus={setStatusModal}
        />
      )}

      {form && (
        <HouseForm
          key={form.seq}
          init={form.init}
          records={records}
          properties={properties}
          catalogs={catalogs}
          access={access}
          formConfig={formConfig}
          currentUser={currentUser}
          photoConfig={photoConfig}
          queue={queue}
          onSaveDraft={saveDraft}
          onClose={handleCloseForm}
        />
      )}

      {detail && selectedHouse && (
        <HouseDetail
          key={detail.seq}
          house={selectedHouse}
          initialTab={detail.tab}
          autoCamera={detail.camera}
          records={records}
          catalogs={catalogs}
          access={access}
          currentUser={currentUser}
          isSuperAdmin={isSuperAdmin}
          photoConfig={photoConfig}
          queue={queue}
          onClose={() => setDetail(null)}
          onEdit={handleOpenForm}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onStatusChange={handleQuickStatusChange}
          onRequestStatus={setStatusModal}
        />
      )}

      {/* --- BARRA DE PROGRESO DE FOTOS --- */}
      {queue.photoUpload && <PhotoUploadToast progress={queue.photoUpload} />}

      {/* --- MODAL: BORRADORES DEL FORMULARIO --- */}
      {isDraftsOpen && (
        <DraftsModal drafts={drafts} onRestore={restoreDraft} onDelete={deleteDraft} onClose={() => setIsDraftsOpen(false)} />
      )}

      {/* --- DIÁLOGO: MOTIVO OBLIGATORIO DE BORRADO → PAPELERA --- */}
      {houseTrash.target && (
        <DeleteHouseDialog
          label={houseTrash.label}
          busy={houseTrash.busy}
          onCancel={houseTrash.cancel}
          onConfirm={(reason) => void houseTrash.confirm(reason)}
        />
      )}

      {/* --- MODAL DE CAMBIO DE ESTADO (reemplaza la lista desplegable) --- */}
      {statusModal && (
        <StatusChangeModal
          config={statusModal}
          statuses={statuses}
          onClose={() => setStatusModal(null)}
        />
      )}
    </div>
  );
}
