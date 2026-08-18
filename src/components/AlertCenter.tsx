import { useEffect, useMemo, useState } from 'react'
import { Bell, BookOpen, CheckCircle2, Filter, MessageCircle, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getAlerts, resolveAlert, type AlertRecord, type AlertStatus, type AlertType } from '@/services/phase6Service'
import type { Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  currentClassroom: Classroom
  students: Student[]
  onOpenCaseFile: (student: Student) => void
  onOpenWhatsApp: (student: Student, alertType: AlertType) => void
}

const typeLabels: Record<AlertType, string> = {
  REPEAT_OFFENDER: 'Reincidencia',
  THIRD_NOTIFICATION: 'Tercera notificación',
  FREQUENT_LATE: 'Tardanzas frecuentes',
  ABSENCE: 'Ausencia',
}

function badgeClass(type: AlertType) {
  if (type === 'THIRD_NOTIFICATION') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
  if (type === 'ABSENCE') return 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300'
  return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
}

export default function AlertCenter({ open, onClose, classrooms, currentClassroom, students, onOpenCaseFile, onOpenWhatsApp }: Props) {
  const [status, setStatus] = useState<AlertStatus | 'ALL'>('OPEN')
  const [classroomId, setClassroomId] = useState<string | 'ALL'>(currentClassroom.id)
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setAlerts(await getAlerts({ status, classroomId: classroomId === 'ALL' ? null : classroomId }))
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las alertas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open, status, classroomId])

  const counts = useMemo(() => ({
    total: alerts.length,
    urgent: alerts.filter((item) => item.alertType === 'THIRD_NOTIFICATION' || item.alertType === 'ABSENCE').length,
  }), [alerts])

  async function handleResolve(alert: AlertRecord) {
    try {
      await resolveAlert(alert.id)
      await load()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'No se pudo resolver la alerta.')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6">
      <section className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400"><Bell size={15} /> Automatización</p>
              <h2 className="mt-1 text-2xl font-black">Centro de alertas</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Las reglas de Supabase detectan situaciones que requieren seguimiento.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-40">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Estado</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as AlertStatus | 'ALL')} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950">
                  <option value="OPEN">Abiertas</option><option value="RESOLVED">Resueltas</option><option value="ALL">Todas</option>
                </select>
              </label>
              <label className="block min-w-56">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Aula</span>
                <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950">
                  <option value="ALL">Todas las aulas</option>
                  {classrooms.map((item) => <option key={item.id} value={item.id}>{item.grade} {item.section} · {item.level}</option>)}
                </select>
              </label>
              <Button variant="outline" className="h-11 px-3" onClick={() => void load()}><RefreshCw size={17} /></Button>
              <Button variant="ghost" className="h-11 px-3" onClick={onClose}><X size={20} /></Button>
            </div>
          </div>
        </header>

        <div className="p-5 sm:p-7">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-slate-500">Alertas mostradas</p><p className="mt-1 text-2xl font-black">{counts.total}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Prioridad alta</p><p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">{counts.urgent}</p></Card>
            <Card className="p-4"><p className="text-xs text-slate-500">Filtro activo</p><p className="mt-1 flex items-center gap-2 text-sm font-black"><Filter size={16} /> {status === 'OPEN' ? 'Pendientes' : status === 'RESOLVED' ? 'Resueltas' : 'Todas'}</p></Card>
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          {loading && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Cargando alertas...</div>}

          <div className="mt-5 space-y-3">
            {!loading && alerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                <CheckCircle2 className="mx-auto text-emerald-500" size={34} />
                <p className="mt-3 font-black">No hay alertas en este filtro</p>
                <p className="mt-1 text-sm text-slate-500">El sistema no detectó situaciones pendientes para mostrar.</p>
              </div>
            ) : alerts.map((alert) => {
              const student = students.find((item) => item.id === alert.studentId)
              return (
                <Card key={alert.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"><TriangleAlert size={19} /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black">{alert.studentName}</h3>
                          <span className={`rounded-lg px-2.5 py-1 text-[11px] font-black ${badgeClass(alert.alertType)}`}>{typeLabels[alert.alertType]}</span>
                          {alert.status === 'RESOLVED' && <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Resuelta</span>}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{alert.classroomLabel} · {new Date(alert.createdAt).toLocaleString('es-PE')}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">{alert.message}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {student && <Button variant="outline" onClick={() => onOpenCaseFile(student)}><BookOpen className="mr-2" size={16} /> Expediente</Button>}
                      {student && student.guardianPhone && <Button variant="outline" onClick={() => onOpenWhatsApp(student, alert.alertType)}><MessageCircle className="mr-2" size={16} /> WhatsApp</Button>}
                      {alert.status === 'OPEN' && <Button onClick={() => void handleResolve(alert)}><CheckCircle2 className="mr-2" size={16} /> Resolver</Button>}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
