import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  /** Alumnos sin marca de entrada que se pueden marcar en bloque. */
  students: Student[]
  selected: Set<string>
  onSelectedChange: (next: Set<string>) => void
  saving: boolean
  onConfirm: () => void
  description: ReactNode
  /** Si se pasa, muestra el aula debajo de cada nombre (útil con todo el colegio). */
  classroomMap?: Map<string, Classroom>
  /** `fixed` cubre la pantalla; `absolute` queda dentro del panel que lo contiene. */
  position?: 'fixed' | 'absolute'
}

/**
 * Confirmación del "Marcar el resto a tiempo". Todos llegan preseleccionados:
 * el auxiliar desmarca solo a quienes sabe que faltaron.
 */
export default function BulkMarkDialog({ open, onClose, students, selected, onSelectedChange, saving, onConfirm, description, classroomMap, position = 'fixed' }: Props) {
  function toggle(studentId: string) {
    const next = new Set(selected)
    if (next.has(studentId)) next.delete(studentId)
    else next.add(studentId)
    onSelectedChange(next)
  }

  return (
    <AnimatePresence>{open && (
      <motion.div
        className={`${position} inset-0 z-[90] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm`}
        onMouseDown={() => { if (!saving) onClose() }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="w-full max-w-lg"
          onMouseDown={(e) => e.stopPropagation()}
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <Card className="flex max-h-[85vh] flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-brand-navy dark:text-brand-gold">Marcado masivo</p>
                <h3 className="mt-1 text-xl font-black">Confirmar alumnos a marcar a tiempo</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
              </div>
              <Button variant="ghost" onClick={onClose} disabled={saving}><X size={20} /></Button>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>{selected.size} de {students.length} seleccionados</span>
              <div className="flex gap-3">
                <button type="button" className="text-brand-navy hover:underline dark:text-brand-gold" onClick={() => onSelectedChange(new Set(students.map((s) => s.id)))}>Marcar todos</button>
                <button type="button" className="text-brand-navy hover:underline dark:text-brand-gold" onClick={() => onSelectedChange(new Set())}>Ninguno</button>
              </div>
            </div>

            <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {students.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todos los alumnos ya tienen asistencia registrada hoy.</p>
              ) : students.map((student) => {
                const checked = selected.has(student.id)
                const room = classroomMap?.get(student.classroomId)
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => toggle(student.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${checked ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                      {checked && <Check size={13} className="text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{student.lastName}, {student.firstName}</span>
                      {room && <span className="block text-xs text-slate-500 dark:text-slate-400">{room.grade} {room.section} · {room.level}</span>}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button onClick={onConfirm} disabled={saving || selected.size === 0}>
                {saving ? 'Guardando...' : `Marcar ${selected.size} a tiempo`}
              </Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
