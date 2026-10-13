import type { NotificationPrintData } from '@/lib/notificationTypes'

/**
 * Las fichas usan jsPDF, docxtemplater y html2canvas (más de 1 MB). Se cargan
 * recién al descargar una ficha para que la app abra rápido en celulares.
 */
const load = () => import('@/lib/notification')

export async function downloadNotificationPdf(data: NotificationPrintData) { return (await load()).downloadNotificationPdf(data) }
export async function downloadNotificationWord(data: NotificationPrintData) { return (await load()).downloadNotificationWord(data) }
export async function downloadNotificationImage(data: NotificationPrintData) { return (await load()).downloadNotificationImage(data) }
export async function shareNotification(data: NotificationPrintData, format: 'pdf' | 'png') { return (await load()).shareNotification(data, format) }
export async function downloadMultiNotificationPdf(data: NotificationPrintData[]) { return (await load()).downloadMultiNotificationPdf(data) }
export async function downloadMultiNotificationWord(data: NotificationPrintData[]) { return (await load()).downloadMultiNotificationWord(data) }
export async function downloadMultiNotificationImage(data: NotificationPrintData[]) { return (await load()).downloadMultiNotificationImage(data) }
