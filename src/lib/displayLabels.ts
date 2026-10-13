export const alertTypeLabels: Record<string, string> = {
  REPEAT_OFFENDER: 'Reincidencia',
  THIRD_NOTIFICATION: 'Tercera notificación / citación',
  FREQUENT_LATE: 'Tardanzas frecuentes',
  ABSENCE: 'Ausencia',
}

export const notificationTypeLabels: Record<string, string> = {
  PRESENTATION: 'Incumplimiento del reglamento',
  LATE_ENTRY: 'Tardanza en el ingreso',
  INAPPROPRIATE_CONDUCT: 'Conducta inapropiada',
}

export function getAlertTypeLabel(type: unknown): string {
  const key = String(type ?? '')
  return alertTypeLabels[key] ?? 'Alerta'
}

export function getNotificationTypeLabel(type: unknown): string {
  const key = String(type ?? '')
  return notificationTypeLabels[key] ?? 'Notificación'
}

/** Hora de ingreso para mostrar. Vacía = tardanza marcada sin hora (el auxiliar no sabía a qué hora entró). */
export function entryTimeLabel(time?: string | null): string {
  return time ? time.slice(0, 5) : 'Sin hora'
}

/** Texto de la notificación de tardanza; sin hora no se inventa una. */
export function lateEntryObservation(time?: string | null): string {
  return time ? `Tardanza en el ingreso. Hora registrada: ${time.slice(0, 5)}.` : 'Tardanza en el ingreso (sin hora registrada).'
}
