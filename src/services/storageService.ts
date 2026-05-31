import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

// getStorage() sin argumentos usa la app de Firebase ya inicializada
const storage = getStorage();

/**
 * Sanitiza un string para que sea seguro como nombre de archivo/carpeta:
 * - Quita acentos (á → a, ñ → n, etc.)
 * - Reemplaza espacios por guiones bajos
 * - Quita caracteres especiales no permitidos
 */
function sanitizeForPath(input: string): string {
  if (!input) return 'unknown';
  return input
    .normalize('NFD')                       // Separar tildes de letras
    .replace(/[\u0300-\u036f]/g, '')        // Quitar las tildes
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '')     // Solo letras, números, espacios y - _ .
    .replace(/\s+/g, '_')                   // Espacios -> guiones bajos
    .replace(/_+/g, '_')                    // Múltiples _ -> uno solo
    .replace(/^_|_$/g, '')                  // Quitar _ al inicio y fin
    .substring(0, 80);                      // Limitar a 80 chars
}

/**
 * Obtiene el siguiente número consecutivo disponible en una carpeta de Storage.
 * Lee los nombres de los archivos existentes y devuelve el siguiente número (con padding).
 */
async function getNextFileNumber(folderPath: string): Promise<number> {
  try {
    const folderRef = ref(storage, folderPath);
    const result = await listAll(folderRef);

    let maxNum = 0;
    result.items.forEach(item => {
      // Buscar patrones tipo "_001.jpg", "_002.jpeg", etc.
      const match = item.name.match(/_(\d+)\.(jpg|jpeg|png|webp)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return maxNum + 1;
  } catch (e) {
    console.warn('Could not list folder, starting at 1:', e);
    return 1;
  }
}

export const storageService = {
  /**
   * Sube una foto de propiedad a Firebase Storage usando la estructura:
   * {ClientName}/BeforePhotos/{address}_001.jpg
   * {ClientName}/AfterPhotos/{address}_001.jpg
   *
   * @param file - Archivo a subir
   * @param clientName - Nombre del cliente (carpeta raíz)
   * @param address - Dirección de la propiedad (parte del nombre del archivo)
   * @param type - 'before' o 'after'
   * @param sequenceNumber - Número opcional para evitar listAll cuando se suben múltiples archivos en paralelo
   * @returns URL pública de descarga
   */
  uploadPropertyPhoto: async (
    file: File,
    clientName: string,
    address: string,
    type: 'before' | 'after',
    sequenceNumber?: number
  ): Promise<string> => {
    try {
      const safeClient = sanitizeForPath(clientName);
      const safeAddress = sanitizeForPath(address);
      const folder = type === 'before' ? 'BeforePhotos' : 'AfterPhotos';
      const folderPath = `${safeClient}/${folder}`;

      // Determinar número consecutivo
      let num: number;
      if (typeof sequenceNumber === 'number') {
        num = sequenceNumber;
      } else {
        num = await getNextFileNumber(folderPath);
      }
      const paddedNum = String(num).padStart(3, '0');

      // Obtener extensión real del archivo
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const fileName = `${safeAddress}_${paddedNum}.${ext}`;
      const filePath = `${folderPath}/${fileName}`;

      const storageRef = ref(storage, filePath);

      console.log(`📤 [storageService] Uploading to: ${filePath}`);
      console.log(`   File size: ${(file.size / 1024).toFixed(2)} KB`);
      console.log(`   File type: ${file.type}`);

      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type
      });
      console.log(`✅ [storageService] Upload complete:`, snapshot.metadata.fullPath);

      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log(`✅ [storageService] Download URL:`, downloadURL);

      return downloadURL;
    } catch (error: any) {
      console.error(`❌ [storageService] Upload failed:`, error);
      console.error(`   Code: ${error.code}`);
      console.error(`   Message: ${error.message}`);
      throw error;
    }
  },

  /**
   * Sube múltiples fotos en orden, calculando los números consecutivos correctamente.
   */
  uploadMultiplePropertyPhotos: async (
    files: File[],
    clientName: string,
    address: string,
    type: 'before' | 'after'
  ): Promise<string[]> => {
    if (files.length === 0) return [];

    const safeClient = sanitizeForPath(clientName);
    const folder = type === 'before' ? 'BeforePhotos' : 'AfterPhotos';
    const folderPath = `${safeClient}/${folder}`;

    // Obtener el siguiente número una sola vez para todo el batch
    const startNumber = await getNextFileNumber(folderPath);

    // Subir todos en paralelo con números secuenciales
    return Promise.all(
      files.map((file, idx) =>
        storageService.uploadPropertyPhoto(file, clientName, address, type, startNumber + idx)
      )
    );
  },

  /**
   * Elimina una foto de Firebase Storage usando su URL
   */
  deletePropertyPhoto: async (url: string): Promise<void> => {
    try {
      const photoRef = ref(storage, url);
      await deleteObject(photoRef);
      console.log(`✅ [storageService] Photo deleted: ${url}`);
    } catch (error: any) {
      console.error(`❌ [storageService] Delete failed:`, error);
      throw error;
    }
  }
};