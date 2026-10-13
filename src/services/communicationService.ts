export type WhatsAppMessageType =
  | 'LATE'
  | 'REGULATION'
  | 'INAPPROPRIATE_CONDUCT'
  | 'RECURRENCE_2'
  | 'RECURRENCE_3'
  | 'ABSENCE'
  | 'FREQUENT_LATE'

export type WhatsAppPayload = {
  phone: string
  guardianName?: string
  studentName: string
  type: WhatsAppMessageType
  notificationNumber?: number
  date?: string
  time?: string
  observation?: string
  violations?: string[]
}

export type WhatsAppSendResult = {
  provider: 'wa.me'
  normalizedPhone: string
  url: string
  opened: boolean
}

/**
 * Fase 5.2 usa wa.me. En producción esta función será el único punto a
 * reemplazar por Supabase Edge Function + WhatsApp Cloud API.
 */
export const WHATSAPP_PROVIDER = 'wa.me' as const

export function normalizePeruPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0051')) digits = digits.slice(2)
  if (digits.startsWith('51') && digits.length === 11) return digits
  if (digits.length === 9 && digits.startsWith('9')) return `51${digits}`
  return digits
}

export function isValidPeruWhatsApp(phone: string): boolean {
  return /^519\d{8}$/.test(normalizePeruPhone(phone))
}

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function getWhatsAppTypeLabel(type: WhatsAppMessageType): string {
  switch (type) {
    case 'LATE': return 'Tardanza en el ingreso'
    case 'REGULATION': return 'Incumplimiento de reglamento interno'
    case 'INAPPROPRIATE_CONDUCT': return 'Conducta inapropiada'
    case 'RECURRENCE_2': return 'Segunda notificación'
    case 'RECURRENCE_3': return 'Tercera notificación / citación'
    case 'ABSENCE': return 'Ausencia registrada'
    case 'FREQUENT_LATE': return 'Tardanzas frecuentes'
  }
}

/** Mensajes de cobranza (módulo Cobranza); se guardan junto a las plantillas escolares. */
export type PensionMessageType = 'PENSION_OVERDUE' | 'PENSION_REMINDER'

export const PENSION_MESSAGE_TYPES: PensionMessageType[] = ['PENSION_OVERDUE', 'PENSION_REMINDER']

export type WhatsAppTemplates = Partial<Record<WhatsAppMessageType | PensionMessageType, string>>

export const WHATSAPP_MESSAGE_TYPES: WhatsAppMessageType[] = [
  'LATE', 'REGULATION', 'INAPPROPRIATE_CONDUCT', 'RECURRENCE_2', 'RECURRENCE_3', 'ABSENCE', 'FREQUENT_LATE',
]

/** Marcadores que el admin puede usar al editar una plantilla. */
export const WHATSAPP_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: '{saludo}', description: 'Estimado(a) <apoderado>: (o saludo genérico si no hay apoderado)' },
  { key: '{apoderado}', description: 'Nombre del apoderado' },
  { key: '{alumno}', description: 'Nombre completo del alumno' },
  { key: '{fecha}', description: 'Fecha del hecho (dd/mm/aaaa)' },
  { key: '{hora}', description: 'Hora de ingreso registrada' },
  { key: '{numero}', description: '(N° de notificación), vacío si no aplica' },
  { key: '{incumplimientos}', description: 'Lista de incumplimientos marcados, vacío si no hay' },
  { key: '{observacion}', description: 'Descripción de la observación, vacío si no hay' },
]

const SIGNATURE = 'Atentamente,\nIEPr Nikola Tesla'
const HEADER = '*IEPr Nikola Tesla*\n\n{saludo}'

export const DEFAULT_WHATSAPP_TEMPLATES: Record<WhatsAppMessageType, string> = {
  LATE: `${HEADER}\n\nSe informa que *{alumno}* registró una *tardanza en el ingreso* del {fecha} a las *{hora}*. {numero}\n\nAgradecemos su apoyo para reforzar el cumplimiento de las disposiciones institucionales.\n\n${SIGNATURE}`,
  INAPPROPRIATE_CONDUCT: `${HEADER}\n\nSe informa que *{alumno}* registra una observación por *conducta inapropiada* del {fecha}. {numero}\n\n{observacion}\n\nSe solicita brindar el acompañamiento correspondiente.\n\n${SIGNATURE}`,
  REGULATION: `${HEADER}\n\nSe informa que *{alumno}* ha incurrido el {fecha} en un *incumplimiento del reglamento interno de la institución*. {numero}\n\n{incumplimientos}\n\n{observacion}\n\nSe solicita revisar la notificación y brindar el acompañamiento necesario.\n\n${SIGNATURE}`,
  ABSENCE: `${HEADER}\n\nSe informa que *{alumno}* no registra ingreso a la institución el {fecha}.\n\nLa asistencia del aula ha sido cerrada y se solicita confirmar o justificar la ausencia por los canales correspondientes.\n\n${SIGNATURE}`,
  FREQUENT_LATE: `${HEADER}\n\nSe informa que *{alumno}* registra *tardanzas frecuentes* durante las últimas semanas.\n\nSolicitamos su apoyo para reforzar la puntualidad y evitar nuevas incidencias.\n\n${SIGNATURE}`,
  RECURRENCE_2: `${HEADER}\n\nSe informa que *{alumno}* registra su *segunda notificación* por incumplimiento de las disposiciones institucionales del {fecha}.\n\nSolicitamos su apoyo para evitar nuevas reincidencias.\n\n${SIGNATURE}`,
  RECURRENCE_3: `${HEADER}\n\nSe informa que *{alumno}* registra su *tercera notificación* del {fecha}.\n\nDe acuerdo con el procedimiento institucional, se solicita al padre, madre o apoderado comunicarse con la institución para el seguimiento correspondiente.\n\n${SIGNATURE}`,
}

export function renderWhatsAppTemplate(template: string, payload: WhatsAppPayload): string {
  const hasGuardian = Boolean(payload.guardianName && !payload.guardianName.startsWith('Sin '))
  const values: Record<string, string> = {
    '{saludo}': hasGuardian ? `Estimado(a) ${payload.guardianName}:` : 'Estimado padre, madre o apoderado:',
    '{apoderado}': hasGuardian ? payload.guardianName ?? '' : 'padre, madre o apoderado',
    '{alumno}': payload.studentName,
    '{fecha}': formatDate(payload.date),
    '{hora}': payload.time ?? '',
    '{numero}': payload.notificationNumber ? `(N° ${payload.notificationNumber})` : '',
    '{incumplimientos}': payload.violations?.length
      ? `Incumplimiento(s) registrado(s):\n${payload.violations.map((item) => `• ${item}`).join('\n')}`
      : '',
    '{observacion}': payload.observation?.trim() ? `Descripción de la observación: ${payload.observation.trim()}` : '',
  }
  let text = template
  // Si falta la fecha o la hora se quita la frase completa ("del {fecha}", "a las *{hora}*")
  // para no dejar textos como "registró una tardanza del  a las **".
  if (!values['{fecha}']) text = text.replace(/\s+(?:del|el)\s+\{fecha\}/g, '')
  if (!values['{hora}']) text = text.replace(/\s+a las\s+\*?\{hora\}\*?/g, '')
  return text
    .replace(/\{[a-z_]+\}/g, (key) => values[key] ?? key)
    // Limpieza para marcadores vacíos: espacios colgando y párrafos en blanco repetidos.
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildWhatsAppMessage(payload: WhatsAppPayload, templates: WhatsAppTemplates = {}): string {
  const custom = templates[payload.type]?.trim()
  return renderWhatsAppTemplate(custom || DEFAULT_WHATSAPP_TEMPLATES[payload.type], payload)
}

export function buildWaMeUrl(phone: string, message: string): string {
  const normalizedPhone = normalizePeruPhone(phone)
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
}

export async function sendWhatsApp(params: { phone: string; message: string }): Promise<WhatsAppSendResult> {
  const normalizedPhone = normalizePeruPhone(params.phone)
  if (!/^519\d{8}$/.test(normalizedPhone)) {
    throw new Error('El teléfono del apoderado no es un celular peruano válido.')
  }
  if (!params.message.trim()) throw new Error('El mensaje de WhatsApp está vacío.')

  const url = buildWaMeUrl(normalizedPhone, params.message.trim())
  const popup = window.open(url, '_blank', 'noopener,noreferrer')
  return { provider: WHATSAPP_PROVIDER, normalizedPhone, url, opened: Boolean(popup) }
}
