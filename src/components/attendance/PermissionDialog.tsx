import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Paperclip, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { reportError } from '@/lib/security'
import { JUSTIFICATION_REASONS, createPermission, deletePermission, uploadJustificationDocument } from '@/services/dayStatusService'
import type { PermissionKind, Student, StudentPermission } from '@/types'
import { friendlyError } from '@/lib/errorMessages'
import { useToast } from '@/lib/toast'

type Props = {
  student: Student | null
  permissions: StudentPermission[]
  today: string
  userName: string
  onClose: () => void
  onChanged: () => void
}

const KIND_LABEL: Record<PermissionKind, string> = { ABSENCE: 'No asistirá', LATE: 'Llegará tarde' }

function shortDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' })
}

/** Permisos anticipados: ese día el alumno figura con permiso y no como falta o tardanza. */
export default function PermissionDialog({ student, permissions, today, userName, onClose, onChanged }: Props) {
  const [kind, setKind] = useState<PermissionKind>('ABSENCE')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [reason, setReason] = useState<string>(JUSTIFICATION_REASONS[0])
  const toast = useToast()
  const [detail, setDetail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setKind('ABSENCE'); setDateFrom(today); setDateTo(today); setReason(JUSTIFICATION_REASONS[0]); setDetail(''); setFile(null); setError('') }, [student, today])

  const own = student ? permissions.filter((item) => item.studentId === student.id && item.dateTo >= today) : []

  async function save() {
    if (!student) return
    setSaving(true); setError('')
    try {
      const documentPath = file ? await uploadJustificationDocument(file, student.id, (message) => toast.info(message)) : null
      await createPermission({ studentId: student.id, dateFrom, dateTo: kind === 'LATE' ? dateFrom : dateTo, kind, reason: [reason, detail.trim()].filter(Boolean).join(': '), documentPath, byName: userName })
      setDetail(''); setFile(null)
      onChanged()
    } catch (err) {
      reportError('PermissionDialog', err)
      setError(friendlyError(err, 'No se pudo registrar el permiso.'))
    } finally { setSaving(false) }
  }

  async function remove(permission: StudentPermission) {
    if (!confirm('¿Borrar este permiso?')) return
    try { await deletePermission(permission.id); onChanged() }
    catch (err) { setError(friendlyError(err, 'No se pudo borrar el permiso.')) }
  }

  return (
    <AnimatePresence>{student && (
      <motion.div data-sheet-overlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={() => { if (!saving) onClose() }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.div className="w-full max-w-lg" initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <Card data-sheet className="max-h-[90vh] w-full overflow-y-auto p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300"><CalendarClock size={15} /> Permiso anticipado</p>
                <h3 className="mt-1 text-xl font-black">{student.lastName}, {student.firstName}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Avisos previos del apoderado: ese día no contará como falta o tardanza.</p>
              </div>
              <Button variant="ghost" disabled={saving} onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            {own.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Permisos vigentes</p>
                {own.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/30">
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{KIND_LABEL[item.kind]} · {item.dateFrom === item.dateTo ? shortDate(item.dateFrom) : `${shortDate(item.dateFrom)} al ${shortDate(item.dateTo)}`}</p>
                      <p className="text-slate-600 dark:text-slate-300">{item.reason}</p>
                      {item.createdByName && <p className="text-xs text-slate-500 dark:text-slate-400">Registró: {item.createdByName}</p>}
                    </div>
                    <button type="button" onClick={() => void remove(item)} className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-white hover:text-red-600 dark:hover:bg-slate-900" aria-label="Borrar permiso"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              {(['ABSENCE', 'LATE'] as const).map((item) => (
                <Button key={item} variant={kind === item ? 'default' : 'outline'} onClick={() => setKind(item)}>{KIND_LABEL[item]}</Button>
              ))}
            </div>
            <div className={`mt-4 grid gap-3 ${kind === 'ABSENCE' ? 'grid-cols-2' : ''}`}>
              <label className="block text-sm font-bold">{kind === 'ABSENCE' ? 'Desde' : 'Día'}<Input type="date" className="mt-2" min={today} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (dateTo < e.target.value) setDateTo(e.target.value) }} /></label>
              {kind === 'ABSENCE' && <label className="block text-sm font-bold">Hasta<Input type="date" className="mt-2" min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>}
            </div>
            <label className="mt-4 block text-sm font-bold">
              Motivo
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {JUSTIFICATION_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Input className="mt-3" placeholder="Detalle (opcional)" maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} />
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
              <Paperclip size={18} className="shrink-0 text-slate-500 dark:text-slate-400" />
              <span className="min-w-0 flex-1 truncate font-bold">{file ? file.name : 'Adjuntar foto o PDF (opcional)'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={onClose}>Cerrar</Button>
              <Button disabled={saving || (reason === 'Otro' && !detail.trim())} onClick={() => void save()}>{saving ? 'Guardando...' : 'Registrar permiso'}</Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
