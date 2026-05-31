import React from 'react';

// --- TUS TIPOS ORIGINALES (FUSIONADOS CON LAS NUEVAS PROPIEDADES) ---

export interface Property {
  id: string;
  statusId: string;
  // Agregamos 'Pre-Paid' a tu tipado original
  invoiceStatus: 'Pre-Paid' | 'Needs Invoice' | 'Pending' | 'Paid' | '' | string;
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
  
  // Arreglos nuevos para las funcionalidades de la casa
  assignedWorkers?: string[];
  beforePhotos?: string[];
  afterPhotos?: string[];
  
  // Campos opcionales para las tarjetas iniciales
  city?: string;
  size?: string;
  description?: string;
  tag?: { text: string; type: 'team' | 'prepaid' };
  bottomNote?: string;
  borderColorClass?: string;

  // NUEVO: Work Log (Tiempos de Inicio y Fin de trabajo)
  employeeStartedBy?: string | null;
  employeeStartedAt?: string | null;
  employeeFinishedBy?: string | null;
  employeeFinishedAt?: string | null;
}

export interface SettingOption {
  id: string;
  label: string;
  icon: React.ElementType;
}

export interface CategoryExpense { id: string; name: string; }
export interface Team { id: string; name: string; business?: string; color: string; }
export interface Responsable { id: string; name: string; color: string; }
export interface Priority { id: string; name: string; business?: string; color: string; }

export interface Status { 
  id: string; 
  order: string | number; 
  name: string; 
  business?: string; 
  color: string;
  // Propiedades nuevas para el dashboard
  showInDashboard?: boolean;
  dashboardOrder?: number;
}

export interface Tax { id: string; percentage: number; name?: string; }
export interface Place { id: string; name: string; }
export interface Service { id: string; name: string; estimatedTime?: string; business?: string; description?: string; }
export interface PaymentMethod { id: string; name: string; }
export interface Task { id: string; placeId: string; name: string; }
export interface Product { id: string; name: string; price: string | number; }
export interface Business { id: string; name: string; }

export interface Customer {
  id: string;
  color?: string;
  type?: string;
  name: string;
  business?: string;
  note?: string;
  address?: string;
  cityStateZip?: string;
  email?: string;
  phone?: string;
}


// --- TIPOS NUEVOS PARA EL SISTEMA Y SEGURIDAD ---

export interface Permission {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  scope: 'All' | 'Own';
  // ⭐ NUEVO: IDs de status permitidos (solo aplica al módulo Houses)
  // Si está vacío o undefined, no se aplica filtro (ver todos)
  allowedStatusIds?: string[];
}

export interface Role {
  id: string;
  name: string;
  // ⭐ NUEVO: descripción del rol (ya se usaba en RolesView pero no estaba en el tipo)
  description?: string;
  permissions: Permission[];
}

export interface SystemUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  teamId?: string;
  isActive: boolean;
  status?: 'Active' | 'Pending Invite' | 'Inactive';
}

// --- TIPOS PARA FINANZAS Y FACTURACIÓN ---

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
  status?: 'Pending' | 'Paid';
}

export interface BilledService {
  id?: string;
  propertyId: string;
  serviceId: string;
  quantity: number;
  price: number;
  subtotal: number;
  applyTax: 'Yes' | 'No';
  minusTax: 'Yes' | 'No';
  taxPercentage: number;
  taxAmount: number;
  total: number;
  notes: string;
  createdAt?: string;
}

// --- TIPOS PARA EL MURO SOCIAL (NOTICE BOARD) ---

export interface Announcement {
  id?: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  likes: string[]; 
  seenBy: string[]; 
}

export interface AnnouncementComment {
  id?: string;
  announcementId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}