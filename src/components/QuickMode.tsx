import { useMemo, useState } from 'react'
import { Check, Clock3, LogOut, Search, TriangleAlert, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
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
}

export default function QuickMode({ open, onClose, classrooms, students, records, onMark, onExit, online }: Props) {
  const [query, setQuery] = useState('')
  const [classroomId, setClassroomId] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'MARKED' | 'LATE'>('ALL')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [exitingId, setExitingId] = useState<string | null>(null)

  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...students]
      .filter((student) => classroomId === 'ALL' || student.classroomId === classroomId)
      .filter((student) => `${student.firstName} ${student.lastName}`.toLowerCase().includes(q))
      .map((student) => ({ student, record: records.find((r) => r.studentId === student.id) }))
      .filter(({ record }) => {
        if (statusFilter === 'PENDING') return !record
        if (statusFilter === 'MARKED') return Boolean(record)
        if (statusFilter === 'LATE') return record?.status === 'LATE'
        return true
      })
      .sort((a, b) => {
        const byLast = a.student.lastName.localeCompare(b.student.lastName, 'es')
        return byLast || a.student.firstName.localeCompare(b.student.firstName, 'es')
      })
  }, [students, records, classroomId, query, statusFilter])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <section className="mx-auto flex h-full max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand-navy dark:text-brand-gold"><Zap size={15}/> Modo auxiliar rápido</p>
            <h2 className="mt-1 text-2xl font-black">Todo el colegio</h2>
            <p className="mt-1 text-sm text-slate-500">Busca en todos los salones o filtra por aula. {online ? 'Conectado a Supabase.' : 'Sin conexión: las entradas quedarán en cola.'}</p>
          </div>
          <Button variant="ghost" onClick={onClose}><X size={20}/></Button>
        </div>

        <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[1fr_210px_180px]">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-slate-400" size={19}/>
            <Input autoFocus className="pl-11" placeholder="Buscar alumno en todo el colegio..." value={query} onChange={(e)=>setQuery(e.target.value)}/>
          </div>
          <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
            <option value="ALL">Todos los salones</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade} {c.section} · {c.level}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
            <option value="ALL">Todos</option>
            <option value="PENDING">Sin marcar entrada</option>
            <option value="MARKED">Ya marcados</option>
            <option value="LATE">Solo tardanzas</option>
          </select>
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs font-bold text-slate-500 dark:border-slate-800">
          <span>{filtered.length} alumnos mostrados</span>
          <span>Orden alfabético</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-2">
            {filtered.map(({ student, record }) => {
              const classroom = classroomMap.get(student.classroomId)
              return (
                <div key={student.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">{student.lastName}, {student.firstName}</p>
                    <p className="text-xs text-slate-400">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Aula no encontrada'}</p>
                  </div>

                  {record ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className={`flex min-w-32 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black ${record.status==='ON_TIME'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300':'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                        {record.status==='ON_TIME'?<Check size={16}/>:<TriangleAlert size={16}/>} {record.time} · {record.status==='ON_TIME'?'A tiempo':'Tardanza'}
                      </div>
                      {onExit && (
                        <Button variant="outline" disabled={Boolean(record.exitTime) || exitingId===student.id} onClick={async()=>{setExitingId(student.id);try{await onExit(student.id)}finally{setExitingId(null)}}}>
                          <LogOut className="mr-2" size={16}/>{record.exitTime ? `Salida ${record.exitTime}` : exitingId===student.id ? 'Marcando...' : 'Salida'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button disabled={markingId===student.id} onClick={async()=>{setMarkingId(student.id); try{await onMark(student.id)}finally{setMarkingId(null)}}}>
                      <Clock3 className="mr-2" size={16}/>{markingId===student.id?'Marcando...':'Entrada'}
                    </Button>
                  )}
                </div>
              )
            })}
            {filtered.length===0 && <div className="py-12 text-center text-sm text-slate-500">No hay alumnos para este filtro.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
