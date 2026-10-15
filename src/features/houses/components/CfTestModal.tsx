// ============================================================================
// ⭐ PANEL DE PRUEBAS DE CLOUD FUNCTIONS (temporal; botón "Probar functions"
//    del detalle de la casa). Diagnóstico del Calendar, activar el watch y
//    sincronizar una casa. Extraído de HousesView. La prueba del correo de QC
//    se quitó con la función onqualitycheckfinished (Fase 1).
//    Cuando todo esté verificado, se puede borrar este archivo y su botón.
// ============================================================================
import { useState } from "react";
import { X, Zap } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { Property } from "../../../types/index";
import { formatTime } from "../../../utils/dateFormat";

interface CfTestModalProps {
  house: Property;
  clientName: string;
  onClose: () => void;
}

export default function CfTestModal({ house, clientName, onClose }: CfTestModalProps) {
  const [cfTestLog, setCfTestLog] = useState<string[]>([]);
  const [isCfTesting, setIsCfTesting] = useState(false);

  const cfLog = (line: string) =>
    setCfTestLog((prev) => [
      ...prev,
      `[${formatTime(new Date())}] ${line}`,
    ]);

  const cfErrorText = (err: unknown): string => {
    const e = err as { code?: string; message?: string };
    return `${e.code ? `(${e.code}) ` : ""}${e.message || String(err)}`;
  };

  // 1) Activa el canal de avisos de Google Calendar (se hace UNA sola vez)
  // ⭐ Diagnóstico por capas: reporta EXACTAMENTE qué parte del Calendar
  //    falla (secretos, refresh token, lectura) con el mensaje real.
  const handleCfDiagnostics = async () => {
    setIsCfTesting(true);
    cfLog("Corriendo diagnóstico del Calendar…");
    try {
      const call = httpsCallable(getFunctions(), "calendardiagnostics");
      const res = (await call({})) as {
        data?: { ok?: boolean; steps?: { name: string; ok: boolean; detail: string }[] };
      };
      for (const s of res?.data?.steps || []) {
        cfLog(`${s.ok ? "✅" : "❌"} ${s.name}: ${s.detail}`);
      }
      if (res?.data?.ok) cfLog("✅ Todo el Calendar está operativo.");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      cfLog(`❌ No se pudo correr el diagnóstico: ${e.code || ""} ${e.message || String(err)}`);
      // ⭐ Un callable que NO está desplegado (o sin permiso público de
      //    invocación) no responde "not-found": el navegador bloquea la
      //    respuesta por CORS y el SDK la reporta como "functions/internal".
      if (e.code === "functions/internal" || e.code === "functions/not-found") {
        cfLog(
          "La función calendardiagnostics no respondió: no está desplegada o no tiene permiso de invocación. Ejecuta: firebase deploy --only functions",
        );
      }
    } finally {
      setIsCfTesting(false);
    }
  };

  const handleCfActivateWatch = async () => {
    setIsCfTesting(true);
    cfLog("Activando watch del calendario…");
    try {
      const call = httpsCallable(getFunctions(), "setupcalendarwatch");
      const res = (await call({})) as {
        data?: { ok?: boolean; channelId?: string; expiration?: string };
      };
      if (res?.data?.ok) {
        cfLog(`✅ Watch activo. Canal: ${res.data.channelId}`);
        cfLog(
          "A partir de ahora, editar un evento en Google Calendar actualiza la casa.",
        );
      } else {
        cfLog(`⚠️ Respuesta inesperada: ${JSON.stringify(res?.data)}`);
      }
    } catch (err) {
      cfLog(`❌ Error: ${cfErrorText(err)}`);
    } finally {
      setIsCfTesting(false);
    }
  };

  // 2) Sincroniza ESTA casa con Google Calendar vía Cloud Function
  const handleCfTestSync = async () => {
    if (!house.scheduleDate || !house.timeIn) {
      cfLog("⚠️ Esta casa necesita Schedule Date y Time In para sincronizar.");
      return;
    }
    setIsCfTesting(true);
    cfLog("Sincronizando esta casa con Google Calendar…");
    try {
      const call = httpsCallable(getFunctions(), "synchousetocalendar");
      const res = (await call({
        houseId: house.id,
        clientName: clientName,
      })) as { data?: { ok?: boolean; eventId?: string; htmlLink?: string } };
      if (res?.data?.ok) {
        cfLog(`✅ Evento creado/actualizado. ID: ${res.data.eventId}`);
        if (res.data.htmlLink) cfLog(`Enlace: ${res.data.htmlLink}`);
        cfLog(
          "Revisa el calendario. Cambia la hora del evento y vuelve a abrir esta casa en ~30 s.",
        );
      } else {
        cfLog(`⚠️ Respuesta inesperada: ${JSON.stringify(res?.data)}`);
      }
    } catch (err) {
      cfLog(`❌ Error: ${cfErrorText(err)}`);
    } finally {
      setIsCfTesting(false);
    }
  };

  return (
    <div
      className="modal-overlay-centered"
      onClick={() => !isCfTesting && onClose()}
    >
      <div className="hv-cftest-modal" onClick={(e) => e.stopPropagation()}>
        <header className="hv-cftest-header">
          <h3 className="hv-cftest-title">
            <Zap size={18} /> Pruebas de Cloud Functions
          </h3>
          <button
            className="hv-cftest-close"
            onClick={onClose}
            disabled={isCfTesting}
          >
            <X size={22} />
          </button>
        </header>

        <div className="hv-cftest-body">
          <p className="hv-cftest-hint">
            Casa: <b>{clientName}</b> ·{" "}
            {house.address || "—"}
          </p>

          <div className="hv-cftest-actions">
            {/* ⭐ Paso 0: diagnóstico por capas del Calendar */}
            <button
              className="hv-cftest-btn"
              disabled={isCfTesting}
              onClick={handleCfDiagnostics}
            >
              0 · Diagnóstico del Calendar (qué está fallando)
            </button>
            <span className="hv-cftest-note">
              Prueba secretos, token, lectura del calendario y el watch, y
              reporta la capa exacta que falla con su mensaje real.
            </span>
            <button
              className="hv-cftest-btn primary"
              onClick={handleCfActivateWatch}
              disabled={isCfTesting}
            >
              1 · Activar watch del calendario
            </button>
            <span className="hv-cftest-note">
              Solo la primera vez. Habilita que las ediciones hechas en
              Google Calendar regresen a la app.
            </span>

            <button
              className="hv-cftest-btn"
              onClick={handleCfTestSync}
              disabled={isCfTesting}
            >
              2 · Sincronizar esta casa con Calendar
            </button>
            <span className="hv-cftest-note">
              Crea el evento vía API y guarda el vínculo en la casa.
            </span>
          </div>

          <div className="hv-cftest-log">
            {cfTestLog.length === 0 ? (
              <span className="hv-cftest-log-empty">
                Los resultados aparecerán aquí…
              </span>
            ) : (
              cfTestLog.map((line, i) => (
                <div key={i} className="hv-cftest-log-line">
                  {line}
                </div>
              ))
            )}
            {isCfTesting && (
              <div className="hv-cftest-log-line">⏳ Ejecutando…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
