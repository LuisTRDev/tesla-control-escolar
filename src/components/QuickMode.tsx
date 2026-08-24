import { useMemo, useState } from 'react'
import { Check, Clock3, DoorOpen, Search, TriangleAlert, X, Zap } from 'lucide-react'
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
  onExit: (studentId: string) => Promise<void>
  online: boolean
}

type MarkFilter = 'ALL' | 'PENDING' | 'MARKED'
type ActionMode = 'ENTRY' | 'EXIT'

export default function QuickMode({ open, onClose, classrooms, students, records, onMark, onExit, online }: Props) {
  const [query, setQuery] = useState('')
  const [classroomId, setClassroomId] = useState('ALL')
  const [markFilter, setMarkFilter] = useState<MarkFilter>('PENDING')
  const [actionMode, setActionMode] = useState<ActionMode>('ENTRY')
  const [markingId, setMarkingId] = useState<string | null>(null)

  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c])), [classrooms])
  const recordMap = useMemo(() => new Map(records.map((record) => [record.studentId, record])), [records])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    return students
      .filter((student) => classroomId === 'ALL' || student.classroomId === classroomId)
      .filter((student) => {
        const record = recordMap.get(student.id)
        const marked = actionMode === 'ENTRY' ? Boolean(record) : Boolean(record?.exitTime)
        const eligible = actionMode === 'ENTRY' ? !record : Boolean(record) && !record?.exitTime
        if (markFilter === 'PENDING') return eligible
        if (markFilter === 'MARKED') return marked
        return true
      })
      .filter((student) => {
        if (!normalized) return true
        const room = classroomMap.get(student.classroomId)
        const haystack = `${student.firstName} ${student.lastName} ${student.dni} ${room?.grade ?? ''} ${room?.section ?? ''} ${room?.level ?? ''}`.toLocaleLowerCase('es')
        return haystack.includes(normalized)
      })
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es', { sensitivity: 'base' }))
  }, [students, classroomId, query, classroomMap, recordMap, markFilter, actionMode])

  const pendingCount = useMemo(() => students.filter((student) => {
    const record = recordMap.get(student.id)
    return actionMode === 'ENTRY' ? !record : Boolean(record) && !record?.exitTime
  }).length, [students, recordMap, actionMode])
  const markedCount = useMemo(() => students.filter((student) => actionMode === 'ENTRY' ? recordMap.has(student.id) : Boolean(recordMap.get(student.id)?.exitTime)).length, [students, recordMap, actionMode])

  if (!open) return null

  const run = async (studentId: string) => {
    setMarkingId(studentId)
    try { if (actionMode === 'ENTRY') await onMark(studentId); else await onExit(studentId) }
    finally { setMarkingId(null) }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <section className="mx-auto flex h-full max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400"><Zap size={15}/> Modo auxiliar rápido</p><h2 className="mt-1 text-2xl font-black">Todos los alumnos</h2><p className="mt-1 text-sm text-slate-500">Entrada y salida rápida en todo el colegio. {online ? 'Conectado.' : 'Sin conexión: las operaciones quedarán pendientes.'}</p></div>
          <Button variant="ghost" onClick={onClose}><X size={20}/></Button>
        </div>

        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
            <button type="button" onClick={()=>{setActionMode('ENTRY');setMarkFilter('PENDING')}} className={`rounded-xl px-4 py-2 text-sm font-black ${actionMode==='ENTRY'?'bg-white text-slate-950 shadow dark:bg-slate-100':'text-slate-500'}`}><Clock3 className="mr-2 inline" size={16}/>Entradas</button>
            <button type="button" onClick={()=>{setActionMode('EXIT');setMarkFilter('PENDING')}} className={`rounded-xl px-4 py-2 text-sm font-black ${actionMode==='EXIT'?'bg-white text-slate-950 shadow dark:bg-slate-100':'text-slate-500'}`}><DoorOpen className="mr-2 inline" size={16}/>Salidas</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <div className="relative"><Search className="absolute left-4 top-3.5 text-slate-400" size={19}/><Input autoFocus className="pl-11" placeholder="Buscar alumno o DNI..." value={query} onChange={(e)=>setQuery(e.target.value)}/></div>
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-900" value={classroomId} onChange={(e)=>setClassroomId(e.target.value)}><option value="ALL">Todos los salones</option>{classrooms.map((room) => <option key={room.id} value={room.id}>{room.grade} {room.section} · {room.level}</option>)}</select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMarkFilter('ALL')} className={`rounded-xl border px-3 py-2 text-xs font-black ${markFilter==='ALL'?'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950':'border-slate-200'}`}>Todos · {students.length}</button>
            <button type="button" onClick={() => setMarkFilter('PENDING')} className={`rounded-xl border px-3 py-2 text-xs font-black ${markFilter==='PENDING'?'border-amber-500 bg-amber-500 text-white':'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'}`}>{actionMode==='ENTRY'?'Sin entrada':'Pendientes de salida'} · {pendingCount}</button>
            <button type="button" onClick={() => setMarkFilter('MARKED')} className={`rounded-xl border px-3 py-2 text-xs font-black ${markFilter==='MARKED'?'border-emerald-600 bg-emerald-600 text-white':'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>{actionMode==='ENTRY'?'Con entrada':'Con salida'} · {markedCount}</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4"><div className="space-y-2">{filtered.map((student) => {
          const record = recordMap.get(student.id); const room = classroomMap.get(student.classroomId)
          const done = actionMode==='ENTRY' ? Boolean(record) : Boolean(record?.exitTime)
          const canAct = actionMode==='ENTRY' ? !record : Boolean(record) && !record?.exitTime
          return <div key={student.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/50"><div className="min-w-0 flex-1"><p className="truncate font-black">{student.lastName}, {student.firstName}</p><p className="text-xs text-slate-400">{room ? `${room.grade} ${room.section} · ${room.level}` : 'Sin salón'}{student.dni ? ` · DNI ${student.dni}` : ''}</p></div>{done ? <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Check className="mr-1 inline" size={16}/>{actionMode==='ENTRY' ? record?.time : record?.exitTime}</div> : canAct ? <Button disabled={markingId===student.id} onClick={()=>void run(student.id)}>{actionMode==='ENTRY'?<Clock3 className="mr-2" size={16}/>:<DoorOpen className="mr-2" size={16}/>} {markingId===student.id?'Marcando...':actionMode==='ENTRY'?'Entrada':'Salida'}</Button> : <span className="text-xs font-bold text-slate-400">Sin entrada</span>}</div>
        })}{filtered.length===0&&<div className="py-12 text-center text-sm text-slate-500">No hay alumnos para este filtro.</div>}</div></div>
      </section>
    </div>
  )
}
