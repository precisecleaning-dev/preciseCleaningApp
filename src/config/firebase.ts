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

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAU2ZPSROGJcf1NfamG-r5jWiOX13vOoe4",
  authDomain: "bdprecise-2d4bc.firebaseapp.com",
  projectId: "bdprecise-2d4bc",
  storageBucket: "bdprecise-2d4bc.firebasestorage.app",
  messagingSenderId: "697053380036",
  appId: "1:697053380036:web:7343cab6d09ab258557891"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// ⭐ FIRESTORE CON PERSISTENCE LOCAL (caché en IndexedDB del navegador)
//    Beneficios:
//    - Después de la primera carga, los datos se sirven desde caché en ~10-50ms
//    - Funciona offline (la app sigue funcionando sin internet)
//    - Soporte para múltiples pestañas abiertas simultáneamente
//    - Sincronización automática en tiempo real entre dispositivos
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});

export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;