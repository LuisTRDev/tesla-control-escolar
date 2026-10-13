import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import type { AttendanceRecord, Student } from '@/types'

type Props = {
  record: AttendanceRecord | null
  student?: Student
  time: string
  onTimeChange: (value: string) => void
  entryLimit: string
  saving: boolean
  onClose: () => void
  onSave: () => void
  onDelete: () => void
}

/** Corrige la hora de ingreso o borra una marca hecha por error. */
export default function AttendanceEditDialog({ record, student, time, onTimeChange, entryLimit, saving, onClose, onSave, onDelete }: Props) {
  return (
    <AnimatePresence>{record && (
      <motion.div
        data-sheet-overlay
        className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"
        onMouseDown={() => { if (!saving) onClose() }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="w-full max-w-md"
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <Card data-sheet className="max-h-[92vh] w-full overflow-y-auto p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-brand-navy dark:text-brand-gold">Corrección de asistencia</p>
                <h3 className="mt-1 text-xl font-black">Editar marca de ingreso</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Corrige la hora registrada o borra la marca si fue un error.</p>
              </div>
              <Button variant="ghost" disabled={saving} onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <div className="mt-6">
              <p className="text-sm font-bold">Alumno: {student ? `${student.lastName}, ${student.firstName}` : record.studentId}</p>
              <label className="mt-4 block text-sm font-bold">
                Hora de ingreso
                <Input className="mt-2 h-12 text-lg font-bold" type="time" value={time} onChange={(event) => onTimeChange(event.target.value)} disabled={saving} />
              </label>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Hora actual: {record.time || '—'} · Límite: {entryLimit}</p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" disabled={saving} onClick={onDelete}>
                <Trash2 className="mr-2" size={17} /> Borrar marca
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 sm:flex-none" disabled={saving} onClick={onClose}>Cancelar</Button>
                <Button className="flex-1 sm:flex-none" disabled={saving || !time} onClick={onSave}>{saving ? 'Guardando...' : 'Guardar corrección'}</Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
