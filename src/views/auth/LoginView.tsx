import { useState, useEffect } from 'react';
import { Mail, Lock, LogIn, ArrowRight } from 'lucide-react';
import { auth } from '../../config/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { usersService } from '../../services/usersService';
import { getCachedBranding, getBranding, type Branding } from '../../utils/companyBranding';
import './LoginView.css';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // ⭐ Logo y nombre de la empresa (del módulo Empresa). Usa el valor cacheado al
  //    instante e intenta refrescar desde Firestore (si las reglas lo permiten).
  const [branding, setBranding] = useState<Branding>(() => getCachedBranding());
  useEffect(() => {
    getBranding().then(setBranding).catch(() => { /* sin permiso/red: se queda el cacheado */ });
  }, []);

  // ⭐ Quita el fondo negro del logo: lo dibuja en un canvas y hace transparentes los
  //    píxeles casi-negros, dejando solo el logo (azul) sobre el fondo blanco de la tarjeta.
  const [processedLogo, setProcessedLogo] = useState<string | null>(null);
  useEffect(() => {
    const src = branding.logo;
    if (!src) { setProcessedLogo(null); return; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        const THRESHOLD = 55; // píxeles casi negros -> transparentes
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] <= THRESHOLD && d[i + 1] <= THRESHOLD && d[i + 2] <= THRESHOLD) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);

        // Recorta el logo a su contenido real (elimina el margen transparente que
        // dejaba el fondo negro), para que se vea grande y no perdido en la caja.
        let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, found = false;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (d[(y * canvas.width + x) * 4 + 3] > 12) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        let outUrl: string;
        if (found) {
          const pad = 3;
          minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
          maxX = Math.min(canvas.width - 1, maxX + pad); maxY = Math.min(canvas.height - 1, maxY + pad);
          const w = maxX - minX + 1, h = maxY - minY + 1;
          const crop = document.createElement('canvas');
          crop.width = w; crop.height = h;
          const cctx = crop.getContext('2d');
          if (cctx) cctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
          outUrl = crop.toDataURL('image/png');
        } else {
          outUrl = canvas.toDataURL('image/png');
        }
        if (!cancelled) setProcessedLogo(outUrl);
      } catch (e) {
        // Si el canvas queda "tainted" (imagen remota sin CORS) no se puede leer: usamos el original
        if (!cancelled) setProcessedLogo(null);
      }
    };
    img.onerror = () => { if (!cancelled) setProcessedLogo(null); };
    img.src = src;
    return () => { cancelled = true; };
  }, [branding.logo]);

  // ⭐ Enviar correo para restablecer la contraseña (flujo nativo de Firebase Auth).
  //    Firebase manda un email con un enlace donde la persona define una nueva contraseña.
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) { alert("Please enter your email address."); return; }

    setResetLoading(true);
    try {
      // Validar lista blanca (igual que el login). Si la verificación falla por red,
      // intentamos enviar de todos modos.
      let allowed = true;
      try { allowed = await usersService.isEmailWhitelisted(target); } catch { allowed = true; }
      if (!allowed) {
        alert("ACCESS DENIED: Your email is not authorized in this system. Please contact the administrator.");
        setResetLoading(false);
        return;
      }

      await sendPasswordResetEmail(auth, target);
      setResetSent(true);
    } catch (error: any) {
      console.error("Password reset error:", error?.code);
      if (error?.code === 'auth/invalid-email') {
        alert("The email address is not valid.");
      } else if (error?.code === 'auth/user-not-found') {
        // Por seguridad mostramos el mismo mensaje de éxito (no revelamos si existe)
        setResetSent(true);
      } else {
        alert("Could not send the reset email. Please verify the address and try again.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const goToForgot = () => { setResetSent(false); setView('forgot'); };
  const goToLogin = () => { setResetSent(false); setView('login'); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. LOGIN REAL EN FIREBASE PRIMERO.
      //    Así, si el correo o la contraseña son incorrectos, obtenemos el error
      //    EXACTO de Firebase (y no uno enmascarado por la lectura de Firestore).
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // 2. VALIDAR LISTA BLANCA DESPUÉS de autenticar (ya hay sesión, por lo que
      //    las reglas de Firestore permiten leer). Si la verificación falla por
      //    permisos o red, NO bloqueamos: el usuario ya se autenticó con Firebase.
      let allowed = true;
      try {
        allowed = await usersService.isEmailWhitelisted(email.trim());
      } catch (whitelistErr) {
        console.error("No se pudo verificar la lista blanca (se permite el acceso):", whitelistErr);
        allowed = true;
      }

      if (!allowed) {
        await signOut(auth);
        alert("ACCESS DENIED: Your email is not authorized in this system. Please contact the administrator to be added to the user list.");
        setIsLoading(false);
        return;
      }

      onLoginSuccess();
    } catch (error: any) {
      const code = error?.code || '';
      console.error("Auth error:", code, error?.message);

      if (code === 'auth/invalid-email') {
        alert("The email address is not valid.");
      } else if (code === 'auth/user-disabled') {
        alert("This account has been disabled. Please contact the administrator.");
      } else if (code === 'auth/too-many-requests') {
        alert("Too many attempts. Please wait a few minutes and try again (or reset your password).");
      } else if (code === 'auth/network-request-failed') {
        alert("Network error. Check your internet connection and try again.");
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        alert("Invalid credentials. Please verify your email and password.");
      } else {
        // Cualquier otro error (p. ej. de Firestore) se muestra tal cual para no enmascararlo
        alert("Could not sign in: " + (error?.message || code || 'unknown error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">

        <div className="login-header">
          {/* ⭐ Logo de la empresa (del módulo Empresa); si no hay, ícono por defecto.
              Sin fondo ni borde cuando hay logo, para que un PNG transparente se vea limpio. */}
          <div className={`login-logo${branding.logo ? ' has-logo' : ''}`}>
            {branding.logo
              ? <img src={processedLogo || branding.logo} alt={branding.name} />
              : <LogIn size={36} color="#ffffff" />}
          </div>

          {/* ⭐ Encabezado móvil "Login to your Account" (oculto en escritorio) */}
          {view === 'login' && (
            <div className="login-hero">
              <h1 className="login-title">Login to your Account</h1>
              <p className="login-subtitle">Welcome back, please sign in to continue</p>
            </div>
          )}

          {view !== 'login' && (
            <>
              <h1 className="login-title recover">
                Recover Access
              </h1>
              <p className="login-subtitle recover">
                Contact admin if you lost your password
              </p>
            </>
          )}
        </div>

        {view === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <div>
              <label className="login-label stacked">Email Address</label>
              <div className="login-input-wrap">
                <Mail size={18} color="#94a3b8" className="login-input-icon" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="login-input"
                  placeholder="your.email@company.com"
                />
              </div>
            </div>

            <div>
              <div className="login-label-row">
                <label className="login-label">Password</label>
                <button type="button" className="login-forgot" onClick={goToForgot}>Forgot it?</button>
              </div>
              <div className="login-input-wrap">
                <Lock size={18} color="#94a3b8" className="login-input-icon" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="login-input"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="login-submit">
              {isLoading ? 'Checking Access...' : 'Sign In'} <ArrowRight size={18} />
            </button>
          </form>
        ) : resetSent ? (
          <div className="login-reset-sent">
            <div className="login-success-box">
              <p className="login-success-title">Reset link sent</p>
              <p className="login-subtitle reset-sent">
                We sent an email to <strong>{email.trim()}</strong> with a link to reset your password. Check your inbox (and spam folder), open the link and choose a new password.
              </p>
            </div>
            <button onClick={goToLogin} className="login-link-btn">Return to Login</button>
          </div>
        ) : (
          <form onSubmit={handlePasswordReset} className="login-forgot-form">
            <p className="login-subtitle forgot-intro">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div>
              <label className="login-label stacked">Email Address</label>
              <div className="login-input-wrap">
                <Mail size={18} color="#94a3b8" className="login-input-icon" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="login-input"
                  placeholder="your.email@company.com"
                />
              </div>
            </div>
            <button type="submit" disabled={resetLoading} className="login-submit">
              {resetLoading ? 'Sending...' : 'Send reset link'} <ArrowRight size={18} />
            </button>
            <button type="button" onClick={goToLogin} className="login-link-btn">Return to Login</button>
          </form>
        )}
      </div>
    </div>
  );
}