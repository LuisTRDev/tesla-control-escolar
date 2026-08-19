import { useMemo, useState } from 'react'
import { Check, Clock3, Search, TriangleAlert, X, Zap } from 'lucide-react'
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
  online: boolean
}

type MarkFilter = 'ALL' | 'PENDING' | 'MARKED'

export default function QuickMode({ open, onClose, classrooms, students, records, onMark, online }: Props) {
  const [query, setQuery] = useState('')
  const [classroomId, setClassroomId] = useState('ALL')
  const [markFilter, setMarkFilter] = useState<MarkFilter>('ALL')
  const [markingId, setMarkingId] = useState<string | null>(null)

  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms])
  const recordMap = useMemo(() => new Map(records.map((record) => [record.studentId, record])), [records])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    return students
      .filter((student) => classroomId === 'ALL' || student.classroomId === classroomId)
      .filter((student) => {
        const marked = recordMap.has(student.id)
        if (markFilter === 'PENDING') return !marked
        if (markFilter === 'MARKED') return marked
        return true
      })
      .filter((student) => {
        if (!normalized) return true
        const room = classroomMap.get(student.classroomId)
        const haystack = `${student.firstName} ${student.lastName} ${room?.grade ?? ''} ${room?.section ?? ''} ${room?.level ?? ''}`.toLocaleLowerCase('es')
        return haystack.includes(normalized)
      })
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es', { sensitivity: 'base' }))
  }, [students, classroomId, query, classroomMap, recordMap, markFilter])

  const pendingCount = useMemo(() => students.filter((student) => !recordMap.has(student.id)).length, [students, recordMap])
  const markedCount = students.length - pendingCount

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <section className="mx-auto flex h-full max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400"><Zap size={15}/> Modo auxiliar rápido</p>
            <h2 className="mt-1 text-2xl font-black">Todos los alumnos</h2>
            <p className="mt-1 text-sm text-slate-500">Busca en todo el colegio, filtra por salón o muestra únicamente los alumnos que todavía no registran entrada. {online ? 'Conectado.' : 'Sin conexión: las entradas quedarán pendientes.'}</p>
          </div>
          <Button variant="ghost" onClick={onClose}><X size={20}/></Button>
        </div>

        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 text-slate-400" size={19}/>
              <Input autoFocus className="pl-11" placeholder="Buscar alumno en todo el colegio..." value={query} onChange={(e)=>setQuery(e.target.value)}/>
            </div>
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-900" value={classroomId} onChange={(e)=>setClassroomId(e.target.value)}>
              <option value="ALL">Todos los salones</option>
              {classrooms.map((room) => <option key={room.id} value={room.id}>{room.grade} {room.section} · {room.level}</option>)}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMarkFilter('ALL')} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${markFilter === 'ALL' ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
              Todos · {students.length}
            </button>
            <button type="button" onClick={() => setMarkFilter('PENDING')} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${markFilter === 'PENDING' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'}`}>
              Sin marcar · {pendingCount}
            </button>
            <button type="button" onClick={() => setMarkFilter('MARKED')} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${markFilter === 'MARKED' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
              Marcados · {markedCount}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2 text-xs text-slate-500 dark:border-slate-800">
          <span>{filtered.length} alumno{filtered.length === 1 ? '' : 's'} visibles</span>
          <span>Orden alfabético por apellido</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-2">
            {filtered.map((student) => {
              const record = recordMap.get(student.id)
              const room = classroomMap.get(student.classroomId)
              return <div key={student.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{student.lastName}, {student.firstName}</p>
                  <p className="text-xs text-slate-400">{room ? `${room.grade} ${room.section} · ${room.level}` : 'Sin salón'} · {student.guardianName}</p>
                </div>
                {record ? <div className={`flex min-w-32 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black ${record.status==='ON_TIME'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300':'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>{record.status==='ON_TIME'?<Check size={16}/>:<TriangleAlert size={16}/>} {record.time}</div>
                : <Button disabled={markingId===student.id} onClick={async()=>{setMarkingId(student.id); try{await onMark(student.id)}finally{setMarkingId(null)}}}><Clock3 className="mr-2" size={16}/>{markingId===student.id?'Marcando...':'Entrada'}</Button>}
              </div>
            })}
            {filtered.length === 0 && <div className="py-12 text-center text-sm text-slate-500">{markFilter === 'PENDING' ? 'Todos los alumnos de este filtro ya tienen entrada registrada.' : 'No hay alumnos que coincidan con la búsqueda.'}</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
