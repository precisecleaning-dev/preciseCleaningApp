import { useState, useEffect } from 'react';
import { Camera, Upload, Image as ImageIcon, Save, Sliders, AlertCircle } from 'lucide-react';
import { photoConfigService, DEFAULT_PHOTO_CONFIG } from '../services/photoConfigService';
import type { PhotoConfig } from '../services/photoConfigService';
import './PhotoSettingsView.css';

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
      <div className="ps-loading">
        Cargando configuración...
      </div>
    );
  }

  return (
    <div className="ps-page">
      <header className="ps-header">
        <h1 className="ps-title">
          <Sliders size={28} color="#3b82f6" /> Configuración de Fotos
        </h1>
        <p className="ps-subtitle">
          Define cómo los usuarios pueden agregar fotos a las propiedades.
        </p>
      </header>

      {/* CARD: Opciones de carga */}
      <div className="ps-card">
        <h3 className="ps-card-title">
          <ImageIcon size={20} color="#3b82f6" /> Métodos de Carga Permitidos
        </h3>

        {/* Toggle: Tomar Foto */}
        <div className={`ps-toggle-row${config.allowTakePhoto ? ' active-blue' : ''}`}>
          <div className="ps-toggle-left">
            <div className={`ps-toggle-icon-box${config.allowTakePhoto ? ' blue' : ''}`}>
              <Camera size={20} />
            </div>
            <div>
              <div className="ps-toggle-label">📷 Tomar Foto</div>
              <div className="ps-toggle-desc">
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
        <div className={`ps-toggle-row last${config.allowUploadFromDevice ? ' active-green' : ''}`}>
          <div className="ps-toggle-left">
            <div className={`ps-toggle-icon-box${config.allowUploadFromDevice ? ' green' : ''}`}>
              <Upload size={20} />
            </div>
            <div>
              <div className="ps-toggle-label">📁 Cargar desde Dispositivo</div>
              <div className="ps-toggle-desc">
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
          <div className="ps-warning-banner">
            <AlertCircle size={16} /> Debes habilitar al menos una opción.
          </div>
        )}
      </div>

      {/* CARD: Configuración de compresión */}
      <div className="ps-card">
        <h3 className="ps-card-title">
          ⚙️ Optimización de Imágenes
        </h3>

        <div className="ps-field">
          <label className="ps-field-label">
            Calidad de Compresión: <span className="ps-field-value">{(config.compressionQuality * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="1"
            step="0.05"
            value={config.compressionQuality}
            onChange={(e) => setConfig({ ...config, compressionQuality: Number(e.target.value) })}
            className="ps-range"
          />
          <div className="ps-range-legend">
            <span>Más liviano (50%)</span>
            <span>Recomendado (85%)</span>
            <span>Máxima calidad (100%)</span>
          </div>
        </div>

        <div className="ps-field">
          <label className="ps-field-label">
            Ancho Máximo: <span className="ps-field-value">{config.maxImageWidth}px</span>
          </label>
          <select
            value={config.maxImageWidth}
            onChange={(e) => setConfig({ ...config, maxImageWidth: Number(e.target.value) })}
            className="ps-select"
          >
            <option value={1280}>1280px - Pequeño (ideal para web)</option>
            <option value={1920}>1920px - Mediano (Full HD) ⭐ Recomendado</option>
            <option value={2560}>2560px - Grande (2K)</option>
            <option value={3840}>3840px - Máximo (4K)</option>
          </select>
        </div>

        <div>
          <label className="ps-field-label">
            Tamaño Máximo Objetivo: <span className="ps-field-value">{config.maxSizeMB} MB</span>
          </label>
          <input
            type="range"
            min="0.3"
            max="5"
            step="0.1"
            value={config.maxSizeMB}
            onChange={(e) => setConfig({ ...config, maxSizeMB: Number(e.target.value) })}
            className="ps-range"
          />
          <div className="ps-range-legend">
            <span>0.3 MB</span>
            <span>5 MB</span>
          </div>
        </div>

        <div className="ps-tip-banner">
          💡 <strong>Recomendado:</strong> 85% calidad + 1920px ancho + 1 MB. Ofrece la mejor relación calidad/tamaño.
        </div>
      </div>

      {/* BOTÓN GUARDAR */}
      <div className="ps-footer-row">
        {savedMessage && (
          <div className="ps-saved-message">
            {savedMessage}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="ps-save-btn"
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
      className={`ps-toggle-switch${checked ? ' on' : ''}`}
    >
      <div className={`ps-toggle-switch-knob${checked ? ' on' : ''}`} />
    </button>
  );
}