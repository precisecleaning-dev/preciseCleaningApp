/* ============================================================================
   Cloud Functions — Precise Cleaning  (TypeScript)
   ----------------------------------------------------------------------------
   1) synchousetocalendar    (callable)  : crea/actualiza el evento en Google
      Calendar vía API y guarda gcalEventId en la casa (properties/{id}).
   2) calendarwebhook        (https)     : recibe las notificaciones push de
      Google Calendar; cuando un evento se EDITA en el calendario, actualiza
      la casa correspondiente en Firestore (fecha, horas, dirección, nota).
   3) setupcalendarwatch     (callable)  : crea el "watch" inicial del calendario
      (el canal que hace que Google nos avise de los cambios).
   4) renewcalendarwatch     (scheduled) : renueva el watch a diario (los canales
      de Google Calendar expiran; sin esto, dejan de llegar avisos).
   5) onqualitycheckfinished (trigger)   : cuando un Quality Check queda
      "Finished" (momento en que su PDF/reporte existe), envía un email con el
      resumen a la cuenta configurada, usando la extensión Trigger Email
      (colección "mail") que ya usa la app.

   AUTENTICACIÓN CON GOOGLE CALENDAR
   Se usa la cuenta de servicio por defecto del proyecto (Application Default
   Credentials). NO requiere archivos de llaves: solo hay que COMPARTIR el
   calendario de account@precisecleaningtx.com con el email de la cuenta de
   servicio, con permiso "Hacer cambios en los eventos".
   ============================================================================ */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import { google, calendar_v3 } from "googleapis";
import * as crypto from "crypto";

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Configuración (functions/.env)
// ---------------------------------------------------------------------------
const CALENDAR_ID = process.env.CALENDAR_ID || "account@precisecleaningtx.com";
const TIMEZONE = "America/Chicago";
// Documento donde se guarda el estado de la sincronización (syncToken + canal)
const SYNC_STATE_DOC = "app_settings/gcal_sync";

// Error de la API de Google (para leer .code y .message sin usar any)
type GoogleApiError = { code?: number; message?: string };

// Cliente de Calendar autenticado con la cuenta de servicio del proyecto
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

// ---------------------------------------------------------------------------
// Helpers de fecha/hora
// ---------------------------------------------------------------------------
// "09:00" | "9:00 AM" -> "HH:MM" en 24h
function normalizeTime(t: string): string {
  const s = String(t || "").trim();
  const ampm = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  let h: number;
  let m: number;
  if (ampm) {
    h = Number(ampm[1]) % 12;
    if (/PM/i.test(ampm[3])) h += 12;
    m = Number(ampm[2]);
  } else {
    const [hh = "0", mm = "0"] = s.split(":");
    h = Number(hh);
    m = Number(mm);
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// start/end de la API ({ dateTime | date }) -> { date, time }
// El dateTime viene en RFC3339 con el offset del calendario (America/Chicago),
// así que los literales de fecha/hora YA son la hora local correcta.
function parseGoogleDate(
  g?: calendar_v3.Schema$EventDateTime,
): { date: string | null; time: string | null } {
  if (!g) return { date: null, time: null };
  if (g.dateTime) {
    return { date: g.dateTime.slice(0, 10), time: g.dateTime.slice(11, 16) };
  }
  if (g.date) return { date: g.date, time: null }; // evento de día completo
  return { date: null, time: null };
}

// ===========================================================================
// 1) synchousetocalendar — botón "Sync" de la app
//    data: { houseId, clientName }
// ===========================================================================
export const synchousetocalendar = onCall(
  { region: "us-central1" },
  async (request) => {
    const { houseId, clientName } = (request.data || {}) as {
      houseId?: string;
      clientName?: string;
    };
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    if (!houseId) {
      throw new HttpsError("invalid-argument", "Falta houseId.");
    }

    const houseRef = db.doc(`properties/${houseId}`);
    const snap = await houseRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "La casa no existe.");
    }
    const house = snap.data() as {
      scheduleDate?: string;
      timeIn?: string;
      timeOut?: string;
      address?: string;
      note?: string;
      gcalEventId?: string;
    };
    if (!house.scheduleDate || !house.timeIn) {
      throw new HttpsError(
        "failed-precondition",
        "La casa necesita Schedule Date y Time In para sincronizar.",
      );
    }

    const timeIn = normalizeTime(house.timeIn);
    let timeOut = house.timeOut ? normalizeTime(house.timeOut) : null;
    // Respaldo +2h si no hay Time Out o la duración quedaría cero/negativa
    if (!timeOut || timeOut <= timeIn) {
      const [h, m] = timeIn.split(":").map(Number);
      timeOut = `${String(Math.min(h + 2, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    const event: calendar_v3.Schema$Event = {
      summary: `Cleaning: ${clientName || "Precise Cleaning"}`,
      location: house.address || "",
      description: house.note || "",
      start: {
        dateTime: `${house.scheduleDate}T${timeIn}:00`,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: `${house.scheduleDate}T${timeOut}:00`,
        timeZone: TIMEZONE,
      },
      // ⭐ El vínculo evento <-> casa viaja DENTRO del evento: el webhook lo usa
      //    para saber qué documento actualizar cuando el evento se edite.
      extendedProperties: { private: { houseId } },
    };

    const calendar = await getCalendarClient();
    let eventId: string | null | undefined = house.gcalEventId || null;

    try {
      if (eventId) {
        // Ya existía: actualizar el mismo evento
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId,
          requestBody: event,
        });
      } else {
        const res = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: event,
        });
        eventId = res.data.id;
      }
    } catch (err) {
      const e = err as GoogleApiError;
      // Si el evento guardado ya no existe en el calendario (lo borraron),
      // crear uno nuevo en lugar de fallar.
      if (eventId && (e.code === 404 || e.code === 410)) {
        const res = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: event,
        });
        eventId = res.data.id;
      } else {
        logger.error("Error sincronizando con Calendar:", err);
        throw new HttpsError(
          "internal",
          `Google Calendar rechazó la operación: ${e.message || String(err)}`,
        );
      }
    }

    await houseRef.update({
      gcalEventId: eventId,
      gcalSyncedAt: new Date().toISOString(),
    });

    return { ok: true, eventId };
  },
);

// ===========================================================================
// 2) calendarwebhook — Google avisa aquí cuando algo cambia en el calendario
// ===========================================================================
export const calendarwebhook = onRequest(
  { region: "us-central1" },
  async (req, res) => {
    // Google manda headers; el body llega vacío. Respondemos 200 SIEMPRE y
    // rápido para que Google no reintente, y luego procesamos.
    const state = req.get("X-Goog-Resource-State"); // "sync" | "exists" | "not_exists"
    const channelId = req.get("X-Goog-Channel-ID") || "";
    logger.info(`Webhook de Calendar: state=${state} channel=${channelId}`);

    // "sync" es el saludo inicial del canal: no hay cambios que procesar
    if (state === "sync") {
      res.status(200).send("ok");
      return;
    }

    try {
      await runIncrementalSync();
    } catch (err) {
      logger.error("Error en la sincronización incremental:", err);
    }
    res.status(200).send("ok");
  },
);

// Trae SOLO lo que cambió desde la última vez (syncToken) y actualiza Firestore
async function runIncrementalSync(): Promise<void> {
  const calendar = await getCalendarClient();
  const stateRef = db.doc(SYNC_STATE_DOC);
  const stateSnap = await stateRef.get();
  const syncToken: string | null = stateSnap.exists
    ? (stateSnap.data()?.syncToken as string | null) ?? null
    : null;

  let pageToken: string | null = null;
  let newSyncToken: string | null = null;
  const changed: calendar_v3.Schema$Event[] = [];

  try {
    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: CALENDAR_ID,
        pageToken: pageToken || undefined,
      };
      if (syncToken && !pageToken) params.syncToken = syncToken;
      if (!syncToken) {
        // Primera vez (o token inválido): mirar solo los últimos 60 días
        params.timeMin = new Date(Date.now() - 60 * 86400000).toISOString();
        params.singleEvents = true;
      }
      const res = await calendar.events.list(params);
      (res.data.items || []).forEach((ev) => changed.push(ev));
      pageToken = res.data.nextPageToken || null;
      if (res.data.nextSyncToken) newSyncToken = res.data.nextSyncToken;
    } while (pageToken);
  } catch (err) {
    const e = err as GoogleApiError;
    if (e.code === 410) {
      // El syncToken caducó: Google pide resync completo
      logger.warn("syncToken caducado (410); reiniciando token.");
      await stateRef.set({ syncToken: null }, { merge: true });
      await runIncrementalSync();
      return;
    }
    throw err;
  }

  if (newSyncToken) {
    await stateRef.set(
      { syncToken: newSyncToken, lastSyncAt: new Date().toISOString() },
      { merge: true },
    );
  }

  // Aplicar cada cambio a su casa (solo eventos creados por la app: llevan houseId)
  for (const ev of changed) {
    const houseId = ev.extendedProperties?.private?.houseId;
    if (!houseId) continue;

    const houseRef = db.doc(`properties/${houseId}`);

    if (ev.status === "cancelled") {
      // Borraron el evento en el calendario: soltar el vínculo (la casa queda intacta)
      await houseRef
        .update({
          gcalEventId: admin.firestore.FieldValue.delete(),
          gcalSyncedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
      logger.info(`Evento cancelado; vínculo removido de la casa ${houseId}`);
      continue;
    }

    const start = parseGoogleDate(ev.start);
    const end = parseGoogleDate(ev.end);
    const update: Record<string, string> = {
      gcalEventId: ev.id || "",
      gcalSyncedAt: new Date().toISOString(),
    };
    if (start.date) update.scheduleDate = start.date;
    if (start.time) update.timeIn = start.time;
    if (end.time) update.timeOut = end.time;
    if (typeof ev.location === "string") update.address = ev.location;
    if (typeof ev.description === "string") update.note = ev.description;

    try {
      await houseRef.update(update);
      logger.info(`Casa ${houseId} actualizada desde Google Calendar`, update);
    } catch (err) {
      const e = err as GoogleApiError;
      logger.error(`No se pudo actualizar la casa ${houseId}:`, e.message);
    }
  }
}

// ===========================================================================
// 3) setupcalendarwatch — crear el canal de avisos (se llama UNA vez tras el
//    deploy, y cuando quieras re-crearlo manualmente)
// ===========================================================================
export const setupcalendarwatch = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const url = process.env.CALENDAR_WEBHOOK_URL;
    if (!url) {
      throw new HttpsError(
        "failed-precondition",
        "Configura CALENDAR_WEBHOOK_URL en functions/.env (la URL de calendarwebhook) y vuelve a desplegar.",
      );
    }
    const info = await createWatchChannel(url);
    return { ok: true, ...info };
  },
);

async function createWatchChannel(
  url: string,
): Promise<{ channelId: string; expiration: string | null }> {
  const calendar = await getCalendarClient();
  const stateRef = db.doc(SYNC_STATE_DOC);
  const stateSnap = await stateRef.get();
  const prev = (stateSnap.exists ? stateSnap.data() : {}) as {
    channelId?: string;
    resourceId?: string;
  };

  // Detener el canal anterior si existe (evita avisos duplicados)
  if (prev.channelId && prev.resourceId) {
    try {
      await calendar.channels.stop({
        requestBody: { id: prev.channelId, resourceId: prev.resourceId },
      });
    } catch (err) {
      const e = err as GoogleApiError;
      logger.warn(
        "No se pudo detener el canal anterior (puede haber expirado):",
        e.message,
      );
    }
  }

  const channelId = crypto.randomUUID();
  const res = await calendar.events.watch({
    calendarId: CALENDAR_ID,
    requestBody: { id: channelId, type: "web_hook", address: url },
  });

  await stateRef.set(
    {
      channelId,
      resourceId: res.data.resourceId || null,
      expiration: res.data.expiration || null,
      watchUrl: url,
      watchCreatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  logger.info(
    `Watch de Calendar creado. Canal ${channelId}, expira ${res.data.expiration}`,
  );
  return { channelId, expiration: res.data.expiration || null };
}

// ===========================================================================
// 4) renewcalendarwatch — renovación diaria automática del canal
// ===========================================================================
export const renewcalendarwatch = onSchedule(
  { schedule: "every 24 hours", region: "us-central1", timeZone: TIMEZONE },
  async () => {
    const stateSnap = await db.doc(SYNC_STATE_DOC).get();
    const url =
      (stateSnap.exists ? (stateSnap.data()?.watchUrl as string) : "") ||
      process.env.CALENDAR_WEBHOOK_URL;
    if (!url) {
      logger.warn(
        "renewcalendarwatch: no hay CALENDAR_WEBHOOK_URL configurada; nada que renovar.",
      );
      return;
    }
    await createWatchChannel(url);
  },
);

// ===========================================================================
// 5) onqualitycheckfinished — email automático del reporte QC
//    Se dispara cuando un doc de quality_checks queda con status "Finished"
//    (el momento en que su PDF/reporte existe). Usa la colección "mail" de la
//    extensión Trigger Email que la app ya utiliza.
// ===========================================================================
export const onqualitycheckfinished = onDocumentWritten(
  { document: "quality_checks/{qcId}", region: "us-central1" },
  async (event) => {
    const afterSnap = event.data?.after;
    const beforeSnap = event.data?.before;
    const after = afterSnap?.exists ? afterSnap.data() : null;
    const before = beforeSnap?.exists ? beforeSnap.data() : null;
    if (!after || !afterSnap) return; // borrado

    // Solo cuando ACABA de quedar Finished (creado ya Finished, o transición)
    const becameFinished =
      after.status === "Finished" && (!before || before.status !== "Finished");
    if (!becameFinished) return;

    // Guardia anti-duplicados: si ya se envió, no repetir
    if (after.reportEmailSentAt) return;

    // Destinatario: .env o, en su defecto, el email de settings_company/main
    let to = (process.env.QC_REPORT_EMAIL || "").trim();
    if (!to) {
      const companySnap = await db.doc("settings_company/main").get();
      to = companySnap.exists
        ? String(companySnap.data()?.email || "").trim()
        : "";
    }
    if (!to) {
      logger.warn(
        "onqualitycheckfinished: sin destinatario (QC_REPORT_EMAIL ni settings_company/main.email).",
      );
      return;
    }

    // Nombre del cliente (after.client puede ser id de customers o el nombre)
    let clientName = String(after.client || "Unknown Client");
    if (after.client) {
      const custSnap = await db
        .doc(`customers/${after.client}`)
        .get()
        .catch(() => null);
      if (custSnap && custSnap.exists) {
        const c = custSnap.data() as {
          name?: string;
          firstName?: string;
          lastName?: string;
        };
        clientName =
          c.name ||
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          clientName;
      }
    }

    const failed = after.result === "failed";
    const badge = failed ?
      "<span style=\"background:#f3e8ff;color:#7c3aed;padding:4px 12px;border-radius:12px;font-weight:700;\">Recall</span>" :
      "<span style=\"background:#dcfce7;color:#166534;padding:4px 12px;border-radius:12px;font-weight:700;\">Passed</span>";

    const row = (label: string, value?: string): string =>
      `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;">${label}</td><td style="padding:6px 12px;color:#0f172a;font-weight:600;font-size:14px;">${value || "—"}</td></tr>`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0f172a;">Quality Check Report ${badge}</h2>
        <table style="border-collapse:collapse;width:100%;background:#f8fafc;border-radius:12px;">
          ${row("Cliente", clientName)}
          ${row("Dirección", after.address)}
          ${row("Equipo", after.team)}
          ${row("Inspector", after.inspector)}
          ${row("Fecha", after.date)}
          ${row("Duración (min)", typeof after.durationMinutes === "number" ? String(after.durationMinutes) : "—")}
        </table>
        <p style="color:#64748b;font-size:13px;margin-top:16px;">
          El PDF completo con áreas, tareas, notas y fotos está disponible en la app,
          pestaña <b>Quality Check → Reportes</b>.
        </p>
      </div>`;

    const subject = `Quality Check Report - ${clientName} (${after.date || ""})${failed ? " · RECALL" : ""}`;

    await db.collection("mail").add({ to, message: { subject, html } });
    await afterSnap.ref.update({ reportEmailSentAt: new Date().toISOString() });
    logger.info(`Reporte QC enviado a ${to} (${clientName}, ${after.date})`);
  },
);
