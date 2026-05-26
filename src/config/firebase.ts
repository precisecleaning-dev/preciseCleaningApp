import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; 
import { getStorage } from "firebase/storage";

// Tu configuración real de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAU2ZPSROGJcf1NfamG-r5jWiOX13vOoe4",
  authDomain: "bdprecise-2d4bc.firebaseapp.com",
  projectId: "bdprecise-2d4bc",
  storageBucket: "bdprecise-2d4bc.firebasestorage.app",
  messagingSenderId: "100110215031",
  appId: "1:697053380036:web:7343cab6d09ab258557891"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// EXPORTAR SERVICIOS PARA EL RESTO DE LA APP
export const db = getFirestore(app);
export const auth = getAuth(app); 
export const storage = getStorage(app);
export default app;


