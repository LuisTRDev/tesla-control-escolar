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

export function buildWhatsAppMessage(payload: WhatsAppPayload): string {
  const guardianGreeting = payload.guardianName && !payload.guardianName.startsWith('Sin ')
    ? `Estimado(a) ${payload.guardianName}:`
    : 'Estimado padre, madre o apoderado:'
  const date = formatDate(payload.date)
  const dateText = date ? ` del ${date}` : ''
  const numberText = payload.notificationNumber ? ` (N° ${payload.notificationNumber})` : ''

  switch (payload.type) {
    case 'LATE':
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* registró una *tardanza en el ingreso*${dateText}${payload.time ? ` a las *${payload.time}*` : ''}.${numberText}`,
        '', 'Agradecemos su apoyo para reforzar el cumplimiento de las disposiciones institucionales.', '',
        'Atentamente,', 'IEPr Nikola Tesla',
      ].join('\n')

    case 'INAPPROPRIATE_CONDUCT':
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* registra una observación por *conducta inapropiada*${dateText}.${numberText}`,
        payload.observation?.trim() ? `\nDescripción de la observación: ${payload.observation.trim()}` : '',
        '', 'Se solicita brindar el acompañamiento correspondiente.', '', 'Atentamente,', 'IEPr Nikola Tesla',
      ].filter(Boolean).join('\n')

    case 'REGULATION': {
      const detail = payload.violations?.length
        ? `\n\nIncumplimiento(s) registrado(s):\n${payload.violations.map((item) => `• ${item}`).join('\n')}`
        : ''
      const observation = payload.observation?.trim() ? `\n\nDescripción de la observación: ${payload.observation.trim()}` : ''
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* ha incurrido${dateText} en un *incumplimiento del reglamento interno de la institución*.${numberText}${detail}${observation}`,
        '', 'Se solicita revisar la notificación y brindar el acompañamiento necesario.', '', 'Atentamente,', 'IEPr Nikola Tesla',
      ].join('\n')
    }

    case 'ABSENCE':
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* no registra ingreso a la institución${dateText}.`,
        '', 'La asistencia del aula ha sido cerrada y se solicita confirmar o justificar la ausencia por los canales correspondientes.', '',
        'Atentamente,', 'IEPr Nikola Tesla',
      ].join('\n')

    case 'FREQUENT_LATE':
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* registra *tardanzas frecuentes* durante las últimas semanas.`,
        '', 'Solicitamos su apoyo para reforzar la puntualidad y evitar nuevas incidencias.', '',
        'Atentamente,', 'IEPr Nikola Tesla',
      ].join('\n')

    case 'RECURRENCE_2':
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* registra su *segunda notificación* por incumplimiento de las disposiciones institucionales${dateText}.`,
        '', 'Solicitamos su apoyo para evitar nuevas reincidencias.', '', 'Atentamente,', 'IEPr Nikola Tesla',
      ].join('\n')

    case 'RECURRENCE_3':
      return [
        '*IEPr Nikola Tesla*', '', guardianGreeting, '',
        `Se informa que *${payload.studentName}* registra su *tercera notificación*${dateText}.`,
        '', 'De acuerdo con el procedimiento institucional, se solicita al padre, madre o apoderado comunicarse con la institución para el seguimiento correspondiente.', '',
        'Atentamente,', 'IEPr Nikola Tesla',
      ].join('\n')
  }
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
