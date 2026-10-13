import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileCheck2, Paperclip, ShieldCheck, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { reportError } from '@/lib/security'
import {
  JUSTIFICATION_REASONS, getDocumentUrl, justifyAbsence, justifyLate, unjustifyAbsence, unjustifyLate, uploadJustificationDocument,
} from '@/services/dayStatusService'
import type { AbsenceRecord, AttendanceRecord, Student } from '@/types'
import { friendlyError } from '@/lib/errorMessages'
import { useToast } from '@/lib/toast'

export type JustifyTarget =
  | { kind: 'LATE'; student: Student; record: AttendanceRecord }
  | { kind: 'ABSENCE'; student: Student; absence: AbsenceRecord }

type Props = {
  target: JustifyTarget | null
  userName: string
  onClose: () => void
  onLateSaved: (record: AttendanceRecord) => void
  onAbsenceSaved: (absence: AbsenceRecord) => void
}

/** Justifica una tardanza o una falta, con motivo y documento opcional. */
export default function JustifyDialog({ target, userName, onClose, onLateSaved, onAbsenceSaved }: Props) {
  const [reason, setReason] = useState<string>(JUSTIFICATION_REASONS[0])
  const [detail, setDetail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  useEffect(() => { setReason(JUSTIFICATION_REASONS[0]); setDetail(''); setFile(null); setError('') }, [target])

  const current = target ? (target.kind === 'LATE'
    ? (target.record.justified ? { reason: target.record.justificationReason, document: target.record.justificationDocument, by: target.record.justifiedByName } : null)
    : (target.absence.status !== 'UNJUSTIFIED' ? { reason: target.absence.justificationReason, document: target.absence.justificationDocument, by: target.absence.justifiedByName } : null)) : null

  async function save() {
    if (!target) return
    const fullReason = [reason, detail.trim()].filter(Boolean).join(': ')
    setSaving(true); setError('')
    try {
      const documentPath = file ? await uploadJustificationDocument(file, target.student.id, (message) => toast.info(message)) : null
      const input = { reason: fullReason, documentPath, byName: userName }
      if (target.kind === 'LATE') onLateSaved(await justifyLate(target.record, input))
      else onAbsenceSaved(await justifyAbsence(target.absence, input))
      onClose()
    } catch (err) {
      reportError('JustifyDialog', err)
      setError(friendlyError(err, 'No se pudo guardar la justificación.'))
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!target || !confirm('¿Quitar la justificación? Volverá a contar como ' + (target.kind === 'LATE' ? 'tardanza (con su notificación).' : 'falta.'))) return
    setSaving(true); setError('')
    try {
      if (target.kind === 'LATE') onLateSaved(await unjustifyLate(target.record))
      else onAbsenceSaved(await unjustifyAbsence(target.absence))
      onClose()
    } catch (err) {
      reportError('JustifyDialog', err)
      setError(friendlyError(err, 'No se pudo quitar la justificación.'))
    } finally { setSaving(false) }
  }

  async function openDocument(path: string) {
    try { window.open(await getDocumentUrl(path), '_blank', 'noopener,noreferrer') }
    catch (err) { setError(friendlyError(err, 'No se pudo abrir el documento.')) }
  }

  const isPermission = target?.kind === 'ABSENCE' && target.absence.status === 'PERMISSION'

  return (
    <AnimatePresence>{target && (
      <motion.div data-sheet-overlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={() => { if (!saving) onClose() }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.div className="w-full max-w-md" initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <Card data-sheet className="max-h-[90vh] w-full overflow-y-auto p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sky-700 dark:text-sky-300"><ShieldCheck size={15} /> Justificación</p>
                <h3 className="mt-1 text-xl font-black">{target.kind === 'LATE' ? (target.record.time ? `Tardanza de las ${target.record.time}` : 'Tardanza sin hora') : `Falta del ${new Date(target.absence.date + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'long' })}`}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{target.student.lastName}, {target.student.firstName}</p>
              </div>
              <Button variant="ghost" disabled={saving} onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            {current ? (
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm dark:border-sky-900/60 dark:bg-sky-950/30">
                <p className="font-black text-sky-800 dark:text-sky-200">{isPermission ? 'Falta con permiso previo' : 'Ya está justificada'}</p>
                <p className="mt-1 text-slate-700 dark:text-slate-200">{current.reason || 'Sin motivo registrado'}</p>
                {current.by && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Registró: {current.by}</p>}
                {current.document && (
                  <button type="button" onClick={() => void openDocument(current.document!)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-sky-700 hover:underline dark:text-sky-300">
                    <FileCheck2 size={14} /> Ver documento adjunto
                  </button>
                )}
                {!isPermission && (
                  <Button variant="outline" className="mt-4 w-full" disabled={saving} onClick={() => void remove()}>
                    <Undo2 className="mr-2" size={16} /> Quitar justificación
                  </Button>
                )}
              </div>
            ) : (
              <>
                <label className="mt-5 block text-sm font-bold">
                  Motivo
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {JUSTIFICATION_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-bold">
                  Detalle {reason === 'Otro' ? '' : <span className="font-normal text-slate-500 dark:text-slate-400">(opcional)</span>}
                  <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} maxLength={400} placeholder="Ej.: presentó certificado médico del Centro de Salud..." className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </label>
                <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
                  <Paperclip size={18} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <b className="block">{file ? file.name : 'Adjuntar foto o PDF (opcional)'}</b>
                    <small className="text-slate-500 dark:text-slate-400">Certificado, esquela o constancia · las fotos se comprimen solas · PDF máx. 5 MB</small>
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
                  <Button disabled={saving || (reason === 'Otro' && !detail.trim())} onClick={() => void save()}>{saving ? 'Guardando...' : 'Justificar'}</Button>
                </div>
              </>
            )}

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
