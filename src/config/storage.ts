// ⭐ Firebase Storage aparte de src/config/firebase.ts: así `firebase/storage`
//    solo se descarga con las vistas que suben o borran fotos, no al arrancar.
import { getStorage } from 'firebase/storage';
import app from './firebase';

export const storage = getStorage(app);
