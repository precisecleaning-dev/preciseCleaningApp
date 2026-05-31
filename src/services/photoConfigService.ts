import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface PhotoConfig {
  allowTakePhoto: boolean;        // Permitir tomar foto con la cámara
  allowUploadFromDevice: boolean; // Permitir cargar archivo desde el dispositivo
  compressionQuality: number;     // Calidad de compresión (0.5 - 1.0)
  maxImageWidth: number;          // Ancho máximo en pixeles (ej: 1920)
  maxSizeMB: number;              // Tamaño máximo objetivo en MB
}

// Configuración por defecto (si no existe en Firestore)
export const DEFAULT_PHOTO_CONFIG: PhotoConfig = {
  allowTakePhoto: true,
  allowUploadFromDevice: true,
  compressionQuality: 0.85,
  maxImageWidth: 1920,
  maxSizeMB: 1
};

export const photoConfigService = {
  /**
   * Obtiene la configuración de fotos. Si no existe, devuelve los defaults.
   */
  get: async (): Promise<PhotoConfig> => {
    try {
      const docRef = doc(db, 'app_settings', 'photo_config');
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data() as Partial<PhotoConfig>;
        // Mergear con defaults para asegurar que todos los campos existan
        return { ...DEFAULT_PHOTO_CONFIG, ...data };
      }
      return DEFAULT_PHOTO_CONFIG;
    } catch (error) {
      console.error('Error fetching photo config:', error);
      return DEFAULT_PHOTO_CONFIG;
    }
  },

  /**
   * Actualiza la configuración de fotos
   */
  update: async (config: Partial<PhotoConfig>): Promise<void> => {
    try {
      const docRef = doc(db, 'app_settings', 'photo_config');
      await setDoc(docRef, config, { merge: true });
      console.log('✅ Photo config updated:', config);
    } catch (error) {
      console.error('Error updating photo config:', error);
      throw error;
    }
  }
};