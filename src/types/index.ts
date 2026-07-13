// src/types/index.ts
import type { LucideIcon } from 'lucide-react';

// ==========================================
// 1. SYSTEM SECURITY & USERS (RBAC)
// ==========================================

export interface Permission {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  scope: 'All' | 'Own';
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface SystemUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  altPhone: string;
  roleId: string;
  status: 'Active' | 'Pending Invite' | 'Inactive';
  teamId?: string; // Para el catálogo de equipos
}

// ==========================================
// 2. CORE BUSINESS LOGIC (Properties/Jobs)
// ==========================================

export interface Property {
  id: string;
  statusId: string;
  invoiceStatus: string | 'Needs Invoice' | 'Pending' | 'Paid';
  receiveDate: string;
  scheduleDate: string;
  client: string;
  note: string;
  address: string;
  employeeNote: string;
  serviceId: string;
  rooms: string;
  bathrooms: string;
  priorityId: string;
  teamId: string;
  timeIn: string;
  timeOut: string;
  
  // Asignación de personal
  assignedWorkers?: string[]; 
  
  // Subida de imágenes
  beforePhotos?: string[];
  afterPhotos?: string[];
  
  // Opcionales / Visuales (Legacy)
  description?: string;
  city?: string;
  size?: string;
  bottomNote?: string;
  borderColorClass?: string;
  tag?: {
    text: string;
    type: string;
  };

  // Work Log (tiempos de inicio y fin de trabajo) — usado por HousesView.tsx,
  // PropertyDetailModal.tsx y PipelineBoardView.tsx, antes redeclarado por separado en
  // cada uno como extensión local del tipo.
  employeeStartedBy?: string | null;
  employeeStartedAt?: string | null;
  employeeFinishedBy?: string | null;
  employeeFinishedAt?: string | null;
}

// ==========================================
// 3. SETTINGS & CATALOGS
// ==========================================

export interface SettingOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface Status {
  id: string;
  name: string;
  business?: string;
  color: string;
  order: number | string; // Orden en el que aparece en pantalla
  showInDashboard?: boolean; // NUEVO: Checkbox para saber si se muestra en el inicio
  dashboardOrder?: number; // Orden dentro del dashboard (distinto de `order`)
}
export interface Team { id: string; name: string; business?: string; color: string; }
export interface Priority { id: string; name: string; business?: string; color: string; }
export interface Service { id: string; name: string; estimatedTime?: string; business?: string; color?: string; }

export interface Customer { 
  id: string; 
  name: string; 
  email?: string; 
  phone?: string; 
  address?: string; 
  type?: string; 
  business?: string; 
  note?: string; 
  cityStateZip?: string; 
  color?: string; 
}

export interface CategoryExpense { id: string; name: string; }
export interface Responsable { id: string; name: string; color: string; }
export interface Tax { id: string; percentage: number; name?: string; }
export interface Place { id: string; name: string; }
export interface PaymentMethod { id: string; name: string; }
export interface Task { id: string; placeId: string; name: string; }
export interface Product { id: string; name: string; price: string | number; }
export interface Business { id: string; name: string; }

// ==========================================
// 4. PAYROLL / PAYMENTS
// ==========================================

export interface PayrollRecord {
  id?: string;
  propertyId: string;
  date: string;
  employeeId: string;
  baseAmount: number;
  extraAmount: number;
  extraNote: string;
  discountAmount: number;
  discountNote: string;
  totalAmount: number;
  status?: 'Pending' | 'Paid'; // <-- ESTO ES NUEVO
}