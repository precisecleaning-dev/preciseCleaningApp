// src/features/houses/services/gcalSync.ts
// Envío de una casa a Google Calendar (botón "Sync" del detalle). Extraído de
// HousesView sin cambiar la lógica:
//   · syncHouseToCalendar(): vía API, Cloud Function `synchousetocalendar`.
//   · manualCalendarUrl(): respaldo manual (plantilla de Google Calendar).
import { callable } from '../../../config/functions';
import type { Property } from '../../../types/index';
import type { GcalVerification } from '../components/GcalVerificationModal';

interface GcalSyncResult {
  ok?: boolean;
  eventId?: string;
  verified?: GcalVerification | null;
}

// ⭐ VÍA API (Cloud Function synchousetocalendar): crea/actualiza el evento
//    y guarda gcalEventId en la casa. Con ese vínculo, las EDICIONES hechas
//    en Google Calendar regresan solas a la app (webhook calendarwebhook).
export async function syncHouseToCalendar(houseId: string, clientName: string): Promise<GcalSyncResult | undefined> {
  const call = await callable('synchousetocalendar');
  const res = (await call({ houseId, clientName })) as { data?: GcalSyncResult };
  return res?.data;
}

// ⭐ El evento SIEMPRE debe crearse en esta cuenta, nunca en otra.
const CALENDAR_ACCOUNT_EMAIL = 'account@precisecleaningtx.com';

// ⭐ Hora "flotante" (local) exacta: respeta Time In y Time Out tal cual, sin
//    convertir a UTC. Google Calendar interpreta YYYYMMDDTHHMMSS (sin 'Z') en la
//    zona horaria del calendario, así que la hora/fecha se mantienen idénticas.
const toMinutes = (t: string): number => {
  const s = String(t || '').trim();
  const ampm = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampm) {
    let h = +ampm[1] % 12;
    if (/PM/i.test(ampm[3])) h += 12;
    return h * 60 + +ampm[2];
  }
  const [hh = '0', mm = '0'] = s.split(':');
  return +hh * 60 + +mm;
};
const shiftDate = (isoDate: string, addDays: number): string => {
  const y = +isoDate.slice(0, 4),
    mo = +isoDate.slice(5, 7),
    d = +isoDate.slice(8, 10);
  const nd = new Date(y, mo - 1, d + addDays);
  return `${nd.getFullYear()}${String(nd.getMonth() + 1).padStart(2, '0')}${String(nd.getDate()).padStart(2, '0')}`;
};
const fmtStamp = (isoDate: string, minutes: number): string => {
  const days = Math.floor(minutes / 1440);
  const mins = ((minutes % 1440) + 1440) % 1440;
  const datePart = days === 0 ? isoDate.replace(/-/g, '') : shiftDate(isoDate, days);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${datePart}T${hh}${mm}00`;
};

/**
 * URL del método MANUAL (plantilla de Google Calendar) cuando la Cloud
 * Function falla. `title` ya viene armado ("Team - Dirección").
 */
export function manualCalendarUrl(house: Property, title: string): string {
  const startMin = toMinutes(house.timeIn);
  // Respeta el Time Out real; si no hay, usa +2h como respaldo.
  let endMin = house.timeOut ? toMinutes(house.timeOut) : startMin + 120;
  if (endMin <= startMin) endMin = startMin + 120; // evita duración cero/negativa
  const startDateTime = fmtStamp(house.scheduleDate, startMin);
  const endDateTime = fmtStamp(house.scheduleDate, endMin);
  // ⭐ Sin invitados automáticos: los correos de los colaboradores ya no se
  //    agregan al evento (pedido del 08/2026).
  const addParam = '';
  const renderUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDateTime}/${endDateTime}&ctz=America/Chicago&details=${encodeURIComponent(house.note || '')}&location=${encodeURIComponent(house.address)}${addParam}&authuser=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}&sf=true&output=xml`;
  // Forzamos el selector de cuenta de Google a ese correo y de ahí continuamos al
  // formulario del evento. Si esa cuenta no está iniciada, Google pedirá entrar con ella,
  // garantizando que el evento nunca se cree bajo otra cuenta.
  return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}&continue=${encodeURIComponent(renderUrl)}`;
}
