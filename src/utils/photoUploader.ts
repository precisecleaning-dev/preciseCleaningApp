// ============================================================================
// ⭐ MOTOR DE SUBIDA DE FOTOS — confiable, rápido y con progreso visible.
//
// La carga de fotos es la evidencia del trabajo: NO PUEDE FALLAR. Este motor
// reemplaza al `uploadBytes` simple con cuatro mejoras concretas:
//
//   1. PROGRESO REAL: usa `uploadBytesResumable`, que reporta bytes subidos.
//      La UI puede mostrar una barra "Subiendo fotos 3/8 · 42%".
//   2. REINTENTOS AUTOMÁTICOS: cada foto se intenta hasta 3 veces con espera
//      creciente (0.8s, 2s). Un parpadeo de señal ya no pierde la foto.
//   3. VIGILANTE DE ESTANCAMIENTO: si una subida pasa 45 s sin avanzar un
//      byte (típico al perder señal a mitad de subida), se cancela y se
//      reintenta, en vez de quedarse "cargando" para siempre.
//   4. CONCURRENCIA LIMITADA (3 a la vez): subir 10 fotos a la vez satura la
//      conexión del teléfono y TODAS avanzan lento; de 3 en 3 el total
//      termina antes y el progreso se mueve de forma visible.
//
// Cada foto reporta su avance individual; el agregado (porcentaje global,
// hechas/total) se calcula aquí y se entrega listo para pintar.
// ============================================================================
import { storage } from '../config/firebase';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';

export interface UploadProgress {
  /** Fotos ya terminadas (subida + URL obtenida). */
  done: number;
  /** Total de fotos del lote. */
  total: number;
  /** Porcentaje global 0-100 calculado por BYTES (no por conteo): la barra
   *  avanza suave aunque haya fotos grandes y pequeñas mezcladas. */
  percent: number;
}

interface UploadTask {
  file: File;
  fullPath: string;
}

const ATTEMPTS = 3;
const BACKOFF_MS = [800, 2000];
const STALL_TIMEOUT_MS = 45_000;
const CONCURRENCY = 3;

/** Sube UN archivo con reintentos y vigilante de estancamiento.
 *  onBytes recibe los bytes transferidos acumulados de este archivo. */
const uploadOneWithRetry = async (
  task: UploadTask,
  onBytes: (transferred: number) => void,
): Promise<string> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const storageRef = ref(storage, task.fullPath);
      const url = await new Promise<string>((resolve, reject) => {
        const up = uploadBytesResumable(storageRef, task.file, {
          contentType: task.file.type || 'image/jpeg',
        });

        // Vigilante: si no avanza en STALL_TIMEOUT_MS, se cancela (→ reintento).
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        const armStall = () => {
          if (stallTimer) clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
            try {
              up.cancel();
            } catch {
              /* ya terminada */
            }
          }, STALL_TIMEOUT_MS);
        };
        armStall();

        up.on(
          'state_changed',
          (snap) => {
            onBytes(snap.bytesTransferred);
            armStall();
          },
          (err) => {
            if (stallTimer) clearTimeout(stallTimer);
            reject(err);
          },
          async () => {
            if (stallTimer) clearTimeout(stallTimer);
            try {
              resolve(await getDownloadURL(storageRef));
            } catch (err) {
              reject(err);
            }
          },
        );
      });
      return url;
    } catch (err) {
      lastError = err;
      const code = String((err as { code?: string })?.code || '');
      // Errores PERMANENTES: reintentar no ayuda (permisos, cuota, app config).
      if (
        code === 'storage/unauthorized' ||
        code === 'storage/quota-exceeded' ||
        code === 'storage/invalid-argument' ||
        code === 'storage/unauthenticated'
      ) {
        throw err;
      }
      // Transitorio (red, canceled por el vigilante, retry-limit): backoff y otra vez.
      if (attempt < ATTEMPTS - 1) {
        await new Promise((r) =>
          setTimeout(r, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]),
        );
      }
    }
  }
  throw lastError;
};

/**
 * Sube un lote de fotos con progreso agregado, reintentos y concurrencia 3.
 * Devuelve las URLs en el MISMO ORDEN que los archivos de entrada.
 * Lanza el primer error definitivo (tras agotar reintentos) — el caller decide
 * si encolar offline o avisar al usuario con el código.
 */
export const uploadBatchWithProgress = async (
  tasks: UploadTask[],
  onProgress?: (p: UploadProgress) => void,
): Promise<string[]> => {
  const totalBytes = tasks.reduce((s, t) => s + (t.file.size || 1), 0) || 1;
  const perFileBytes: number[] = tasks.map(() => 0);
  let done = 0;

  const report = () => {
    if (!onProgress) return;
    const transferred = perFileBytes.reduce((s, b) => s + b, 0);
    onProgress({
      done,
      total: tasks.length,
      percent: Math.min(100, Math.round((transferred / totalBytes) * 100)),
    });
  };
  report();

  const results: string[] = new Array(tasks.length);
  let next = 0;
  let firstError: unknown = null;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= tasks.length || firstError) return;
      try {
        results[i] = await uploadOneWithRetry(tasks[i], (bytes) => {
          perFileBytes[i] = bytes;
          report();
        });
        perFileBytes[i] = tasks[i].file.size || 1;
        done += 1;
        report();
      } catch (err) {
        if (!firstError) firstError = err;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker),
  );

  if (firstError) throw firstError;
  return results;
};
