// ⭐ Configuración de Houses en app_settings: compresión de fotos y la
//    visibilidad / solo lectura de campos por rol ("Configure Fields").
//    Un listener por documento, abierto por HousesView mientras está montada.
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { COLLECTIONS } from '../../../lib/firebase/collections';
import { DEFAULT_PHOTO_CONFIG, type PhotoConfig } from '../../../services/photoConfigService';
import { DEFAULT_FORM_CONFIG, type FormVisibilityConfig } from '../houseFieldConfig';

export function useHouseSettings() {
  const [photoConfig, setPhotoConfig] = useState<PhotoConfig>(DEFAULT_PHOTO_CONFIG);
  const [formConfig, setFormConfig] = useState<FormVisibilityConfig>(DEFAULT_FORM_CONFIG);

  useEffect(() => {
    const unsubs = [
      onSnapshot(
        doc(db, COLLECTIONS.appSettings, 'photo_config'),
        (snap) => setPhotoConfig(snap.exists() ? (snap.data() as PhotoConfig) : DEFAULT_PHOTO_CONFIG),
        (err) => {
          console.error('Error PhotoConfig:', err);
          setPhotoConfig(DEFAULT_PHOTO_CONFIG);
        },
      ),
      onSnapshot(
        doc(db, COLLECTIONS.appSettings, 'houses_form_config'),
        (snap) => setFormConfig(snap.exists() ? (snap.data() as FormVisibilityConfig) : DEFAULT_FORM_CONFIG),
        (err) => {
          console.error('Error FormConfig:', err);
          setFormConfig(DEFAULT_FORM_CONFIG);
        },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return { photoConfig, formConfig };
}
