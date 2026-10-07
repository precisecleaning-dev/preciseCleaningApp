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

   AUTENTICACIÓN — OAuth de usuario con refresh token
   La cuenta account@precisecleaningtx.com autoriza la app UNA SOLA VEZ desde
   la pantalla de consentimiento normal de Google. El refresh token resultante
   se guarda como secreto y las funciones renuevan solas el access_token.

   Ventajas: NO requiere ser administrador del Workspace, NO requiere llaves
   .json (bloqueadas por política), NO requiere compartir el calendario.

   Secretos necesarios (ver INSTRUCCIONES):
     GCAL_CLIENT_ID · GCAL_CLIENT_SECRET · GCAL_REFRESH_TOKEN
   ============================================================================ */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
// ⭐ Se importa SOLO la API de Calendar (@googleapis/calendar) en vez del
//    paquete "googleapis" completo: este último carga cientos de APIs y hace
//    que el despliegue falle con "Timeout after 10000" al analizar el código.
import { auth as gauth, calendar, calendar_v3 } from "@googleapis/calendar";
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

// ⭐ Credenciales OAuth del usuario dueño del calendario. Se cargan con:
//    firebase functions:secrets:set GCAL_CLIENT_ID
//    firebase functions:secrets:set GCAL_CLIENT_SECRET
//    firebase functions:secrets:set GCAL_REFRESH_TOKEN
const GCAL_CLIENT_ID = defineSecret("GCAL_CLIENT_ID");
const GCAL_CLIENT_SECRET = defineSecret("GCAL_CLIENT_SECRET");
const GCAL_REFRESH_TOKEN = defineSecret("GCAL_REFRESH_TOKEN");

// ⭐ Credenciales SMTP para el envío de correo (ver función sendmailqueue).
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_USER = defineSecret("SMTP_USER");
const SMTP_PASS = defineSecret("SMTP_PASS");
const SMTP_FROM = defineSecret("SMTP_FROM");

// URI de redirección usado al obtener el refresh token (OAuth Playground).
// Debe COINCIDIR con el que se registró en el cliente OAuth.
const OAUTH_REDIRECT =
  process.env.GCAL_REDIRECT_URI ||
  "https://developers.google.com/oauthplayground";

// Error de la API de Google (para leer .code y .message sin usar any)
type GoogleApiError = { code?: number; message?: string };

/**
 * Cliente de Calendar autenticado COMO el usuario que dio el consentimiento.
 * googleapis renueva el access_token automáticamente con el refresh token, así
 * que no hay que gestionar caducidades a mano.
 */
async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const clientId = GCAL_CLIENT_ID.value();
  const clientSecret = GCAL_CLIENT_SECRET.value();
  const refreshToken = GCAL_REFRESH_TOKEN.value();

  const faltantes: string[] = [];
  if (!clientId) faltantes.push("GCAL_CLIENT_ID");
  if (!clientSecret) faltantes.push("GCAL_CLIENT_SECRET");
  if (!refreshToken) faltantes.push("GCAL_REFRESH_TOKEN");
  if (faltantes.length) {
    // ⭐ HttpsError (no Error): un Error normal llega a la app como
    //    "internal" SIN mensaje; con HttpsError la app muestra el motivo real.
    throw new HttpsError(
      "failed-precondition",
      `Faltan secretos: ${faltantes.join(", ")}. Cárgalos con: firebase functions:secrets:set <NOMBRE>`,
    );
  }

  const oauth = new gauth.OAuth2(clientId, clientSecret, OAUTH_REDIRECT);
  oauth.setCredentials({ refresh_token: refreshToken });

  // Validación temprana: si el refresh token fue revocado, avisa con claridad
  try {
    await oauth.getAccessToken();
  } catch (err) {
    const e = err as GoogleApiError;
    // ⭐ HttpsError con el motivo real (antes llegaba como "internal" mudo).
    //    Causa típica: `invalid_grant` = el refresh token CADUCÓ o fue
    //    revocado. Si la pantalla de consentimiento OAuth está en modo
    //    "Testing", Google caduca los refresh tokens A LOS 7 DÍAS: publicar
    //    la app OAuth en "In production" elimina esa caducidad.
    throw new HttpsError(
      "failed-precondition",
      `No se pudo renovar el acceso a Google Calendar (${e.message || String(err)}). ` +
        "Si el mensaje dice invalid_grant, el refresh token caducó o fue revocado: " +
        "genera uno nuevo en OAuth Playground y recárgalo con firebase functions:secrets:set GCAL_REFRESH_TOKEN, " +
        "y publica la pantalla OAuth en 'In production' para que no caduque cada 7 días.",
    );
  }

  return calendar({ version: "v3", auth: oauth });
}

// Secretos que necesitan las funciones que hablan con Calendar
const CALENDAR_SECRETS = [
  GCAL_CLIENT_ID,
  GCAL_CLIENT_SECRET,
  GCAL_REFRESH_TOKEN,
];

// ---------------------------------------------------------------------------
// Helpers de fecha/hora
// ---------------------------------------------------------------------------
// "09:00" | "9:00 AM" | "09:00:00" -> minutos desde medianoche.
// ⭐ Devuelve null si el valor no es una hora válida: antes un valor raro
//    producía "NaN:NaN" y Google rechazaba el evento con un error críptico.
function timeToMinutes(t: string): number | null {
  const s = String(t || "").trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  let h: number;
  let m: number;
  if (ampm) {
    h = Number(ampm[1]);
    m = Number(ampm[2]);
    if (h < 1 || h > 12) return null;
    h = h % 12;
    if (/PM/i.test(ampm[3])) h += 12;
  } else {
    const plain = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!plain) return null;
    h = Number(plain[1]);
    m = Number(plain[2]);
  }
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

// "2026-10-07" | "10/7/2026" -> "YYYY-MM-DD" (null si no es una fecha válida).
// Los datos migrados de AppSheet pueden traer el formato M/D/YYYY.
function normalizeDate(d: string): string | null {
  const s = String(d || "").trim();
  let y: number;
  let mo: number;
  let day: number;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) {
    [y, mo, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (us) {
    [y, mo, day] = [Number(us[3]), Number(us[1]), Number(us[2])];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, mo - 1, day));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null; // 2026-02-31 y similares
  }
  return dt.toISOString().slice(0, 10);
}

// Fecha base + minutos (pueden pasar de 1440) -> "YYYY-MM-DDTHH:MM:00" local.
// ⭐ Cruza la medianoche correctamente: antes un Time In de 23:30 sin Time Out
//    generaba un evento de duración CERO (fin topado a las 23:xx del mismo día).
function localDateTime(isoDate: string, minutes: number): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d) + minutes * 60000);
  return dt.toISOString().slice(0, 16) + ":00";
}

// ¿El error de la API de Google es "el evento no existe"?
function isGoneError(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number };
  const code = Number(e?.code ?? e?.status);
  return code === 404 || code === 410;
}

// Google Calendar web guarda la descripción como HTML cuando se edita desde
// el navegador (<br>, <b>, &amp;…). La nota de la casa es texto plano.
function htmlToPlainText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ⭐ El htmlLink de la API abre el evento con la cuenta de Google POR DEFECTO
//    del navegador. Si esa cuenta no es la dueña del calendario, Google muestra
//    "Could not find the requested event". authuser fuerza la cuenta correcta.
function withCalendarAccount(htmlLink: string | null | undefined): string {
  if (!htmlLink) return "";
  const sep = htmlLink.includes("?") ? "&" : "?";
  return `${htmlLink}${sep}authuser=${encodeURIComponent(CALENDAR_ID)}`;
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
// Colores de EVENTO de Google Calendar. La API solo acepta estos 11 colorId;
// no se puede mandar un hex arbitrario. El color del equipo (hex, definido en
// la app en settings_teams) se traduce al colorId MÁS CERCANO por distancia
// RGB, así cada equipo pinta sus eventos de "su" color en el calendario.
// ===========================================================================
// La API REST exige mandar `conferenceData: null` para QUITAR/evitar el Meet,
// pero el tipado de @googleapis/calendar no admite null en ese campo: se
// fuerza con este cast puntual (el JSON que viaja sí lleva null).
const NO_CONFERENCE = null as unknown as calendar_v3.Schema$ConferenceData;

const GCAL_EVENT_COLORS: Array<{ id: string; hex: string }> = [
  { id: "1", hex: "#7986cb" }, // Lavender
  { id: "2", hex: "#33b679" }, // Sage
  { id: "3", hex: "#8e24aa" }, // Grape
  { id: "4", hex: "#e67c73" }, // Flamingo
  { id: "5", hex: "#f6c026" }, // Banana
  { id: "6", hex: "#f5511d" }, // Tangerine
  { id: "7", hex: "#039be5" }, // Peacock
  { id: "8", hex: "#616161" }, // Graphite
  { id: "9", hex: "#3f51b5" }, // Blueberry
  { id: "10", hex: "#0b8043" }, // Basil
  { id: "11", hex: "#d60000" }, // Tomato
];

// Nombres CSS que pueden venir en equipos migrados de AppSheet (el editor de
// la app guarda hex #rrggbb, pero los datos viejos pueden traer nombres).
const CSS_COLOR_NAMES: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000",
  blue: "#0000ff", yellow: "#ffff00", orange: "#ffa500", purple: "#800080",
  pink: "#ffc0cb", brown: "#a52a2a", gray: "#808080", grey: "#808080",
  teal: "#008080", navy: "#000080", olive: "#808000", maroon: "#800000",
  lime: "#00ff00", cyan: "#00ffff", magenta: "#ff00ff", gold: "#ffd700",
};

function hexToRgb(color: string): [number, number, number] | null {
  let c = String(color || "").trim().toLowerCase();
  if (CSS_COLOR_NAMES[c]) c = CSS_COLOR_NAMES[c];
  // #rgb corto -> #rrggbb
  const short = c.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) c = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const m = c.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function nearestGcalColorId(teamHex?: string): string | undefined {
  const rgb = teamHex ? hexToRgb(teamHex) : null;
  if (!rgb) return undefined;
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of GCAL_EVENT_COLORS) {
    const p = hexToRgb(c.hex);
    if (!p) continue;
    const d =
      (rgb[0] - p[0]) ** 2 + (rgb[1] - p[1]) ** 2 + (rgb[2] - p[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c.id;
    }
  }
  return best;
}

// Quita la videoconferencia de Meet que el calendario agrega solo cuando el
// dueño tiene activada la opción "agregar Meet automáticamente" y el evento
// lleva invitados. `conferenceData: null` + conferenceDataVersion 1 la borra.
async function stripAutoMeet(
  gcal: calendar_v3.Calendar,
  eventId: string | null | undefined,
  ev: calendar_v3.Schema$Event | undefined,
): Promise<void> {
  if (!eventId || !ev?.conferenceData) return;
  try {
    await gcal.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      conferenceDataVersion: 1,
      requestBody: { conferenceData: NO_CONFERENCE },
    });
  } catch (err) {
    // No es fatal: el evento queda creado, solo con el Meet que Google agrego.
    logger.warn("No se pudo quitar el Meet automatico:", err);
  }
}

// ===========================================================================
// 1) synchousetocalendar — botón "Sync" de la app
//    data: { houseId, clientName }
// ===========================================================================
// ============================================================================
// ⭐ DIAGNÓSTICO DEL CALENDARIO — prueba cada capa y reporta cuál falla,
//    con el mensaje real. Nunca lanza: siempre devuelve el reporte completo.
//    Se consume desde el panel "Pruebas de Cloud Functions" de la app.
// ============================================================================
export const calendardiagnostics = onCall(
  { region: "us-central1", secrets: CALENDAR_SECRETS },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }
    const steps: { name: string; ok: boolean; detail: string }[] = [];

    // 1) Secretos presentes
    try {
      const missing = [
        ["GCAL_CLIENT_ID", GCAL_CLIENT_ID.value()],
        ["GCAL_CLIENT_SECRET", GCAL_CLIENT_SECRET.value()],
        ["GCAL_REFRESH_TOKEN", GCAL_REFRESH_TOKEN.value()],
      ].filter(([, v]) => !v).map(([n]) => n);
      steps.push({
        name: "Secretos",
        ok: missing.length === 0,
        detail: missing.length ? `Faltan: ${missing.join(", ")}` : "Los 3 presentes",
      });
    } catch (e) {
      steps.push({ name: "Secretos", ok: false, detail: String((e as Error).message || e) });
    }

    // 2) Renovar el access token con el refresh token (aquí cae invalid_grant)
    let calendar: calendar_v3.Calendar | null = null;
    try {
      calendar = await getCalendarClient();
      steps.push({ name: "Refresh token", ok: true, detail: "Acceso renovado ✓" });
    } catch (e) {
      const msg = String((e as { message?: string }).message || e);
      steps.push({
        name: "Refresh token",
        ok: false,
        detail: msg.includes("invalid_grant")
          ? "invalid_grant → el token CADUCÓ/fue revocado. Genera uno nuevo (OAuth Playground) y publica la app OAuth en 'In production' para que no caduque cada 7 días."
          : msg,
      });
    }

    // 3) Leer el calendario (permisos + calendarId correctos)
    if (calendar) {
      try {
        const r = await calendar.events.list({ calendarId: CALENDAR_ID, maxResults: 1 });
        steps.push({
          name: "Lectura del calendario",
          ok: true,
          detail: `OK (${r.data.items?.length ?? 0} evento(s) leídos de prueba)`,
        });
      } catch (e) {
        steps.push({ name: "Lectura del calendario", ok: false, detail: String((e as { message?: string }).message || e) });
      }
    } else {
      steps.push({ name: "Lectura del calendario", ok: false, detail: "Omitido: sin acceso (paso anterior falló)" });
    }

    // 4) Canal de avisos (watch): sin él, las ediciones hechas en Google
    //    Calendar no regresan a la app.
    try {
      const st = (await db.doc(SYNC_STATE_DOC).get()).data() || {};
      const exp = Number(st.expiration || 0);
      const ok = !!st.channelId && exp > Date.now();
      steps.push({
        name: "Watch (Calendar → app)",
        ok,
        detail: !st.channelId
          ? "No hay canal activo: pulsa 'Activar watch del calendario'."
          : ok
            ? `Canal ${st.channelId} vigente hasta ${new Date(exp).toISOString()}`
            : `El canal ${st.channelId} EXPIRÓ: pulsa 'Activar watch' (y revisa que renewcalendarwatch esté desplegada).`,
      });
    } catch (e) {
      steps.push({ name: "Watch (Calendar → app)", ok: false, detail: String((e as Error).message || e) });
    }

    return { ok: steps.every((s) => s.ok), steps };
  },
);

export const synchousetocalendar = onCall(
  { region: "us-central1", secrets: CALENDAR_SECRETS },
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
      teamId?: string;
      assignedWorkers?: string[];
    };
    if (!house.scheduleDate || !house.timeIn) {
      throw new HttpsError(
        "failed-precondition",
        "La casa necesita Schedule Date y Time In para sincronizar.",
      );
    }

    const scheduleDate = normalizeDate(house.scheduleDate);
    if (!scheduleDate) {
      throw new HttpsError(
        "invalid-argument",
        `Schedule Date no es una fecha válida: "${house.scheduleDate}".`,
      );
    }
    const startMin = timeToMinutes(house.timeIn);
    if (startMin === null) {
      throw new HttpsError(
        "invalid-argument",
        `Time In no es una hora válida: "${house.timeIn}".`,
      );
    }
    let endMin = house.timeOut ? timeToMinutes(house.timeOut) : null;
    // Respaldo +2h si no hay Time Out (o es inválido) o la duración quedaría
    // cero/negativa. Puede cruzar la medianoche: localDateTime lo resuelve.
    if (endMin === null || endMin <= startMin) endMin = startMin + 120;

    // ⭐ (1) TEAM asignado → título, y (2) su color → color del evento.
    //    El color se define en la app (Settings → Teams) y aquí se traduce
    //    al colorId de Google más parecido.
    let teamName = "";
    let teamColorId: string | undefined;
    if (house.teamId) {
      const teamSnap = await db.doc(`settings_teams/${house.teamId}`).get();
      if (teamSnap.exists) {
        const team = teamSnap.data() as { name?: string; color?: string };
        teamName = (team.name || "").trim();
        teamColorId = nearestGcalColorId(team.color);
      }
    }

    // ⭐ SIN invitados automáticos (pedido del 08/2026): los correos de los
    //    colaboradores YA NO se agregan al evento. Se manda `attendees: []`
    //    para además LIMPIAR los invitados de eventos creados por la versión
    //    anterior al re-sincronizarlos.

    // Título: "Team - Dirección". Sin equipo asignado se mantiene el formato
    // anterior con el cliente para no dejar eventos sin identificar.
    const summaryBase =
      house.address || clientName || "Precise Cleaning";
    const event: calendar_v3.Schema$Event = {
      summary: teamName
        ? `${teamName} - ${summaryBase}`
        : `Cleaning: ${summaryBase}`,
      ...(teamColorId ? { colorId: teamColorId } : {}),
      attendees: [],
      // ⭐ (3) Sin Google Meet: se pide explícitamente sin videoconferencia
      //    (ver también stripAutoMeet para el caso en que el calendario la
      //    agregue solo por configuración del dueño).
      conferenceData: NO_CONFERENCE,
      // ⭐ Sin notificación: useDefault=false y sin overrides quita tanto el
      //    recordatorio automático del calendario (30/10 min) como cualquiera
      //    heredado del evento anterior.
      reminders: { useDefault: false, overrides: [] },
      location: house.address || "",
      description: house.note || "",
      start: {
        dateTime: localDateTime(scheduleDate, startMin),
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: localDateTime(scheduleDate, endMin),
        timeZone: TIMEZONE,
      },
      // ⭐ El vínculo evento <-> casa viaja DENTRO del evento: el webhook lo usa
      //    para saber qué documento actualizar cuando el evento se edite.
      extendedProperties: { private: { houseId } },
    };

    let calendar: calendar_v3.Calendar;
    try {
      calendar = await getCalendarClient();
    } catch (err) {
      // getCalendarClient ya lanza HttpsError con el motivo real: se respeta
      // su código (failed-precondition) en vez de convertirlo en "internal".
      if (err instanceof HttpsError) throw err;
      const e = err as GoogleApiError;
      logger.error("No se pudo autenticar con Google Calendar:", err);
      throw new HttpsError(
        "internal",
        `Autenticación con Google Calendar fallida: ${e.message || String(err)}`,
      );
    }
    let eventId: string | null | undefined = house.gcalEventId || null;

    // ⭐ GUARDIA: verificar que el evento guardado exista, siga ACTIVO y
    //    pertenezca a ESTA casa.
    //    a) Casas duplicadas heredaban el gcalEventId del original; al
    //       sincronizar la copia se PARCHABA el evento de la otra casa. Cada
    //       evento lleva sellado su houseId; si no coincide, se crea uno nuevo.
    //    b) ⭐ Evento BORRADO en Google Calendar: la API NO responde 404, sino
    //       que devuelve el evento con status "cancelled". Antes se parchaba ese
    //       evento borrado, la app decía "Evento creado/actualizado" y en el
    //       calendario no aparecía nada ("Could not find the requested event").
    //    c) Solo un 404/410 real significa "no existe". Cualquier otro error
    //       (red, permisos, cuota) se reporta: antes se tragaba y se creaba un
    //       evento NUEVO, dejando el viejo duplicado en el calendario.
    if (eventId) {
      try {
        const existing = await calendar.events.get({
          calendarId: CALENDAR_ID,
          eventId,
        });
        const ownerHouseId = existing.data.extendedProperties?.private?.houseId;
        if (existing.data.status === "cancelled") {
          logger.info(
            `gcalEventId ${eventId} fue borrado en Google Calendar: se creará uno nuevo para ${houseId}.`,
          );
          eventId = null;
        } else if (ownerHouseId && ownerHouseId !== houseId) {
          logger.warn(
            `gcalEventId ${eventId} pertenece a la casa ${ownerHouseId}, no a ${houseId}: se creará un evento propio.`,
          );
          eventId = null;
        }
      } catch (err) {
        if (isGoneError(err)) {
          eventId = null; // ya no existe: el flujo de abajo crea uno nuevo
        } else {
          const e = err as GoogleApiError;
          logger.error("No se pudo leer el evento vinculado:", err);
          throw new HttpsError(
            "unavailable",
            `No se pudo verificar el evento actual en Google Calendar (${e.message || String(err)}). Intenta de nuevo.`,
          );
        }
      }
    }

    // conferenceDataVersion=1: obligatorio para que Google respete el
    // `conferenceData: null` (sin Meet). sendUpdates="none": sin correos.
    const insertEvent = async (): Promise<string | null | undefined> => {
      const res = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        conferenceDataVersion: 1,
        sendUpdates: "none",
        requestBody: event,
      });
      await stripAutoMeet(calendar, res.data.id, res.data);
      return res.data.id;
    };

    try {
      if (eventId) {
        // Ya existía: actualizar el mismo evento
        const res = await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId,
          conferenceDataVersion: 1,
          sendUpdates: "none",
          requestBody: event,
        });
        await stripAutoMeet(calendar, eventId, res.data);
      } else {
        eventId = await insertEvent();
      }
    } catch (err) {
      try {
        // Si el evento lo borraron justo entre la guardia y el patch, crear
        // uno nuevo en lugar de fallar.
        if (eventId && isGoneError(err)) {
          eventId = await insertEvent();
        } else {
          throw err;
        }
      } catch (err2) {
        // ⭐ Todo error sale como HttpsError con el mensaje de Google: un
        //    error crudo llega a la app como "internal" sin explicación.
        const e = err2 as GoogleApiError;
        logger.error("Error sincronizando con Calendar:", err2);
        throw new HttpsError(
          "internal",
          `Google Calendar rechazó la operación: ${e.message || String(err2)}`,
        );
      }
    }

    if (!eventId) {
      throw new HttpsError(
        "internal",
        "Google Calendar no devolvió el ID del evento creado.",
      );
    }

    await houseRef.update({
      gcalEventId: eventId,
      gcalSyncedAt: new Date().toISOString(),
    });

    // ⭐ VERIFICACIÓN: se relee el evento tal como quedó GUARDADO en Google
    //    (no lo que se envió) y se devuelve a la app para que el usuario
    //    pueda rectificar título, color, invitados y que el Meet quedó fuera,
    //    con el enlace directo al evento en el calendario.
    let saved: calendar_v3.Schema$Event | undefined;
    try {
      const check = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId,
      });
      saved = check.data;
    } catch (err) {
      logger.warn("No se pudo releer el evento para verificación:", err);
    }
    if (saved?.status === "cancelled") {
      // No debería pasar tras la guardia, pero si pasa NO se reporta éxito.
      throw new HttpsError(
        "aborted",
        "El evento quedó como BORRADO en Google Calendar. Vuelve a sincronizar.",
      );
    }

    return {
      ok: true,
      eventId,
      htmlLink: withCalendarAccount(saved?.htmlLink),
      verified: saved
        ? {
            summary: saved.summary || "",
            htmlLink: withCalendarAccount(saved.htmlLink),
            colorId: saved.colorId || "",
            start: saved.start?.dateTime || saved.start?.date || "",
            end: saved.end?.dateTime || saved.end?.date || "",
            location: saved.location || "",
            meetRemoved: !saved.conferenceData,
            remindersOff:
              saved.reminders?.useDefault === false &&
              (saved.reminders?.overrides || []).length === 0,
          }
        : null,
    };
  },
);

// ===========================================================================
// 2) calendarwebhook — Google avisa aquí cuando algo cambia en el calendario
// ===========================================================================
export const calendarwebhook = onRequest(
  { region: "us-central1", secrets: CALENDAR_SECRETS },
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

    // ⭐ Solo se atiende el canal VIGENTE. La URL es pública: sin esta
    //    comprobación cualquiera (o un canal viejo que no se pudo detener al
    //    renovar) dispararía sincronizaciones en paralelo.
    try {
      const current = (await db.doc(SYNC_STATE_DOC).get()).data()?.channelId;
      if (current && channelId !== current) {
        logger.warn(`Aviso de un canal no vigente (${channelId}); ignorado.`);
        res.status(200).send("ignored");
        return;
      }
    } catch (err) {
      logger.warn("No se pudo validar el canal del webhook:", err);
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
  const fullSyncTimeMin = new Date(Date.now() - 60 * 86400000).toISOString();

  try {
    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: CALENDAR_ID,
        pageToken: pageToken || undefined,
        // ⭐ Mismos parámetros en la sincronización completa y en las
        //    incrementales (Google lo exige para que el syncToken sea
        //    coherente). Antes singleEvents solo iba en la primera.
        singleEvents: true,
        // ⭐ Las horas vuelven SIEMPRE en hora de Texas. Sin esto llegan en la
        //    zona horaria configurada en la cuenta de Google; si esa no es
        //    America/Chicago, la casa se actualizaba con la hora corrida.
        timeZone: TIMEZONE,
      };
      // El syncToken va en TODAS las páginas: Google lo exige mientras se
      // pagina (antes solo iba en la primera página).
      if (syncToken) params.syncToken = syncToken;
      // Primera vez (o token inválido): mirar solo los últimos 60 días
      if (!syncToken) params.timeMin = fullSyncTimeMin;
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
    // En los eventos borrados Google a veces omite extendedProperties: en ese
    // caso se busca la casa por su gcalEventId.
    let houseId = ev.extendedProperties?.private?.houseId;
    if (!houseId && ev.status === "cancelled" && ev.id) {
      const q = await db
        .collection("properties")
        .where("gcalEventId", "==", ev.id)
        .limit(1)
        .get();
      houseId = q.empty ? undefined : q.docs[0].id;
    }
    if (!houseId || !ev.id) continue;

    const houseRef = db.doc(`properties/${houseId}`);
    const houseSnap = await houseRef.get();
    if (!houseSnap.exists) {
      logger.info(`Evento ${ev.id} apunta a la casa ${houseId}, que ya no existe; ignorado.`);
      continue;
    }

    // ⭐ PROPIEDAD DEL VÍNCULO: solo el evento ACTUAL de la casa puede
    //    modificarla. Un evento viejo (de antes de re-crearlo, o el de la casa
    //    original en un duplicado) ya no manda: antes, editar o borrar ese
    //    evento viejo pisaba la fecha/hora de la casa o le quitaba el vínculo
    //    al evento nuevo recién creado.
    const linkedEventId = houseSnap.data()?.gcalEventId as string | undefined;
    if (linkedEventId !== ev.id) {
      logger.info(
        `Evento ${ev.id} no es el vinculado a la casa ${houseId} (${linkedEventId || "sin vínculo"}); ignorado.`,
      );
      continue;
    }

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
      gcalSyncedAt: new Date().toISOString(),
    };
    if (start.date) update.scheduleDate = start.date;
    if (start.time) update.timeIn = start.time;
    // Time Out solo si el evento termina el MISMO día (la casa no guarda fecha
    // de salida; un fin al día siguiente no se puede representar).
    if (end.time && end.date === start.date) update.timeOut = end.time;
    if (typeof ev.location === "string") update.address = ev.location;
    if (typeof ev.description === "string") {
      update.note = htmlToPlainText(ev.description);
    }

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
  { region: "us-central1", secrets: CALENDAR_SECRETS },
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
    // ⭐ Se devuelve el MOTIVO real al cliente: sin esto Firebase responde solo
    //    "internal" y hay que ir a los logs para saber qué pasó.
    try {
      const info = await createWatchChannel(url);
      return { ok: true, ...info };
    } catch (err) {
      const e = err as GoogleApiError;
      logger.error("setupcalendarwatch falló:", err);
      throw new HttpsError(
        "internal",
        `No se pudo crear el watch: ${e.message || String(err)}`,
      );
    }
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
  {
    schedule: "every 24 hours",
    region: "us-central1",
    timeZone: TIMEZONE,
    secrets: CALENDAR_SECRETS,
  },
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

// ============================================================================
// 6) sendmailqueue — ENVÍO REAL DE CORREO
// ----------------------------------------------------------------------------
// Reemplaza a la extensión "Trigger Email from Firestore".
//
// POR QUÉ EXISTE:
//   Toda la app "envía" correos escribiendo en la colección `mail`. Ese diseño
//   asume que hay algo escuchando esa colección — la extensión. Sin ella los
//   documentos se guardaban y nadie los despachaba: la app decía "enviado" y no
//   llegaba nada.
//
//   Esta función hace exactamente lo mismo que la extensión, incluido escribir
//   el resultado en el campo `delivery` con el MISMO formato. Por eso NO hay que
//   tocar una sola línea del cliente: `sendMailAndConfirm` sigue funcionando
//   igual, y si algún día se instala la extensión, basta con borrar esta función.
//
// IDEMPOTENCIA:
//   Si el documento ya trae `delivery`, se ignora. Evita reenvíos cuando la
//   función se reintenta (Firestore garantiza "al menos una vez", no "una sola
//   vez": sin este candado un fallo transitorio duplicaría el correo).
// ============================================================================
export const sendmailqueue = onDocumentCreated(
  {
    document: "mail/{mailId}",
    region: "us-central1",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as {
      to?: string | string[];
      message?: { subject?: string; html?: string; text?: string };
      delivery?: unknown;
    };

    if (data.delivery) return; // ya procesado
    const to = data.to;
    const subject = data.message?.subject;
    const html = data.message?.html;
    if (!to || (!html && !data.message?.text)) {
      await snap.ref.update({
        delivery: {
          state: "ERROR",
          error: "El documento no tiene destinatario o cuerpo del mensaje.",
          endTime: new Date().toISOString(),
        },
      });
      return;
    }

    await snap.ref.update({
      delivery: { state: "PROCESSING", startTime: new Date().toISOString() },
    });

    try {
      // Import dinámico: nodemailer solo se carga cuando llega un correo, así el
      // análisis de despliegue de las OTRAS funciones no se hace más lento.
      const nodemailer = await import("nodemailer");

      const port = Number(SMTP_PORT.value() || "465");
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port,
        // 465 = SSL implícito; 587 = STARTTLS. Deducirlo del puerto evita un
        // secreto más y es el error de configuración más común.
        secure: port === 465,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
      });

      const info = await transporter.sendMail({
        from: SMTP_FROM.value() || SMTP_USER.value(),
        to: Array.isArray(to) ? to.join(",") : to,
        subject: subject || "(sin asunto)",
        html,
        text: data.message?.text,
      });

      await snap.ref.update({
        delivery: {
          state: "SUCCESS",
          endTime: new Date().toISOString(),
          info: { messageId: info.messageId, accepted: info.accepted },
        },
      });
      logger.info(`Correo enviado a ${String(to)} — ${subject}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // El error se guarda EN EL DOCUMENTO, no solo en los logs: así la app se
      // lo muestra al usuario y no hay que entrar a la consola para saber que
      // fallaron las credenciales SMTP.
      await snap.ref.update({
        delivery: { state: "ERROR", error: message, endTime: new Date().toISOString() },
      });
      logger.error(`Error enviando correo a ${String(to)}: ${message}`);
    }
  },
);