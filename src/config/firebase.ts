// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// ⚠️ IMPORTANTE: Reemplaza estos valores con TUS credenciales actuales de firebase.ts
//    No las copies de aquí - usa las que ya tenías en tu archivo original.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Inicializar app
const app = initializeApp(firebaseConfig);

// ⭐ INICIALIZAR FIRESTORE CON PERSISTENCE LOCAL
//    - persistentLocalCache: guarda todos los datos en IndexedDB del navegador
//    - persistentMultipleTabManager: permite múltiples pestañas abiertas sin conflictos
//    - CACHE_SIZE_UNLIMITED: caché sin límite (puede usar mucha memoria, pero perfecto para apps pequeñas/medianas)
//    Resultado: después de la primera carga, los datos se sirven desde IndexedDB
//    en menos de 100ms. Solo los cambios nuevos se descargan del servidor.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});

export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;