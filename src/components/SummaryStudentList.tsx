import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useBackClose } from '@/lib/backClose'
import { studentMatches } from '@/lib/search'
import type { SummaryListRow, SummaryRowTone } from './dailySummaryLists'

const TONE_CLASS: Record<SummaryRowTone, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  late: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  absent: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  warn: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

type Props = {
  open: boolean
  onClose: () => void
  title: string
  scopeLabel: string
  rows: SummaryListRow[]
  /** Con "todo el colegio" los alumnos se agrupan por aula. */
  groupByClassroom: boolean
}

const classroomLabel = (row: SummaryListRow) => (row.classroom ? `${row.classroom.grade} ${row.classroom.section} · ${row.classroom.level}` : 'Sin aula')

function ListBody({ onClose, title, scopeLabel, rows, groupByClassroom }: Omit<Props, 'open'>) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => rows.filter((row) => studentMatches(row.student, query)), [rows, query])
  const groups = useMemo(() => {
    if (!groupByClassroom) return [{ label: '', rows: filtered }]
    const byLabel = new Map<string, SummaryListRow[]>()
    for (const row of filtered) byLabel.set(classroomLabel(row), [...(byLabel.get(classroomLabel(row)) ?? []), row])
    return [...byLabel.entries()].map(([label, items]) => ({ label, rows: items }))
  }, [filtered, groupByClassroom])

  return (
    <motion.div data-sheet-overlay className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <Card data-sheet role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden p-0" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-lg font-black">{title} <span className="text-slate-500">· {rows.length}</span></h3>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{scopeLabel}</p>
          </div>
          <Button variant="ghost" className="h-10 px-2.5" onClick={onClose} aria-label="Cerrar lista"><X size={20} /></Button>
        </div>
        {rows.length > 8 && (
          <label className="relative block border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <span className="sr-only">Buscar alumno</span>
            <Search size={17} className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar alumno…" className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base font-semibold dark:border-slate-700 dark:bg-slate-950" />
          </label>
        )}
        <div className="overflow-y-auto px-3 py-3">
          {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700">{rows.length === 0 ? 'No hay alumnos en esta cifra.' : 'Nadie coincide con la búsqueda.'}</p>}
          {groups.map((group) => (
            <section key={group.label || 'all'} className="mb-3 last:mb-0">
              {group.label && <h4 className="sticky top-0 z-[1] flex items-center justify-between bg-white/95 px-2 py-1.5 text-xs font-black uppercase tracking-wider text-slate-500 backdrop-blur dark:bg-slate-900/95 dark:text-slate-400"><span>{group.label}</span><span>{group.rows.length}</span></h4>}
              <ul>
                {group.rows.map((row) => (
                  <li key={row.student.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 odd:bg-slate-50 dark:odd:bg-slate-800/40">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-bold leading-tight">{row.student.lastName}, {row.student.firstName}</p>
                      {!groupByClassroom && <p className="text-xs text-slate-500 dark:text-slate-400">{classroomLabel(row)}</p>}
                    </div>
                    <span className={`max-w-[55%] shrink-0 rounded-lg px-2.5 py-1 text-right text-xs font-black ${TONE_CLASS[row.tone]}`}>{row.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Card>
    </motion.div>
  )
}

/** Lista de alumnos detrás de una cifra del resumen diario (tardanzas, faltas, etc.). */
export function SummaryStudentList(props: Props) {
  useBackClose(props.open, props.onClose)
  return <AnimatePresence>{props.open && <ListBody onClose={props.onClose} title={props.title} scopeLabel={props.scopeLabel} rows={props.rows} groupByClassroom={props.groupByClassroom} />}</AnimatePresence>
}
