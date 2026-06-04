import { useState, useRef, useCallback } from 'react';
import { 
  Upload, ArrowRight, AlertCircle, CheckCircle,
  Database, Loader2, RotateCcw, FileSpreadsheet, ChevronDown
} from 'lucide-react';
import Papa from 'papaparse';
import { db } from '../config/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'skip';

// ⭐ Colecciones disponibles en el proyecto Precise Cleaning.
//    `fields` define los campos conocidos de Firestore para esa colección.
//    El usuario podrá seleccionarlos desde un dropdown en el step de mapeo,
//    o escribir un nombre custom si su sheet tiene otro campo.
type CollectionDef = {
  id: string;
  name: string;
  description: string;
  fields: { name: string; type: FieldType; label?: string }[];
};

const AVAILABLE_COLLECTIONS: CollectionDef[] = [
  {
    id: 'customers', name: 'Customers', description: 'List of clients',
    fields: [
      { name: 'name', type: 'string', label: 'Full name' },
      { name: 'email', type: 'string' },
      { name: 'phone', type: 'string' },
      { name: 'address', type: 'string' },
      { name: 'city', type: 'string' },
      { name: 'notes', type: 'string' },
      { name: 'createdAt', type: 'date' }
    ]
  },
  {
    id: 'properties', name: 'Properties (Houses)', description: 'Properties to clean',
    fields: [
      { name: 'client', type: 'string', label: 'Client name' },
      { name: 'address', type: 'string' },
      { name: 'city', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'size', type: 'string' },
      { name: 'rooms', type: 'string' },
      { name: 'bathrooms', type: 'string' },
      { name: 'statusId', type: 'string', label: 'Status (ID or name)' },
      { name: 'invoiceStatus', type: 'string' },
      { name: 'priorityId', type: 'string' },
      { name: 'serviceId', type: 'string' },
      { name: 'teamId', type: 'string' },
      { name: 'assignedWorkers', type: 'array', label: 'Workers (comma-separated)' },
      { name: 'receiveDate', type: 'date' },
      { name: 'scheduleDate', type: 'date' },
      { name: 'timeIn', type: 'string' },
      { name: 'timeOut', type: 'string' },
      { name: 'note', type: 'string', label: 'General note' },
      { name: 'employeeNote', type: 'string' }
    ]
  },
  {
    id: 'system_users', name: 'System Users', description: 'Employees / users',
    fields: [
      { name: 'firstName', type: 'string' },
      { name: 'lastName', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'phone', type: 'string' },
      { name: 'roleId', type: 'string' },
      { name: 'teamId', type: 'string' },
      { name: 'active', type: 'boolean' },
      { name: 'createdAt', type: 'date' }
    ]
  },
  {
    id: 'settings_teams', name: 'Settings: Teams', description: 'Work teams',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'color', type: 'string', label: 'Hex color (#RRGGBB)' },
      { name: 'order', type: 'number' }
    ]
  },
  {
    id: 'settings_priorities', name: 'Settings: Priorities', description: 'Priority levels',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'color', type: 'string' },
      { name: 'order', type: 'number' }
    ]
  },
  {
    id: 'settings_statuses', name: 'Settings: Statuses', description: 'Job statuses',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'color', type: 'string' },
      { name: 'order', type: 'number' },
      { name: 'showInDashboard', type: 'boolean' },
      { name: 'dashboardOrder', type: 'number' }
    ]
  },
  {
    id: 'settings_services', name: 'Settings: Services', description: 'Services catalog',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'price', type: 'number' },
      { name: 'description', type: 'string' },
      { name: 'order', type: 'number' }
    ]
  },
  {
    id: 'settings_tax', name: 'Settings: Tax', description: 'Tax rates',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'percentage', type: 'number' }
    ]
  },
  {
    id: 'settings_places', name: 'Settings: Places', description: 'Rooms / places',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'order', type: 'number' }
    ]
  },
  {
    id: 'settings_tasks', name: 'Settings: Tasks', description: 'Tasks per place',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'placeId', type: 'string' },
      { name: 'order', type: 'number' }
    ]
  },
  {
    id: 'settings_roles', name: 'Settings: Roles', description: 'User roles',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'permissions', type: 'array' }
    ]
  },
  {
    id: 'billing_services', name: 'Billing Services', description: 'Billed services',
    fields: [
      { name: 'propertyId', type: 'string' },
      { name: 'serviceId', type: 'string' },
      { name: 'quantity', type: 'number' },
      { name: 'price', type: 'number' },
      { name: 'subtotal', type: 'number' },
      { name: 'applyTax', type: 'string', label: 'Apply Tax (Yes/No)' },
      { name: 'minusTax', type: 'string' },
      { name: 'taxPercentage', type: 'number' },
      { name: 'taxAmount', type: 'number' },
      { name: 'total', type: 'number' },
      { name: 'notes', type: 'string' },
      { name: 'createdAt', type: 'date' }
    ]
  },
  {
    id: 'payroll', name: 'Payroll', description: 'Payment records',
    fields: [
      { name: 'propertyId', type: 'string' },
      { name: 'employeeId', type: 'string' },
      { name: 'date', type: 'date' },
      { name: 'baseAmount', type: 'number' },
      { name: 'extraAmount', type: 'number' },
      { name: 'extraNote', type: 'string' },
      { name: 'discountAmount', type: 'number' },
      { name: 'discountNote', type: 'string' },
      { name: 'totalAmount', type: 'number' },
      { name: 'status', type: 'string', label: 'Status (Pending/Paid)' }
    ]
  },
  {
    id: 'quality_checks', name: 'Quality Checks', description: 'QC reports',
    fields: [
      { name: 'propertyId', type: 'string' },
      { name: 'inspectorId', type: 'string' },
      { name: 'date', type: 'date' },
      { name: 'score', type: 'number' },
      { name: 'notes', type: 'string' }
    ]
  },
  {
    id: 'notice_board', name: 'Notice Board', description: 'Announcements',
    fields: [
      { name: 'title', type: 'string' },
      { name: 'content', type: 'string' },
      { name: 'authorId', type: 'string' },
      { name: 'createdAt', type: 'date' },
      { name: 'pinned', type: 'boolean' }
    ]
  }
];

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

  // ⭐ Devuelve la definición completa de la colección seleccionada
  const getCollectionDef = (): CollectionDef | undefined => {
    return AVAILABLE_COLLECTIONS.find(c => c.id === selectedCollection);
  };

  // ⭐ Busca el mejor field match para un header del CSV. Comparación insensible
  //    a mayúsculas, espacios y guiones bajos. Si encuentra match exacto en
  //    nombre o label, lo devuelve. Si no, devuelve null.
  const findBestFieldMatch = (csvHeader: string, fields: CollectionDef['fields']): string | null => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
    const target = norm(csvHeader);
    const exact = fields.find(f => norm(f.name) === target || (f.label && norm(f.label) === target));
    return exact ? exact.name : null;
  };

  // ⭐ Cuando el usuario elige una colección destino, re-mapea automáticamente
  //    los headers que coincidan con campos conocidos de esa colección.
  //    Los que no coincidan quedan como camelCase (custom) y el usuario puede
  //    ajustarlos manualmente.
  const handleSelectCollection = (collectionId: string) => {
    setSelectedCollection(collectionId);
    const def = AVAILABLE_COLLECTIONS.find(c => c.id === collectionId);
    if (!def || csvHeaders.length === 0) return;

    setFieldMappings(prev => {
      const next: Record<string, FieldMapping> = { ...prev };
      csvHeaders.forEach(h => {
        const match = findBestFieldMatch(h, def.fields);
        if (match) {
          // Match encontrado: usa el field conocido + el tipo declarado en el schema
          const fieldDef = def.fields.find(f => f.name === match)!;
          next[h] = { firestoreField: match, type: fieldDef.type };
        } else if (!prev[h] || !prev[h].firestoreField) {
          // Sin match: deja el camelCase auto-generado
          next[h] = { firestoreField: toCamelCase(h), type: detectType(csvData, h) };
        }
        // Si ya había un mapeo manual del usuario, lo respeta
      });
      return next;
    });
  };

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
  // ESTILOS — Refinados para look profesional y compacto
  // ─────────────────────────────────────────────────────────────

  const s = {
    card: { backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '20px' },
    label: { fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.6px', marginBottom: '6px', display: 'block' },
    input: { backgroundColor: '#ffffff', padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.825rem', color: '#0f172a', width: '100%', boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s' },
    select: { backgroundColor: '#ffffff', padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.825rem', color: '#0f172a', width: '100%', boxSizing: 'border-box' as const, outline: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s' },
    btnPrimary: { backgroundColor: '#1e293b', color: 'white', border: '1px solid #1e293b', padding: '8px 16px', borderRadius: '7px', fontWeight: 500, cursor: 'pointer', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' },
    btnSecondary: { backgroundColor: 'white', border: '1px solid #e2e8f0', color: '#475569', padding: '8px 16px', borderRadius: '7px', fontWeight: 500, cursor: 'pointer', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' },
    stepBadge: (active: boolean, complete: boolean) => ({
      width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.75rem',
      backgroundColor: complete ? '#10b981' : (active ? '#0f172a' : '#f1f5f9'),
      color: complete || active ? 'white' : '#94a3b8',
      transition: 'all 0.2s',
      flexShrink: 0
    }),
    th: { padding: '9px 12px', textAlign: 'left' as const, fontSize: '0.65rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', whiteSpace: 'nowrap' as const },
    td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', color: '#0f172a' }
  };

  const STEPS = ['Upload CSV', 'Map Fields', 'Preview', 'Import'];
  const currentStepIndex = step === 'upload' ? 0 : step === 'mapping' ? 1 : step === 'preview' ? 2 : 3;

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fade-in" style={{ padding: '24px', maxWidth: '1180px', margin: '0 auto' }}>
      <style>{`
        .spin-import { animation: spin-import 1s linear infinite; }
        @keyframes spin-import { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .hamburger-btn { background: white; border: 1px solid #e5e7eb; border-radius: 7px; padding: 7px 10px; cursor: pointer; color: #475569; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .hamburger-btn:hover { background-color: #f8fafc; border-color: #cbd5e1; }
        .di-btn-primary:hover { background-color: #0f172a !important; }
        .di-btn-secondary:hover { background-color: #f8fafc !important; border-color: #cbd5e1 !important; }
        .di-input:focus { border-color: #0f172a !important; box-shadow: 0 0 0 3px rgba(15,23,42,0.06) !important; }
        .di-row:hover { background-color: #fafbfc !important; }
      `}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
        <button className="hamburger-btn" onClick={onOpenMenu}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a', fontWeight: 600, letterSpacing: '-0.02em' }}>Data Import</h1>
          <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.825rem' }}>Import CSV files from Google Sheets into Firestore</p>
        </div>
      </header>

      {/* PROGRESS BAR */}
      <div style={{ ...s.card, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', padding: '16px 20px' }}>
        {STEPS.map((label, idx) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '110px' }}>
            <div style={s.stepBadge(idx === currentStepIndex, idx < currentStepIndex)}>
              {idx < currentStepIndex ? <CheckCircle size={14} /> : idx + 1}
            </div>
            <div style={{ fontSize: '0.775rem', fontWeight: idx === currentStepIndex ? 600 : 500, color: idx === currentStepIndex ? '#0f172a' : '#94a3b8' }}>
              {label}
            </div>
            {idx < STEPS.length - 1 && <div style={{ flex: 1, height: '1px', backgroundColor: idx < currentStepIndex ? '#10b981' : '#e2e8f0', marginLeft: '6px' }} />}
          </div>
        ))}
      </div>

      {/* ─────────── STEP 1: UPLOAD ─────────── */}
      {step === 'upload' && (
        <div style={s.card}>
          <h2 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: '#0f172a', fontWeight: 600 }}>Upload your CSV file</h2>
          <p style={{ margin: '0 0 18px 0', color: '#64748b', fontSize: '0.825rem' }}>
            Export your Google Sheet as CSV (File → Download → Comma Separated Values) and drop it here.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `1.5px dashed ${isDragging ? '#0f172a' : '#cbd5e1'}`,
              borderRadius: '10px',
              padding: '44px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: isDragging ? '#f1f5f9' : '#fafbfc',
              transition: 'all 0.18s'
            }}
          >
            <Upload size={32} strokeWidth={1.5} style={{ color: isDragging ? '#0f172a' : '#94a3b8', margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a', marginBottom: '3px' }}>
              {isDragging ? 'Drop the CSV here' : 'Click to select or drag a CSV file'}
            </div>
            <div style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
              Only .csv files · First row must be column headers
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
          <div style={{ marginTop: '18px', padding: '14px 16px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', display: 'flex', gap: '10px' }}>
            <AlertCircle size={15} color="#a16207" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.55 }}>
              <strong style={{ fontWeight: 600 }}>How to export from Google Sheets:</strong>
              <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
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
              <h2 style={{ margin: '0 0 3px 0', fontSize: '0.95rem', color: '#0f172a', fontWeight: 600 }}>Map columns to Firestore fields</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.775rem' }}>
                <FileSpreadsheet size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />
                <strong style={{ color: '#0f172a', fontWeight: 600 }}>{csvFile?.name}</strong> · {csvData.length} rows · {csvHeaders.length} columns
              </p>
            </div>
            <button onClick={handleReset} className="di-btn-secondary" style={s.btnSecondary}><RotateCcw size={13} /> Start Over</button>
          </div>

          {/* SELECCIONAR COLECCIÓN */}
          <div style={{ marginBottom: '16px' }}>
            <label style={s.label}>
              <Database size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />
              Target Firestore Collection
            </label>
            <select className="di-input" style={s.select} value={selectedCollection} onChange={(e) => handleSelectCollection(e.target.value)}>
              <option value="">— Select a collection —</option>
              {AVAILABLE_COLLECTIONS.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.description})</option>
              ))}
            </select>
            {selectedCollection && (
              <p style={{ margin: '6px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                {getCollectionDef()?.fields.length} known fields for this collection. Matching columns were auto-mapped below.
              </p>
            )}
          </div>

          {/* OPCIÓN: USAR ID DEL CSV */}
          <div style={{ marginBottom: '16px', padding: '14px 16px', backgroundColor: '#fafbfc', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: useExistingId ? '12px' : 0 }}>
              <input type="checkbox" checked={useExistingId} onChange={(e) => setUseExistingId(e.target.checked)} style={{ accentColor: '#0f172a', cursor: 'pointer' }} />
              <span style={{ fontWeight: 500, fontSize: '0.825rem', color: '#0f172a' }}>Use a column from CSV as the Firestore document ID</span>
            </label>
            {useExistingId && (
              <div>
                <label style={s.label}>Column to use as document ID</label>
                <select className="di-input" style={s.select} value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
                  <option value="">— Select column —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                  If unchecked, Firestore will auto-generate random IDs (recommended).
                </p>
              </div>
            )}
          </div>

          {/* RESUMEN DEL MAPEO — campos del schema sin asignar / columnas extra */}
          {(() => {
            const def = getCollectionDef();
            if (!def) return null;
            const mappingValues: FieldMapping[] = Object.values(fieldMappings);
            const usedFieldNames = new Set(mappingValues.filter(m => m.type !== 'skip' && m.firestoreField).map(m => m.firestoreField));
            const unmappedKnownFields = def.fields.filter(f => !usedFieldNames.has(f.name));
            const extraColumns = csvHeaders.filter(h => {
              const m = fieldMappings[h];
              if (!m || m.type === 'skip' || !m.firestoreField) return false;
              return !def.fields.some(f => f.name === m.firestoreField);
            });
            return (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {unmappedKnownFields.length > 0 && (
                  <div style={{ flex: '1 1 240px', padding: '10px 14px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '7px', fontSize: '0.75rem', color: '#78350f' }}>
                    <div style={{ fontWeight: 600, marginBottom: '3px' }}>
                      {unmappedKnownFields.length} schema {unmappedKnownFields.length === 1 ? 'field' : 'fields'} not in CSV
                    </div>
                    <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.7rem', opacity: 0.85 }}>
                      {unmappedKnownFields.map(f => f.name).join(', ')}
                    </div>
                  </div>
                )}
                {extraColumns.length > 0 && (
                  <div style={{ flex: '1 1 240px', padding: '10px 14px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '7px', fontSize: '0.75rem', color: '#1e3a8a' }}>
                    <div style={{ fontWeight: 600, marginBottom: '3px' }}>
                      {extraColumns.length} custom {extraColumns.length === 1 ? 'field' : 'fields'} (not in schema)
                    </div>
                    <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.7rem', opacity: 0.85 }}>
                      {extraColumns.map(h => fieldMappings[h]?.firestoreField).join(', ')}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TABLA DE MAPEO */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={s.th}>CSV Column</th>
                  <th style={s.th}>Sample Value</th>
                  <th style={{ ...s.th, width: '40px' }}></th>
                  <th style={s.th}>
                    {(() => {
                      const def = getCollectionDef();
                      return def ? `→ Maps to Field in ${def.name}` : '→ Target Field (select collection first)';
                    })()}
                  </th>
                  <th style={s.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {csvHeaders.map(header => {
                  const mapping = fieldMappings[header];
                  const sampleValue = csvData[0]?.[header] || '';
                  const isSkipped = mapping?.type === 'skip';
                  const collectionDef = getCollectionDef();
                  const knownFields = collectionDef?.fields || [];
                  // ¿El field actual es uno conocido de la colección, o uno custom?
                  const isKnownField = knownFields.some(f => f.name === mapping?.firestoreField);
                  // Valor del dropdown:
                  //   - "" si no hay nada mapeado
                  //   - field name conocido si match con schema de la colección
                  //   - "__custom__" si tiene valor pero no está en el schema (o no hay colección elegida)
                  const dropdownValue = !mapping?.firestoreField
                    ? ''
                    : (isKnownField ? mapping.firestoreField : '__custom__');

                  return (
                    <tr key={header} className="di-row" style={{ opacity: isSkipped ? 0.4 : 1, transition: 'background-color 0.15s' }}>
                      <td style={{ ...s.td, fontWeight: 600, color: '#0f172a' }}>{header}</td>
                      <td style={{ ...s.td, color: '#94a3b8', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace', fontSize: '0.75rem' }}>
                        {String(sampleValue).substring(0, 50)}
                      </td>
                      <td style={s.td}><ArrowRight size={13} color="#cbd5e1" strokeWidth={2} /></td>
                      <td style={s.td}>
                        {/* ⭐ Dropdown SIEMPRE visible. Las opciones cambian según haya
                            colección elegida o no. El input custom aparece debajo cuando
                            el usuario quiere escribir un nombre que no está en el schema. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <select
                            className="di-input"
                            style={{ ...s.select, padding: '6px 10px', fontSize: '0.8rem' }}
                            value={dropdownValue}
                            disabled={isSkipped}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') {
                                setFieldMappings(prev => ({ ...prev, [header]: { ...prev[header], firestoreField: '' } }));
                              } else if (v === '__custom__') {
                                // Al elegir Custom, vacía el campo para que el usuario escriba
                                setFieldMappings(prev => ({ ...prev, [header]: { ...prev[header], firestoreField: isKnownField ? '' : (prev[header]?.firestoreField || '') } }));
                              } else {
                                // Field conocido elegido: actualiza también el type según el schema
                                const fieldDef = knownFields.find(f => f.name === v);
                                setFieldMappings(prev => ({
                                  ...prev,
                                  [header]: { firestoreField: v, type: fieldDef?.type || prev[header]?.type || 'string' }
                                }));
                              }
                            }}
                          >
                            <option value="">— Don't map this column —</option>
                            {collectionDef && knownFields.length > 0 && (
                              <optgroup label={`📋 ${collectionDef.name} fields`}>
                                {knownFields.map(f => (
                                  <option key={f.name} value={f.name}>
                                    {f.name}{f.label ? ` · ${f.label}` : ''} ({f.type})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <option value="__custom__">✎ Custom field name…</option>
                          </select>

                          {/* Input para escribir nombre custom — aparece cuando se elige Custom O cuando no hay colección y el usuario ya tiene un valor */}
                          {(dropdownValue === '__custom__' || (!collectionDef && mapping?.firestoreField)) && (
                            <input
                              type="text"
                              className="di-input"
                              style={{ ...s.input, padding: '5px 10px', fontSize: '0.75rem' }}
                              value={mapping?.firestoreField || ''}
                              onChange={(e) => setFieldMappings(prev => ({
                                ...prev,
                                [header]: { ...prev[header], firestoreField: e.target.value }
                              }))}
                              disabled={isSkipped}
                              placeholder={collectionDef ? 'customFieldName' : 'Select collection above to use schema'}
                              autoFocus={dropdownValue === '__custom__'}
                            />
                          )}
                        </div>
                      </td>
                      <td style={s.td}>
                        <select
                          className="di-input"
                          style={{ ...s.select, padding: '6px 10px', fontSize: '0.8rem' }}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', gap: '10px' }}>
            <button 
              onClick={() => setStep('preview')} 
              disabled={!selectedCollection} 
              className="di-btn-primary"
              style={{ ...s.btnPrimary, opacity: !selectedCollection ? 0.4 : 1, cursor: !selectedCollection ? 'not-allowed' : 'pointer' }}
            >
              Preview Data <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 3: PREVIEW ─────────── */}
      {step === 'preview' && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: '0 0 3px 0', fontSize: '0.95rem', color: '#0f172a', fontWeight: 600 }}>Preview before importing</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.775rem' }}>
                First 5 rows transformed as they will be saved in <strong style={{ color: '#0f172a', fontWeight: 600 }}>{selectedCollection}</strong>
              </p>
            </div>
            <button onClick={() => setStep('mapping')} className="di-btn-secondary" style={s.btnSecondary}>
              <ChevronDown size={13} style={{ transform: 'rotate(90deg)' }} /> Back to Mapping
            </button>
          </div>

          {/* CARDS DE PREVIEW */}
          <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
            {csvData.slice(0, 5).map((row, idx) => {
              const transformed = transformRow(row);
              const docId = useExistingId && idColumn ? String(row[idColumn] || '(empty!)').trim() : '(auto-generated)';
              return (
                <div key={idx} style={{ backgroundColor: '#fafbfc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Row {idx + 1}</span>
                    <span style={{ fontSize: '0.7rem', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontWeight: 500, fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace' }}>
                      ID: {docId}
                    </span>
                  </div>
                  <pre style={{ margin: 0, fontSize: '0.75rem', color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace', lineHeight: 1.55 }}>
                    {JSON.stringify(transformed, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>

          {csvData.length > 5 && (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.775rem', marginBottom: '16px' }}>
              and <strong style={{ color: '#475569', fontWeight: 600 }}>{csvData.length - 5}</strong> more rows will be imported similarly
            </p>
          )}

          {/* CONFIRMACIÓN */}
          <div style={{ padding: '14px 16px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', marginBottom: '18px', display: 'flex', gap: '10px' }}>
            <AlertCircle size={16} color="#a16207" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>About to import {csvData.length} documents into "{selectedCollection}"</strong>
              <div style={{ marginTop: '3px', fontSize: '0.75rem', opacity: 0.85 }}>This action cannot be undone from this view. Make sure the mapping is correct.</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={handleReset} className="di-btn-secondary" style={s.btnSecondary}>Cancel</button>
            <button 
              onClick={handleImport} 
              style={{ ...s.btnPrimary, backgroundColor: '#10b981', borderColor: '#10b981' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
            >
              <Upload size={14} /> Import {csvData.length} records
            </button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 4: IMPORTING ─────────── */}
      {step === 'importing' && (
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Loader2 size={32} strokeWidth={1.75} className="spin-import" style={{ color: '#0f172a', margin: '0 auto 16px', display: 'block' }} />
            <h2 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#0f172a', fontWeight: 600 }}>Importing data</h2>
            <p style={{ margin: '0 0 22px 0', color: '#64748b', fontSize: '0.8rem' }}>
              {importProgress.current} of {importProgress.total} records processed
            </p>

            {/* PROGRESS BAR */}
            <div style={{ maxWidth: '360px', margin: '0 auto' }}>
              <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#0f172a',
                    transition: 'width 0.3s ease',
                    borderRadius: '3px'
                  }}
                />
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#475569', fontWeight: 500, fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace' }}>
                {Math.round((importProgress.current / importProgress.total) * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── STEP 5: DONE ─────────── */}
      {step === 'done' && (
        <div style={s.card}>
          <div style={{ textAlign: 'center', padding: '20px 16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <CheckCircle size={26} strokeWidth={2} color="#10b981" />
            </div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#0f172a', fontWeight: 600 }}>Import complete</h2>
            <p style={{ margin: '0 0 22px 0', color: '#64748b', fontSize: '0.8rem' }}>
              <strong style={{ color: '#10b981', fontWeight: 600 }}>{importProgress.successCount}</strong> records imported successfully to <strong style={{ color: '#0f172a', fontWeight: 600 }}>{selectedCollection}</strong>
              {importProgress.errors.length > 0 && (
                <span>, <strong style={{ color: '#ef4444', fontWeight: 600 }}>{importProgress.errors.length}</strong> errors</span>
              )}
            </p>

            {/* ERRORES SI HAY */}
            {importProgress.errors.length > 0 && (
              <details style={{ textAlign: 'left', maxWidth: '560px', margin: '0 auto 22px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#991b1b', fontSize: '0.8rem' }}>
                  Show {importProgress.errors.length} errors
                </summary>
                <div style={{ marginTop: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                  {importProgress.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: '0.75rem', color: '#7f1d1d', padding: '4px 0', borderBottom: i < importProgress.errors.length - 1 ? '1px solid #fecaca' : 'none' }}>
                      <strong style={{ fontWeight: 600 }}>Row {err.row}:</strong> {err.message}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <button onClick={handleReset} className="di-btn-primary" style={s.btnPrimary}>
              <RotateCcw size={14} /> Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}