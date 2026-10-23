import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import PizZip from 'pizzip'

export type HistoricalTemplateColumn = {
  header: string
  required: boolean
  description: string
  example: string
}

// Los encabezados deben coincidir con los que reconoce HistoricalImport.mapParsedRows.
export const HISTORICAL_TEMPLATE_COLUMNS: HistoricalTemplateColumn[] = [
  { header: 'Alumno', required: true, description: 'Apellidos y nombres, como figuran en la nómina.', example: 'Quispe Mamani Juan' },
  { header: 'Aula', required: false, description: 'Grado y sección. Ej.: 3° A Secundaria.', example: '3° A Secundaria' },
  { header: 'Fecha', required: true, description: 'Formato DD/MM/AAAA.', example: '15/03/2026' },
  { header: 'Hora', required: false, description: 'Formato 24 horas HH:MM. Déjala vacía si no aplica.', example: '08:12' },
  { header: 'Tipo', required: true, description: 'Asistencia, Tardanza, Ausencia, Presentación, Conducta, Notificación u Otro.', example: 'Tardanza' },
  { header: 'Incumplimiento', required: false, description: 'Motivo o falta (uniforme, peinado, etc.).', example: 'Llegó después de la hora' },
  { header: 'Observación', required: false, description: 'Detalle libre, máximo 2000 caracteres.', example: 'Justificó con llamada del apoderado' },
  { header: 'N° Notificación', required: false, description: 'Número de notificación entregada (solo números).', example: '2' },
]

export const HISTORICAL_TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ['Quispe Mamani Juan', '3° A Secundaria', '15/03/2026', '08:12', 'Tardanza', 'Llegó después de la hora', 'Justificó con llamada del apoderado', '2'],
  ['Flores Ramos María', '1° B Primaria', '16/03/2026', '', 'Ausencia', '', 'Sin justificación', ''],
  ['Condori Huamán Luis', '5° A Secundaria', '17/03/2026', '07:45', 'Presentación', 'Uniforme incompleto', 'Sin corbata', '1'],
]

export type HistoricalTemplateFormat = 'xlsx' | 'csv' | 'docx' | 'pdf'

export const HISTORICAL_TEMPLATE_FORMATS: Array<{ format: HistoricalTemplateFormat; label: string; hint: string }> = [
  { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Lectura automática. Recomendado.' },
  { format: 'csv', label: 'CSV (.csv)', hint: 'Lectura automática.' },
  { format: 'docx', label: 'Word (.docx)', hint: 'Para llenar o imprimir. Se guarda como respaldo.' },
  { format: 'pdf', label: 'PDF (.pdf)', hint: 'Para imprimir y llenar a mano. Se guarda como respaldo.' },
]

const FILE_BASE = 'plantilla-carga-historica'
const headers = () => HISTORICAL_TEMPLATE_COLUMNS.map((c) => c.header)

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildXlsx(): Blob {
  const wb = XLSX.utils.book_new()

  // La importación solo lee la primera hoja: va vacía, lista para llenar.
  const data = XLSX.utils.aoa_to_sheet([headers()])
  data['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 13 }, { wch: 9 }, { wch: 16 }, { wch: 28 }, { wch: 40 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, data, 'Registros')

  const example = XLSX.utils.aoa_to_sheet([headers(), ...HISTORICAL_TEMPLATE_EXAMPLE_ROWS])
  example['!cols'] = data['!cols']
  XLSX.utils.book_append_sheet(wb, example, 'Ejemplo')

  const help = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Obligatoria', 'Qué escribir', 'Ejemplo'],
    ...HISTORICAL_TEMPLATE_COLUMNS.map((c) => [c.header, c.required ? 'Sí' : 'No', c.description, c.example]),
    [],
    ['Importante'],
    ['Llena solo la hoja "Registros" y no cambies los encabezados de la fila 1.'],
    ['La hoja "Ejemplo" es solo de referencia: no se importa.'],
    ['Máximo 5000 filas por archivo.'],
  ])
  help['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 70 }, { wch: 34 }]
  XLSX.utils.book_append_sheet(wb, help, 'Instrucciones')

  const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function buildCsv(): Blob {
  // BOM para que Excel respete las tildes.
  return new Blob(['﻿', headers().join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' })
}

function xmlEscape(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildDocx(): Blob {
  const widths = [2700, 1900, 1300, 900, 1500, 2100, 2800, 1000] // twips, total ~14200
  const border = '<w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders>'
  const cell = (text: string, w: number, bold = false, shade = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${border}${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="E2E8F0"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz>18</w:sz></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`
  const row = (values: string[], bold = false, shade = false, height = 0) =>
    `<w:tr>${height ? `<w:trPr><w:trHeight w:val="${height}" w:hRule="atLeast"/></w:trPr>` : ''}${values.map((v, i) => cell(v, widths[i], bold, shade)).join('')}</w:tr>`
  const para = (text: string, bold = false, size = 20) =>
    `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz>${size}</w:sz></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`

  const blank = Array.from({ length: 14 }, () => row(headers().map(() => ''), false, false, 480)).join('')
  const body =
    para('Colegio Nikola Tesla - Plantilla de carga histórica', true, 30) +
    para('Escribe un registro por fila, con letra clara. Campos obligatorios: Alumno, Fecha (DD/MM/AAAA) y Tipo.') +
    para('Tipo: Asistencia, Tardanza, Ausencia, Presentación, Conducta, Notificación u Otro.') +
    para('Ejemplo (primera fila):', true) +
    `<w:tbl><w:tblPr><w:tblW w:w="14200" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    row(headers(), true, true) +
    row(HISTORICAL_TEMPLATE_EXAMPLE_ROWS[0]) +
    `</w:tbl>` +
    para('') +
    para('Registros:', true) +
    `<w:tbl><w:tblPr><w:tblW w:w="14200" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` +
    row(headers(), true, true) + blank + `</w:tbl>`

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="900" w:right="1000" w:bottom="900" w:left="1000" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>'

  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml', documentXml)
  return zip.generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
}

function buildPdf(): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const colW = [52, 34, 24, 15, 28, 38, 60, 26] // 277 mm
  const left = 10
  let y = 14

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text('Colegio Nikola Tesla - Plantilla de carga histórica', left, y); y += 7
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Un registro por fila, con letra clara. Obligatorios: Alumno, Fecha (DD/MM/AAAA) y Tipo.', left, y); y += 5
  doc.text('Tipo: Asistencia, Tardanza, Ausencia, Presentación, Conducta, Notificación u Otro.', left, y); y += 7

  const drawRow = (values: string[], height: number, bold: boolean, fill: boolean) => {
    let x = left
    values.forEach((value, i) => {
      if (fill) { doc.setFillColor(226, 232, 240); doc.rect(x, y, colW[i], height, 'FD') } else doc.rect(x, y, colW[i], height)
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8)
      const text = doc.splitTextToSize(value, colW[i] - 2).slice(0, 2)
      doc.text(text, x + 1, y + 4)
      x += colW[i]
    })
    y += height
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Ejemplo:', left, y); y += 2
  drawRow(headers(), 7, true, true)
  drawRow(HISTORICAL_TEMPLATE_EXAMPLE_ROWS[0], 9, false, false)
  y += 5
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('Registros:', left, y); y += 2
  drawRow(headers(), 7, true, true)
  while (y + 9 <= 200) drawRow(headers().map(() => ''), 9, false, false)

  return doc.output('blob')
}

export function downloadHistoricalTemplate(format: HistoricalTemplateFormat) {
  const blob = format === 'xlsx' ? buildXlsx() : format === 'csv' ? buildCsv() : format === 'docx' ? buildDocx() : buildPdf()
  downloadBlob(blob, `${FILE_BASE}.${format}`)
}
