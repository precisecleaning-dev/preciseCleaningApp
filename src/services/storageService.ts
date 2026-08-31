// src/services/storageService.ts
import { storage } from '../config/firebase';
import { ref, deleteObject } from 'firebase/storage';
// ⭐ Motor de subida: progreso real, 3 reintentos con espera creciente,
//    vigilante de estancamiento (45s sin avanzar → cancela y reintenta) y
//    concurrencia limitada a 3. Ver src/utils/photoUploader.ts.
import { uploadBatchWithProgress } from '../utils/photoUploader';
import type { UploadProgress } from '../utils/photoUploader';

export type { UploadProgress };

/**
 * Limpia un string para usarlo como parte de un path en Firebase Storage.
 * Quita acentos, caracteres especiales y reemplaza espacios por guiones bajos.
 */
const sanitizeForPath = (str: string): string => {
  if (!str) return 'unknown';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')      // Quitar acentos
    .replace(/[^a-zA-Z0-9\s_-]/g, '')     // Solo alfanuméricos, espacios, _ y -
    .trim()
    .replace(/\s+/g, '_')                  // Espacios → _
    .substring(0, 80) || 'unknown';        // Límite de 80 caracteres
};

/* ============================================================================
 * ⭐ NOMBRES DE ARCHIVO ÚNICOS — correccion de PERDIDA DE FOTOS.
 *
 * QUE PASABA:
 *   Antes, el nombre salia de `getNextFileNumber()`, que LISTABA la carpeta y
 *   devolvia `ultimo + 1`. Ese numero se calcula ANTES de subir nada.
 *
 *   La vista de Quality Check sube cada foto en PARALELO (una llamada por
 *   foto). Con 5 fotos ocurria esto:
 *
 *     foto A -> lista la carpeta (0 archivos) -> le toca photo_001.jpg
 *     foto B -> lista la carpeta (0 archivos) -> le toca photo_001.jpg
 *     foto C -> lista la carpeta (0 archivos) -> le toca photo_001.jpg
 *     ...
 *
 *   Ninguna habia terminado de subir, asi que TODAS leian una carpeta vacia y
 *   TODAS elegian el mismo nombre. Firebase Storage sobrescribe: solo quedaba
 *   un archivo, y las 5 llamadas devolvian LA MISMA URL.
 *
 *   Por eso el reporte mostraba la misma imagen repetida N veces: no se estaban
 *   duplicando fotos, se estaban PERDIENDO. La evidencia real de la inspeccion
 *   se sobrescribia entre si.
 *
 * LA CORRECCION:
 *   El nombre ya no depende de leer la carpeta. Se compone de marca de tiempo +
 *   contador de proceso + azar, asi que es unico aunque se generen mil en el
 *   mismo milisegundo. Ademas se elimina el listado previo, que costaba una
 *   consulta a Storage por cada foto.
 *
 *   El prefijo de tiempo mantiene el orden cronologico al listar la carpeta.
 * ========================================================================== */

let uploadCounter = 0;

const uniqueFileName = (prefix: string, file: File, index: number): string => {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const stamp = Date.now();
  const seq = String(uploadCounter++ % 100000).padStart(5, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${seq}${index}_${rand}.${ext}`;
};

export const storageService = {
  /**
   * Sube múltiples fotos Before/After de una propiedad.
   * Estructura: {ClientName}/BeforePhotos/{address}_001.jpg
   */
  async uploadMultiplePropertyPhotos(
    files: File[],
    clientName: string,
    address: string,
    type: 'before' | 'after',
    onProgress?: (p: UploadProgress) => void
  ): Promise<string[]> {
    const safeClient = sanitizeForPath(clientName);
    const folderName = type === 'before' ? 'BeforePhotos' : 'AfterPhotos';
    const folderPath = `${safeClient}/${folderName}`;
    const safeAddress = sanitizeForPath(address);

    // ⭐ Nombre unico por construccion (ver arriba) + motor con progreso,
    //    reintentos y concurrencia 3 (ver photoUploader.ts).
    const tasks = files.map((file, index) => ({
      file,
      fullPath: `${folderPath}/${uniqueFileName(safeAddress, file, index)}`,
    }));
    return uploadBatchWithProgress(tasks, onProgress);
  },

  /**
   * ⭐ NUEVO: Sube fotos del Quality Check.
   * Estructura: {Address}/QualityCheck/{PlaceName}/photo_001.jpg
   */
  async uploadQualityCheckPhotos(
    files: File[],
    address: string,
    placeName: string,
    onProgress?: (p: UploadProgress) => void
  ): Promise<string[]> {
    const safeAddress = sanitizeForPath(address);
    const safePlaceName = sanitizeForPath(placeName);
    const folderPath = `${safeAddress}/QualityCheck/${safePlaceName}`;

    // ⭐ Nombre unico por construccion (ver arriba) + motor con progreso,
    //    reintentos y concurrencia 3 (ver photoUploader.ts).
    const tasks = files.map((file, index) => ({
      file,
      fullPath: `${folderPath}/${uniqueFileName('photo', file, index)}`,
    }));
    return uploadBatchWithProgress(tasks, onProgress);
  },

  /**
   * Elimina una foto por su URL de descarga.
   */
  async deletePhotoByUrl(url: string): Promise<void> {
    try {
      const storageRef = ref(storage, url);
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Error deleting photo from Storage:', error);
    }
  }
};