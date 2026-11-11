// src/services/fixedSalariesService.ts
// ============================================================================
// Lecturas y escrituras de `fixed_salaries` (tipo FixedSalary en
// src/types/payroll.ts). Un documento por empleado: el id del documento es el
// id del empleado, así guardar otra vez el mismo empleado actualiza su sueldo
// en vez de crear uno repetido. La pantalla lee la lista en vivo con
// useLiveCollection('fixedSalaries').
// ============================================================================
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, runTransaction, updateDoc,
  type CollectionReference, type DocumentReference,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { FixedSalary, FixedSalaryInput } from '../types/index';
import { COLLECTIONS } from '../lib/firebase/collections';
import { typedConverter } from '../lib/firebase/typedConverter';
import type { BatchOp } from '../shared/data/batchWrites';

const fixedSalariesCol: CollectionReference<FixedSalary> =
  collection(db, COLLECTIONS.fixedSalaries).withConverter(typedConverter<FixedSalary>());

const fixedSalaryRef = (employeeId: string): DocumentReference<FixedSalary> =>
  doc(db, COLLECTIONS.fixedSalaries, employeeId).withConverter(typedConverter<FixedSalary>());

/** Mensaje del error de `create` cuando el empleado ya tiene sueldo fijo. */
export const FIXED_SALARY_EXISTS = 'FIXED_SALARY_EXISTS';

export const fixedSalariesService = {
  /**
   * Crea el sueldo fijo del empleado (queda activo). En una transacción: si el
   * empleado YA tiene uno (aunque la pantalla no lo haya cargado), falla con
   * FIXED_SALARY_EXISTS en vez de reemplazarlo y borrar su skippedPayDates.
   */
  async create(input: FixedSalaryInput, updatedByUserName: string): Promise<void> {
    const salaryRef = fixedSalaryRef(input.employeeId);
    await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(salaryRef);
      if (existingSnap.exists()) throw new Error(FIXED_SALARY_EXISTS);
      transaction.set(salaryRef, {
        ...input,
        id: input.employeeId,
        active: true,
        updatedAt: new Date().toISOString(),
        updatedByUserName,
      });
    });
  },

  async update(
    employeeId: string,
    changes: Partial<Pick<FixedSalary, 'monthlyAmount' | 'startDate' | 'active'>>,
    updatedByUserName: string,
  ): Promise<void> {
    await updateDoc(fixedSalaryRef(employeeId), { ...changes, updatedAt: new Date().toISOString(), updatedByUserName });
  },

  /** Operación de batch que marca una fecha de pago como borrada a mano: createfixedpayroll ya no crea ese pago. */
  skipPayDateOp(employeeId: string, payDate: string): BatchOp {
    return (batch) => batch.update(fixedSalaryRef(employeeId), { skippedPayDates: arrayUnion(payDate) });
  },

  /** Operación de batch que guarda el sueldo completo en el id de su empleado (para moverlo de id). */
  setOp(salary: FixedSalary): BatchOp {
    return (batch) => batch.set(fixedSalaryRef(salary.employeeId), salary);
  },

  deleteOp(employeeId: string): BatchOp {
    return (batch) => batch.delete(fixedSalaryRef(employeeId));
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
