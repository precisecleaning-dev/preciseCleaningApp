import { db } from '../config/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

/* =========================================================================
   MÓDULO DE EMPRESA — fuente única de configuración (logo, nombre, correo,
   dirección, teléfono). Se guarda en Firestore en `settings_company/main`
   y se cachea en localStorage para que los generadores de documentos puedan
   leer el logo/datos de forma INSTANTÁNEA sin esperar a la red.
   ========================================================================= */

export interface CompanyConfig {
  name: string;
  address: string;
  email: string;
  phone: string;
  logo: string;       // data URL (base64) o URL remota
  autoSend?: boolean; // usado por Quality Check para el envío automático del reporte
}

const COMPANY_COL = 'settings_company';
const COMPANY_DOC_ID = 'main';
const CACHE_KEY = 'pc_company_settings';

export const DEFAULT_COMPANY: CompanyConfig = {
  name: 'Precise Cleaning',
  address: '',
  email: '',
  phone: '',
  logo: '',
  autoSend: true,
};

const normalize = (data: Partial<CompanyConfig> | null | undefined): CompanyConfig => ({
  ...DEFAULT_COMPANY,
  ...(data || {}),
});

const readCache = (): CompanyConfig | null => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const writeCache = (cfg: CompanyConfig) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* localStorage no disponible */
  }
};

/** Lectura SÍNCRONA e instantánea (desde caché o valores por defecto). */
export const getCachedCompanySettings = (): CompanyConfig => readCache() || DEFAULT_COMPANY;

/** Lectura desde Firestore, con respaldo a caché y valores por defecto. */
export const getCompanySettings = async (): Promise<CompanyConfig> => {
  try {
    const snap = await getDoc(doc(db, COMPANY_COL, COMPANY_DOC_ID));
    if (snap.exists()) {
      const cfg = normalize(snap.data() as Partial<CompanyConfig>);
      writeCache(cfg);
      return cfg;
    }
  } catch (e) {
    console.error('Error cargando la configuración de empresa:', e);
  }
  return readCache() || DEFAULT_COMPANY;
};

/** Guarda la configuración (merge: no borra otros campos del documento). */
export const saveCompanySettings = async (cfg: CompanyConfig): Promise<CompanyConfig> => {
  const clean: CompanyConfig = {
    name: (cfg.name || '').trim(),
    address: (cfg.address || '').trim(),
    email: (cfg.email || '').trim(),
    phone: (cfg.phone || '').trim(),
    logo: cfg.logo || '',
    autoSend: cfg.autoSend !== false,
  };
  await setDoc(doc(db, COMPANY_COL, COMPANY_DOC_ID), clean, { merge: true });
  writeCache(clean);
  return clean;
};

/** Suscripción en tiempo real (devuelve la función para desuscribirse). */
export const subscribeCompanySettings = (cb: (cfg: CompanyConfig) => void): (() => void) => {
  return onSnapshot(
    doc(db, COMPANY_COL, COMPANY_DOC_ID),
    (snap) => {
      const cfg = snap.exists() ? normalize(snap.data() as Partial<CompanyConfig>) : DEFAULT_COMPANY;
      writeCache(cfg);
      cb(cfg);
    },
    (e) => console.error('Error en la suscripción de empresa:', e)
  );
};