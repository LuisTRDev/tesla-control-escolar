import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Search, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { studentMatches } from '@/lib/search'
import type { Student } from '@/types'

export type SharedStudentStatus = { label: string; canJustify: boolean }

type Props = {
  /** Documento recibido desde el menú Compartir; el diálogo se abre mientras haya uno. */
  file: File | null
  students: Student[]
  classroomLabel: (student: Student) => string
  statusOf: (student: Student) => SharedStudentStatus
  onPick: (student: Student) => void
  onClose: () => void
}

const MAX_RESULTS = 8

/** Elegir a qué alumno corresponde un documento compartido desde otra app (WhatsApp, Galería...). */
export default function SharedDocumentDialog({ file, students, classroomLabel, statusOf, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    if (query.trim().length < 2) return []
    return students.filter((student) => studentMatches(student, query)).slice(0, MAX_RESULTS)
  }, [students, query])

  return (
    <AnimatePresence>{file && (
      <motion.div data-sheet-overlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }} className="w-full max-w-md">
          <Card data-sheet className="max-h-[90vh] w-full overflow-y-auto p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-black">Documento recibido</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><FileText size={15} className="shrink-0" /><span className="truncate">{file.name}</span></p>
              </div>
              <button type="button" onClick={onClose} aria-label="Cerrar" className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X size={20} /></button>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Busca al alumno para usarlo como documento al justificar su tardanza o falta de hoy.</p>
            <div className="relative mt-4">
              <Search className="absolute left-4 top-3.5 text-slate-500 dark:text-slate-400" size={19} />
              <Input autoFocus className="pl-11" placeholder="Apellido, nombre o DNI" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="mt-3 space-y-2">
              {results.map((student) => {
                const status = statusOf(student)
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => onPick(student)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition-colors hover:border-sky-500 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-black">{student.lastName}, {student.firstName}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{classroomLabel(student)}</span>
                    </span>
                    <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-black ${status.canJustify ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{status.label}</span>
                  </button>
                )
              })}
              {query.trim().length >= 2 && results.length === 0 && <p className="py-4 text-center text-sm text-slate-500">Ningún alumno coincide.</p>}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
