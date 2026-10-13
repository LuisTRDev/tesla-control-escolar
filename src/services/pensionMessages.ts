import type { PensionMessageType, WhatsAppTemplates } from '@/services/communicationService'

/** Una pensión impaga: vencida (mora) o por vencer (recordatorio). */
export type PensionDue = { year: number; month: number; amount: number; dueDate: string }

export type PensionMessagePayload = {
  type: PensionMessageType
  guardianName: string
  studentNames: string[]
  /** Meses que se cobran: todos los vencidos (mora) o el que está por vencer (recordatorio). */
  months: PensionDue[]
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function getPensionMessageLabel(type: PensionMessageType): string {
  return type === 'PENSION_OVERDUE' ? 'Pensión vencida (mora)' : 'Recordatorio de pensión por vencer'
}

export const PENSION_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: '{saludo}', description: 'Estimado(a) <apoderado>:' },
  { key: '{apoderado}', description: 'Nombre del apoderado' },
  { key: '{alumnos}', description: 'Nombre(s) de sus alumnos' },
  { key: '{meses}', description: 'Mes o meses que se cobran (ej. agosto y septiembre de 2026)' },
  { key: '{cantidad_meses}', description: 'Cuántos meses (ej. 2 meses)' },
  { key: '{total}', description: 'Monto total (ej. S/500)' },
  { key: '{vencimiento}', description: 'Fecha de vencimiento del mes más antiguo (dd/mm/aaaa)' },
]

const SIGNATURE = 'Atentamente,\nIEPr Nikola Tesla'
const HEADER = '*IEPr Nikola Tesla*\n\n{saludo}'

export const DEFAULT_PENSION_TEMPLATES: Record<PensionMessageType, string> = {
  PENSION_OVERDUE: `${HEADER}\n\nLe informamos que a la fecha se encuentra pendiente el pago de la pensión de *{meses}* correspondiente a *{alumnos}*, por un total de *{total}*.\n\nLe agradeceremos regularizar el pago a la brevedad. Si ya lo realizó, por favor envíenos el comprobante por este medio y disculpe la molestia.\n\n${SIGNATURE}`,
  PENSION_REMINDER: `${HEADER}\n\nLe recordamos que la pensión de *{meses}* correspondiente a *{alumnos}* ({total}) vence el *{vencimiento}*.\n\nAgradecemos su puntualidad. Si ya realizó el pago, por favor ignore este mensaje.\n\n${SIGNATURE}`,
}

export function formatSoles(amount: number): string {
  return `S/${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/** "agosto y septiembre de 2026" o, si cruza de año, "diciembre de 2025 y enero de 2026". */
export function formatPensionMonths(months: PensionDue[]): string {
  const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month)
  const years = new Set(sorted.map((m) => m.year))
  if (years.size === 1) return `${joinList(sorted.map((m) => MONTH_NAMES[m.month - 1]))} de ${sorted[0]?.year ?? ''}`.trim()
  return joinList(sorted.map((m) => `${MONTH_NAMES[m.month - 1]} de ${m.year}`))
}

function formatDate(value?: string) {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export function renderPensionTemplate(template: string, payload: PensionMessagePayload): string {
  const months = [...payload.months].sort((a, b) => a.year - b.year || a.month - b.month)
  const name = payload.guardianName.trim()
  const values: Record<string, string> = {
    '{saludo}': name ? `Estimado(a) ${name}:` : 'Estimado padre, madre o apoderado:',
    '{apoderado}': name || 'padre, madre o apoderado',
    '{alumnos}': payload.studentNames.length ? joinList(payload.studentNames) : 'su menor hijo(a)',
    '{meses}': formatPensionMonths(months),
    '{cantidad_meses}': `${months.length} ${months.length === 1 ? 'mes' : 'meses'}`,
    '{total}': formatSoles(months.reduce((sum, m) => sum + m.amount, 0)),
    '{vencimiento}': formatDate(months[0]?.dueDate),
  }
  return template
    .replace(/\{[a-z_]+\}/g, (key) => values[key] ?? key)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildPensionMessage(payload: PensionMessagePayload, templates: WhatsAppTemplates = {}): string {
  const custom = templates[payload.type]?.trim()
  return renderPensionTemplate(custom || DEFAULT_PENSION_TEMPLATES[payload.type], payload)
}
