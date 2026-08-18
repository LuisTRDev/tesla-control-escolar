import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { jsPDF } from 'jspdf'
import type { Classroom, PresentationRecord, Student } from '@/types'

export const MAX_NOTIFICATIONS_PER_PAGE = 3

export type NotificationPrintData = {
  student: Student
  classroom: Classroom
  record: PresentationRecord
  notificationNumber: 1 | 2 | 3
}

const A4_WIDTH_MM = 210
const CARD_HEIGHT_MM = 99

const rules = [
  ['hairstyleViolation', 'Peinado no acorde con las disposiciones institucionales.'],
  ['uniformUsageViolation', 'Uso inadecuado o incompleto del uniforme.'],
  ['nonInstitutionalGarment', 'Prenda no correspondiente al uniforme institucional.'],
  ['otherViolation', 'Otro'],
] as const

function cleanFilename(value: string) {
  return value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ-]/g, '')
}

function individualFilename(student: Student, ext: string) {
  return `Notificacion-Presentacion-${cleanFilename(`${student.firstName}-${student.lastName}`)}.${ext}`
}

function multiFilename(ext: string) {
  const date = new Date().toISOString().slice(0, 10)
  return `Multinotificacion-Presentacion-${date}.${ext}`
}

function dateParts(date: string) {
  const [y, m, d] = date.split('-')
  return { y, m, d }
}

function selected(record: PresentationRecord, key: typeof rules[number][0]) {
  return Boolean(record[key])
}

function observation(record: PresentationRecord) {
  if (record.otherViolation && record.otherDescription.trim()) return record.otherDescription.trim()
  const selectedRules = rules
    .filter(([key]) => selected(record, key) && key !== 'otherViolation')
    .map(([, label]) => label.replace(/\.$/, ''))
  return selectedRules.length ? selectedRules.join('; ') : 'Sin observación adicional.'
}

function notificationLabel(number: 1 | 2 | 3) {
  if (number === 1) return 'PRIMERA NOTIFICACIÓN'
  if (number === 2) return 'SEGUNDA NOTIFICACIÓN'
  return 'TERCERA NOTIFICACIÓN'
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

function drawCheckbox(doc: jsPDF, x: number, y: number, checked: boolean, size = 3.2) {
  doc.rect(x, y - size + 0.35, size, size)
  if (checked) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.text('X', x + size / 2, y - 0.15, { align: 'center' })
  }
}

/**
 * Ficha PDF de altura fija 99 mm.
 * A diferencia de la versión anterior, los bloques están anclados a zonas
 * verticales concretas para aprovechar todo el tercio de A4 y evitar grandes
 * áreas vacías al final.
 */
function drawNotificationCard(doc: jsPDF, data: NotificationPrintData, top: number, showOuterBorder: boolean) {
  const { student, classroom, record, notificationNumber } = data
  const left = 6
  const right = A4_WIDTH_MM - 6
  const width = right - left
  const dp = dateParts(record.date)

  if (showOuterBorder) {
    doc.setDrawColor(160)
    doc.setLineWidth(0.18)
    doc.rect(3, top + 2.2, A4_WIDTH_MM - 6, CARD_HEIGHT_MM - 4.4)
  }

  // HEADER: 5–14 mm
  let y = top + 6.2
  doc.setTextColor(15)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.2)
  doc.text('IEP “NIKOLA TESLA”', left, y)
  doc.text('NOTIFICACIÓN A PADRES DE FAMILIA', A4_WIDTH_MM / 2, y, { align: 'center' })
  doc.setFontSize(7)
  doc.text(`${notificationLabel(notificationNumber)} · ${dp.d}/${dp.m}/${dp.y}`, right, y, { align: 'right' })

  y = top + 10.1
  doc.setDrawColor(110)
  doc.line(left, y, right, y)

  y = top + 13.4
  doc.setFontSize(7.15)
  doc.text(`Estudiante: ${student.firstName} ${student.lastName}`, left, y)
  doc.text(`Grado: ${classroom.grade} ${classroom.section} - ${classroom.level}`, 111, y)
  y = top + 17.1
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.75)
  doc.text(`Tutor(a): ${classroom.tutorName || '________________'}`, left, y)
  doc.text(`Apoderado: ${student.guardianName || '________________'} · DNI: ${student.guardianDni || '________'}`, 90, y)

  // PRESENTACIÓN: 21–50 mm
  y = top + 22.3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('PRESENTACIÓN PERSONAL', left, y)

  y = top + 25.6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.35)
  doc.text('Se comunica el incumplimiento de las disposiciones institucionales de presentación personal:', left, y)

  const colWidth = width / 2
  const ruleY = top + 31.1
  rules.forEach(([key, label], index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = left + col * colWidth
    const yy = ruleY + row * 6.1
    drawCheckbox(doc, x, yy, selected(record, key))
    doc.setFont('helvetica', selected(record, key) ? 'bold' : 'normal')
    doc.setFontSize(6.45)
    const ruleText = doc.splitTextToSize(`${index + 1}. ${label}`, colWidth - 7)
    doc.text(ruleText.slice(0, 2), x + 5, yy)
  })

  y = top + 44.8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.7)
  doc.text('Observación:', left, y)
  doc.setFont('helvetica', 'normal')
  const obsLines = doc.splitTextToSize(observation(record), width - 22)
  doc.text(obsLines.slice(0, 2), left + 20, y)

  // SEGUIMIENTO: 53–69 mm
  y = top + 53.2
  doc.setDrawColor(195)
  doc.line(left, y - 2.2, right, y - 2.2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('COMPROMISO Y SEGUIMIENTO', left, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.15)
  doc.text('1. Primera: comunicación del incumplimiento.', left, top + 57.1)
  doc.text('2. Segunda: reiteración y acompañamiento familiar.', 75, top + 57.1)
  doc.text('3. Tercera: citación formal del padre/madre/apoderado a Dirección.', left, top + 61.0)
  doc.setFont('helvetica', 'bold')
  doc.text('IMPORTANTE: devolver la ficha firmada al día siguiente.', 118, top + 61.0)

  // RECEPCIÓN: 70–94 mm
  y = top + 70.0
  doc.setDrawColor(195)
  doc.line(left, y - 2.2, right, y - 2.2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('CONSTANCIA DE RECEPCIÓN', left, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.2)
  const receipt = `Yo, ${student.guardianName || '____________________________'}, declaro haber tomado conocimiento de la presente notificación.`
  doc.text(doc.splitTextToSize(receipt, width).slice(0, 2), left, top + 74.0)
  doc.text(`Firma padre/madre/apoderado: ____________________   DNI: ${student.guardianDni || '________'}   Fecha: ____/____/______`, left, top + 81.1)
  doc.text('Firma docente/tutor: ______________________________', left, top + 87.3)

  // Espacio de firma deliberado, pero controlado: no más de ~6 mm al final.
}

/** Individual: página personalizada horizontal 210 x 99 mm. */
export function downloadNotificationPdf(
  student: Student,
  classroom: Classroom,
  record: PresentationRecord,
  notificationNumber: 1 | 2 | 3 = 1,
) {
  // Para formatos personalizados jsPDF normaliza según orientación; [99,210] + landscape
  // garantiza una página final de 210 x 99 mm.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_HEIGHT_MM, A4_WIDTH_MM] })
  drawNotificationCard(doc, { student, classroom, record, notificationNumber }, 0, true)
  doc.save(individualFilename(student, 'pdf'))
}

/** Multinotificación: A4 vertical con 3 franjas exactas de 99 mm. */
export function downloadMultiNotificationPdf(items: NotificationPrintData[]) {
  const selectedItems = items.slice(0, MAX_NOTIFICATIONS_PER_PAGE)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  selectedItems.forEach((item, index) => {
    drawNotificationCard(doc, item, index * CARD_HEIGHT_MM, true)
  })

  doc.setDrawColor(140)
  doc.setLineDashPattern([2, 2], 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.2)
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
  const { student, classroom, record, notificationNumber } = data
  const dp = dateParts(record.date)
  return {
    notificationLabel: notificationLabel(notificationNumber),
    date: `${dp.d}/${dp.m}/${dp.y}`,
    studentName: `${student.firstName} ${student.lastName}`,
    gradeSection: `${classroom.grade} ${classroom.section} - ${classroom.level}`,
    tutorName: classroom.tutorName || '________________',
    guardianName: student.guardianName || 'Sin apoderado registrado',
    guardianDni: student.guardianDni || '________',
    hairstyle: selected(record, 'hairstyleViolation') ? '[X]' : '[ ]',
    uniform: selected(record, 'uniformUsageViolation') ? '[X]' : '[ ]',
    garment: selected(record, 'nonInstitutionalGarment') ? '[X]' : '[ ]',
    other: selected(record, 'otherViolation') ? '[X]' : '[ ]',
    observation: observation(record),
  }
}

async function loadWordTemplate(templateUrl: string) {
  const response = await fetch(templateUrl)
  if (!response.ok) {
    throw new Error(`No se pudo cargar la plantilla Word: ${templateUrl}`)
  }
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
  return doc.getZip().generate({
    type: 'blob',
    mimeType: WORD_MIME,
    compression: 'DEFLATE',
  }) as Blob
}

/**
 * Word individual mediante plantilla A4 vertical; la ficha ocupa el primer tercio de la hoja (210 x 99 mm).
 * El navegador únicamente reemplaza campos; Word conserva el layout diseñado.
 */
export async function downloadNotificationWord(
  student: Student,
  classroom: Classroom,
  record: PresentationRecord,
  notificationNumber: 1 | 2 | 3 = 1,
) {
  const template = await loadWordTemplate(INDIVIDUAL_WORD_TEMPLATE)
  const blob = renderWordTemplate(
    template,
    wordTemplateData({ student, classroom, record, notificationNumber }),
  )
  downloadBlob(blob, individualFilename(student, 'docx'))
}

function emptyWordTemplateData() {
  return {
    notificationLabel: '',
    date: '',
    studentName: '',
    gradeSection: '',
    tutorName: '',
    guardianName: '',
    guardianDni: '',
    hairstyle: '',
    uniform: '',
    garment: '',
    other: '',
    observation: '',
  }
}

/**
 * Word múltiple mediante una plantilla A4 que ya contiene tres fichas físicas.
 * Los estudiantes 1, 2 y 3 se inyectan en n1_*, n2_* y n3_* respectivamente.
 */
export async function downloadMultiNotificationWord(items: NotificationPrintData[]) {
  const selectedItems = items.slice(0, MAX_NOTIFICATIONS_PER_PAGE)
  const template = await loadWordTemplate(MULTI_WORD_TEMPLATE)
  const data: Record<string, string> = {}

  for (let index = 0; index < MAX_NOTIFICATIONS_PER_PAGE; index += 1) {
    const prefix = `n${index + 1}_`
    const card = selectedItems[index]
      ? wordTemplateData(selectedItems[index])
      : emptyWordTemplateData()

    Object.entries(card).forEach(([key, value]) => {
      data[`${prefix}${key}`] = value
    })
  }

  const blob = renderWordTemplate(template, data)
  downloadBlob(blob, multiFilename('docx'))
}
