/* ============================================================================
   Pagos fijos quincenales — createfixedpayroll (scheduled)
   ----------------------------------------------------------------------------
   Cada sueldo fijo activo (colección fixed_salaries, uno por empleado) se paga
   en dos partes: el 15 y el último día de cada mes. Esta función corre a diario
   a las 6:00 (hora de Texas) y crea en `payroll` los pagos que ya tocan y
   todavía no existen, con status Pending (los marca pagados la pestaña Fixed
   pay de Payroll).

   IDEMPOTENCIA: el id del pago es fijo (fixed_{empleado}_{AAAA-MM-DD}) y se
   crea con create(), que falla si ya existe. Correr dos veces, o reintentar,
   nunca duplica un pago.

   DÍAS QUE FALLARON: además de los de este mes, revisa el último día del mes
   pasado. Si la función no corrió ese día, el pago se crea al día siguiente.
   No crea pagos de antes de `startDate` del sueldo (el día que se dio de alta
   o se reanudó).

   La división en dos partes es la MISMA que getBiweeklyAmounts de
   src/features/payroll/fixedPay.ts (la pantalla): si cambia una, cambia la otra.
   ============================================================================ */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";

const TIMEZONE = "America/Chicago";
/** Código de Firestore cuando create() encuentra el documento ya creado. */
const ALREADY_EXISTS = 6;

// Perezoso: index.ts llama a admin.initializeApp() al cargar.
const db = () => admin.firestore();

interface FixedSalaryDoc {
  employeeId?: string;
  monthlyAmount?: number;
  startDate?: string;
  active?: boolean;
}

const padToTwoDigits = (value: number) => String(value).padStart(2, "0");

/** Hoy (AAAA-MM-DD) en Texas: la función corre en UTC. */
const getTodayInTexas = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

/** Último día del mes (`month` de 1 a 12). */
const getLastDayOfMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Fechas de pago que ya llegaron: el último día del mes pasado y, de este mes, el 15 y el último día. */
const getDuePayDates = (todayYmd: string): string[] => {
  const [year, month, day] = todayYmd.split("-").map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const dueDates = [
    `${previousYear}-${padToTwoDigits(previousMonth)}-${padToTwoDigits(getLastDayOfMonth(previousYear, previousMonth))}`,
  ];
  if (day >= 15) dueDates.push(`${year}-${padToTwoDigits(month)}-15`);
  const lastDay = getLastDayOfMonth(year, month);
  if (day === lastDay) dueDates.push(`${year}-${padToTwoDigits(month)}-${padToTwoDigits(lastDay)}`);
  return dueDates;
};

/** Las dos partes del sueldo mensual; el centavo que sobra va en la del último día. */
const getBiweeklyAmounts = (monthlyAmount: number) => {
  const monthlyCents = Math.round(monthlyAmount * 100);
  const firstHalfCents = Math.floor(monthlyCents / 2);
  return { firstHalf: firstHalfCents / 100, secondHalf: (monthlyCents - firstHalfCents) / 100 };
};

/** Crea UN pago fijo si no existe; devuelve true si lo creó. */
const createFixedPayment = async (
  salaryId: string, employeeId: string, payDate: string, amount: number,
): Promise<boolean> => {
  try {
    await db().collection("payroll").doc(`fixed_${salaryId}_${payDate}`).create({
      propertyId: "",
      employeeId,
      date: payDate,
      baseAmount: amount,
      extraAmount: 0,
      extraNote: "",
      discountAmount: 0,
      discountNote: "",
      totalAmount: amount,
      status: "Pending",
      payType: "fixed",
      fixedSalaryId: salaryId,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === ALREADY_EXISTS) return false;
    throw error;
  }
};

export const createfixedpayroll = onSchedule(
  {
    schedule: "every day 06:00",
    region: "us-central1",
    timeZone: TIMEZONE,
  },
  async () => {
    const todayYmd = getTodayInTexas();
    const dueDates = getDuePayDates(todayYmd);
    const salariesSnap = await db().collection("fixed_salaries").where("active", "==", true).get();
    let createdCount = 0;

    for (const salaryDoc of salariesSnap.docs) {
      const salary = salaryDoc.data() as FixedSalaryDoc;
      const employeeId = salary.employeeId || salaryDoc.id;
      const { firstHalf, secondHalf } = getBiweeklyAmounts(Number(salary.monthlyAmount) || 0);
      if (firstHalf <= 0) continue;

      for (const payDate of dueDates) {
        if (payDate < (salary.startDate || "")) continue;
        const amount = payDate.endsWith("-15") ? firstHalf : secondHalf;
        try {
          if (await createFixedPayment(salaryDoc.id, employeeId, payDate, amount)) createdCount++;
        } catch (error) {
          // Un pago que falla no detiene los demás; se vuelve a intentar mañana.
          logger.error(`createfixedpayroll: no se pudo crear el pago ${salaryDoc.id} ${payDate}`, error);
        }
      }
    }

    logger.info(`createfixedpayroll (${todayYmd}): ${createdCount} pago(s) creados de ${salariesSnap.size} sueldo(s).`);
  },
);
