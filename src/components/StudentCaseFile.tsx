import { useEffect, useMemo, useState } from 'react'
import { Bell, BookOpen, CheckCircle2, Clock3, Download, FileText, MessageCircle, ShieldAlert, TriangleAlert, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { getStudentCaseFile, type StudentCaseFile as CaseFile } from '@/services/phase6Service'
import type { Classroom, Student } from '@/types'
import { getAlertTypeLabel, getNotificationTypeLabel } from '@/lib/displayLabels'

type Props = {
  student: Student | null
  classroom?: Classroom
  onClose: () => void
  onOpenWhatsApp: (student: Student) => void
}

type TimelineItem = { id: string; date: string; title: string; detail: string; tone: 'ok' | 'warning' | 'info' | 'danger' }

const violationLabels: Record<string, string> = {
  HAIRSTYLE: 'Peinado no acorde',
  UNIFORM_INCOMPLETE: 'Uniforme incompleto',
  NON_INSTITUTIONAL_GARMENT: 'Prenda no institucional',
  LATE_ENTRY: 'Tardanza en el ingreso',
  INAPPROPRIATE_CONDUCT: 'Conducta inapropiada',
  OTHER: 'Otro',
}

function s(value: unknown) { return value == null ? '' : String(value) }
function dateTime(value: string) { const d = new Date(value.length === 10 ? `${value}T12:00:00` : value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString('es-PE', { day:'2-digit', month:'short', year:'numeric', hour: value.length > 10 ? '2-digit' : undefined, minute: value.length > 10 ? '2-digit' : undefined }) }

export default function StudentCaseFile({ student, classroom, onClose, onOpenWhatsApp }: Props) {
  const [data, setData] = useState<CaseFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    if (!student) { setData(null); return }
    setLoading(true); setError('')
    getStudentCaseFile(student.id).then(setData).catch((err) => { console.error(err); setError(err instanceof Error ? err.message : 'No se pudo cargar el expediente.') }).finally(() => setLoading(false))
  }, [student?.id])

  const metrics = useMemo(() => {
    if (!data) return { attendance:0, late:0, incidents:0, notifications:0, openAlerts:0 }
    return {
      attendance: data.attendance.length,
      late: data.attendance.filter((row) => s(row.status) === 'LATE').length,
      incidents: data.presentation.filter((row) => s(row.status) === 'NON_COMPLIANT').length,
      notifications: data.notifications.length,
      openAlerts: data.alerts.filter((row) => s(row.status) === 'OPEN').length,
    }
  }, [data])

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return []
    const items: TimelineItem[] = []
    for (const row of data.attendance) {
      const late = s(row.status) === 'LATE'
      items.push({ id:`a-${s(row.id)}`, date:s(row.date), title: late ? 'Tardanza' : 'Ingreso a tiempo', detail:`Hora: ${s(row.entry_time).slice(0,5) || '—'}`, tone: late ? 'warning' : 'ok' })
    }
    for (const row of data.presentation) {
      if (s(row.status) !== 'NON_COMPLIANT') continue
      const types = data.violationsByControl[s(row.id)] ?? []
      items.push({ id:`p-${s(row.id)}`, date:s(row.date), title:'Incumplimiento del reglamento', detail:[types.map((t)=>violationLabels[t] ?? t).join(' · '), s(row.other_description)].filter(Boolean).join(' — ') || 'Sin detalle', tone:'warning' })
    }
    for (const row of data.notifications) {
      items.push({ id:`n-${s(row.id)}`, date:s(row.date), title:`Notificación N° ${s(row.notification_number)}`, detail:s(row.observation) || getNotificationTypeLabel(row.notification_type), tone:Number(row.notification_number) >= 3 ? 'danger' : 'info' })
    }
    for (const row of data.alerts) {
      items.push({ id:`al-${s(row.id)}`, date:s(row.created_at), title:`Alerta: ${getAlertTypeLabel(row.alert_type)}`, detail:s(row.message), tone:s(row.status)==='OPEN'?'danger':'info' })
    }
    return items.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100)
  }, [data])

  // FIX: este useMemo estaba DESPUES del "if (!student) return null" que
  // había más abajo. Eso viola las Rules of Hooks: cuando `student` es
  // null, React ejecuta menos hooks que cuando `student` tiene valor, y
  // el orden/cantidad de hooks entre renders debe ser siempre el mismo.
  // Por eso salía "Rendered more hooks than during the previous render".
  // Se soluciona llamando SIEMPRE todos los hooks antes de cualquier
  // return condicional.
  const filteredTimeline = useMemo(() => {
    if (!timeline.length) return []

    const from = fromDate || '0000-01-01'
    const to = toDate || '9999-12-31'

    return timeline.filter((item) => {
      const itemDate = item.date.slice(0, 10)
      return itemDate >= from && itemDate <= to
    })
  }, [timeline, fromDate, toDate])

  if (!student) return null

  function exportPdf() {
    if (!data) return
    const doc = new jsPDF({ unit:'mm', format:'a4' })
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text('IEPr Nikola Tesla - Expediente digital', 14, 16)
    doc.setFontSize(12); doc.text(`${student!.firstName} ${student!.lastName}`,14,25)
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.text(`${classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : ''}  |  Apoderado: ${student!.guardianName}`,14,31)
    doc.line(14,35,196,35)
    doc.setFontSize(9)
    const summary = [`Ingresos: ${metrics.attendance}`,`Tardanzas: ${metrics.late}`,`Incidencias: ${metrics.incidents}`,`Notificaciones: ${metrics.notifications}`,`Alertas abiertas: ${metrics.openAlerts}`]
    doc.text(summary.join('   |   '),14,42)
    let y=52
    doc.setFont('helvetica','bold'); doc.text('Historial',14,y); y+=6
    doc.setFont('helvetica','normal'); doc.setFontSize(8)
    for (const item of timeline) {
      if (y>282) { doc.addPage(); y=18 }
      doc.text(dateTime(item.date).slice(0,22),14,y)
      doc.setFont('helvetica','bold'); doc.text(item.title.slice(0,42),52,y)
      doc.setFont('helvetica','normal')
      const lines=doc.splitTextToSize(item.detail || '—',120)
      doc.text(lines.slice(0,2),52,y+4)
      y += 5 + Math.min(2,lines.length)*4
    }
    doc.save(`Expediente-${student!.firstName}-${student!.lastName}.pdf`.replace(/\s+/g,'-'))
  }

  const status = metrics.openAlerts > 0 || metrics.notifications >= 3 ? 'Seguimiento' : 'Regular'

  function applyTodayFilter() {
    const today = new Date().toISOString().slice(0, 10)
    setFromDate(today)
    setToDate(today)
  }

  function applyLast7DaysFilter() {
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    setFromDate(from.toISOString().slice(0, 10))
    setToDate(today.toISOString().slice(0, 10))
  }

  function clearDateFilter() {
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6" onMouseDown={onClose}>
      <section className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(e)=>e.stopPropagation()}>
        <header className="border-b border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400"><BookOpen size={15}/> Expediente digital</p><h2 className="mt-1 text-2xl font-black">{student.firstName} {student.lastName}</h2><p className="mt-1 text-sm text-slate-500">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula no identificada'} · Apoderado: {student.guardianName}</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>onOpenWhatsApp(student)} disabled={!student.guardianPhone}><MessageCircle className="mr-2" size={17}/> WhatsApp</Button><Button variant="outline" onClick={exportPdf} disabled={!data}><Download className="mr-2" size={17}/> PDF</Button><Button variant="ghost" onClick={onClose}><X size={20}/></Button></div>
          </div>
        </header>
        <div className="p-5 sm:p-7">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          {loading && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Cargando expediente completo...</div>}
          {data && <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Card className="p-4"><p className="text-xs text-slate-500">Estado</p><p className={`mt-1 text-lg font-black ${status==='Seguimiento'?'text-amber-700 dark:text-amber-400':'text-emerald-700 dark:text-emerald-400'}`}>{status}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Ingresos</p><p className="mt-1 text-2xl font-black">{metrics.attendance}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Tardanzas</p><p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{metrics.late}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Incidencias</p><p className="mt-1 text-2xl font-black">{metrics.incidents}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Notificaciones</p><p className="mt-1 text-2xl font-black">{metrics.notifications}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Alertas</p><p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">{metrics.openAlerts}</p></Card>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[.72fr_1.28fr]">
              <div className="space-y-4">
                <Card className="p-5"><h3 className="flex items-center gap-2 font-black"><FileText size={18}/> Datos del alumno</h3><div className="mt-4 space-y-2 text-sm"><p><b>Alumno:</b> {student.firstName} {student.lastName}</p><p><b>Apoderado:</b> {student.guardianName}</p><p><b>DNI apoderado:</b> {student.guardianDni || 'No registrado'}</p><p><b>WhatsApp:</b> {student.guardianPhone || 'No registrado'}</p></div></Card>
                <Card className="p-5"><h3 className="flex items-center gap-2 font-black"><ShieldAlert size={18}/> Seguimiento</h3><div className="mt-4 space-y-2">{data.alerts.length===0?<p className="text-sm text-slate-500">Sin alertas históricas.</p>:data.alerts.slice(0,6).map((row)=><div key={s(row.id)} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><div className="flex justify-between gap-2"><b>{getAlertTypeLabel(row.alert_type)}</b><span className={s(row.status)==='OPEN'?'text-red-600':'text-emerald-600'}>{s(row.status)}</span></div><p className="mt-1 text-xs text-slate-500">{s(row.message)}</p></div>)}</div></Card>
              </div>

              <Card className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-400">Historial unificado</p>
                      <h3 className="mt-1 text-lg font-black">Línea de tiempo</h3>
                    </div>
                    <span className="text-xs font-bold text-slate-500">{filteredTimeline.length} de {timeline.length} eventos</span>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500">Desde</label>
                        <Input type="date" className="mt-1" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500">Hasta</label>
                        <Input type="date" className="mt-1" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="h-9 px-3 text-xs" onClick={applyTodayFilter}>Hoy</Button>
                        <Button variant="outline" className="h-9 px-3 text-xs" onClick={applyLast7DaysFilter}>7 días</Button>
                        {(fromDate || toDate) && <Button variant="ghost" className="h-9 px-3 text-xs" onClick={clearDateFilter}>Limpiar</Button>}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                    {filteredTimeline.length===0?<p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{timeline.length===0?'No hay eventos registrados.':'No hay eventos dentro del período seleccionado.'}</p>:filteredTimeline.map((item)=><div key={item.id} className="flex gap-3"><div className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.tone==='ok'?'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300':item.tone==='danger'?'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300':item.tone==='warning'?'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300':'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'}`}>{item.tone==='ok'?<CheckCircle2 size={17}/>:item.tone==='danger'?<Bell size={17}/>:item.tone==='warning'?<TriangleAlert size={17}/>:<Clock3 size={17}/>}</div><div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-black">{item.title}</p><p className="text-xs font-semibold text-slate-400">{dateTime(item.date)}</p></div><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p></div></div>)}
                  </div>
                </div>
              </Card>
            </div>
          </>}
        </div>
      </section>
    </div>
  )
}
