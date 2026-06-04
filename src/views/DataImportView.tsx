import { useState, useRef, useCallback } from 'react';
import { 
  Upload, ArrowRight, AlertCircle, CheckCircle,
  Database, Loader2, RotateCcw, FileSpreadsheet, ChevronDown
} from 'lucide-react';
import Papa from 'papaparse';
import { db } from '../config/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';

// ⭐ Colecciones disponibles en el proyecto Precise Cleaning.
//    Si necesitas más, solo agrégalas al array.
const AVAILABLE_COLLECTIONS = [
  { id: 'customers', name: 'Customers', description: 'List of clients' },
  { id: 'properties', name: 'Properties (Houses)', description: 'Properties to clean' },
  { id: 'system_users', name: 'System Users', description: 'Employees / users' },
  { id: 'settings_teams', name: 'Settings: Teams', description: 'Work teams' },
  { id: 'settings_priorities', name: 'Settings: Priorities', description: 'Priority levels' },
  { id: 'settings_statuses', name: 'Settings: Statuses', description: 'Job statuses' },
  { id: 'settings_services', name: 'Settings: Services', description: 'Services catalog' },
  { id: 'settings_tax', name: 'Settings: Tax', description: 'Tax rates' },
  { id: 'settings_places', name: 'Settings: Places', description: 'Rooms / places' },
  { id: 'settings_tasks', name: 'Settings: Tasks', description: 'Tasks per place' },
  { id: 'settings_roles', name: 'Settings: Roles', description: 'User roles' },
  { id: 'billing_services', name: 'Billing Services', description: 'Billed services' },
  { id: 'payroll', name: 'Payroll', description: 'Payment records' },
  { id: 'quality_checks', name: 'Quality Checks', description: 'QC reports' },
  { id: 'notice_board', name: 'Notice Board', description: 'Announcements' }
];

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'skip';
type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

interface FieldMapping {
  firestoreField: string;
  type: FieldType;
}

interface ImportProgress {
  current: number;
  total: number;
  errors: { row: number; message: string }[];
  successCount: number;
}

interface DataImportViewProps {
  onOpenMenu: () => void;
}

export default function DataImportView({ onOpenMenu }: DataImportViewProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [fieldMappings, setFieldMappings] = useState<Record<string, FieldMapping>>({});
  const [useExistingId, setUseExistingId] = useState(false);
  const [idColumn, setIdColumn] = useState('');
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    current: 0,
    total: 0,
    errors: [],
    successCount: 0
  });
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  // Convierte "First Name" → "firstName"
  const toCamelCase = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^[A-Z]/, (m) => m.toLowerCase());
  };

  // Detecta el tipo de dato más probable basado en las primeras 5 filas
  const detectType = (data: any[], column: string): FieldType => {
    const samples = data.slice(0, 5).map(r => r[column]).filter(v => v !== null && v !== '' && v !== undefined);
    if (samples.length === 0) return 'string';

    if (samples.every(v => !isNaN(Number(v)) && String(v).trim() !== '')) return 'number';
    if (samples.every(v => ['true', 'false', 'yes', 'no', '1', '0'].includes(String(v).toLowerCase().trim()))) return 'boolean';
    
    // Fechas: detecta formatos comunes pero NO números que parsearían como timestamp
    if (samples.every(v => {
      const str = String(v).trim();
      // Debe contener al menos un separador típico de fecha
      if (!/[-/]/.test(str)) return false;
      return !isNaN(Date.parse(str));
    })) return 'date';

    return 'string';
  };

  // Transforma valor según tipo declarado
  const transformValue = (value: any, type: FieldType): any => {
    if (value === null || value === undefined || value === '') {
      if (type === 'number') return 0;
      if (type === 'boolean') return false;
      if (type === 'array') return [];
      return '';
    }

    const str = String(value).trim();

    switch (type) {
      case 'number':
        const num = Number(str.replace(/,/g, '')); // Acepta "1,000.50"
        return isNaN(num) ? 0 : num;
      case 'boolean':
        return ['true', 'yes', '1', 'sí', 'si'].includes(str.toLowerCase());
      case 'date':
        const date = new Date(str);
        if (isNaN(date.getTime())) return str;
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      case 'array':
        return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
      default:
        return str;
    }
  };

  // Construye el objeto Firestore desde una fila del CSV
  const transformRow = (row: any): any => {
    const transformed: any = {};
    Object.entries(fieldMappings).forEach(([csvHeader, mapping]) => {
      if (mapping.type === 'skip' || !mapping.firestoreField) return;
      transformed[mapping.firestoreField] = transformValue(row[csvHeader], mapping.type);
    });
    return transformed;
  };

  // ─────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Por favor selecciona un archivo CSV.');
      return;
    }

    setCsvFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing warnings:', results.errors);
        }
        const data = results.data as any[];
        const headers = (results.meta.fields || []).filter(h => h.trim() !== '');

        if (data.length === 0) {
          alert('El CSV está vacío o no tiene filas válidas.');
          return;
        }

        setCsvData(data);
        setCsvHeaders(headers);

        // Inicializar mapeos automáticos: nombre camelCase + tipo detectado
        const initialMappings: Record<string, FieldMapping> = {};
        headers.forEach(h => {
          initialMappings[h] = {
            firestoreField: toCamelCase(h),
            type: detectType(data, h)
          };
        });
        setFieldMappings(initialMappings);

        setStep('mapping');
      },
      error: (err: any) => {
        alert(`Error parseando CSV: ${err.message}`);
      }
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleImport = async () => {
    if (!selectedCollection) {
      alert('Selecciona una colección destino.');
      return;
    }
    if (csvData.length === 0) {
      alert('No hay datos para importar.');
      return;
    }

    // Verificar que al menos un campo NO esté en "skip"
    const hasMappedFields = Object.values(fieldMappings).some(m => m.type !== 'skip' && m.firestoreField);
    if (!hasMappedFields) {
      alert('Debes mapear al menos un campo (no todos pueden estar en "Skip").');
      return;
    }

    setStep('importing');
    setImportProgress({ current: 0, total: csvData.length, errors: [], successCount: 0 });

    try {
      const BATCH_SIZE = 500; // Firestore límite por batch
      let successCount = 0;
      const errors: { row: number; message: string }[] = [];

      for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        const batchData = csvData.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        batchData.forEach((row, index) => {
          const rowNumber = i + index + 1;
          try {
            const transformedData = transformRow(row);

            // Filtrar registros completamente vacíos
            const hasAnyValue = Object.values(transformedData).some(v => 
              v !== '' && v !== 0 && v !== false && (!Array.isArray(v) || v.length > 0)
            );
            if (!hasAnyValue) {
              errors.push({ row: rowNumber, message: 'Fila completamente vacía, saltada.' });
              return;
            }

            if (useExistingId && idColumn) {
              const docId = String(row[idColumn] || '').trim();
              if (!docId) {
                throw new Error(`ID vacío en la columna "${idColumn}"`);
              }
              // Sanitizar el ID: no puede tener / ni espacios al inicio/final
              const cleanId = docId.replace(/\//g, '_').replace(/^\.+|\.+$/g, '');
              const docRef = doc(db, selectedCollection, cleanId);
              batch.set(docRef, transformedData);
            } else {
              // Auto-generar ID
              const docRef = doc(collection(db, selectedCollection));
              batch.set(docRef, transformedData);
            }
            successCount++;
          } catch (err: any) {
            errors.push({ row: rowNumber, message: err.message || 'Error desconocido' });
          }
        });

        await batch.commit();

        setImportProgress({
          current: Math.min(i + BATCH_SIZE, csvData.length),
          total: csvData.length,
          successCount,
          errors: [...errors]
        });
      }

      setStep('done');
    } catch (error: any) {
      console.error('Error durante la importación:', error);
      alert(`Error al importar: ${error.message}\n\nRevisa la consola para más detalles.`);
      setStep('preview');
    }
  };

  const handleReset = () => {
    setStep('upload');
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setSelectedCollection('');
    setFieldMappings({});
    setUseExistingId(false);
    setIdColumn('');
    setImportProgress({ current: 0, total: 0, errors: [], successCount: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────────────────────
  // ESTILOS
  // ─────────────────────────────────────────────────────────────

  const s = {
    card: { backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' },
    label: { fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px', display: 'block' },
    input: { backgroundColor: '#ffffff', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', color: '#111827', width: '100%', boxSizing: 'border-box' as const, outline: 'none' },
    select: { backgroundColor: '#ffffff', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', color: '#111827', width: '100%', boxSizing: 'border-box' as const, outline: 'none', cursor: 'pointer' },
    btnPrimary: { backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' },
    btnSecondary: { backgroundColor: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 20px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' },
    stepBadge: (active: boolean, complete: boolean) => ({
      width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem',
      backgroundColor: complete ? '#10b981' : (active ? '#3b82f6' : '#e2e8f0'),
      color: complete || active ? 'white' : '#94a3b8',
      transition: 'all 0.2s'
    }),
    th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', whiteSpace: 'nowrap' as const },
    td: { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#111827' }
  };

  const STEPS = ['Upload CSV', 'Map Fields', 'Preview', 'Import'];
  const currentStepIndex = step === 'upload' ? 0 : step === 'mapping' ? 1 : step === 'preview' ? 2 : 3;

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        .spin-import { animation: spin-import 1s linear infinite; }
        @keyframes spin-import { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .hamburger-btn { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; cursor: pointer; color: #111827; display: flex; align-items: center; justify-content: center; }
        .hamburger-btn:hover { background-color: #f8fafc; }
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button className="hamburger-btn" onClick={onOpenMenu}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#111827', fontWeight: 700 }}>Data Import</h1>
          <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '0.95rem' }}>Import CSV files from Google Sheets into Firestore</p>
        </div>
      </header>

      {/* PROGRESS BAR */}
      <div style={{ ...s.card, marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        {STEPS.map((label, idx) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '120px' }}>
            <div style={s.stepBadge(idx === currentStepIndex, idx < currentStepIndex)}>
              {idx < currentStepIndex ? <CheckCircle size={16} /> : idx + 1}
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: idx === currentStepIndex ? 700 : 500, color: idx === currentStepIndex ? '#0f172a' : '#94a3b8' }}>
              {label}
            </div>
            {idx < STEPS.length - 1 && <div style={{ flex: 1, height: '2px', backgroundColor: idx < currentStepIndex ? '#10b981' : '#e2e8f0', marginLeft: '8px' }} />}
          </div>
        ))}
      </div>

      {/* ─────────── STEP 1: UPLOAD ─────────── */}
      {step === 'upload' && (
        <div style={s.card}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#0f172a' }}>Step 1: Upload your CSV file</h2>
          <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.9rem' }}>
            Export your Google Sheet as CSV (File → Download → Comma Separated Values) and drag it here.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#3b82f6' : '#cbd5e1'}`,
              borderRadius: '12px',
              padding: '60px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: isDragging ? '#eff6ff' : '#f8fafc',
              transition: 'all 0.2s'
            }}
          >
            <Upload size={48} style={{ color: isDragging ? '#3b82f6' : '#94a3b8', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
              {isDragging ? 'Drop the CSV here' : 'Click to select or drag a CSV file'}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Only .csv files. First row must be column headers.
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          {/* INSTRUCCIONES */}
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', display: 'flex', gap: '12px' }}>
            <AlertCircle size={18} color="#a16207" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.85rem', color: '#713f12', lineHeight: 1.5 }}>
              <strong>How to export from Google Sheets:</strong>
              <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li>Open your Google Sheet</li>
                <li>Make sure the <strong>first row</strong> contains column names (e.g., "First Name", "Email", "Phone")</li>
                <li>Click <strong>File → Download → Comma-separated values (.csv)</strong></li>
                <li>Drag the downloaded file here</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── STEP 2: MAPPING ─────────── */}
      {step === 'mapping' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#0f172a' }}>Step 2: Map columns to Firestore fields</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                <FileSpreadsheet size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                <strong>{csvFile?.name}</strong> • {csvData.length} rows • {csvHeaders.length} columns
              </p>
            </div>
            <button onClick={handleReset} style={s.btnSecondary}><RotateCcw size={14} /> Start Over</button>
          </div>

          {/* SELECCIONAR COLECCIÓN */}
          <div style={{ marginBottom: '20px' }}>
            <label style={s.label}>
              <Database size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              Target Firestore Collection
            </label>
            <select style={s.select} value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}>
              <option value="">-- Select a collection --</option>
              {AVAILABLE_COLLECTIONS.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.description})</option>
              ))}
            </select>
          </div>

          {/* OPCIÓN: USAR ID DEL CSV */}
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: useExistingId ? '12px' : 0 }}>
              <input type="checkbox" checked={useExistingId} onChange={(e) => setUseExistingId(e.target.checked)} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>Use a column from CSV as the Firestore document ID</span>
            </label>
            {useExistingId && (
              <div>
                <label style={s.label}>Column to use as document ID</label>
                <select style={s.select} value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
                  <option value="">-- Select column --</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  If unchecked, Firestore will auto-generate random IDs (recommended for most cases).
                </p>
              </div>
            )}
          </div>

          {/* TABLA DE MAPEO */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={s.th}>CSV Column</th>
                  <th style={s.th}>Sample Value</th>
                  <th style={{ ...s.th, width: '50px' }}></th>
                  <th style={s.th}>Firestore Field Name</th>
                  <th style={s.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {csvHeaders.map(header => {
                  const mapping = fieldMappings[header];
                  const sampleValue = csvData[0]?.[header] || '';
                  const isSkipped = mapping?.type === 'skip';
                  return (
                    <tr key={header} style={{ opacity: isSkipped ? 0.5 : 1 }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{header}</td>
                      <td style={{ ...s.td, color: '#64748b', fontStyle: 'italic', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(sampleValue).substring(0, 50)}
                      </td>
                      <td style={s.td}><ArrowRight size={14} color="#94a3b8" /></td>
                      <td style={s.td}>
                        <input
                          type="text"
                          style={{ ...s.input, padding: '6px 10px', fontSize: '0.85rem' }}
                          value={mapping?.firestoreField || ''}
                          onChange={(e) => setFieldMappings(prev => ({
                            ...prev,
                            [header]: { ...prev[header], firestoreField: e.target.value }
                          }))}
                          disabled={isSkipped}
                          placeholder="fieldName"
                        />
                      </td>
                      <td style={s.td}>
                        <select
                          style={{ ...s.select, padding: '6px 10px', fontSize: '0.85rem' }}
                          value={mapping?.type || 'string'}
                          onChange={(e) => setFieldMappings(prev => ({
                            ...prev,
                            [header]: { ...prev[header], type: e.target.value as FieldType }
                          }))}
                        >
                          <option value="string">Text (string)</option>
                          <option value="number">Number</option>
                          <option value="boolean">Yes/No (boolean)</option>
                          <option value="date">Date (YYYY-MM-DD)</option>
                          <option value="array">Array (comma-separated)</option>
                          <option value="skip">⊘ Skip this column</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '12px' }}>
            <button onClick={() => setStep('preview')} disabled={!selectedCollection} style={{ ...s.btnPrimary, opacity: !selectedCollection ? 0.5 : 1, cursor: !selectedCollection ? 'not-allowed' : 'pointer' }}>
              Preview Data <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 3: PREVIEW ─────────── */}
      {step === 'preview' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', color: '#0f172a' }}>Step 3: Preview before importing</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                First 5 rows transformed as they will be saved in <strong>{selectedCollection}</strong>
              </p>
            </div>
            <button onClick={() => setStep('mapping')} style={s.btnSecondary}><ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} /> Back to Mapping</button>
          </div>

          {/* CARDS DE PREVIEW */}
          <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
            {csvData.slice(0, 5).map((row, idx) => {
              const transformed = transformRow(row);
              const docId = useExistingId && idColumn ? String(row[idColumn] || '(empty!)').trim() : '(auto-generated)';
              return (
                <div key={idx} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Row {idx + 1}</span>
                    <span style={{ fontSize: '0.75rem', color: '#3b82f6', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>ID: {docId}</span>
                  </div>
                  <pre style={{ margin: 0, fontSize: '0.8rem', color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>
                    {JSON.stringify(transformed, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>

          {csvData.length > 5 && (
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.85rem', marginBottom: '20px' }}>
              ...and <strong>{csvData.length - 5}</strong> more rows will be imported similarly.
            </p>
          )}

          {/* CONFIRMACIÓN */}
          <div style={{ padding: '16px', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '12px' }}>
            <AlertCircle size={20} color="#a16207" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.9rem', color: '#713f12', lineHeight: 1.5 }}>
              <strong>About to import {csvData.length} documents into "{selectedCollection}"</strong>
              <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>This action cannot be undone from this view. Make sure the mapping is correct.</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={handleReset} style={s.btnSecondary}>Cancel</button>
            <button onClick={handleImport} style={{ ...s.btnPrimary, backgroundColor: '#10b981' }}>
              <Upload size={16} /> Import {csvData.length} records
            </button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 4: IMPORTING ─────────── */}
      {step === 'importing' && (
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Loader2 size={48} className="spin-import" style={{ color: '#3b82f6', margin: '0 auto 20px', display: 'block' }} />
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#0f172a' }}>Importing data...</h2>
            <p style={{ margin: '0 0 24px 0', color: '#64748b' }}>
              {importProgress.current} of {importProgress.total} records processed
            </p>

            {/* PROGRESS BAR */}
            <div style={{ maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ height: '12px', backgroundColor: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease',
                    borderRadius: '6px'
                  }}
                />
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                {Math.round((importProgress.current / importProgress.total) * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── STEP 5: DONE ─────────── */}
      {step === 'done' && (
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={36} color="#10b981" />
            </div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.3rem', color: '#0f172a' }}>Import Complete!</h2>
            <p style={{ margin: '0 0 24px 0', color: '#64748b' }}>
              <strong style={{ color: '#10b981' }}>{importProgress.successCount}</strong> records imported successfully to <strong>{selectedCollection}</strong>
              {importProgress.errors.length > 0 && (
                <span>, <strong style={{ color: '#ef4444' }}>{importProgress.errors.length}</strong> errors</span>
              )}
            </p>

            {/* ERRORES SI HAY */}
            {importProgress.errors.length > 0 && (
              <details style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto 24px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#991b1b', fontSize: '0.9rem' }}>
                  Show {importProgress.errors.length} errors
                </summary>
                <div style={{ marginTop: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                  {importProgress.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: '0.8rem', color: '#7f1d1d', padding: '4px 0', borderBottom: '1px solid #fecaca' }}>
                      <strong>Row {err.row}:</strong> {err.message}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <button onClick={handleReset} style={s.btnPrimary}>
              <RotateCcw size={16} /> Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}