import { Fragment, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock3, LogOut, Search, TriangleAlert, Users, X, Zap } from 'lucide-react'
import BulkMarkDialog from '@/components/BulkMarkDialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { studentMatches } from '@/lib/search'
import type { AttendanceRecord, Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  students: Student[]
  records: AttendanceRecord[]
  onMark: (studentId: string) => Promise<void>
  onExit?: (studentId: string) => Promise<void>
  online: boolean
  entryLimit: string
  onBulkMark: (studentIds: string[]) => Promise<void>
}

type StatusFilter = 'ALL' | 'PENDING' | 'MARKED' | 'LATE'

const statusFilters: Array<{ id: StatusFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'PENDING', label: 'Faltan por llegar' },
  { id: 'MARKED', label: 'Ya marcados' },
  { id: 'LATE', label: 'Tardanzas' },
]

const byName = (a: Student, b: Student) => a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es')

export default function QuickMode({ open, onClose, classrooms, students, records, onMark, onExit, online, entryLimit, onBulkMark }: Props) {
  const [query, setQuery] = useState('')
  const [classroomId, setClassroomId] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set())
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms])
  const classroomOrder = useMemo(() => new Map(classrooms.map((c, index) => [c.id, index])), [classrooms])
  // Índice por alumno: evita recorrer todos los registros por cada fila (lento con todo el colegio en celulares).
  const recordByStudent = useMemo(() => new Map(records.map((r) => [r.studentId, r])), [records])

  // Alumnos del aula elegida que coinciden con la búsqueda, sin aplicar aún el filtro de estado.
  const inScope = useMemo(() => students
    .filter((student) => classroomId === 'ALL' || student.classroomId === classroomId)
    .filter((student) => studentMatches(student, query)),
  [students, classroomId, query])

  const counts = useMemo(() => {
    let marked = 0
    let late = 0
    for (const student of inScope) {
      const record = recordByStudent.get(student.id)
      if (!record) continue
      marked++
      if (record.status === 'LATE') late++
    }
    return { total: inScope.length, marked, late, pending: inScope.length - marked }
  }, [inScope, recordByStudent])

  const filtered = useMemo(() => {
    const rows = inScope
      .map((student) => ({ student, record: recordByStudent.get(student.id) }))
      .filter(({ record }) => {
        if (statusFilter === 'PENDING') return !record
        if (statusFilter === 'MARKED') return Boolean(record)
        if (statusFilter === 'LATE') return record?.status === 'LATE'
        return true
      })
    // "Faltan por llegar" en todo el colegio se ordena por aula para recorrerlo salón por salón.
    if (statusFilter === 'PENDING' && classroomId === 'ALL') {
      return rows.sort((a, b) => (classroomOrder.get(a.student.classroomId) ?? 0) - (classroomOrder.get(b.student.classroomId) ?? 0) || byName(a.student, b.student))
    }
    return rows.sort((a, b) => byName(a.student, b.student))
  }, [inScope, recordByStudent, statusFilter, classroomId, classroomOrder])

  const groupByClassroom = statusFilter === 'PENDING' && classroomId === 'ALL'

  // Alumnos sin ninguna asistencia hoy, respetando el filtro de aula/búsqueda
  // actual (pero no el filtro de estado, para no confundir qué se va a marcar).
  const unmarkedInView = useMemo(() => inScope.filter((student) => !recordByStudent.has(student.id)).sort(byName), [inScope, recordByStudent])

  function openBulk() {
    setBulkSelected(new Set(unmarkedInView.map((s) => s.id)))
    setBulkOpen(true)
  }

  async function confirmBulk() {
    const ids = Array.from(bulkSelected)
    if (ids.length === 0) { setBulkOpen(false); return }
    setBulkSaving(true)
    try {
      await onBulkMark(ids)
      setBulkOpen(false)
    } finally {
      setBulkSaving(false)
    }
  }

  async function markStudent(studentId: string) {
    if (markingIds.has(studentId)) return
    setMarkingIds((curr) => new Set(curr).add(studentId))
    try {
      await onMark(studentId)
    } finally {
      setMarkingIds((curr) => { const next = new Set(curr); next.delete(studentId); return next })
    }
  }

  const progress = counts.total ? Math.round((counts.marked / counts.total) * 100) : 0

  return (
    <AnimatePresence>{open && (
    <motion.div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-sm sm:p-5" onMouseDown={onClose} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
      <motion.section className="relative mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 sm:max-h-[94vh] sm:rounded-3xl sm:border sm:border-slate-200 sm:dark:border-slate-800" onMouseDown={(e) => e.stopPropagation()} initial={{scale:0.96,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-navy dark:text-brand-gold"><Zap size={15}/> Modo auxiliar rápido</p>
            <h2 className="mt-1 text-xl font-black sm:text-2xl">{classroomId === 'ALL' ? 'Todo el colegio' : (() => { const c = classroomMap.get(classroomId); return c ? `${c.grade} ${c.section} · ${c.level}` : 'Aula' })()}</h2>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block">Toca un alumno para marcar su entrada. {online ? 'Conectado a Supabase.' : 'Sin conexión: las entradas quedarán en cola.'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" className="hidden sm:inline-flex" onClick={openBulk} disabled={unmarkedInView.length === 0}>
              <Users className="mr-2" size={16}/> Marcar el resto a tiempo
            </Button>
            <Button variant="ghost" className="h-11 w-11 p-0" onClick={onClose} aria-label="Cerrar"><X size={22}/></Button>
          </div>
        </div>

        {/* Contador en vivo del alcance actual (aula o colegio + búsqueda). */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="text-lg font-black tabular-nums">{counts.marked}/{counts.total} <span className="text-sm font-bold text-slate-500 dark:text-slate-400">ingresaron</span></span>
            <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">{counts.late} tardanza{counts.late !== 1 ? 's' : ''}</span>
            <span className="font-bold tabular-nums text-slate-600 dark:text-slate-300">{counts.pending} faltan</span>
            {!online && <span className="ml-auto rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Sin conexión · en cola</span>}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="grid gap-2 border-b border-slate-200 p-3 dark:border-slate-800 sm:p-4 md:grid-cols-[1fr_230px]">
          <div className="relative">
            <Search className="absolute left-4 top-4 text-slate-400" size={20}/>
            <Input autoFocus className="h-14 pl-12 text-base" placeholder="Apellido, nombre o DNI..." value={query} onChange={(e)=>setQuery(e.target.value)} enterKeyHint="search"/>
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Limpiar búsqueda"><X size={18}/></button>}
          </div>
          <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="h-14 rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:h-14">
            <option value="ALL">Todos los salones</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade} {c.section} · {c.level}</option>)}
          </select>
          <div className="flex gap-2 overflow-x-auto md:col-span-2">
            {statusFilters.map((item) => (
              <Button key={item.id} variant={statusFilter === item.id ? 'default' : 'outline'} className="h-11 shrink-0 whitespace-nowrap" onClick={() => setStatusFilter(item.id)}>
                {item.label}{item.id === 'PENDING' && counts.pending > 0 ? ` (${counts.pending})` : ''}
              </Button>
            ))}
            <Button variant="outline" className="h-11 shrink-0 whitespace-nowrap sm:hidden" onClick={openBulk} disabled={unmarkedInView.length === 0}>
              <Users className="mr-2" size={16}/> Resto a tiempo
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-2">
            {filtered.map(({ student, record }, index) => {
              const classroom = classroomMap.get(student.classroomId)
              const classroomLabel = classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula no encontrada'
              const showHeader = groupByClassroom && (index === 0 || filtered[index - 1].student.classroomId !== student.classroomId)
              const pendingInRoom = showHeader ? filtered.filter((row) => row.student.classroomId === student.classroomId).length : 0
              return (
                <Fragment key={student.id}>
                  {showHeader && (
                    <p className="sticky top-0 z-[1] -mx-1 bg-white/95 px-1 pb-1 pt-3 text-xs font-black uppercase tracking-wider text-slate-500 backdrop-blur dark:bg-slate-950/95 dark:text-slate-400">
                      {classroomLabel} · faltan {pendingInRoom}
                    </p>
                  )}
                  {record ? (
                    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black">{student.lastName}, {student.firstName}</p>
                        <p className="text-xs text-slate-400">{classroomLabel}</p>
                      </div>
                      <div className="flex gap-2">
                        <div className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-black sm:min-w-36 sm:flex-none ${record.status==='ON_TIME'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300':'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                          {record.status==='ON_TIME'?<Check size={16}/>:<TriangleAlert size={16}/>} {record.time} · {record.status==='ON_TIME'?'A tiempo':'Tardanza'}
                        </div>
                        {onExit && (
                          <Button variant="outline" className="h-11 flex-1 sm:flex-none" disabled={Boolean(record.exitTime) || exitingId===student.id} onClick={async()=>{setExitingId(student.id);try{await onExit(student.id)}finally{setExitingId(null)}}}>
                            <LogOut className="mr-2" size={16}/>{record.exitTime ? `Salida ${record.exitTime}` : exitingId===student.id ? 'Marcando...' : 'Salida'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Toda la fila es el botón: un toque marca la entrada (se puede deshacer desde el aviso).
                    <button
                      type="button"
                      disabled={markingIds.has(student.id)}
                      onClick={() => void markStudent(student.id)}
                      className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-navy active:scale-[0.99] active:bg-emerald-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-gold dark:active:bg-emerald-950/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-black">{student.lastName}, {student.firstName}</p>
                        <p className="text-xs text-slate-400">{classroomLabel}</p>
                      </div>
                      <span className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-black text-white dark:bg-brand-gold dark:text-brand-navyDeep">
                        <Clock3 size={18}/>{markingIds.has(student.id) ? 'Marcando...' : 'Entrada'}
                      </span>
                    </button>
                  )}
                </Fragment>
              )
            })}
            {filtered.length===0 && (
              <div className="py-12 text-center text-sm text-slate-500">
                {statusFilter === 'PENDING' && counts.total > 0 ? '¡Todos ingresaron! No falta nadie en esta vista.' : 'No hay alumnos para este filtro.'}
              </div>
            )}
          </div>
        </div>

        <BulkMarkDialog
          position="absolute"
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          students={unmarkedInView}
          selected={bulkSelected}
          onSelectedChange={setBulkSelected}
          saving={bulkSaving}
          onConfirm={() => void confirmBulk()}
          classroomMap={classroomId === 'ALL' ? classroomMap : undefined}
          description={<>Se guardará <b>{entryLimit}</b> (hora límite) como hora de ingreso, en {classroomId === 'ALL' ? 'todo el colegio' : 'el aula filtrada'}. Desmarca a quien sepas que <b>faltó</b> hoy.</>}
        />
      </motion.section>
    </motion.div>
    )}</AnimatePresence>
  )
}
