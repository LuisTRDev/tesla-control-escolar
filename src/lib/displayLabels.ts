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
