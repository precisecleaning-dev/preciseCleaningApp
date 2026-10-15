import { db } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const USERS_COLLECTION = 'system_users';

// ojo: el login importa este archivo. Nada de getAuth() a nivel de módulo aquí,
// arrastra el resolver de popups y baja apis.google.com en la pantalla de login.
export const usersService = {
  // Verifica si el email está registrado en el módulo de usuarios
  async isEmailWhitelisted(email: string): Promise<boolean> {
    const q = query(
      collection(db, USERS_COLLECTION),
      where("email", "==", email.toLowerCase().trim())
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  },
};
