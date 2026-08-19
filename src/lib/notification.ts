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

// Exportación PNG pensada para compartir por WhatsApp/correo sin depender de un visor PDF.
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word } else line = test
  }
  if (line) lines.push(line)
  return lines
}

function drawCanvasLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number, maxLines = lines.length) {
  lines.slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
}

function drawNotificationCanvas(ctx: CanvasRenderingContext2D, data: NotificationPrintData, top: number, width: number, height: number) {
  const scale = width / 210
  const mm = (value: number) => value * scale
  const { student, classroom, notificationNumber } = data
  const state = reasons(data)
  const dp = dateParts(sourceDate(data))
  const left = mm(6), right = width - mm(6)

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, top, width, height)
  ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1, mm(.18)); ctx.strokeRect(mm(3), top + mm(2), width - mm(6), height - mm(4))
  ctx.fillStyle = '#111'; ctx.textBaseline = 'alphabetic'

  const font = (size: number, bold = false) => { ctx.font = `${bold ? 700 : 400} ${Math.round(mm(size))}px Arial, sans-serif` }
  font(3.7, true); ctx.fillText('INSTITUCIÓN EDUCATIVA PRIVADA “NIKOLA TESLA”', left, top + mm(7))
  font(3.25, true); ctx.fillText('NOTIFICACIÓN SOBRE INCUMPLIMIENTO DE REGLAMENTO INTERNO DE LA INSTITUCIÓN', left, top + mm(11))
  ctx.textAlign = 'right'; ctx.fillText(`FECHA: ${dp.d} / ${dp.m} / ${dp.y}`, right, top + mm(7)); ctx.fillText(`N° ${notificationNumber}`, right, top + mm(11)); ctx.textAlign = 'left'

  font(3.25, true); ctx.fillText(`ESTUDIANTE: ${student.firstName} ${student.lastName}`, left, top + mm(15.5))
  ctx.textAlign = 'right'; ctx.fillText(`AÑO Y SECCIÓN: ${classroom.grade} ${classroom.section}`, right, top + mm(15.5)); ctx.textAlign = 'left'
  font(2.75); drawCanvasLines(ctx, wrapCanvasText(ctx, 'Por medio de la presente, se comunica al apoderado que el estudiante ha incurrido en un incumplimiento de las disposiciones institucionales, específicamente:', right-left), left, top+mm(19), mm(3.2), 2)

  const tableY = top + mm(25), leftW = mm(96), tableH = mm(29), rowH = tableH / 5, rightX = left + leftW + mm(3), rightW = right-rightX
  ctx.strokeRect(left, tableY, leftW, tableH); ctx.strokeRect(rightX, tableY, rightW, tableH)
  for (let i=1;i<5;i++) { ctx.beginPath(); ctx.moveTo(left, tableY+i*rowH); ctx.lineTo(left+leftW, tableY+i*rowH); ctx.stroke() }
  rules.forEach(([key,label], index) => {
    const y=tableY+rowH*index+mm(4.1); const box=mm(3)
    ctx.strokeRect(left+mm(2), y-box+mm(.5), box, box)
    if (state[key]) { font(2.9,true); ctx.fillText('X',left+mm(2.55),y) }
    font(2.75,state[key]); ctx.fillText(`${index+1}. ${label}`,left+mm(7),y)
  })
  font(2.9,true); ctx.fillText('DESCRIPCIÓN DE LA OBSERVACIÓN:',rightX+mm(2),tableY+mm(4.2))
  font(2.7); drawCanvasLines(ctx,wrapCanvasText(ctx,observation(data)||' ',rightW-mm(4)),rightX+mm(2),tableY+mm(9),mm(3.3),5)

  font(2.55); drawCanvasLines(ctx,wrapCanvasText(ctx,'Recordamos que el adecuado cumplimiento de las normas institucionales contribuye al orden, la disciplina y la formación integral de nuestros estudiantes. Por ello, solicitamos a la familia brindar el acompañamiento necesario para garantizar el cumplimiento de estas disposiciones.',right-left),left,top+mm(58),mm(3),2)
  font(2.9,true); ctx.fillText('COMPROMISO Y SEGUIMIENTO',left,top+mm(66))
  font(2.4); drawCanvasLines(ctx,wrapCanvasText(ctx,'La presente notificación deberá ser firmada por el padre, madre o apoderado y devuelta por el estudiante al día siguiente de su entrega, como constancia de haber tomado conocimiento de la situación comunicada. Se dispone que ante la reiteración de la situación (tercera notificación realizada) se realizará un llamado formal al padre, madre o apoderado para una reunión en la Dirección de la institución.',right-left),left,top+mm(69),mm(2.8),4)
  font(2.9,true); ctx.fillText('CONSTANCIA DE RECEPCIÓN',left,top+mm(81))
  font(2.4); drawCanvasLines(ctx,wrapCanvasText(ctx,`Yo, ${student.guardianName || '________________________________'}, padre, madre o apoderado(a) del estudiante, declaro haber tomado conocimiento de la presente notificación y me comprometo a brindar el acompañamiento necesario para el cumplimiento de las disposiciones institucionales.`,right-left),left,top+mm(84),mm(2.8),2)
  font(2.5,true); ctx.fillText('FIRMA DEL PADRE/MADRE/APODERADO: ____________________________',left,top+mm(91)); ctx.textAlign='right'; ctx.fillText(`DNI: ${student.guardianDni || '________________'}   FECHA: ____ / ____ / ______`,right,top+mm(91)); ctx.textAlign='left'
  ctx.fillText('FIRMA DEL AUXILIAR/TUTOR/DOCENTE A CARGO: __________________________________________',mm(40),top+mm(96))
}

function canvasToPng(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<void>((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) { reject(new Error('No se pudo generar la imagen.')); return }
    downloadBlob(blob, filename); resolve()
  }, 'image/png', 1))
}

export async function downloadNotificationImage(data: NotificationPrintData) {
  const width = 1680
  const height = Math.round(width * CARD_HEIGHT_MM / A4_WIDTH_MM)
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('El navegador no permite generar la imagen.')
  drawNotificationCanvas(ctx, data, 0, width, height)
  await canvasToPng(canvas, individualFilename(data.student, 'png'))
}

export async function downloadMultiNotificationImage(items: NotificationPrintData[]) {
  const selected = items.slice(0, MAX_NOTIFICATIONS_PER_PAGE)
  const width = 1680
  const cardHeight = Math.round(width * CARD_HEIGHT_MM / A4_WIDTH_MM)
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = cardHeight * MAX_NOTIFICATIONS_PER_PAGE
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('El navegador no permite generar la imagen.')
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height)
  selected.forEach((item,index)=>drawNotificationCanvas(ctx,item,index*cardHeight,width,cardHeight))
  await canvasToPng(canvas, multiFilename('png'))
}
