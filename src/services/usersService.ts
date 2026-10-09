import { db } from '../config/firebase';
import app from '../config/firebase'; // Importamos la app principal
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import type { SystemUser } from '../types/index';

const USERS_COLLECTION = 'system_users';

// TRUCO DE ARQUITECTO: Creamos una instancia secundaria de Firebase.
// Esto permite crear nuevos usuarios en Auth sin cerrar la sesión del Administrador actual.
const secondaryApp = initializeApp(app.options, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

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

  // Agrega un usuario, lo crea en Auth y dispara el email
  async inviteUser(userData: Omit<SystemUser, 'id'>) {
    const targetEmail = userData.email.toLowerCase().trim();

    // 1. Guardar en la base de datos Firestore (Whitelist)
    const docRef = await addDoc(collection(db, USERS_COLLECTION), {
      ...userData,
      email: targetEmail,
      status: 'Pending Invite'
    });

    try {
      // 2. Crear el usuario en Firebase Auth usando la app secundaria
      // Le ponemos una contraseña temporal súper segura que nadie sabrá
      const tempPassword = Math.random().toString(36).slice(-10) + "A1@x!";
      await createUserWithEmailAndPassword(secondaryAuth, targetEmail, tempPassword);

      // 3. Enviar el correo oficial para que el usuario ponga su propia contraseña
      await sendPasswordResetEmail(secondaryAuth, targetEmail);
      
      // 4. Cerrar sesión en la app secundaria (limpieza)
      await signOut(secondaryAuth);
      
    } catch (caught) {
      const error = caught as { code?: string; message?: string };
      console.error("Error en el proceso de Auth:", error);
      
      // Si el usuario ya existía en Auth, simplemente le enviamos el correo de recuperación
      if (error.code === 'auth/email-already-in-use') {
         await sendPasswordResetEmail(getAuth(app), targetEmail);
      }
    }

    return docRef.id;
  }
};