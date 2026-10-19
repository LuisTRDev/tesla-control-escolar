import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Paperclip, ShieldCheck, UserX, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { reportError } from '@/lib/security'
import { friendlyError } from '@/lib/errorMessages'
import { useToast } from '@/lib/toast'
import { JUSTIFICATION_REASONS, markAbsences, uploadJustificationDocument } from '@/services/dayStatusService'
import type { AbsenceRecord, Student } from '@/types'

type Props = {
  /** Alumnos que se pueden marcar con falta. Con uno solo no se muestra la lista. */
  students: Student[] | null
  /** Seleccionados al abrir (un alumno: él mismo; en grupo: ninguno). */
  initialSelected?: string[]
  date: string
  userName: string
  onClose: () => void
  onSaved: (absences: AbsenceRecord[]) => void
}

/** Marca faltas al momento (uno o varios alumnos), opcionalmente ya justificadas. */
export default function MarkAbsenceDialog({ students, initialSelected, date, userName, onClose, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [justified, setJustified] = useState(false)
  const [reason, setReason] = useState<string>(JUSTIFICATION_REASONS[0])
  const [detail, setDetail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  useEffect(() => {
    setSelected(new Set(initialSelected ?? []))
    setJustified(false); setReason(JUSTIFICATION_REASONS[0]); setDetail(''); setFile(null); setError('')
  }, [students, initialSelected])

  const single = students?.length === 1 ? students[0] : null

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function save() {
    if (!students || saving || selected.size === 0) return
    setSaving(true); setError('')
    try {
      const chosen = students.filter((s) => selected.has(s.id))
      // En grupo, el mismo documento sirve para todos: se sube una sola vez.
      const documentPath = justified && file ? await uploadJustificationDocument(file, chosen[0].id, (message) => toast.info(message)) : null
      const saved = await markAbsences({
        students: chosen.map((s) => ({ id: s.id, classroomId: s.classroomId })),
        date,
        justification: justified ? { reason: [reason, detail.trim()].filter(Boolean).join(': '), documentPath, byName: userName } : undefined,
      })
      onSaved(saved)
      onClose()
    } catch (err) {
      reportError('MarkAbsenceDialog', err)
      setError(friendlyError(err, 'No se pudo registrar la falta.'))
    } finally { setSaving(false) }
  }

  const count = selected.size
  const confirmLabel = saving ? 'Guardando...' : single ? (justified ? 'Marcar falta justificada' : 'Marcar falta') : `Marcar ${count} falta${count === 1 ? '' : 's'}`

  return (
    <AnimatePresence>{students && (
      <motion.div data-sheet-overlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={() => { if (!saving) onClose() }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.div className="w-full max-w-lg" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <Card data-sheet className="flex max-h-[90vh] w-full flex-col overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-700 dark:text-red-300"><UserX size={15} /> Inasistencia</p>
                <h3 className="mt-1 text-xl font-black">{single ? `${single.lastName}, ${single.firstName}` : 'Marcar faltas del aula'}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {single ? 'Queda registrada ahora, sin esperar al cierre del día.' : 'Elige a los alumnos que faltaron hoy.'} Si el alumno llega después, al marcar su ingreso la falta se quita sola.
                </p>
              </div>
              <Button variant="ghost" disabled={saving} onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            {!single && (
              <>
                <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span>{count} de {students.length} seleccionados</span>
                  {count > 0 && <button type="button" className="text-slate-700 hover:underline dark:text-slate-200" onClick={() => setSelected(new Set())}>Quitar selección</button>}
                </div>
                <div className="mt-3 max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
                  {students.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todos los alumnos ya tienen ingreso, falta o permiso hoy.</p>
                  ) : students.map((student) => {
                    const checked = selected.has(student.id)
                    return (
                      <button key={student.id} type="button" onClick={() => toggle(student.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${checked ? 'border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${checked ? 'border-red-500 bg-red-500' : 'border-slate-300 dark:border-slate-600'}`}>
                          {checked && <Check size={13} className="text-white" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{student.lastName}, {student.firstName}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
              <input type="checkbox" className="h-5 w-5 accent-sky-600" checked={justified} onChange={(e) => setJustified(e.target.checked)} />
              <span className="min-w-0 flex-1">
                <b className="flex items-center gap-1.5"><ShieldCheck size={16} className="text-sky-600 dark:text-sky-400" /> Falta justificada</b>
                <small className="text-slate-500 dark:text-slate-400">El apoderado ya avisó o presentó un documento. También se puede justificar después.</small>
              </span>
            </label>

            {justified && (
              <>
                <label className="mt-4 block text-sm font-bold">
                  Motivo
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {JUSTIFICATION_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-bold">
                  Detalle {reason === 'Otro' ? '' : <span className="font-normal text-slate-500 dark:text-slate-400">(opcional)</span>}
                  <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} maxLength={400} placeholder="Ej.: la mamá avisó por teléfono que está con fiebre" className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </label>
                <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
                  <Paperclip size={18} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{file ? file.name : 'Adjuntar foto o PDF (opcional)'}</b>
                    <small className="text-slate-500 dark:text-slate-400">Certificado, esquela o constancia · las fotos se comprimen solas</small>
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </>
            )}

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
              <Button disabled={saving || count === 0 || (justified && reason === 'Otro' && !detail.trim())} onClick={() => void save()}>{confirmLabel}</Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
