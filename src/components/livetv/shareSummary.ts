import { gradeLabel, lateCountLabel, type PanelData } from './panelData'

export type SummaryRow = { name: string; section: string; justified: boolean }
export type SummaryLevel = { level: string; total: number; grades: Array<{ label: string; rows: SummaryRow[] }> }
export type Summary = {
  dateLabel: string
  timeLabel: string
  lateLabel: string
  stats: Array<{ label: string; value: number }>
  levels: SummaryLevel[]
}

const SCHOOL = 'Colegio Nikola Tesla'

/** Resumen de tardanzas y asistencia del día, listo para compartir como texto o imagen. */
export function buildSummary(data: PanelData, totalStudents: number, now: Date = new Date()): Summary {
  const dateText = now.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  return {
    dateLabel: dateText.charAt(0).toUpperCase() + dateText.slice(1),
    timeLabel: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    lateLabel: lateCountLabel(data.late, data.lateJustified),
    stats: [
      { label: 'Alumnos', value: totalStudents },
      { label: 'Ingresaron', value: data.entered },
      { label: 'Tardanzas', value: data.late },
      { label: 'Sin marcar', value: data.pending },
    ],
    levels: data.lateByLevel.map((group) => ({
      level: group.level,
      total: group.total,
      grades: group.grades.map(({ grade, rows }) => ({
        label: gradeLabel(group.level, grade),
        rows: rows.map(({ student, classroom, record }) => ({
          name: `${student.lastName}, ${student.firstName}`,
          section: classroom.section,
          justified: Boolean(record.justified),
        })),
      })),
    })),
  }
}

/** Texto con formato de WhatsApp (*negrita*). */
export function summaryToText(summary: Summary): string {
  const lines: string[] = [
    `*${SCHOOL}*`,
    `${summary.dateLabel} · ${summary.timeLabel}`,
    '',
    summary.stats.map((item) => `${item.label}: ${item.value}`).join(' · '),
    `*Tardanzas de hoy:* ${summary.lateLabel}`,
  ]
  for (const level of summary.levels) {
    lines.push('', `*${level.level.toUpperCase()}* (${level.total})`)
    if (level.grades.length === 0) lines.push('Sin tardanzas.')
    for (const grade of level.grades) {
      lines.push(`_${grade.label}_ (${grade.rows.length})`)
      for (const row of grade.rows) lines.push(`• ${row.name} (${row.section})${row.justified ? ' - justificada' : ''}`)
    }
  }
  return lines.join('\n')
}

const W = 1080
const PAD = 48
const ROW = 54
const COLORS = { bg: '#050b16', card: '#0d1829', line: '#1b2a41', text: '#f8fafc', muted: '#94a3b8', amber: '#fcd34d', sky: '#7dd3fc' }

function imageHeight(summary: Summary) {
  let height = PAD + 330
  for (const level of summary.levels) {
    height += 84
    if (level.grades.length === 0) height += ROW + 12
    for (const grade of level.grades) height += 58 + grade.rows.length * ROW + 14
  }
  return height + 70
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Dibuja el resumen como imagen PNG (1080 px de ancho) para enviarla por WhatsApp sin capturas de pantalla. */
export function renderSummaryImage(summary: Summary): Promise<Blob> {
  const height = imageHeight(summary)
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Este navegador no puede generar la imagen.'))
  ctx.scale(scale, scale)
  const font = (weight: number, size: number) => { ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` }

  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, height)

  let y = PAD + 36
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.sky
  font(800, 22)
  ctx.fillText(SCHOOL.toUpperCase(), PAD, y)
  y += 52
  ctx.fillStyle = COLORS.text
  font(800, 44)
  ctx.fillText('Tardanzas de hoy', PAD, y)
  y += 40
  ctx.fillStyle = COLORS.muted
  font(600, 24)
  ctx.fillText(`${summary.dateLabel} · ${summary.timeLabel}`, PAD, y)

  // Cifras
  y += 36
  const gap = 16
  const boxW = (W - PAD * 2 - gap * 3) / 4
  summary.stats.forEach((item, index) => {
    const x = PAD + index * (boxW + gap)
    const accent = item.label === 'Tardanzas'
    ctx.fillStyle = accent ? 'rgba(245,158,11,.16)' : COLORS.card
    roundRect(ctx, x, y, boxW, 108, 20)
    ctx.fill()
    ctx.fillStyle = accent ? COLORS.amber : COLORS.text
    font(800, 48)
    ctx.fillText(String(item.value), x + 20, y + 58)
    ctx.fillStyle = COLORS.muted
    font(700, 20)
    ctx.fillText(item.label.toUpperCase(), x + 20, y + 90)
  })
  y += 108 + 30
  ctx.fillStyle = COLORS.amber
  font(700, 24)
  ctx.fillText(summary.lateLabel, PAD, y)
  y += 24

  for (const level of summary.levels) {
    y += 56
    ctx.fillStyle = COLORS.text
    font(800, 32)
    ctx.fillText(level.level.toUpperCase(), PAD, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.amber
    ctx.fillText(String(level.total), W - PAD, y)
    ctx.textAlign = 'left'
    y += 28
    if (level.grades.length === 0) {
      ctx.fillStyle = COLORS.muted
      font(600, 24)
      ctx.fillText('Sin tardanzas.', PAD, y + 30)
      y += ROW + 12
    }
    for (const grade of level.grades) {
      y += 30
      ctx.fillStyle = COLORS.muted
      font(800, 22)
      ctx.fillText(`${grade.label.toUpperCase()}  ·  ${grade.rows.length}`, PAD, y)
      y += 28
      for (const row of grade.rows) {
        ctx.fillStyle = COLORS.card
        roundRect(ctx, PAD, y, W - PAD * 2, ROW - 8, 14)
        ctx.fill()
        ctx.fillStyle = COLORS.line
        roundRect(ctx, PAD + 10, y + 8, 44, ROW - 24, 10)
        ctx.fill()
        ctx.fillStyle = COLORS.text
        font(800, 22)
        ctx.textAlign = 'center'
        ctx.fillText(row.section, PAD + 32, y + 32)
        ctx.textAlign = 'left'
        font(700, 26)
        const tagWidth = row.justified ? 170 : 0
        ctx.fillStyle = COLORS.text
        ctx.fillText(fit(ctx, row.name, W - PAD * 2 - 80 - tagWidth), PAD + 72, y + 33)
        if (row.justified) {
          ctx.fillStyle = COLORS.sky
          font(800, 20)
          ctx.textAlign = 'right'
          ctx.fillText('JUSTIFICADA', W - PAD - 18, y + 31)
          ctx.textAlign = 'left'
        }
        y += ROW
      }
      y += 4
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), 'image/png')
  })
}
