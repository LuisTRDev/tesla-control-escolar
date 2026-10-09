import { supabase } from '@/lib/supabase'
import { addDaysToKey, lastDayOfMonthKey as lastDayOfMonth, toDateKey } from '@/lib/dates'

export type GuardianDebtStatus = 'AL_DIA' | 'POR_VENCER' | 'MOROSO'

/** Reglas fijas del colegio: no configurables desde la UI. */
export const PENSION_AMOUNT = 250
const DUE_SOON_DAYS = 5

export type GuardianMonth = {
  guardianId: string
  fullName: string
  dni: string
  phone: string
  students: { id: string; name: string; classroom: string }[]
  paymentId: string | null
  amount: number
  dueDate: string
  paid: boolean
  paidAt: string | null
  notes: string
  status: GuardianDebtStatus
}

export type MonthlyHistoryEntry = {
  year: number
  month: number
  dueDate: string
  amount: number
  paid: boolean
  paidAt: string | null
}

export function computeDebtStatus(paid: boolean, dueDate: string, today: string = toDateKey()): GuardianDebtStatus {
  if (paid) return 'AL_DIA'
  if (dueDate < today) return 'MOROSO'
  return dueDate <= addDaysToKey(today, DUE_SOON_DAYS) ? 'POR_VENCER' : 'AL_DIA'
}

/**
 * Trae el estado de la pensión de TODOS los apoderados para un mes
 * específico. Antes de leer, asegura (vía RPC) que exista la fila de
 * ese mes para cada apoderado — así uno nuevo agregado después
 * también aparece automáticamente, con monto y vencimiento ya fijos.
 */
export async function getPensionStatusForMonth(year: number, month: number): Promise<GuardianMonth[]> {
  const { error: ensureError } = await supabase.rpc('ensure_pension_rows', { p_year: year, p_month: month })
  if (ensureError) throw ensureError

  const [{ data: guardians, error: gError }, { data: links, error: lError }, { data: payments, error: pError }] = await Promise.all([
    supabase.from('guardians').select('id, full_name, dni, phone').order('full_name', { ascending: true }),
    supabase.from('student_guardians').select('guardian_id, students(id, first_name, last_name, classroom_id, classrooms(grade, section))'),
    supabase.from('pension_payments').select('id, guardian_id, amount, due_date, paid, paid_at, notes').eq('period_year', year).eq('period_month', month),
  ])
  if (gError) throw gError
  if (lError) throw lError
  if (pError) throw pError

  const today = toDateKey()
  const fallbackDue = lastDayOfMonth(year, month)

  const studentsByGuardian = new Map<string, { id: string; name: string; classroom: string }[]>()
  for (const row of (links ?? []) as Record<string, any>[]) {
    const gid = String(row.guardian_id)
    const rawStudent = Array.isArray(row.students) ? row.students[0] : row.students
    if (!rawStudent) continue
    const rawClassroom = Array.isArray(rawStudent.classrooms) ? rawStudent.classrooms[0] : rawStudent.classrooms
    const entry = {
      id: String(rawStudent.id),
      name: `${rawStudent.first_name ?? ''} ${rawStudent.last_name ?? ''}`.trim(),
      classroom: rawClassroom ? `${rawClassroom.grade ?? ''} ${rawClassroom.section ?? ''}`.trim() : 'Sin aula',
    }
    const list = studentsByGuardian.get(gid) ?? []
    list.push(entry)
    studentsByGuardian.set(gid, list)
  }

  const paymentByGuardian = new Map<string, Record<string, any>>()
  for (const row of (payments ?? []) as Record<string, any>[]) {
    paymentByGuardian.set(String(row.guardian_id), row)
  }

  return ((guardians ?? []) as Record<string, any>[]).map((g) => {
    const id = String(g.id)
    const payment = paymentByGuardian.get(id)
    const paid = payment?.paid ?? false
    const dueDate = payment?.due_date ?? fallbackDue
    return {
      guardianId: id,
      fullName: g.full_name ?? '(Sin nombre)',
      dni: g.dni ?? '',
      phone: g.phone ?? '',
      students: studentsByGuardian.get(id) ?? [],
      paymentId: payment?.id != null ? String(payment.id) : null,
      amount: Number(payment?.amount ?? PENSION_AMOUNT),
      dueDate,
      paid,
      paidAt: payment?.paid_at ?? null,
      notes: payment?.notes ?? '',
      status: computeDebtStatus(paid, dueDate, today),
    }
  })
}

/** Marca (o desmarca) la pensión de un apoderado como pagada, para un mes específico. */
export async function setPensionPaid(
  guardianId: string,
  year: number,
  month: number,
  paid: boolean,
  notes?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    guardian_id: Number(guardianId),
    period_year: year,
    period_month: month,
    amount: PENSION_AMOUNT,
    due_date: lastDayOfMonth(year, month),
    paid,
    paid_at: paid ? new Date().toISOString() : null,
  }
  if (notes !== undefined) payload.notes = notes || null

  const { error } = await supabase.from('pension_payments').upsert(payload, { onConflict: 'guardian_id,period_year,period_month' })
  if (error) throw error
}

/** Solo actualiza las notas (sin tocar el estado de pago), para no pisar `paid` con un upsert parcial. */
export async function setPensionNotes(guardianId: string, year: number, month: number, notes: string): Promise<void> {
  const { error } = await supabase
    .from('pension_payments')
    .update({ notes: notes || null })
    .eq('guardian_id', Number(guardianId))
    .eq('period_year', year)
    .eq('period_month', month)
  if (error) throw error
}

/** Historial de los últimos N meses de un apoderado (para ver "cómo venía pagando"). */
export async function getGuardianPaymentHistory(guardianId: string, monthsBack = 6): Promise<MonthlyHistoryEntry[]> {
  const { data, error } = await supabase
    .from('pension_payments')
    .select('period_year, period_month, due_date, amount, paid, paid_at')
    .eq('guardian_id', Number(guardianId))
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(monthsBack)
  if (error) throw error
  return (data ?? []).map((row) => ({
    year: row.period_year,
    month: row.period_month,
    dueDate: row.due_date,
    amount: Number(row.amount),
    paid: row.paid,
    paidAt: row.paid_at,
  }))
}
