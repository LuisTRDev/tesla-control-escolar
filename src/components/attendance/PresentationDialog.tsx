import type { Dispatch, SetStateAction } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ClipboardCheck, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { PresentationDraft } from '@/lib/presentation'
import type { AttendanceRecord, Classroom, PresentationStatus, Student } from '@/types'

type Props = {
  presentationStudent: Student | null
  setPresentationStudent: (student: Student | null) => void
  presentationDraft: PresentationDraft
  setPresentationDraft: Dispatch<SetStateAction<PresentationDraft>>
  setPresentationMode: (status: PresentationStatus) => void
  savePresentation: () => void | Promise<void>
  presentationSaveDisabled: boolean
  todayRecords: AttendanceRecord[]
  classroom: Classroom
}

export default function PresentationDialog({ presentationStudent, setPresentationStudent, presentationDraft, setPresentationDraft, setPresentationMode, savePresentation, presentationSaveDisabled, todayRecords, classroom }: Props) {
  return (
    <AnimatePresence>{presentationStudent && (
      <motion.div data-sheet-overlay className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setPresentationStudent(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.section
          data-sheet
          className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6"
          onMouseDown={(event) => event.stopPropagation()}
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Control de reglamento interno</p>
              <h2 className="mt-1 text-xl font-black">{presentationStudent.firstName} {presentationStudent.lastName}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{classroom.grade} {classroom.section} · {classroom.level}</p>
            </div>
            <Button variant="ghost" onClick={() => setPresentationStudent(null)} aria-label="Cerrar"><X size={20} /></Button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPresentationMode('COMPLIANT')}
              className={`rounded-2xl border p-4 text-left transition ${presentationDraft.status === 'COMPLIANT'
                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/40 dark:ring-emerald-950'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-slate-600'}`}
            >
              <span className="flex items-center gap-2 font-black text-emerald-700 dark:text-emerald-300"><Check size={19} /> Todo conforme</span>
              <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">El alumno fue revisado y no presenta incidencias.</span>
            </button>

            <button
              type="button"
              onClick={() => setPresentationMode('NON_COMPLIANT')}
              className={`rounded-2xl border p-4 text-left transition ${presentationDraft.status === 'NON_COMPLIANT'
                ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-100 dark:border-amber-500 dark:bg-amber-950/35 dark:ring-amber-950'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-slate-600'}`}
            >
              <span className="flex items-center gap-2 font-black text-amber-700 dark:text-amber-300"><TriangleAlert size={19} /> Registrar incumplimiento</span>
              <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">Selecciona una o varias disposiciones incumplidas.</span>
            </button>
          </div>

          {presentationDraft.status === 'NON_COMPLIANT' && (() => {
            const attendanceToday = todayRecords.find((r) => r.studentId === presentationStudent.id)
            const lateAllowed = attendanceToday?.status === 'LATE'
            return (
            <div className="mt-6 space-y-3">
              <p className="text-sm font-black">Incumplimientos institucionales</p>
              {[
                ['hairstyleViolation', '1. Peinado no acorde con las disposiciones institucionales.'],
                ['uniformUsageViolation', '2. Uso inadecuado o incompleto del uniforme.'],
                ['nonInstitutionalGarment', '3. Prenda no correspondiente al uniforme institucional.'],
                ['lateEntryViolation', '4. Tardanza en el ingreso.'],
                ['inappropriateConductViolation', '5. Conducta inapropiada.'],
              ].map(([key, label]) => {
                const disabled = key === 'lateEntryViolation' && !lateAllowed && !presentationDraft.lateEntryViolation
                return (
                <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-slate-600 ${disabled ? 'cursor-not-allowed opacity-50 hover:border-slate-200 dark:hover:border-slate-700' : ''}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-slate-950 dark:accent-slate-100"
                    checked={Boolean(presentationDraft[key as keyof PresentationDraft])}
                    disabled={disabled}
                    onChange={(event) => setPresentationDraft((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span className="text-sm font-semibold leading-6">
                    {label}
                    {disabled && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">No disponible: el alumno no tiene una tardanza de ingreso registrada hoy.</span>}
                  </span>
                </label>
                )
              })}

              <label className="block rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/50">
                <span className="text-sm font-black">Descripción de la observación</span>
                <textarea
                  value={presentationDraft.observation}
                  onChange={(event) => setPresentationDraft((current) => ({ ...current, observation: event.target.value }))}
                  placeholder="Detalle adicional de la situación observada..."
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-800"
                />
              </label>
            </div>
            )
          })()}

          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPresentationStudent(null)}>Cancelar</Button>
            <Button disabled={presentationSaveDisabled} onClick={savePresentation}>
              <ClipboardCheck className="mr-2" size={18} /> Guardar control
            </Button>
          </div>
        </motion.section>
      </motion.div>
    )}</AnimatePresence>
  )
}
