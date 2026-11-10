// src/services/fixedSalariesService.ts
// ============================================================================
// Lecturas y escrituras de `fixed_salaries` (tipo FixedSalary en
// src/types/payroll.ts). Un documento por empleado: el id del documento es el
// id del empleado, así guardar otra vez el mismo empleado actualiza su sueldo
// en vez de crear uno repetido. La pantalla lee la lista en vivo con
// useLiveCollection('fixedSalaries').
// ============================================================================
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc,
  type CollectionReference, type DocumentReference,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FixedSalary } from '../types/index';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';

const fixedSalariesCol: CollectionReference<FixedSalary> =
  collection(db, COLLECTIONS.fixedSalaries).withConverter(typedConverter<FixedSalary>());

const fixedSalaryRef = (employeeId: string): DocumentReference<FixedSalary> =>
  doc(db, COLLECTIONS.fixedSalaries, employeeId).withConverter(typedConverter<FixedSalary>());

/** Lo que captura la pantalla; el resto (id, fechas, quién) lo pone el service. */
export interface FixedSalaryInput {
  employeeId: string;
  monthlyAmount: number;
  startDate: string;
}

export const fixedSalariesService = {
  /** Crea o reemplaza el sueldo fijo del empleado (queda activo). */
  async create(input: FixedSalaryInput, updatedByUserName: string): Promise<void> {
    await setDoc(fixedSalaryRef(input.employeeId), {
      ...input,
      id: input.employeeId,
      active: true,
      updatedAt: new Date().toISOString(),
      updatedByUserName,
    });
  },

  async update(
    employeeId: string,
    changes: Partial<Pick<FixedSalary, 'monthlyAmount' | 'startDate' | 'active'>>,
    updatedByUserName: string,
  ): Promise<void> {
    await updateDoc(fixedSalaryRef(employeeId), { ...changes, updatedAt: new Date().toISOString(), updatedByUserName });
  },

  /** Marca una fecha de pago como borrada a mano: createfixedpayroll ya no crea ese pago. */
  async skipPayDate(employeeId: string, payDate: string): Promise<void> {
    await updateDoc(fixedSalaryRef(employeeId), { skippedPayDates: arrayUnion(payDate) });
  },

  async delete(employeeId: string): Promise<void> {
    await deleteDoc(fixedSalaryRef(employeeId));
  },

  async getAll(): Promise<FixedSalary[]> {
    const snapshot = await getDocs(fixedSalariesCol);
    return snapshot.docs.map((salarySnap) => salarySnap.data());
  },

  async getOne(employeeId: string): Promise<FixedSalary | null> {
    const salarySnap = await getDoc(fixedSalaryRef(employeeId));
    return salarySnap.exists() ? salarySnap.data() : null;
  },
};
