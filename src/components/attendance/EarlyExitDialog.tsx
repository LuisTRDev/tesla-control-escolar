import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DoorOpen, ShieldAlert, ShieldCheck, UserCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { getCurrentTime } from '@/lib/storage'
import { normalizeText } from '@/lib/search'
import { reportError } from '@/lib/security'
import { getAuthorizedPickups, registerEarlyExit, saveAuthorizedPickup } from '@/services/dayStatusService'
import type { AttendanceRecord, EarlyExit, Student } from '@/types'
import { friendlyError } from '@/lib/errorMessages'
import { entryTimeLabel } from '@/lib/displayLabels'
import { useToast } from '@/lib/toast'

type Person = { key: string; fullName: string; dni: string; relationship: string; source: 'Apoderado' | 'Autorizado' }

type Props = {
  student: Student | null
  attendance?: AttendanceRecord
  today: string
  userName: string
  isAdmin: boolean
  onClose: () => void
  onSaved: (exit: EarlyExit) => void
}

const REASONS = ['Salud / malestar', 'Cita médica', 'Trámite familiar', 'Emergencia familiar', 'Actividad externa', 'Otro']

/** Salida anticipada: registra quién recoge al alumno y advierte si no está autorizado. */
export default function EarlyExitDialog({ student, attendance, today, userName, isAdmin, onClose, onSaved }: Props) {
  const [pickups, setPickups] = useState<Person[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [dni, setDni] = useState('')
  const [relationship, setRelationship] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [detail, setDetail] = useState('')
  const [confirmedUnlisted, setConfirmedUnlisted] = useState(false)
  const [addToList, setAddToList] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const [error, setError] = useState('')

  useEffect(() => {
    setSelectedKey(null); setName(''); setDni(''); setRelationship(''); setReason(REASONS[0]); setDetail(''); setConfirmedUnlisted(false); setAddToList(false); setError('')
    if (!student) return
    getAuthorizedPickups(student.id)
      .then((rows) => setPickups((rows ?? []).map((row) => ({ key: `p-${row.id}`, fullName: row.fullName, dni: row.dni, relationship: row.relationship, source: 'Autorizado' as const }))))
      .catch((err) => { reportError('EarlyExitDialog', err); setPickups([]) })
  }, [student])

  const people = useMemo<Person[]>(() => {
    const guardians = (student?.guardians ?? []).map((g) => ({ key: `g-${g.id}`, fullName: g.fullName, dni: g.dni, relationship: g.relationship || 'Apoderado', source: 'Apoderado' as const }))
    return [...guardians, ...pickups]
  }, [student, pickups])

  // Una persona escrita a mano cuenta como autorizada si coincide por DNI o por nombre exacto.
  const matched = useMemo(() => {
    if (selectedKey) return people.find((p) => p.key === selectedKey)
    const cleanDni = dni.replace(/\D/g, '')
    const cleanName = normalizeText(name)
    return people.find((p) => (cleanDni.length === 8 && p.dni.replace(/\D/g, '') === cleanDni) || (cleanName.length > 3 && normalizeText(p.fullName) === cleanName))
  }, [people, selectedKey, name, dni])

  const authorized = Boolean(matched)
  const typedSomething = name.trim().length > 0

  function pick(person: Person) {
    setSelectedKey(person.key); setName(person.fullName); setDni(person.dni); setRelationship(person.relationship)
  }

  async function save() {
    if (!student || saving) return
    setSaving(true); setError('')
    try {
      const exit = await registerEarlyExit({
        studentId: student.id, date: today, exitTime: getCurrentTime(), pickedUpByName: name, pickedUpByDni: dni,
        relationship, reason: [reason, detail.trim()].filter(Boolean).join(': '), isAuthorizedPerson: authorized, byName: userName, attendance,
      })
      onSaved(exit)
      // La salida ya quedó guardada: si falla agregar a la lista, se avisa sin invitar a repetir la salida.
      if (!authorized && addToList && isAdmin) {
        try { await saveAuthorizedPickup({ studentId: student.id, fullName: name, dni, relationship, phone: '' }) }
        catch (pickupError) { reportError('EarlyExitDialog', pickupError); toast.error('Salida registrada, pero no se agregó a la lista de autorizados', friendlyError(pickupError)) }
      }
      onClose()
    } catch (err) {
      reportError('EarlyExitDialog', err)
      setError(friendlyError(err, 'No se pudo registrar la salida.'))
    } finally { setSaving(false) }
  }

  return (
    <AnimatePresence>{student && (
      <motion.div data-sheet-overlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={() => { if (!saving) onClose() }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.div className="w-full max-w-lg" initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <Card data-sheet className="max-h-[92vh] w-full overflow-y-auto p-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-700 dark:text-orange-300"><DoorOpen size={15} /> Salida anticipada</p>
                <h3 className="mt-1 text-xl font-black">{student.lastName}, {student.firstName}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hora de salida: {getCurrentTime()} {attendance ? `· ingresó ${entryTimeLabel(attendance.time)}` : '· sin marca de ingreso hoy'}</p>
              </div>
              <Button variant="ghost" disabled={saving} onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">¿Quién lo recoge?</p>
            {people.length === 0 ? (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">El alumno no tiene apoderados ni personas autorizadas registradas.</p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {people.map((person) => (
                  <button key={person.key} type="button" onClick={() => pick(person)} className={`rounded-xl border p-3 text-left text-sm transition-colors ${selectedKey === person.key ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900'}`}>
                    <span className="flex items-center gap-1.5 font-black"><UserCheck size={15} className="text-emerald-600" /> {person.fullName}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{person.source} · {person.relationship || '—'}{person.dni ? ` · DNI ${person.dni}` : ''}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px]">
              <Input placeholder="Nombre completo de quien recoge" value={name} onChange={(e) => { setSelectedKey(null); setName(e.target.value) }} />
              <Input placeholder="DNI" inputMode="numeric" maxLength={8} value={dni} onChange={(e) => { setSelectedKey(null); setDni(e.target.value.replace(/\D/g, '').slice(0, 8)) }} />
            </div>
            <Input className="mt-3" placeholder="Parentesco (madre, tío, vecino...)" value={relationship} onChange={(e) => setRelationship(e.target.value)} />

            {typedSomething && (authorized ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"><ShieldCheck size={17} /> Persona autorizada</p>
            ) : (
              <div className="mt-3 rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm dark:border-red-700 dark:bg-red-950/40">
                <p className="flex items-center gap-2 font-black text-red-700 dark:text-red-300"><ShieldAlert size={18} /> NO está en la lista de autorizados</p>
                <p className="mt-1 text-red-700/90 dark:text-red-300/90">Comunícate con el apoderado antes de entregar al alumno.</p>
                <label className="mt-2 flex items-start gap-2 font-semibold text-red-800 dark:text-red-200">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirmedUnlisted} onChange={(e) => setConfirmedUnlisted(e.target.checked)} />
                  Confirmo que el apoderado autorizó esta salida
                </label>
                {isAdmin && (
                  <label className="mt-2 flex items-start gap-2 text-slate-700 dark:text-slate-200">
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={addToList} onChange={(e) => setAddToList(e.target.checked)} />
                    Agregar a la lista de personas autorizadas
                  </label>
                )}
              </div>
            ))}

            <label className="mt-4 block text-sm font-bold">
              Motivo
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <Input className="mt-3" placeholder="Detalle (opcional)" maxLength={300} value={detail} onChange={(e) => setDetail(e.target.value)} />

            {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
              <Button disabled={saving || !typedSomething || (!authorized && !confirmedUnlisted) || (reason === 'Otro' && !detail.trim())} onClick={() => void save()}>
                {saving ? 'Registrando...' : 'Registrar salida'}
              </Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  )
}
