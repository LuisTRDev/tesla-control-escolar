import { createContext, useContext, type KeyboardEvent, type ReactNode } from 'react'
import type { Classroom, Student } from '@/types'
import { entryTimeLabel } from '@/lib/displayLabels'
import { Odometer } from '../motion'

export type SelectStudent = (studentId: string) => void

/** En celular tocar una fila abre la ficha del alumno; en TV las filas no son interactivas. */
export const TAP_CLASS = 'cursor-pointer active:bg-white/10'
export function tap(onSelect: SelectStudent | undefined, studentId: string) {
  if (!onSelect) return {}
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(studentId),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(studentId) }
    },
  }
}

/** Alumnos cuya tardanza acaba de entrar: sus filas destellan unos segundos. */
export const FlashContext = createContext<ReadonlySet<string>>(new Set())
export function useFlashClass(studentId: string | undefined) {
  const flashing = useContext(FlashContext)
  return studentId && flashing.has(studentId) ? 'animate-lateFlash motion-reduce:animate-none' : ''
}

export type CardProps = {
  data: import('../panelData').PanelData
  /** Vista de celular: la página hace todo el scroll, hay buscador y "Ver más". */
  mobile: boolean
  onSelect?: SelectStudent
}

/** En celular la página hace todo el scroll: una lista con scroll propio atrapa el dedo. */
export const scrollClass = (mobile: boolean, rem: 30 | 34) => mobile ? '' : rem === 30 ? 'max-h-[30rem] overflow-auto pr-1' : 'max-h-[34rem] overflow-auto pr-1'

export function StudentRow({ student, classroom, time, status, icon, showStatus = true, hideTime = false, onSelect }: { student: Student; classroom?: Classroom; time: string; status: 'ON_TIME' | 'LATE'; icon: ReactNode; showStatus?: boolean; hideTime?: boolean; onSelect?: SelectStudent }) {
  const flash = useFlashClass(status === 'LATE' ? student.id : undefined)
  return <div {...tap(onSelect, student.id)} className={`${flash} flex items-center gap-2.5 rounded-2xl border border-white/7 bg-white/[.035] p-2.5 sm:gap-3 sm:p-3 ${onSelect ? TAP_CLASS : ''}`}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${status === 'LATE' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{icon}</div><div className="min-w-0 flex-1"><p className="break-words font-black leading-tight sm:truncate">{student.firstName} {student.lastName}</p><p className="mt-0.5 text-xs font-semibold text-slate-400">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula'}</p></div><div className="shrink-0 text-right">{hideTime ? <p className="text-[9px] font-black uppercase tracking-wider text-amber-300 sm:text-xs">Tardanza</p> : <p className="font-mono text-sm font-black sm:text-lg">{entryTimeLabel(time)}</p>}{showStatus && !hideTime && <p className={`text-[11px] font-black uppercase tracking-wider ${status === 'LATE' ? 'text-amber-300' : 'text-emerald-300'}`}>{status === 'LATE' ? 'Tardanza' : 'A tiempo'}</p>}</div></div>
}

export function Metric({ icon, label, value, accent = 'slate' }: { icon: ReactNode; label: string; value: number; accent?: 'slate' | 'emerald' | 'blue' | 'amber' }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-300 bg-emerald-500/10' : accent === 'blue' ? 'text-sky-300 bg-sky-500/10' : accent === 'amber' ? 'text-amber-300 bg-amber-500/10' : 'text-slate-300 bg-white/5'
  return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[.035] p-3 sm:p-4 xl:p-5"><div className={`inline-flex max-w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-black uppercase tracking-wider sm:gap-2 sm:px-3 sm:py-2 sm:text-xs ${accentClass}`}><span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5">{icon}</span><span className="truncate">{label}</span></div><p className="mt-3 text-3xl font-black sm:mt-4 sm:text-4xl xl:text-5xl"><Odometer value={value} /></p></div>
}

export function MiniStat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return <div className="rounded-2xl bg-white/[.035] p-3"><p className="text-xl font-black"><Odometer value={value} suffix={suffix} /></p><p className="mt-1 text-xs font-black uppercase tracking-widest text-slate-400">{label}</p></div>
}

export function TvCard({ title, subtitle, icon, children, strong = false }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode; strong?: boolean }) {
  return <section className={`h-full min-w-0 rounded-3xl border p-3 sm:p-4 xl:p-5 ${strong ? 'border-white/15 bg-white/[.045]' : 'border-white/10 bg-white/[.025]'}`}><div className="mb-4 flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-300">{icon}</div><div className="min-w-0"><h2 className="text-lg font-black xl:text-xl">{title}</h2><p className="mt-0.5 text-xs font-semibold text-slate-400">{subtitle}</p></div></div>{children}</section>
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-semibold text-slate-400">{text}</div>
}
