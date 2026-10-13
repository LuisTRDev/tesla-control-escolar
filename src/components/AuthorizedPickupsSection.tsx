import { useCallback, useEffect, useState } from 'react'
import { Trash2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { reportError } from '@/lib/security'
import { deleteAuthorizedPickup, getAuthorizedPickups, saveAuthorizedPickup } from '@/services/dayStatusService'
import type { AuthorizedPickup } from '@/types'

const EMPTY = { fullName: '', dni: '', relationship: '', phone: '' }

/**
 * Personas autorizadas a recoger al alumno, además de sus apoderados
 * (Fase 14). No se muestra si phase14_absences_permissions.sql no se ejecutó.
 */
export default function AuthorizedPickupsSection({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<AuthorizedPickup[] | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setRows(await getAuthorizedPickups(studentId)) }
    catch (err) { reportError('AuthorizedPickupsSection', err); setRows(null) }
  }, [studentId])

  useEffect(() => { setForm(EMPTY); setError(''); void load() }, [load])

  async function add() {
    setSaving(true); setError('')
    try { await saveAuthorizedPickup({ studentId, ...form }); setForm(EMPTY); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') }
    finally { setSaving(false) }
  }

  async function remove(row: AuthorizedPickup) {
    if (!window.confirm(`¿Quitar a ${row.fullName} de las personas autorizadas?`)) return
    setSaving(true); setError('')
    try { await deleteAuthorizedPickup(row.id); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo quitar.') }
    finally { setSaving(false) }
  }

  if (rows === null) return null

  return (
    <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
      <p className="flex items-center gap-2 text-sm font-black"><UserCheck size={16} /> Personas autorizadas a recogerlo</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Además de sus apoderados. En una salida anticipada, quien no esté aquí sale con advertencia en rojo.</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500 dark:border-slate-700">Solo sus apoderados pueden recogerlo.</p>}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{row.fullName}</p>
              <p className="text-xs text-slate-500">{row.relationship || 'Sin parentesco'}{row.dni && ` · DNI ${row.dni}`}{row.phone && ` · ${row.phone}`}</p>
            </div>
            <Button variant="ghost" title="Quitar" disabled={saving} onClick={() => void remove(row)}><Trash2 size={16} /></Button>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 rounded-2xl bg-slate-100 p-3 dark:bg-slate-900 sm:grid-cols-2">
        <Input placeholder="Nombre completo *" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <Input placeholder="DNI" inputMode="numeric" maxLength={8} value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
        <Input placeholder="Parentesco (tía, abuelo, movilidad...)" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
        <Input placeholder="Celular" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Button variant="default" className="sm:col-span-2" disabled={saving || !form.fullName.trim()} onClick={() => void add()}>Agregar persona autorizada</Button>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
