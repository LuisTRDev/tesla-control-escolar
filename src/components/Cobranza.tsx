import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Search, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/lib/toast'
import {
  computeDebtStatus,
  getGuardianPaymentHistory,
  getPensionStatusForMonth,
  setPensionNotes,
  setPensionPaid,
  PENSION_AMOUNT,
  type GuardianDebtStatus,
  type GuardianMonth,
  type MonthlyHistoryEntry,
} from '@/services/cobranzaService'

type Props = { open: boolean; onClose: () => void }

type StatusFilter = 'ALL' | GuardianDebtStatus

const STATUS_META: Record<GuardianDebtStatus, { label: string; badge: string; icon: typeof CheckCircle2 }> = {
  AL_DIA: { label: 'Al día', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', icon: CheckCircle2 },
  POR_VENCER: { label: 'Por vencer', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', icon: CalendarClock },
  MOROSO: { label: 'Moroso', badge: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300', icon: AlertTriangle },
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function HistoryPanel({ guardianId, onClose }: { guardianId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<MonthlyHistoryEntry[]>([])

  useEffect(() => {
    setLoading(true)
    getGuardianPaymentHistory(guardianId, 12).then(setEntries).finally(() => setLoading(false))
  }, [guardianId])

  return (
    <motion.div
      className="absolute inset-0 z-20 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
    >
      <motion.div
        className="w-full max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <Card className="max-h-[70vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-brand-navy dark:text-brand-gold">Historial de pensión</p>
              <h3 className="mt-1 text-lg font-black">Últimos 12 meses</h3>
            </div>
            <Button variant="ghost" onClick={onClose}><X size={18} /></Button>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="text-sm text-slate-500">Cargando...</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-slate-500">Sin registros previos.</p>
            ) : entries.map((entry) => (
              <div key={`${entry.year}-${entry.month}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800">
                <span className="font-semibold">{MONTH_NAMES[entry.month - 1]} {entry.year}</span>
                <span className={`flex items-center gap-1.5 font-bold ${entry.paid ? 'text-emerald-600' : 'text-red-600'}`}>
                  {entry.paid ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {entry.paid ? `Pagado S/${entry.amount}` : `Pendiente S/${entry.amount}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>
    </motion.div>
  )
}

function GuardianRow({ guardian, year, month, onSaved, onViewHistory }: {
  guardian: GuardianMonth
  year: number
  month: number
  onSaved: (updated: GuardianMonth) => void
  onViewHistory: (guardianId: string) => void
}) {
  const toast = useToast()
  const [notes, setNotes] = useState(guardian.notes)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const meta = STATUS_META[guardian.status]
  const StatusIcon = meta.icon

  async function togglePaid() {
    const next = !guardian.paid
    setSaving(true)
    try {
      await setPensionPaid(guardian.guardianId, year, month, next, notes)
      onSaved({ ...guardian, paid: next })
      toast.success(next ? `${guardian.fullName} — pensión pagada` : `${guardian.fullName} — marcado pendiente`)
    } catch (error) {
      toast.error('No se pudo actualizar', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  async function saveNotes() {
    setSaving(true)
    try {
      await setPensionNotes(guardian.guardianId, year, month, notes)
      onSaved({ ...guardian, notes })
      setDirty(false)
      toast.success('Nota guardada')
    } catch (error) {
      toast.error('No se pudo guardar la nota', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => void togglePaid()}
            disabled={saving}
            role="checkbox"
            aria-checked={guardian.paid}
            className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${guardian.paid ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}
          >
            {guardian.paid && <CheckCircle2 size={16} className="text-white" />}
          </button>
          <div>
            <p className="font-black">{guardian.fullName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {guardian.students.length > 0 ? guardian.students.map((s) => `${s.name} (${s.classroom})`).join(' · ') : 'Sin alumno vinculado'}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              S/{guardian.amount} · Vence {new Date(guardian.dueDate + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
              {guardian.phone && ` · ${guardian.phone}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          <button type="button" onClick={() => onViewHistory(guardian.guardianId)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" title="Ver historial">
            <Clock3 size={16} />
          </button>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${meta.badge}`}>
            <StatusIcon size={13} /> {meta.label}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <Input
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setDirty(true) }}
          placeholder="Nota opcional (ej. pagó en efectivo el 5)"
          className="flex-1"
        />
        {dirty && (
          <Button className="shrink-0" disabled={saving} onClick={() => void saveNotes()}>Guardar nota</Button>
        )}
      </div>
    </Card>
  )
}

export default function Cobranza({ open, onClose }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [guardians, setGuardians] = useState<GuardianMonth[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [historyGuardianId, setHistoryGuardianId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    getPensionStatusForMonth(year, month)
      .then(setGuardians)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar la cobranza.'))
      .finally(() => setLoading(false))
  }, [open, year, month])

  function changeMonth(delta: number) {
    let newMonth = month + delta
    let newYear = year
    if (newMonth > 12) { newMonth = 1; newYear += 1 }
    if (newMonth < 1) { newMonth = 12; newYear -= 1 }
    setMonth(newMonth)
    setYear(newYear)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const summary = useMemo(() => ({
    total: guardians.length,
    moroso: guardians.filter((g) => g.status === 'MOROSO').length,
    porVencer: guardians.filter((g) => g.status === 'POR_VENCER').length,
    alDia: guardians.filter((g) => g.status === 'AL_DIA').length,
  }), [guardians])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return guardians.filter((g) => {
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false
      if (!q) return true
      const haystack = `${g.fullName} ${g.dni} ${g.phone} ${g.students.map((s) => s.name).join(' ')}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [guardians, search, statusFilter])

  function updateGuardian(updated: GuardianMonth) {
    const status = computeDebtStatus(updated.paid, updated.dueDate)
    setGuardians((curr) => curr.map((g) => (g.guardianId === updated.guardianId ? { ...updated, status } : g)))
  }

  return (
    <AnimatePresence>{open && (
      <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.section
          className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          onMouseDown={(e) => e.stopPropagation()}
          initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brand-navy dark:text-brand-gold"><Banknote size={15} /> Cobranza</p>
                <h2 className="mt-1 text-2xl font-black">Pensión mensual</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Monto fijo S/{PENSION_AMOUNT} · vence el último día de cada mes.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950">
                  <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
                  <span className="min-w-[130px] text-center text-sm font-black">{MONTH_NAMES[month - 1]} {year}</span>
                  <button type="button" onClick={() => changeMonth(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
                </div>
                <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
              </div>
            </div>
            {!isCurrentMonth && (
              <button type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1) }} className="mt-2 text-xs font-bold text-brand-navy hover:underline dark:text-brand-gold">
                ← Volver al mes actual
              </button>
            )}
          </header>

          <div className="p-5 sm:p-7">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button type="button" onClick={() => setStatusFilter('ALL')} className="text-left">
                <Card className={`p-4 transition-colors hover:border-brand-gold ${statusFilter === 'ALL' ? 'border-brand-gold bg-brand-gold/5' : ''}`}>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total apoderados</p>
                  <p className="mt-1 text-2xl font-black">{summary.total}</p>
                </Card>
              </button>
              <button type="button" onClick={() => setStatusFilter('MOROSO')} className="text-left">
                <Card className={`p-4 transition-colors hover:border-red-400 ${statusFilter === 'MOROSO' ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : ''}`}>
                  <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"><AlertTriangle size={13} /> Morosos</p>
                  <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">{summary.moroso}</p>
                </Card>
              </button>
              <button type="button" onClick={() => setStatusFilter('POR_VENCER')} className="text-left">
                <Card className={`p-4 transition-colors hover:border-amber-400 ${statusFilter === 'POR_VENCER' ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"><CalendarClock size={13} /> Por vencer (5 días)</p>
                  <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">{summary.porVencer}</p>
                </Card>
              </button>
              <button type="button" onClick={() => setStatusFilter('AL_DIA')} className="text-left">
                <Card className={`p-4 transition-colors hover:border-emerald-400 ${statusFilter === 'AL_DIA' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20' : ''}`}>
                  <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={13} /> Al día</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">{summary.alDia}</p>
                </Card>
              </button>
            </div>

            {(summary.moroso > 0 || summary.porVencer > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                <TriangleAlert size={16} />
                {summary.moroso > 0 && <span>{summary.moroso} apoderado{summary.moroso !== 1 ? 's' : ''} en mora</span>}
                {summary.moroso > 0 && summary.porVencer > 0 && <span>·</span>}
                {summary.porVencer > 0 && <span>{summary.porVencer} con vencimiento en los próximos 5 días</span>}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
                <Input className="pl-12" placeholder="Buscar apoderado, alumno, DNI o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="ALL">Todos los estados</option>
                <option value="MOROSO">Morosos</option>
                <option value="POR_VENCER">Por vencer</option>
                <option value="AL_DIA">Al día</option>
              </select>
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
            {loading && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Cargando apoderados...</p>}

            <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {!loading && filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No hay apoderados para este filtro.
                </div>
              ) : (
                filtered.map((g) => (
                  <GuardianRow key={g.guardianId} guardian={g} year={year} month={month} onSaved={updateGuardian} onViewHistory={setHistoryGuardianId} />
                ))
              )}
            </div>
          </div>

          <AnimatePresence>
            {historyGuardianId && (
              <HistoryPanel guardianId={historyGuardianId} onClose={() => setHistoryGuardianId(null)} />
            )}
          </AnimatePresence>
        </motion.section>
      </motion.div>
    )}</AnimatePresence>
  )
}
