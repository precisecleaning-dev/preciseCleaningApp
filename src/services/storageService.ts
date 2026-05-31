// src/services/storageService.ts
import { storage } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';

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

/**
 * Encuentra el siguiente número de archivo para auto-numerar dentro de una carpeta.
 */
const getNextFileNumber = async (folderPath: string): Promise<number> => {
  try {
    const folderRef = ref(storage, folderPath);
    const list = await listAll(folderRef);

    let maxNumber = 0;
    list.items.forEach(item => {
      const match = item.name.match(/_(\d+)\.(jpg|jpeg|png|webp)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    });

    return maxNumber + 1;
  } catch (error) {
    console.warn('Could not list folder (probably empty), starting at 1:', error);
    return 1;
  }
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
    type: 'before' | 'after'
  ): Promise<string[]> {
    const safeClient = sanitizeForPath(clientName);
    const folderName = type === 'before' ? 'BeforePhotos' : 'AfterPhotos';
    const folderPath = `${safeClient}/${folderName}`;
    const safeAddress = sanitizeForPath(address);

    const nextNumber = await getNextFileNumber(folderPath);

    const uploads = files.map(async (file, index) => {
      const num = String(nextNumber + index).padStart(3, '0');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `${safeAddress}_${num}.${ext}`;
      const fullPath = `${folderPath}/${fileName}`;

      const storageRef = ref(storage, fullPath);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    });

    return Promise.all(uploads);
  },

  /**
   * ⭐ NUEVO: Sube fotos del Quality Check.
   * Estructura: {Address}/QualityCheck/{PlaceName}/photo_001.jpg
   */
  async uploadQualityCheckPhotos(
    files: File[],
    address: string,
    placeName: string
  ): Promise<string[]> {
    const safeAddress = sanitizeForPath(address);
    const safePlaceName = sanitizeForPath(placeName);
    const folderPath = `${safeAddress}/QualityCheck/${safePlaceName}`;

    const nextNumber = await getNextFileNumber(folderPath);

    const uploads = files.map(async (file, index) => {
      const num = String(nextNumber + index).padStart(3, '0');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `photo_${num}.${ext}`;
      const fullPath = `${folderPath}/${fileName}`;

      const storageRef = ref(storage, fullPath);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    });

    return Promise.all(uploads);
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