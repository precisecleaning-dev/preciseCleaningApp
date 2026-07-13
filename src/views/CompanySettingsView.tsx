import { useState, useEffect, useRef } from 'react';
import {
  Building2, Upload, Trash2, Save, Loader2, Image as ImageIcon, Check, AlertCircle, Menu
} from 'lucide-react';
import { compressImage } from '../utils/imageCompression';
import {
  getCompanySettings, saveCompanySettings, type CompanyConfig
} from '../services/companyService';
import { getBranding, brandingHeaderHTML, type Branding } from '../utils/companyBranding';
import './CompanySettingsView.css';

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

  return (
    <div className="fade-in company-view">
      <header className="cs-header">
        <div className="cs-title-wrap">
          <h1 className="cs-title">
            <Building2 size={26} color="#4338ca" /> Empresa
          </h1>
          <p className="cs-subtitle">Logo, nombre, correo y dirección que se usan en todos los documentos generados</p>
        </div>
        {onOpenMenu && (
          <button className="cs-hamburger-btn" onClick={onOpenMenu} aria-label="Open menu">
            <Menu size={24} />
          </button>
        )}
      </header>

      {loading ? (
        <div className="cs-loading">
          <Loader2 size={20} className="company-spin" /> Cargando configuración...
        </div>
      ) : (
        <div className="company-grid">
          {/* FORMULARIO */}
          <div className="cs-card">
            {/* Logo */}
            <div>
              <span className="cs-label" id="cs-logo-label">Logo de la empresa</span>
              <div className="cs-logo-row">
                <div className="cs-logo-preview">
                  {draft.logo
                    ? <img src={draft.logo} alt="logo" />
                    : <ImageIcon size={26} color="#cbd5e1" />}
                </div>
                <div className="cs-logo-actions">
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="cs-btn-upload" aria-describedby="cs-logo-label">
                    <Upload size={15} /> Subir logo
                  </button>
                  {draft.logo && (
                    <button type="button" onClick={() => update({ logo: '' })} className="cs-btn-remove">
                      <Trash2 size={15} /> Quitar
                    </button>
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" aria-labelledby="cs-logo-label" className="cs-hidden-input" onChange={(e) => { handleLogoUpload(e.target.files?.[0]); if (e.target) e.target.value = ''; }} />
                </div>
              </div>
              <p className="cs-hint">PNG o JPG. Se optimiza automáticamente para los documentos.</p>
            </div>

            <div>
              <label className="cs-label" htmlFor="cs-name">Nombre de la empresa</label>
              <input id="cs-name" type="text" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="Precise Cleaning" className="cs-input" />
            </div>

            <div>
              <label className="cs-label" htmlFor="cs-email">Correo de la empresa</label>
              <input id="cs-email" type="email" value={draft.email} onChange={(e) => update({ email: e.target.value })} placeholder="contacto@empresa.com" className="cs-input" />
            </div>

            <div>
              <label className="cs-label" htmlFor="cs-address">Dirección</label>
              <textarea id="cs-address" value={draft.address} onChange={(e) => update({ address: e.target.value })} placeholder="123 Main St, Killeen, TX 76541" className="cs-input textarea" />
            </div>

            <div>
              <label className="cs-label" htmlFor="cs-phone">Teléfono (opcional)</label>
              <input id="cs-phone" type="tel" value={draft.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="(254) 555-0100" className="cs-input" />
            </div>

            <label className="cs-checkbox-row">
              <input type="checkbox" checked={draft.autoSend !== false} onChange={(e) => update({ autoSend: e.target.checked })} className="cs-checkbox" />
              <span className="cs-checkbox-label">Enviar automáticamente el reporte de Quality Check al guardar</span>
            </label>

            {error && (
              <div className="cs-error-banner">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <div className="cs-footer-row">
              {saved && <span className="cs-saved-badge"><Check size={16} /> Guardado</span>}
              <button onClick={handleSave} disabled={saving} className="cs-btn-save">
                {saving ? <Loader2 size={16} className="company-spin" /> : <Save size={16} />} Guardar
              </button>
            </div>
          </div>

          {/* VISTA PREVIA */}
          <div className="cs-preview-col">
            <span className="cs-label">Vista previa en documentos</span>
            <div className="cs-card preview">
              <div dangerouslySetInnerHTML={{ __html: brandingHeaderHTML(previewBranding, 'Documento') }} />
              <div className="cs-fake-line-1" />
              <div className="cs-fake-line-2" />
              <div className="cs-fake-line-3" />
              <div className="cs-preview-footer">
                {previewBranding.name}{previewBranding.address ? ' • ' + previewBranding.address : ''}{previewBranding.email ? ' • ' + previewBranding.email : ''}
              </div>
            </div>
            <p className="cs-preview-note">
              Este encabezado con tu logo se usará en todos los documentos generados (Quality Check, nómina, facturas, etc.).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}