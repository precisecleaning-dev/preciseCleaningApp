import { useState, useEffect, useRef } from 'react';
import {
  Building2, Upload, Trash2, Save, Loader2, Image as ImageIcon, Check, AlertCircle
} from 'lucide-react';
import { compressImage } from '../utils/imageCompression';
import {
  getCompanySettings, saveCompanySettings, type CompanyConfig
} from '../services/companyService';
import { getBranding, brandingHeaderHTML, type Branding } from '../utils/companyBranding';

interface CompanySettingsViewProps {
  onOpenMenu?: () => void;
  onSaved?: (cfg: CompanyConfig) => void;
}

const EMPTY: CompanyConfig = { name: '', address: '', email: '', phone: '', logo: '', autoSend: true };

export default function CompanySettingsView({ onOpenMenu, onSaved }: CompanySettingsViewProps) {
  const [draft, setDraft] = useState<CompanyConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cfg = await getCompanySettings();
        if (active) setDraft(cfg);
      } catch {
        /* respaldo a valores vacíos */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const update = (patch: Partial<CompanyConfig>) => { setDraft(prev => ({ ...prev, ...patch })); setSaved(false); };

  // Vista previa del encabezado tal como saldrá en los documentos
  const previewBranding: Branding = {
    name: (draft.name || '').trim() || 'Precise Cleaning',
    address: (draft.address || '').trim(),
    email: (draft.email || '').trim(),
    phone: (draft.phone || '').trim(),
    logo: (draft.logo || '').trim(),
    initials: ((draft.name || '').trim() || 'Precise Cleaning').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'PC',
  };

  const handleLogoUpload = async (file?: File | null) => {
    if (!file) return;
    setError(null);
    const toDataUrl = (blob: Blob) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    try {
      const compressed = await compressImage(file, { quality: 0.85, maxWidth: 400, maxSizeMB: 0.2 });
      update({ logo: await toDataUrl(compressed) });
    } catch {
      update({ logo: await toDataUrl(file) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const clean = await saveCompanySettings(draft);
      setDraft(clean);
      setSaved(true);
      if (onSaved) onSaved(clean);
      // Refrescar el branding cacheado para los generadores de documentos
      getBranding().catch(() => {});
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Error guardando la configuración de empresa:', e);
      setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const label: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' };
  const input: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', fontSize: '0.95rem', color: '#111827', backgroundColor: '#ffffff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div className="fade-in company-view" style={{ padding: '20px', boxSizing: 'border-box', maxWidth: '900px', margin: '0 auto' }}>
      <style>{`
        .company-spin { animation: company-spin 1s linear infinite; }
        @keyframes company-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .company-view { overflow-x: hidden; max-width: 100%; }
        .company-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; align-items: start; }
        @media (max-width: 820px) {
          .company-view { padding: 14px !important; }
          .company-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <header style={{ marginBottom: '18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, color: '#111827', fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={26} color="#4338ca" /> Empresa
          </h1>
          <p style={{ marginTop: '4px', color: '#6b7280' }}>Logo, nombre, correo y dirección que se usan en todos los documentos generados</p>
        </div>
        {onOpenMenu && (
          <button className="hamburger-btn" onClick={onOpenMenu} aria-label="Open menu" style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        )}
      </header>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Loader2 size={20} className="company-spin" /> Cargando configuración...
        </div>
      ) : (
        <div className="company-grid">
          {/* FORMULARIO */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
            {/* Logo */}
            <div>
              <span style={label}>Logo de la empresa</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {draft.logo
                    ? <img src={draft.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <ImageIcon size={26} color="#cbd5e1" />}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => logoInputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px', padding: '0 14px', borderRadius: '10px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <Upload size={15} /> Subir logo
                  </button>
                  {draft.logo && (
                    <button type="button" onClick={() => update({ logo: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px', padding: '0 14px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                      <Trash2 size={15} /> Quitar
                    </button>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { handleLogoUpload(e.target.files?.[0]); if (e.target) e.target.value = ''; }} />
                </div>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>PNG o JPG. Se optimiza automáticamente para los documentos.</p>
            </div>

            <div>
              <span style={label}>Nombre de la empresa</span>
              <input type="text" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Precise Cleaning" style={input} />
            </div>

            <div>
              <span style={label}>Correo de la empresa</span>
              <input type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} placeholder="contacto@empresa.com" style={input} />
            </div>

            <div>
              <span style={label}>Dirección</span>
              <textarea value={draft.address} onChange={(e) => update({ address: e.target.value })} placeholder="123 Main St, Killeen, TX 76541" style={{ ...input, minHeight: '64px', resize: 'vertical' }} />
            </div>

            <div>
              <span style={label}>Teléfono (opcional)</span>
              <input type="tel" value={draft.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="(254) 555-0100" style={input} />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
              <input type="checkbox" checked={draft.autoSend !== false} onChange={(e) => update({ autoSend: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <span style={{ fontSize: '0.88rem', color: '#334155', fontWeight: 600 }}>Enviar automáticamente el reporte de Quality Check al guardar</span>
            </label>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '10px 12px', fontSize: '0.85rem' }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
              {saved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 700, fontSize: '0.85rem' }}><Check size={16} /> Guardado</span>}
              <button onClick={handleSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#4338ca', border: 'none', color: '#fff', padding: '12px 22px', borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={16} className="company-spin" /> : <Save size={16} />} Guardar
              </button>
            </div>
          </div>

          {/* VISTA PREVIA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={label}>Vista previa en documentos</span>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
              <div dangerouslySetInnerHTML={{ __html: brandingHeaderHTML(previewBranding, 'Documento') }} />
              <div style={{ marginTop: '18px', height: '10px', background: '#f1f5f9', borderRadius: '6px', width: '70%' }} />
              <div style={{ marginTop: '10px', height: '10px', background: '#f1f5f9', borderRadius: '6px', width: '90%' }} />
              <div style={{ marginTop: '10px', height: '10px', background: '#f1f5f9', borderRadius: '6px', width: '55%' }} />
              <div style={{ marginTop: '22px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                {previewBranding.name}{previewBranding.address ? ' • ' + previewBranding.address : ''}{previewBranding.email ? ' • ' + previewBranding.email : ''}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Este encabezado con tu logo se usará en todos los documentos generados (Quality Check, nómina, facturas, etc.).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}