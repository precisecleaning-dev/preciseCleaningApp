import { useState, useEffect } from 'react';
import { Camera, Upload, Image as ImageIcon, Save, Sliders, AlertCircle } from 'lucide-react';
import { photoConfigService, DEFAULT_PHOTO_CONFIG } from '../services/photoConfigService';
import type { PhotoConfig } from '../services/photoConfigService';

export default function PhotoSettingsView() {
  const [config, setConfig] = useState<PhotoConfig>(DEFAULT_PHOTO_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      const loaded = await photoConfigService.get();
      setConfig(loaded);
      setIsLoading(false);
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    // Validación: al menos una opción debe estar habilitada
    if (!config.allowTakePhoto && !config.allowUploadFromDevice) {
      alert('Debes habilitar al menos una opción: Tomar Foto o Cargar Archivo.');
      return;
    }

    setIsSaving(true);
    try {
      await photoConfigService.update(config);
      setSavedMessage('✅ Configuración guardada correctamente');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (error) {
      alert('Error al guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        Cargando configuración...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Sliders size={28} color="#3b82f6" /> Configuración de Fotos
        </h1>
        <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: '0.95rem' }}>
          Define cómo los usuarios pueden agregar fotos a las propiedades.
        </p>
      </header>

      {/* CARD: Opciones de carga */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ImageIcon size={20} color="#3b82f6" /> Métodos de Carga Permitidos
        </h3>

        {/* Toggle: Tomar Foto */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: config.allowTakePhoto ? '#eff6ff' : '#f8fafc', border: `1px solid ${config.allowTakePhoto ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '8px', marginBottom: '12px', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ backgroundColor: config.allowTakePhoto ? '#3b82f6' : '#cbd5e1', color: 'white', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>📷 Tomar Foto</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                Permite tomar foto directamente con la cámara (móvil)
              </div>
            </div>
          </div>
          <ToggleSwitch
            checked={config.allowTakePhoto}
            onChange={(checked) => setConfig({ ...config, allowTakePhoto: checked })}
          />
        </div>

        {/* Toggle: Cargar de dispositivo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: config.allowUploadFromDevice ? '#ecfdf5' : '#f8fafc', border: `1px solid ${config.allowUploadFromDevice ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: '8px', transition: 'all 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ backgroundColor: config.allowUploadFromDevice ? '#10b981' : '#cbd5e1', color: 'white', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>📁 Cargar desde Dispositivo</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                Permite seleccionar imágenes guardadas (galería o explorador)
              </div>
            </div>
          </div>
          <ToggleSwitch
            checked={config.allowUploadFromDevice}
            onChange={(checked) => setConfig({ ...config, allowUploadFromDevice: checked })}
          />
        </div>

        {!config.allowTakePhoto && !config.allowUploadFromDevice && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> Debes habilitar al menos una opción.
          </div>
        )}
      </div>

      {/* CARD: Configuración de compresión */}
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#1e293b' }}>
          ⚙️ Optimización de Imágenes
        </h3>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
            Calidad de Compresión: <span style={{ color: '#3b82f6' }}>{(config.compressionQuality * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="1"
            step="0.05"
            value={config.compressionQuality}
            onChange={(e) => setConfig({ ...config, compressionQuality: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
            <span>Más liviano (50%)</span>
            <span>Recomendado (85%)</span>
            <span>Máxima calidad (100%)</span>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
            Ancho Máximo: <span style={{ color: '#3b82f6' }}>{config.maxImageWidth}px</span>
          </label>
          <select
            value={config.maxImageWidth}
            onChange={(e) => setConfig({ ...config, maxImageWidth: Number(e.target.value) })}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.95rem', backgroundColor: 'white' }}
          >
            <option value={1280}>1280px - Pequeño (ideal para web)</option>
            <option value={1920}>1920px - Mediano (Full HD) ⭐ Recomendado</option>
            <option value={2560}>2560px - Grande (2K)</option>
            <option value={3840}>3840px - Máximo (4K)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
            Tamaño Máximo Objetivo: <span style={{ color: '#3b82f6' }}>{config.maxSizeMB} MB</span>
          </label>
          <input
            type="range"
            min="0.3"
            max="5"
            step="0.1"
            value={config.maxSizeMB}
            onChange={(e) => setConfig({ ...config, maxSizeMB: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
            <span>0.3 MB</span>
            <span>5 MB</span>
          </div>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', fontSize: '0.8rem', color: '#0369a1' }}>
          💡 <strong>Recomendado:</strong> 85% calidad + 1920px ancho + 1 MB. Ofrece la mejor relación calidad/tamaño.
        </div>
      </div>

      {/* BOTÓN GUARDAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        {savedMessage && (
          <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
            {savedMessage}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            marginLeft: 'auto',
            padding: '12px 24px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: isSaving ? 0.7 : 1
          }}
        >
          <Save size={18} /> {isSaving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </div>
  );
}

// Toggle Switch Component
function ToggleSwitch({ checked, onChange }: { checked: boolean, onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '52px',
        height: '28px',
        borderRadius: '14px',
        border: 'none',
        backgroundColor: checked ? '#3b82f6' : '#cbd5e1',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s',
        padding: 0
      }}
    >
      <div style={{
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        backgroundColor: 'white',
        position: 'absolute',
        top: '3px',
        left: checked ? '27px' : '3px',
        transition: 'all 0.2s',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }} />
    </button>
  );
}