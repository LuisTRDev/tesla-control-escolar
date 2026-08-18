import { useMemo, useState } from 'react'
import { Check, Clock3, Search, TriangleAlert, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { AttendanceRecord, Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classroom: Classroom
  students: Student[]
  records: AttendanceRecord[]
  onMark: (studentId: string) => Promise<void>
  online: boolean
}

export default function QuickMode({ open, onClose, classroom, students, records, onMark, online }: Props) {
  const [query, setQuery] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const filtered = useMemo(() => students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(query.toLowerCase())), [students, query])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <section className="mx-auto flex h-full max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400"><Zap size={15}/> Modo auxiliar rápido</p><h2 className="mt-1 text-2xl font-black">{classroom.grade} {classroom.section}</h2><p className="mt-1 text-sm text-slate-500">Un toque para registrar. {online ? 'Conectado a Supabase.' : 'Sin conexión: las entradas quedarán en cola.'}</p></div>
          <Button variant="ghost" onClick={onClose}><X size={20}/></Button>
        </div>
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="relative"><Search className="absolute left-4 top-3.5 text-slate-400" size={19}/><Input autoFocus className="pl-11" placeholder="Buscar alumno..." value={query} onChange={(e)=>setQuery(e.target.value)}/></div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="space-y-2">
            {filtered.map((student) => {
              const record = records.find((r) => r.studentId === student.id)
              return <div key={student.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="min-w-0 flex-1"><p className="truncate font-black">{student.firstName} {student.lastName}</p><p className="text-xs text-slate-400">{student.guardianName}</p></div>
                {record ? <div className={`flex min-w-32 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black ${record.status==='ON_TIME'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300':'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>{record.status==='ON_TIME'?<Check size={16}/>:<TriangleAlert size={16}/>} {record.time}</div>
                : <Button disabled={markingId===student.id} onClick={async()=>{setMarkingId(student.id); try{await onMark(student.id)}finally{setMarkingId(null)}}}><Clock3 className="mr-2" size={16}/>{markingId===student.id?'Marcando...':'Entrada'}</Button>}
              </div>
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
