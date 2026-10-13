import { useState } from 'react'
import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { reportError } from '@/lib/security'
import { CALENDAR_KIND_LABELS, deleteCalendarDay, deleteLevelSchedule, saveCalendarDay, saveLevelSchedule } from '@/services/dayStatusService'
import type { ToleranceSettings } from '@/services/schoolService'
import type { CalendarDay, CalendarDayKind, Classroom, LevelSchedule } from '@/types'

type Props = {
  schedules: LevelSchedule[]
  calendar: CalendarDay[]
  globalLimit: string
  globalTolerance: ToleranceSettings
  isAdmin: boolean
  onChanged: () => void
}

const LEVELS: Array<Classroom['level']> = ['Primaria', 'Secundaria']

/** Configuración del lote 2: horario propio por nivel y días sin clases. */
export default function ScheduleCalendarSettings({ schedules, calendar, globalLimit, globalTolerance, isAdmin, onChanged }: Props) {
  const [error, setError] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newKind, setNewKind] = useState<CalendarDayKind>('HOLIDAY')
  const [newDescription, setNewDescription] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = calendar.filter((day) => day.date >= today)

  async function run(action: () => Promise<void>) {
    setError('')
    try { await action(); onChanged() }
    catch (err) { reportError('ScheduleCalendarSettings', err); setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio.') }
  }

  function toggleOwnSchedule(level: Classroom['level'], enabled: boolean) {
    void run(() => enabled
      ? saveLevelSchedule({ level, entryLimit: globalLimit, toleranceEnabled: globalTolerance.enabled, toleranceMinutes: globalTolerance.minutes })
      : deleteLevelSchedule(level))
  }

  async function addDay() {
    if (!newDate) { setError('Elige la fecha.'); return }
    await run(() => saveCalendarDay({ date: newDate, kind: newKind, description: newDescription }))
    setNewDate(''); setNewDescription('')
  }

  return (
    <>
      <section>
        <h3 className="font-black">Horario por nivel</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sin horario propio, el nivel usa el general ({globalLimit}{globalTolerance.enabled ? ` +${globalTolerance.minutes} min` : ''}).</p>
        <div className="mt-3 space-y-3">
          {LEVELS.map((level) => {
            const own = schedules.find((item) => item.level === level)
            return (
              <div key={level} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
                <label className="flex items-center justify-between">
                  <b>{level}</b>
                  <span className="flex items-center gap-2 text-sm">
                    Horario propio
                    <input type="checkbox" className="h-5 w-5" checked={Boolean(own)} onChange={(e) => toggleOwnSchedule(level, e.target.checked)} />
                  </span>
                </label>
                {own && (
                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                    <Input type="time" value={own.entryLimit} onChange={(e) => void run(() => saveLevelSchedule({ ...own, entryLimit: e.target.value }))} className="font-bold" />
                    <label className="flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4" checked={own.toleranceEnabled} onChange={(e) => void run(() => saveLevelSchedule({ ...own, toleranceEnabled: e.target.checked }))} /> Tolerancia</label>
                    <input type="number" min={0} max={60} disabled={!own.toleranceEnabled} value={own.toleranceMinutes} onChange={(e) => void run(() => saveLevelSchedule({ ...own, toleranceMinutes: Number(e.target.value) || 0 }))} className="h-10 w-16 rounded-lg border border-slate-300 bg-white px-2 text-center font-bold text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" aria-label={`Minutos de tolerancia de ${level}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-2 font-black"><CalendarOff size={18} /> Calendario escolar</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">En estos días no se generan faltas al cerrar el día.</p>
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500 dark:border-slate-700">No hay días sin clases próximos.</p>}
          {upcoming.map((day) => (
            <div key={day.date} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="min-w-0 flex-1">
                <p className="font-black capitalize">{new Date(day.date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="text-slate-500 dark:text-slate-400">{CALENDAR_KIND_LABELS[day.kind]}{day.description ? ` · ${day.description}` : ''}</p>
              </div>
              {isAdmin && <button type="button" onClick={() => void run(() => deleteCalendarDay(day.date))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800" aria-label="Quitar día"><Trash2 size={16} /></button>}
            </div>
          ))}
        </div>
        {isAdmin ? (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={newDate} min={today} onChange={(e) => setNewDate(e.target.value)} />
              <select value={newKind} onChange={(e) => setNewKind(e.target.value as CalendarDayKind)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {(Object.keys(CALENDAR_KIND_LABELS) as CalendarDayKind[]).map((kind) => <option key={kind} value={kind}>{CALENDAR_KIND_LABELS[kind]}</option>)}
              </select>
            </div>
            <Input placeholder="Descripción (ej.: Día de la Independencia)" maxLength={160} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            <Button variant="outline" className="w-full" onClick={() => void addDay()}><Plus className="mr-2" size={16} /> Agregar día sin clases</Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Solo el administrador puede editar el calendario.</p>
        )}
        {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </section>
    </>
  )
}
