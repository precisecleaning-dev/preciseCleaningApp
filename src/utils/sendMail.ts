// src/utils/sendMail.ts
//
// ============================================================================
// ⭐ ENVÍO DE CORREO CON CONFIRMACIÓN REAL
//
// EL PROBLEMA QUE RESUELVE:
//   La app "envía" correos escribiendo un documento en la colección `mail`.
//   Quien realmente los despacha es la extensión de Firebase **Trigger Email
//   (firestore-send-email)**, que se instala en la consola del proyecto — no
//   vive en este repositorio.
//
//   Si esa extensión NO está instalada (o está mal configurada), el `addDoc`
//   igual funciona: el documento se guarda sin problema. El código lo tomaba
//   como éxito y mostraba "📧 Reporte enviado", pero el correo nunca salía.
//   El usuario recibía una confirmación falsa y esperaba un email que no
//   existía.
//
// CÓMO SE VERIFICA DE VERDAD:
//   La extensión escribe su resultado EN EL MISMO documento, en un campo
//   `delivery`:
//       delivery.state = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR'
//   Aquí se observa ese campo durante unos segundos y se informa lo que
//   realmente pasó. Si el campo nunca aparece, es la señal inequívoca de que
//   no hay extensión escuchando.
// ============================================================================

import { collection, addDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export type MailResult =
  /** La extensión confirmó la entrega. */
  | { status: 'sent' }
  /** La extensión lo tomó y sigue procesando (SMTP lento). Va a llegar. */
  | { status: 'processing' }
  /** La extensión existe pero falló (credenciales SMTP, remitente inválido…). */
  | { status: 'error'; message: string }
  /** Nadie tocó el documento: la extensión no está instalada o no escucha. */
  | { status: 'no-extension' };

/** Cuánto se espera la confirmación. 12 s cubre de sobra un envío SMTP normal
 *  sin dejar al usuario mirando un spinner eterno si algo está roto. */
const CONFIRM_TIMEOUT_MS = 12000;

/**
 * Encola un correo y espera la confirmación de la extensión.
 *
 * Nunca lanza por el resultado del envío: devuelve el estado para que la vista
 * decida qué mensaje mostrar. Sí puede lanzar si falla la ESCRITURA en
 * Firestore (permisos, sin conexión), que es un problema distinto.
 */
export const sendMailAndConfirm = async (
  to: string,
  subject: string,
  html: string,
): Promise<MailResult> => {
  const ref = await addDoc(collection(db, 'mail'), { to, message: { subject, html } });

  return new Promise<MailResult>((resolve) => {
    let done = false;
    const finish = (r: MailResult) => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(timer);
      resolve(r);
    };

    const unsub = onSnapshot(
      doc(db, 'mail', ref.id),
      (snap) => {
        const delivery = snap.data()?.delivery as
          | { state?: string; error?: string; info?: unknown }
          | undefined;
        if (!delivery?.state) return; // aún nadie lo ha tocado
        if (delivery.state === 'SUCCESS') finish({ status: 'sent' });
        else if (delivery.state === 'ERROR') {
          finish({ status: 'error', message: String(delivery.error || 'Error desconocido') });
        }
        // PENDING / PROCESSING: se sigue esperando hasta el timeout.
      },
      (err) => {
        // No poder LEER el estado no significa que no se haya enviado: la
        // escritura ya ocurrió. Se informa como "procesando" para no alarmar.
        console.error('No se pudo leer el estado del correo:', err);
        finish({ status: 'processing' });
      },
    );

    const timer = setTimeout(() => {
      // Sin campo `delivery` tras 12 s: la extensión no está escuchando.
      finish({ status: 'no-extension' });
    }, CONFIRM_TIMEOUT_MS);
  });
};

/**
 * Texto para mostrarle al usuario según el resultado. Se centraliza aquí para
 * que todas las vistas expliquen lo mismo — sobre todo el caso 'no-extension',
 * que necesita instrucciones concretas y no un "algo salió mal".
 */
export const mailResultMessage = (result: MailResult, to: string): string => {
  switch (result.status) {
    case 'sent':
      return `📧 Reporte enviado a ${to}.`;
    case 'processing':
      return `📧 Reporte en cola para ${to}. Debería llegar en unos minutos.`;
    case 'error':
      return `⚠️ El servidor de correo rechazó el envío:\n\n${result.message}\n\n`
        + 'Revisa la configuración SMTP de la extensión Trigger Email en la consola de Firebase.';
    case 'no-extension':
      return 'El correo quedó guardado, pero NO se envió.\n\n'
        + 'Falta instalar la extensión "Trigger Email from Firestore" en el proyecto de Firebase '
        + '(Firebase Console → Extensions), configurada con la colección "mail".\n\n'
        + 'Sin esa extensión ningún correo de la app sale, incluido el envío automático al '
        + 'terminar una inspección.';
  }
};
