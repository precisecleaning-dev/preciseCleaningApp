import { useState, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import {
  Upload, ArrowRight, AlertCircle, CheckCircle,
  Database, Loader2, RotateCcw, FileSpreadsheet, ChevronDown, Download
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db } from '../config/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import './DataImportView.css';

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'skip';

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
    id: 'settings_products', name: 'Settings: Products', description: 'Products catalog',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'price', type: 'number' },
      { name: 'description', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'sku', type: 'string' },
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
    id: 'settings_company', name: 'Settings: Company', description: 'Company info / branding',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'logo', type: 'string' },
      { name: 'address', type: 'string' },
      { name: 'phone', type: 'string' },
      { name: 'email', type: 'string' }
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
  // ⭐ Búsqueda + filtro por estado (agiliza CSV con muchas columnas)
  const [columnSearch, setColumnSearch] = useState('');
  const [mappingFilter, setMappingFilter] = useState<'all' | 'matched' | 'custom' | 'skipped'>('all');

  // ⭐ Colección elegida SOLO para descargar la plantilla Excel (independiente de
  //    la colección destino de importación).
  const [exportCollection, setExportCollection] = useState<string>('');

  const getExportDef = (): CollectionDef | undefined =>
    AVAILABLE_COLLECTIONS.find(c => c.id === exportCollection);

  // ⭐ Texto de ayuda por tipo de campo (fila 2 de la plantilla)
  const TYPE_EXAMPLE: Record<FieldType, string> = {
    string: '[texto]',
    number: '[número]',
    boolean: '[VERDADERO/FALSO]',
    date: '[YYYY-MM-DD]',
    array: '[valor1, valor2]',
    skip: '[texto]',
  };

  // ⭐ Genera y descarga una plantilla .xlsx para la colección elegida:
  //    Fila 1 = nombres de los campos (schema) · Fila 2 = formato esperado por tipo.
  const handleDownloadTemplate = () => {
    const def = getExportDef();
    if (!def) {
      alert('Selecciona una colección para descargar su plantilla.');
      return;
    }

    // ⭐ La primera columna es 'id': aquí va el ID de AppSheet, que será el ID
    //    principal del documento en Firestore (marca "usar columna como ID" al importar).
    const headers = ['id', ...def.fields.map(f => f.name)];
    const exampleRow = ['[ID de AppSheet — será el ID del documento]', ...def.fields.map(f => TYPE_EXAMPLE[f.type] || '[texto]')];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    // Ancho de columnas cómodo según el header
    worksheet['!cols'] = headers.map(h => ({ wch: Math.max(14, h.length + 4) }));

    const workbook = XLSX.utils.book_new();
    // Excel no permite estos caracteres en el nombre de la hoja: : \ / ? * [ ]
    const safeSheetName = (def.name.replace(/[:\\/?*[\]]/g, ' ').trim().substring(0, 31)) || 'Plantilla';
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

    XLSX.writeFile(workbook, `plantilla_${def.id}.xlsx`);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCollectionDef = (): CollectionDef | undefined => {
    return AVAILABLE_COLLECTIONS.find(c => c.id === selectedCollection);
  };

  const findBestFieldMatch = (csvHeader: string, fields: CollectionDef['fields']): string | null => {
    const norm = (str: string) => str.toLowerCase().replace(/[\s_-]+/g, '');
    const target = norm(csvHeader);
    const exact = fields.find(f => norm(f.name) === target || (f.label && norm(f.label) === target));
    return exact ? exact.name : null;
  };

  const handleSelectCollection = (collectionId: string) => {
    setSelectedCollection(collectionId);
    const def = AVAILABLE_COLLECTIONS.find(c => c.id === collectionId);
    if (!def || csvHeaders.length === 0) return;

    setFieldMappings(prev => {
      const next: Record<string, FieldMapping> = { ...prev };
      csvHeaders.forEach(h => {
        const match = findBestFieldMatch(h, def.fields);
        if (match) {
          const fieldDef = def.fields.find(f => f.name === match)!;
          next[h] = { firestoreField: match, type: fieldDef.type };
        } else if (!prev[h] || !prev[h].firestoreField) {
          next[h] = { firestoreField: toCamelCase(h), type: detectType(csvData, h) };
        }
      });
      return next;
    });
  };

  // ⭐ Clasifica cada columna del CSV según su mapeo:
  //    matched  = va a un campo que YA EXISTE en la colección (verde)
  //    custom   = crea un campo nuevo que no está en el schema (azul)
  //    skipped  = no se importa (gris)
  const classifyHeader = (header: string): 'matched' | 'custom' | 'skipped' => {
    const m = fieldMappings[header];
    if (!m || m.type === 'skip' || !m.firestoreField) return 'skipped';
    const known = (getCollectionDef()?.fields || []).some(f => f.name === m.firestoreField);
    return known ? 'matched' : 'custom';
  };

  // ⭐ Acciones masivas para no tocar columna por columna
  const reAutoMap = () => { if (selectedCollection) handleSelectCollection(selectedCollection); };

  const bulkSkipCustom = () => {
    setFieldMappings(prev => {
      const next = { ...prev };
      csvHeaders.forEach(h => {
        if (classifyHeader(h) === 'custom') next[h] = { ...next[h], type: 'skip' };
      });
      return next;
    });
  };

  const bulkImportSkipped = () => {
    setFieldMappings(prev => {
      const next = { ...prev };
      csvHeaders.forEach(h => {
        const m = next[h];
        if (!m || m.type === 'skip') {
          next[h] = { firestoreField: (m && m.firestoreField) || toCamelCase(h), type: detectType(csvData, h) };
        }
      });
      return next;
    });
  };

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  const toCamelCase = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^[A-Z]/, (m) => m.toLowerCase());
  };

  const detectType = (data: any[], column: string): FieldType => {
    const samples = data.slice(0, 5).map(r => r[column]).filter(v => v !== null && v !== '' && v !== undefined);
    if (samples.length === 0) return 'string';

    if (samples.every(v => !isNaN(Number(v)) && String(v).trim() !== '')) return 'number';
    if (samples.every(v => ['true', 'false', 'yes', 'no', '1', '0'].includes(String(v).toLowerCase().trim()))) return 'boolean';

    if (samples.every(v => {
      const str = String(v).trim();
      if (!/[-/]/.test(str)) return false;
      return !isNaN(Date.parse(str));
    })) return 'date';

    return 'string';
  };

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
        const num = Number(str.replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
      case 'boolean':
        return ['true', 'yes', '1', 'sí', 'si'].includes(str.toLowerCase());
      case 'date':
        const date = new Date(str);
        if (isNaN(date.getTime())) return str;
        return date.toISOString().split('T')[0];
      case 'array':
        return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
      default:
        return str;
    }
  };

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
        setColumnSearch('');
        setMappingFilter('all');

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

    const hasMappedFields = Object.values(fieldMappings).some(m => m.type !== 'skip' && m.firestoreField);
    if (!hasMappedFields) {
      alert('Debes mapear al menos un campo (no todos pueden estar en "Skip").');
      return;
    }

    setStep('importing');
    setImportProgress({ current: 0, total: csvData.length, errors: [], successCount: 0 });

    try {
      const BATCH_SIZE = 500;
      let successCount = 0;
      const errors: { row: number; message: string }[] = [];

      for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        const batchData = csvData.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        batchData.forEach((row, index) => {
          const rowNumber = i + index + 1;
          try {
            const transformedData = transformRow(row);

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
              const cleanId = docId.replace(/\//g, '_').replace(/^\.+|\.+$/g, '');
              const docRef = doc(db, selectedCollection, cleanId);
              batch.set(docRef, transformedData);
            } else {
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
    setColumnSearch('');
    setMappingFilter('all');
    setImportProgress({ current: 0, total: 0, errors: [], successCount: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const STEPS = ['Upload CSV', 'Map Fields', 'Preview', 'Import'];
  const currentStepIndex = step === 'upload' ? 0 : step === 'mapping' ? 1 : step === 'preview' ? 2 : 3;

  // ⭐ Conteos por estado + columnas visibles (según búsqueda y filtro activo)
  const counts = csvHeaders.reduce(
    (acc, h) => { const c = classifyHeader(h); (acc as any)[c]++; acc.all++; return acc; },
    { all: 0, matched: 0, custom: 0, skipped: 0 }
  );
  const visibleHeaders = csvHeaders.filter(h => {
    if (columnSearch.trim() && !h.toLowerCase().includes(columnSearch.toLowerCase().trim())) return false;
    if (mappingFilter !== 'all' && classifyHeader(h) !== mappingFilter) return false;
    return true;
  });

  // ⭐ Estilo visual por estado (etiqueta + tinte de fila)
  const STATUS_UI: Record<'matched' | 'custom' | 'skipped', { bg: string; border: string; fg: string; label: string; rowBg: string; icon: string }> = {
    matched: { bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857', label: 'En la colección', rowBg: '#f6fefb', icon: '✓' },
    custom:  { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8', label: 'Campo nuevo', rowBg: '#f8fbff', icon: '✎' },
    skipped: { bg: '#f1f5f9', border: '#e2e8f0', fg: '#94a3b8', label: 'No se importa', rowBg: '#ffffff', icon: '⊘' }
  };

  const filterPill = (key: 'all' | 'matched' | 'custom' | 'skipped', label: string, count: number, color: string) => (
    <button
      type="button"
      onClick={() => setMappingFilter(key)}
      className={`di-filter-pill${mappingFilter === key ? ' active' : ''}`}
      style={{ '--pill-color': color } as CSSProperties}
    >
      {label}
      <span className="di-filter-count">{count}</span>
    </button>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fade-in di-page">
      {/* HEADER */}
      <header className="di-header">
        <button className="hamburger-btn-compact" onClick={onOpenMenu}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 className="di-title">Data Import</h1>
          <p className="di-subtitle">Import CSV files from Google Sheets into Firestore</p>
        </div>
      </header>

      {/* ⭐ PANEL: DESCARGAR PLANTILLA EXCEL (independiente de la importación) */}
      <div className="di-card spaced template">
        <div className="di-panel-title-row">
          <FileSpreadsheet size={16} color="#059669" />
          <h2 className="di-panel-title">Descargar plantilla de Excel</h2>
        </div>
        <p className="di-panel-desc">
          Elige una colección y descarga una plantilla <strong>.xlsx</strong> con las columnas correctas. Llénala, expórtala como <strong>CSV</strong> (File → Download → CSV) y súbela abajo para importar.
        </p>
        <div className="di-template-row">
          <div className="di-template-select-wrap">
            <label className="di-label">
              <Database size={11} className="di-label-icon" />
              Colección de la plantilla
            </label>
            <select className="di-input" value={exportCollection} onChange={(e) => setExportCollection(e.target.value)}>
              <option value="">— Selecciona una colección —</option>
              {AVAILABLE_COLLECTIONS.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.description})</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={!exportCollection}
            className="di-btn-secondary green"
          >
            <Download size={14} /> Descargar Plantilla Excel
          </button>
        </div>
        {exportCollection && (
          <p className="di-template-note">
            La plantilla tendrá <strong className="di-accent-green">{(getExportDef()?.fields.length || 0) + 1}</strong> columna(s), incluyendo <strong className="di-accent-dark">id</strong> (el ID de AppSheet que se usará como ID principal del documento). La fila 2 indica el formato esperado de cada campo (p. ej. [YYYY-MM-DD], [número]).
          </p>
        )}
      </div>

      {/* PROGRESS BAR */}
      <div className="di-card spaced di-steps-bar">
        {STEPS.map((label, idx) => (
          <div key={label} className="di-step">
            <div className={`di-step-badge${idx === currentStepIndex ? ' active' : ''}${idx < currentStepIndex ? ' complete' : ''}`}>
              {idx < currentStepIndex ? <CheckCircle size={14} /> : idx + 1}
            </div>
            <div className={`di-step-label${idx === currentStepIndex ? ' active' : ''}`}>
              {label}
            </div>
            {idx < STEPS.length - 1 && <div className={`di-step-line${idx < currentStepIndex ? ' complete' : ''}`} />}
          </div>
        ))}
      </div>

      {/* ─────────── STEP 1: UPLOAD ─────────── */}
      {step === 'upload' && (
        <div className="di-card">
          <h2 className="di-panel-title">Upload your CSV file</h2>
          <p className="di-step1-desc">
            Export your Google Sheet as CSV (File → Download → Comma Separated Values) and drop it here.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`di-dropzone${isDragging ? ' dragging' : ''}`}
          >
            <Upload size={32} strokeWidth={1.5} className="di-dropzone-icon" />
            <div className="di-dropzone-title">
              {isDragging ? 'Drop the CSV here' : 'Click to select or drag a CSV file'}
            </div>
            <div className="di-dropzone-hint">
              Only .csv files · First row must be column headers
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="di-hidden-input"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div className="di-warning-banner">
            <AlertCircle size={15} color="#a16207" className="di-warning-icon" />
            <div className="di-warning-text">
              <strong className="di-strong">How to export from Google Sheets:</strong>
              <ol className="di-help-list">
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
        <div className="di-card">
          <div className="di-section-header">
            <div>
              <h2 className="di-section-title">Map columns to Firestore fields</h2>
              <p className="di-section-desc">
                <FileSpreadsheet size={13} className="di-label-icon" />
                <strong className="di-accent-dark">{csvFile?.name}</strong> · {csvData.length} rows · {csvHeaders.length} columns
              </p>
            </div>
            <button onClick={handleReset} className="di-btn-secondary"><RotateCcw size={13} /> Start Over</button>
          </div>

          {/* SELECCIONAR COLECCIÓN */}
          <div className="di-field-block">
            <label className="di-label">
              <Database size={11} className="di-label-icon" />
              Target Firestore Collection
            </label>
            <select className="di-input" value={selectedCollection} onChange={(e) => handleSelectCollection(e.target.value)}>
              <option value="">— Select a collection —</option>
              {AVAILABLE_COLLECTIONS.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.description})</option>
              ))}
            </select>
            {selectedCollection && (
              <p className="di-field-hint">
                {getCollectionDef()?.fields.length} known fields for this collection. Matching columns were auto-mapped below.
              </p>
            )}
          </div>

          {/* OPCIÓN: USAR ID DEL CSV */}
          <div className="di-id-panel">
            <label className={`di-id-checkbox-row${useExistingId ? ' expanded' : ''}`}>
              <input type="checkbox" checked={useExistingId} onChange={(e) => setUseExistingId(e.target.checked)} className="di-checkbox" />
              <span className="di-id-checkbox-label">Use a column from CSV as the Firestore document ID</span>
            </label>
            {useExistingId && (
              <div>
                <label className="di-label">Column to use as document ID</label>
                <select className="di-input" value={idColumn} onChange={(e) => setIdColumn(e.target.value)}>
                  <option value="">— Select column —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <p className="di-field-hint">
                  If unchecked, Firestore will auto-generate random IDs (recommended).
                </p>
              </div>
            )}
          </div>

          {/* ⭐ BARRA DE CONTROL: buscador + filtros por estado + acciones masivas */}
          {selectedCollection && (
            <div className="di-control-bar">
              {/* Buscador */}
              <div className="di-control-row">
                <div className="di-search-wrap">
                  <input
                    className="di-input with-icon"
                    placeholder="Buscar columna del CSV…"
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                  />
                  <FileSpreadsheet size={14} color="#94a3b8" className="di-search-icon" />
                </div>
                {/* Acciones masivas */}
                <div className="di-bulk-actions">
                  <button type="button" onClick={reAutoMap} className="di-btn-secondary compact" title="Volver a emparejar automáticamente por nombre">
                    <RotateCcw size={13} /> Auto-mapear
                  </button>
                  <button type="button" onClick={bulkImportSkipped} className="di-btn-secondary compact blue" title="Importar como campo nuevo todas las columnas omitidas">
                    Importar omitidas
                  </button>
                  <button type="button" onClick={bulkSkipCustom} className="di-btn-secondary compact" title="No importar las columnas que crearían campos nuevos">
                    Omitir campos nuevos
                  </button>
                </div>
              </div>

              {/* Filtros por estado (con conteos, clickeables) */}
              <div className="di-filters-row">
                {filterPill('all', 'Todas', counts.all, '#0f172a')}
                {filterPill('matched', '✓ En la colección', counts.matched, '#10b981')}
                {filterPill('custom', '✎ Campo nuevo', counts.custom, '#2563eb')}
                {filterPill('skipped', '⊘ No se importa', counts.skipped, '#64748b')}
              </div>
            </div>
          )}

          {/* TABLA DE MAPEO */}
          <div className="di-table-card">
            <table className="di-table">
              <thead>
                <tr>
                  <th className="di-th w-132">Estado</th>
                  <th className="di-th"><FileSpreadsheet size={11} className="di-label-icon" /> Columna del CSV</th>
                  <th className="di-th">Ejemplo</th>
                  <th className="di-th w-36"></th>
                  <th className="di-th">
                    <Database size={11} className="di-label-icon" />
                    {(() => {
                      const def = getCollectionDef();
                      return def ? `Campo en ${def.name}` : 'Campo destino (elige colección)';
                    })()}
                  </th>
                  <th className="di-th">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {visibleHeaders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="di-td empty">
                      {csvHeaders.length === 0 ? 'No hay columnas.' : 'Ninguna columna coincide con la búsqueda/filtro.'}
                    </td>
                  </tr>
                ) : visibleHeaders.map(header => {
                  const mapping = fieldMappings[header];
                  const sampleValue = csvData[0]?.[header] || '';
                  const isSkipped = mapping?.type === 'skip';
                  const collectionDef = getCollectionDef();
                  const knownFields = collectionDef?.fields || [];
                  const isKnownField = knownFields.some(f => f.name === mapping?.firestoreField);
                  const dropdownValue = !mapping?.firestoreField
                    ? ''
                    : (isKnownField ? mapping.firestoreField : '__custom__');
                  const status = classifyHeader(header);

                  return (
                    <tr key={header} className={`di-row ${status}`}>
                      {/* Estado */}
                      <td className="di-td">
                        <span className={`di-status-badge ${status}`}>
                          <span className="di-status-icon">{STATUS_UI[status].icon}</span> {STATUS_UI[status].label}
                        </span>
                      </td>
                      {/* Columna del CSV */}
                      <td className="di-td strong">{header}</td>
                      {/* Ejemplo */}
                      <td className="di-td sample">
                        {String(sampleValue).substring(0, 50)}
                      </td>
                      <td className="di-td"><ArrowRight size={13} color="#cbd5e1" strokeWidth={2} /></td>
                      {/* Campo destino */}
                      <td className="di-td">
                        <div className="di-field-select-col">
                          <select
                            className="di-input compact"
                            value={dropdownValue}
                            disabled={isSkipped}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') {
                                setFieldMappings(prev => ({ ...prev, [header]: { ...prev[header], firestoreField: '' } }));
                              } else if (v === '__custom__') {
                                setFieldMappings(prev => ({ ...prev, [header]: { ...prev[header], firestoreField: isKnownField ? '' : (prev[header]?.firestoreField || '') } }));
                              } else {
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

                          {(dropdownValue === '__custom__' || (!collectionDef && mapping?.firestoreField)) && (
                            <input
                              type="text"
                              className="di-input tiny"
                              value={mapping?.firestoreField || ''}
                              onChange={(e) => setFieldMappings(prev => ({
                                ...prev,
                                [header]: { ...prev[header], firestoreField: e.target.value }
                              }))}
                              disabled={isSkipped}
                              placeholder={collectionDef ? 'customFieldName' : 'Select collection above to use schema'}
                            />
                          )}
                        </div>
                      </td>
                      {/* Tipo */}
                      <td className="di-td">
                        <select
                          className="di-input compact"
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

          {/* Resumen inferior + continuar */}
          <div className="di-summary-row">
            <div className="di-summary-text">
              Se importarán <strong className="di-accent-dark">{counts.matched + counts.custom}</strong> de {csvHeaders.length} columnas
              {counts.skipped > 0 && <span> · {counts.skipped} omitida(s)</span>}
            </div>
            <button
              onClick={() => setStep('preview')}
              disabled={!selectedCollection}
              className="di-btn-primary"
            >
              Preview Data <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 3: PREVIEW ─────────── */}
      {step === 'preview' && (
        <div className="di-card">
          <div className="di-section-header">
            <div>
              <h2 className="di-section-title">Preview before importing</h2>
              <p className="di-section-desc">
                First 5 rows transformed as they will be saved in <strong className="di-accent-dark">{selectedCollection}</strong>
              </p>
            </div>
            <button onClick={() => setStep('mapping')} className="di-btn-secondary">
              <ChevronDown size={13} className="di-icon-rotate-90" /> Back to Mapping
            </button>
          </div>

          <div className="di-preview-list">
            {csvData.slice(0, 5).map((row, idx) => {
              const transformed = transformRow(row);
              const docId = useExistingId && idColumn ? String(row[idColumn] || '(empty!)').trim() : '(auto-generated)';
              return (
                <div key={idx} className="di-preview-row">
                  <div className="di-preview-row-head">
                    <span className="di-preview-row-num">Row {idx + 1}</span>
                    <span className="di-preview-row-id">
                      ID: {docId}
                    </span>
                  </div>
                  <pre className="di-preview-json">
                    {JSON.stringify(transformed, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>

          {csvData.length > 5 && (
            <p className="di-preview-more">
              and <strong className="di-accent-muted">{csvData.length - 5}</strong> more rows will be imported similarly
            </p>
          )}

          <div className="di-warning-banner tight">
            <AlertCircle size={16} color="#a16207" className="di-warning-icon" />
            <div className="di-warning-text">
              <strong className="di-strong">About to import {csvData.length} documents into "{selectedCollection}"</strong>
              <div className="di-warning-subtext">This action cannot be undone from this view. Make sure the mapping is correct.</div>
            </div>
          </div>

          <div className="di-actions-end">
            <button onClick={handleReset} className="di-btn-secondary">Cancel</button>
            <button
              onClick={handleImport}
              className="di-btn-import"
            >
              <Upload size={14} /> Import {csvData.length} records
            </button>
          </div>
        </div>
      )}

      {/* ─────────── STEP 4: IMPORTING ─────────── */}
      {step === 'importing' && (
        <div className="di-card">
          <div className="di-importing-wrap">
            <Loader2 size={32} strokeWidth={1.75} className="spin-import di-importing-icon" />
            <h2 className="di-importing-title">Importing data</h2>
            <p className="di-importing-desc">
              {importProgress.current} of {importProgress.total} records processed
            </p>

            <div className="di-progress-wrap">
              <div className="di-progress-track">
                <div
                  className="di-progress-fill"
                  style={{ '--progress-width': `${(importProgress.current / importProgress.total) * 100}%` } as CSSProperties}
                />
              </div>
              <div className="di-progress-pct">
                {Math.round((importProgress.current / importProgress.total) * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────── STEP 5: DONE ─────────── */}
      {step === 'done' && (
        <div className="di-card">
          <div className="di-done-wrap">
            <div className="di-done-icon-circle">
              <CheckCircle size={26} strokeWidth={2} color="#10b981" />
            </div>
            <h2 className="di-done-title">Import complete</h2>
            <p className="di-done-desc">
              <strong className="di-accent-success">{importProgress.successCount}</strong> records imported successfully to <strong className="di-accent-dark">{selectedCollection}</strong>
              {importProgress.errors.length > 0 && (
                <span>, <strong className="di-accent-danger">{importProgress.errors.length}</strong> errors</span>
              )}
            </p>

            {importProgress.errors.length > 0 && (
              <details className="di-error-details">
                <summary className="di-error-summary">
                  Show {importProgress.errors.length} errors
                </summary>
                <div className="di-error-list">
                  {importProgress.errors.map((err, i) => (
                    <div key={i} className="di-error-item">
                      <strong className="di-strong">Row {err.row}:</strong> {err.message}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <button onClick={handleReset} className="di-btn-primary">
              <RotateCcw size={14} /> Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}