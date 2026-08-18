import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { jsPDF } from 'jspdf'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'

export const MAX_NOTIFICATIONS_PER_PAGE = 3

export type NotificationPrintData = {
  student: Student
  classroom: Classroom
  presentation?: PresentationRecord
  attendance?: AttendanceRecord
  notificationNumber: number
}

const A4_WIDTH_MM = 210
const CARD_HEIGHT_MM = 99

const rules = [
  ['hairstyle', 'Peinado no acorde con las disposiciones institucionales.'],
  ['uniform', 'Uso inadecuado o incompleto del uniforme.'],
  ['garment', 'Prenda no correspondiente al uniforme institucional.'],
  ['late', 'Tardanza en el ingreso'],
  ['conduct', 'Conducta inapropiada'],
] as const

type RuleKey = typeof rules[number][0]

type ReasonState = Record<RuleKey, boolean>

function cleanFilename(value: string) {
  return value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ-]/g, '')
}

function individualFilename(student: Student, ext: string) {
  return `Notificacion-Reglamento-${cleanFilename(`${student.firstName}-${student.lastName}`)}.${ext}`
}

function multiFilename(ext: string) {
  const date = new Date().toISOString().slice(0, 10)
  return `Multinotificacion-Reglamento-${date}.${ext}`
}

function dateParts(date: string) {
  const [y, m, d] = date.split('-')
  return { y, m, d }
}

function sourceDate(data: NotificationPrintData) {
  return data.presentation?.date ?? data.attendance?.date ?? new Date().toISOString().slice(0, 10)
}

function reasons(data: NotificationPrintData): ReasonState {
  const presentation = data.presentation
  return {
    hairstyle: Boolean(presentation?.hairstyleViolation),
    uniform: Boolean(presentation?.uniformUsageViolation),
    garment: Boolean(presentation?.nonInstitutionalGarment),
    late: Boolean(presentation?.lateEntryViolation || data.attendance?.status === 'LATE'),
    conduct: Boolean(presentation?.inappropriateConductViolation),
  }
}

function observation(data: NotificationPrintData) {
  const explicit = data.presentation?.observation?.trim()
  if (explicit) return explicit
  if (data.attendance?.status === 'LATE') return `Tardanza en el ingreso. Hora registrada: ${data.attendance.time}.`
  return ''
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

function drawCheckbox(doc: jsPDF, x: number, y: number, checked: boolean, size = 3) {
  doc.rect(x, y - size + 0.35, size, size)
  if (checked) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.4)
    doc.text('X', x + size / 2, y - 0.15, { align: 'center' })
  }
}

function drawNotificationCard(doc: jsPDF, data: NotificationPrintData, top: number, showOuterBorder: boolean) {
  const { student, classroom, notificationNumber } = data
  const state = reasons(data)
  const date = sourceDate(data)
  const dp = dateParts(date)
  const left = 5.2
  const right = A4_WIDTH_MM - 5.2
  const width = right - left

  if (showOuterBorder) {
    doc.setDrawColor(120)
    doc.setLineWidth(0.16)
    doc.rect(3, top + 2.1, A4_WIDTH_MM - 6, CARD_HEIGHT_MM - 4.2)
  }

  doc.setTextColor(18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.3)
  doc.text('INSTITUCIÓN EDUCATIVA PRIVADA “NIKOLA TESLA”', left, top + 6.0)
  doc.setFontSize(6.7)
  doc.text('NOTIFICACIÓN SOBRE INCUMPLIMIENTO DE REGLAMENTO INTERNO DE LA INSTITUCIÓN', left, top + 9.3)
  doc.setFontSize(6.5)
  doc.text(`FECHA: ${dp.d} / ${dp.m} / ${dp.y}`, right, top + 6.0, { align: 'right' })
  doc.text(`N° ${notificationNumber}`, right, top + 9.3, { align: 'right' })

  doc.setFontSize(6.5)
  doc.text(`ESTUDIANTE: ${student.firstName} ${student.lastName}`, left, top + 13.2)
  doc.text(`AÑO Y SECCIÓN: ${classroom.grade} ${classroom.section}`, right, top + 13.2, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.75)
  const intro = 'Por medio de la presente, se comunica al apoderado que el estudiante ha incurrido en un incumplimiento de las disposiciones institucionales, específicamente:'
  doc.text(doc.splitTextToSize(intro, width), left, top + 16.7)

  const tableTop = top + 21.6
  const leftColWidth = 92
  const rightColX = left + leftColWidth + 4
  const rightColWidth = width - leftColWidth - 4

  doc.setDrawColor(120)
  doc.setLineWidth(0.12)
  doc.rect(left, tableTop, leftColWidth, 29.0)
  const rowHeight = 5.8
  for (let i = 1; i < 5; i += 1) doc.line(left, tableTop + i * rowHeight, left + leftColWidth, tableTop + i * rowHeight)

  rules.forEach(([key, label], index) => {
    const yy = tableTop + 4.1 + index * rowHeight
    drawCheckbox(doc, left + 2.2, yy, state[key], 2.8)
    doc.setFont('helvetica', state[key] ? 'bold' : 'normal')
    doc.setFontSize(5.9)
    doc.text(`${index + 1}.`, left + 7, yy)
    const lines = doc.splitTextToSize(label, leftColWidth - 17)
    doc.text(lines.slice(0, 2), left + 13, yy)
  })

  doc.rect(rightColX, tableTop, rightColWidth, 29.0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.15)
  doc.text('DESCRIPCIÓN DE LA OBSERVACIÓN:', rightColX + 2.2, tableTop + 4.2)
  doc.line(rightColX + 2, tableTop + 6.7, rightColX + rightColWidth - 2, tableTop + 6.7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.7)
  const obs = observation(data)
  const obsLines = doc.splitTextToSize(obs || ' ', rightColWidth - 5)
  doc.text(obsLines.slice(0, 5), rightColX + 2.2, tableTop + 10.0)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.45)
  const reminder = 'Recordamos que el adecuado cumplimiento de las normas institucionales contribuye al orden, la disciplina y la formación integral de nuestros estudiantes. Por ello, solicitamos a la familia brindar el acompañamiento necesario para garantizar el cumplimiento de estas disposiciones.'
  doc.text(doc.splitTextToSize(reminder, width).slice(0, 2), left, top + 54.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.2)
  doc.text('COMPROMISO Y SEGUIMIENTO', left, top + 62.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.15)
  const commitment = 'La presente notificación deberá ser firmada por el padre, madre o apoderado y devuelta por el estudiante al día siguiente de su entrega, como constancia de haber tomado conocimiento de la situación comunicada. Se dispone que ante la reiteración de la situación (tercera notificación realizada) se realizará un llamado formal al padre, madre o apoderado para una reunión en la Dirección de la institución, con la finalidad de abordar el comportamiento y cumplimiento de las normas institucionales por parte del estudiante y establecer los compromisos correspondientes.'
  doc.text(doc.splitTextToSize(commitment, width).slice(0, 4), left, top + 65.2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.2)
  doc.text('CONSTANCIA DE RECEPCIÓN', left, top + 76.6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.15)
  const receipt = `Yo, ${student.guardianName || '________________________________'}, padre, madre o apoderado(a) del estudiante, declaro haber tomado conocimiento de la presente notificación y me comprometo a brindar el acompañamiento necesario para el cumplimiento de las disposiciones institucionales.`
  doc.text(doc.splitTextToSize(receipt, width).slice(0, 2), left, top + 79.7)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.6)
  doc.text('FIRMA DEL PADRE/MADRE/APODERADO: ____________________________', left, top + 86.6)
  doc.text(`DNI: ${student.guardianDni || '________________'}     FECHA: ____ / ____ / ______`, 120, top + 86.6)
  doc.text('FIRMA DEL AUXILIAR/TUTOR/DOCENTE A CARGO: __________________________________________', 40, top + 92.8)
}

export function downloadNotificationPdf(data: NotificationPrintData) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_HEIGHT_MM, A4_WIDTH_MM] })
  drawNotificationCard(doc, data, 0, true)
  doc.save(individualFilename(data.student, 'pdf'))
}

export function downloadMultiNotificationPdf(items: NotificationPrintData[]) {
  const selectedItems = items.slice(0, MAX_NOTIFICATIONS_PER_PAGE)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  selectedItems.forEach((item, index) => drawNotificationCard(doc, item, index * CARD_HEIGHT_MM, true))
  doc.setDrawColor(145)
  doc.setLineDashPattern([2, 2], 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(125)
  ;[CARD_HEIGHT_MM, CARD_HEIGHT_MM * 2].forEach((cutY) => {
    doc.line(3, cutY, A4_WIDTH_MM - 3, cutY)
    doc.text('línea de corte', A4_WIDTH_MM - 5, cutY - 1.1, { align: 'right' })
  })
  doc.setLineDashPattern([], 0)
  doc.save(multiFilename('pdf'))
}

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const INDIVIDUAL_WORD_TEMPLATE = '/templates/notification-individual.docx'
const MULTI_WORD_TEMPLATE = '/templates/notification-multiple.docx'

function wordTemplateData(data: NotificationPrintData) {
  const state = reasons(data)
  const dp = dateParts(sourceDate(data))
  return {
    date: `${dp.d} / ${dp.m} / ${dp.y}`,
    notificationNumber: String(data.notificationNumber),
    studentName: `${data.student.firstName} ${data.student.lastName}`,
    gradeSection: `${data.classroom.grade} ${data.classroom.section}`,
    guardianName: data.student.guardianName || '________________________________',
    guardianDni: data.student.guardianDni || '________________',
    hairstyle: state.hairstyle ? '[X]' : '[ ]',
    uniform: state.uniform ? '[X]' : '[ ]',
    garment: state.garment ? '[X]' : '[ ]',
    late: state.late ? '[X]' : '[ ]',
    conduct: state.conduct ? '[X]' : '[ ]',
    observation: observation(data),
  }
}

async function loadWordTemplate(templateUrl: string) {
  const response = await fetch(templateUrl)
  if (!response.ok) throw new Error(`No se pudo cargar la plantilla Word: ${templateUrl}`)
  return response.arrayBuffer()
}

function renderWordTemplate(template: ArrayBuffer, data: Record<string, string>) {
  const zip = new PizZip(template)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
    delimiters: { start: '{{', end: '}}' },
  })
  doc.render(data)
  return doc.getZip().generate({ type: 'blob', mimeType: WORD_MIME, compression: 'DEFLATE' }) as Blob
}

export async function downloadNotificationWord(data: NotificationPrintData) {
  const template = await loadWordTemplate(INDIVIDUAL_WORD_TEMPLATE)
  const blob = renderWordTemplate(template, wordTemplateData(data))
  downloadBlob(blob, individualFilename(data.student, 'docx'))
}

function emptyWordTemplateData() {
  return {
    date: '', notificationNumber: '', studentName: '', gradeSection: '', guardianName: '', guardianDni: '',
    hairstyle: '', uniform: '', garment: '', late: '', conduct: '', observation: '',
  }
}

export async function downloadMultiNotificationWord(items: NotificationPrintData[]) {
  const selectedItems = items.slice(0, MAX_NOTIFICATIONS_PER_PAGE)
  const template = await loadWordTemplate(MULTI_WORD_TEMPLATE)
  const data: Record<string, string> = {}
  for (let index = 0; index < MAX_NOTIFICATIONS_PER_PAGE; index += 1) {
    const prefix = `n${index + 1}_`
    const card = selectedItems[index] ? wordTemplateData(selectedItems[index]) : emptyWordTemplateData()
    Object.entries(card).forEach(([key, value]) => { data[`${prefix}${key}`] = value })
  }
  const blob = renderWordTemplate(template, data)
  downloadBlob(blob, multiFilename('docx'))
}
