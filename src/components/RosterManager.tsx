import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link2, Pencil, Plus, Search, Star, Unlink, UserPlus, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/lib/toast'
import {
  RELATIONSHIP_OPTIONS,
  createGuardian,
  createStudent,
  getRosterGuardians,
  linkGuardian,
  setPrimaryGuardian,
  unlinkGuardian,
  updateGuardian,
  updateStudent,
  type GuardianInput,
  type RosterGuardian,
  type StudentInput,
} from '@/services/rosterService'
import type { Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  classrooms: Classroom[]
  students: Student[]
  defaultClassroomId: string
  /** Recarga los alumnos de la app; se espera para que el editor vea el dato nuevo. */
  onChanged: () => Promise<void>
}

type Tab = 'students' | 'guardians'
type LinkFilter = 'ALL' | 'WITHOUT' | 'WITH'
type Editing = { kind: 'student'; id: string | null } | { kind: 'guardian'; id: string | null } | null

const selectClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const EMPTY_GUARDIAN: GuardianInput = { fullName: '', dni: '', phone: '' }

function classroomLabel(classrooms: Classroom[], id: string) {
  const c = classrooms.find((item) => item.id === id)
  return c ? `${c.grade} ${c.section} · ${c.level}` : 'Sin aula'
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo guardar el cambio.'
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function GuardianFields({ value, onChange }: { value: GuardianInput; onChange: (next: GuardianInput) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3"><Field label="Nombre completo *"><Input value={value.fullName} onChange={(e) => onChange({ ...value, fullName: e.target.value })} placeholder="Ej. Rosa Mendoza Pérez" /></Field></div>
      <Field label="DNI"><Input inputMode="numeric" maxLength={8} value={value.dni} onChange={(e) => onChange({ ...value, dni: e.target.value.replace(/\D/g, '') })} placeholder="8 dígitos" /></Field>
      <div className="sm:col-span-2"><Field label="Teléfono / WhatsApp"><Input inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} placeholder="999111222" /></Field></div>
    </div>
  )
}

function Panel({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div className="absolute inset-0 z-20 overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div className="mx-auto w-full max-w-2xl" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-brand-navy dark:text-brand-gold">{subtitle}</p>
              <h3 className="mt-1 text-lg font-black">{title}</h3>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={18} /></Button>
          </div>
          {children}
        </Card>
      </motion.div>
    </motion.div>
  )
}

function StudentEditor({ studentId, classrooms, students, guardians, defaultClassroomId, onSaved, onCreated, onClose }: {
  studentId: string | null
  classrooms: Classroom[]
  students: Student[]
  guardians: RosterGuardian[]
  defaultClassroomId: string
  onSaved: () => Promise<void>
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const toast = useToast()
  const student = studentId ? students.find((s) => s.id === studentId) : undefined
  const [form, setForm] = useState<StudentInput>(() => ({
    firstName: student?.firstName ?? '',
    lastName: student?.lastName ?? '',
    dni: student?.dni ?? '',
    classroomId: student?.classroomId || defaultClassroomId,
  }))
  const [saving, setSaving] = useState(false)
  const [linkMode, setLinkMode] = useState<'existing' | 'new'>('existing')
  const [guardianSearch, setGuardianSearch] = useState('')
  const [selectedGuardianId, setSelectedGuardianId] = useState('')
  const [newGuardian, setNewGuardian] = useState<GuardianInput>(EMPTY_GUARDIAN)
  const [relationship, setRelationship] = useState(RELATIONSHIP_OPTIONS[0])
  const [isPrimary, setIsPrimary] = useState(false)

  const linked = useMemo(() => student?.guardians ?? [], [student])
  const matches = useMemo(() => {
    const q = guardianSearch.trim().toLowerCase()
    if (!q) return []
    const linkedIds = new Set(linked.map((g) => g.id))
    return guardians.filter((g) => !linkedIds.has(g.id) && `${g.fullName} ${g.dni} ${g.phone}`.toLowerCase().includes(q)).slice(0, 6)
  }, [guardianSearch, guardians, linked])

  async function run(action: () => Promise<void>, success: string) {
    setSaving(true)
    try {
      await action()
      await onSaved()
      toast.success(success)
      return true
    } catch (error) {
      toast.error('No se pudo guardar', errorText(error))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveStudent() {
    const dni = form.dni.trim()
    if (dni && students.some((s) => s.dni === dni && s.id !== studentId)) {
      toast.error('DNI duplicado', 'Ya existe otro alumno con ese DNI.')
      return
    }
    if (studentId) {
      await run(() => updateStudent(studentId, form), 'Alumno actualizado')
      return
    }
    let createdId = ''
    const ok = await run(async () => { createdId = await createStudent(form) }, 'Alumno registrado. Ahora vincula su apoderado.')
    if (ok) onCreated(createdId)
  }

  async function addLink() {
    if (!studentId) return
    if (linkMode === 'existing') {
      if (!selectedGuardianId) { toast.error('Selecciona un apoderado de la lista.'); return }
      const ok = await run(() => linkGuardian(studentId, selectedGuardianId, relationship, isPrimary), 'Apoderado vinculado')
      if (ok) { setSelectedGuardianId(''); setGuardianSearch(''); setIsPrimary(false) }
      return
    }
    const dni = newGuardian.dni.trim()
    const duplicate = dni ? guardians.find((g) => g.dni === dni) : undefined
    if (duplicate) {
      toast.error('Ese DNI ya está registrado', `Pertenece a ${duplicate.fullName}. Búscalo en "Apoderado existente".`)
      return
    }
    const ok = await run(async () => {
      const guardianId = await createGuardian(newGuardian)
      await linkGuardian(studentId, guardianId, relationship, isPrimary)
    }, 'Apoderado registrado y vinculado')
    if (ok) { setNewGuardian(EMPTY_GUARDIAN); setIsPrimary(false); setLinkMode('existing') }
  }

  return (
    <Panel title={student ? `${student.lastName}, ${student.firstName}` : 'Nuevo alumno'} subtitle={student ? 'Editar alumno' : 'Registrar alumno'} onClose={onClose}>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Nombres *"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Ej. Camila" /></Field>
        <Field label="Apellidos *"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Ej. Torres Mendoza" /></Field>
        <Field label="DNI"><Input inputMode="numeric" maxLength={8} value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, '') })} placeholder="8 dígitos" /></Field>
        <Field label="Aula *">
          <select className={selectClass} value={form.classroomId} onChange={(e) => setForm({ ...form, classroomId: e.target.value })}>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade} {c.section} · {c.level}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="default" disabled={saving} onClick={() => void saveStudent()}>{student ? 'Guardar cambios' : 'Registrar alumno'}</Button>
      </div>

      {student && (
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <p className="text-sm font-black">Apoderados vinculados</p>
          <div className="mt-3 space-y-2">
            {linked.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">Este alumno aún no tiene apoderado.</p>}
            {linked.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{g.fullName} {g.isPrimary && <span className="ml-1 rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-black text-brand-navy dark:text-brand-gold">PRINCIPAL</span>}</p>
                  <p className="text-xs text-slate-500">{g.relationship || 'Sin parentesco'}{g.dni && ` · DNI ${g.dni}`}{g.phone && ` · ${g.phone}`}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!g.isPrimary && <Button variant="ghost" title="Marcar como principal" disabled={saving} onClick={() => void run(() => setPrimaryGuardian(student.id, g.id), 'Apoderado principal actualizado')}><Star size={16} /></Button>}
                  <Button variant="ghost" title="Desvincular" disabled={saving} onClick={() => { if (window.confirm(`¿Desvincular a ${g.fullName} de este alumno?`)) void run(() => unlinkGuardian(student.id, g.id), 'Apoderado desvinculado') }}><Unlink size={16} /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl bg-slate-100 p-4 dark:bg-slate-900">
            <div className="flex gap-2">
              <Button variant={linkMode === 'existing' ? 'default' : 'outline'} className="flex-1" onClick={() => setLinkMode('existing')}><Link2 size={16} className="mr-2" />Apoderado existente</Button>
              <Button variant={linkMode === 'new' ? 'default' : 'outline'} className="flex-1" onClick={() => setLinkMode('new')}><UserPlus size={16} className="mr-2" />Nuevo apoderado</Button>
            </div>

            <div className="mt-4">
              {linkMode === 'existing' ? (
                <>
                  <Input value={guardianSearch} onChange={(e) => { setGuardianSearch(e.target.value); setSelectedGuardianId('') }} placeholder="Buscar por nombre, DNI o teléfono (ej. hermanos comparten apoderado)" />
                  <div className="mt-2 space-y-1">
                    {guardianSearch.trim() && matches.length === 0 && <p className="text-xs text-slate-500">Sin coincidencias. Usa "Nuevo apoderado".</p>}
                    {matches.map((g) => (
                      <button key={g.id} type="button" onClick={() => setSelectedGuardianId(g.id)} className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedGuardianId === g.id ? 'border-brand-gold bg-brand-gold/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950'}`}>
                        <span className="font-bold">{g.fullName}</span>
                        <span className="ml-2 text-xs text-slate-500">{g.dni && `DNI ${g.dni}`} {g.students.length > 0 && `· ${g.students.length} alumno(s)`}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <GuardianFields value={newGuardian} onChange={setNewGuardian} />
              )}
            </div>

            <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
              <Field label="Parentesco *">
                <select className={selectClass} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                  {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <label className="flex h-12 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={isPrimary || linked.length === 0} disabled={linked.length === 0} onChange={(e) => setIsPrimary(e.target.checked)} /> Principal
              </label>
              <Button variant="default" disabled={saving} onClick={() => void addLink()}>Vincular</Button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function GuardianEditor({ guardian, students, onSaved, onClose }: {
  guardian: RosterGuardian | null
  students: Student[]
  onSaved: () => Promise<void>
  onClose: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState<GuardianInput>(() => guardian ? { fullName: guardian.fullName, dni: guardian.dni, phone: guardian.phone } : EMPTY_GUARDIAN)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      if (guardian) await updateGuardian(guardian.id, form)
      else await createGuardian(form)
      await onSaved()
      toast.success(guardian ? 'Apoderado actualizado' : 'Apoderado registrado')
      onClose()
    } catch (error) {
      toast.error('No se pudo guardar', errorText(error))
    } finally {
      setSaving(false)
    }
  }

  const linkedStudents = (guardian?.students ?? []).map((link) => ({ link, student: students.find((s) => s.id === link.studentId) }))

  return (
    <Panel title={guardian?.fullName ?? 'Nuevo apoderado'} subtitle={guardian ? 'Editar apoderado' : 'Registrar apoderado'} onClose={onClose}>
      <div className="mt-5"><GuardianFields value={form} onChange={setForm} /></div>
      {guardian && (
        <div className="mt-4 text-sm">
          <p className="font-black">Alumnos a cargo</p>
          <p className="mt-1 text-slate-500">
            {linkedStudents.length === 0 ? 'Ninguno. Vincúlalo desde la ficha del alumno.' : linkedStudents.map(({ link, student }) => `${student ? `${student.lastName}, ${student.firstName}` : `Alumno #${link.studentId}`} (${link.relationship || '—'})`).join(' · ')}
          </p>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="default" disabled={saving} onClick={() => void save()}>{guardian ? 'Guardar cambios' : 'Registrar apoderado'}</Button>
      </div>
    </Panel>
  )
}

export default function RosterManager({ open, onClose, classrooms, students, defaultClassroomId, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('students')
  const [classroomFilter, setClassroomFilter] = useState(defaultClassroomId)
  const [search, setSearch] = useState('')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('ALL')
  const [guardians, setGuardians] = useState<RosterGuardian[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Editing>(null)

  const loadGuardians = useCallback(async () => {
    setError('')
    try {
      setGuardians(await getRosterGuardians())
    } catch (err) {
      setError(errorText(err))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void loadGuardians().finally(() => setLoading(false))
  }, [open, loadGuardians])

  const refreshAll = useCallback(async () => {
    await Promise.all([onChanged(), loadGuardians()])
  }, [onChanged, loadGuardians])

  const query = search.trim().toLowerCase()
  const hasGuardian = (s: Student) => (s.guardians ?? []).length > 0
  const studentsInClassroom = useMemo(() => students
    .filter((s) => classroomFilter === 'ALL' || s.classroomId === classroomFilter),
  [students, classroomFilter])
  const filteredStudents = useMemo(() => studentsInClassroom
    .filter((s) => linkFilter === 'ALL' || (linkFilter === 'WITH') === hasGuardian(s))
    .filter((s) => !query || `${s.firstName} ${s.lastName} ${s.dni ?? ''} ${s.guardianName}`.toLowerCase().includes(query))
    // Los que faltan completar van primero para que no se pierdan en la lista.
    .sort((a, b) => Number(hasGuardian(a)) - Number(hasGuardian(b))),
  [studentsInClassroom, linkFilter, query])
  const filteredGuardians = useMemo(() => guardians
    .filter((g) => linkFilter === 'ALL' || (linkFilter === 'WITH') === (g.students.length > 0))
    .filter((g) => !query || `${g.fullName} ${g.dni} ${g.phone}`.toLowerCase().includes(query))
    .sort((a, b) => Number(a.students.length > 0) - Number(b.students.length > 0)),
  [guardians, linkFilter, query])
  const withoutGuardian = students.filter((s) => !hasGuardian(s)).length
  const linkCounts = tab === 'students'
    ? { ALL: studentsInClassroom.length, WITHOUT: studentsInClassroom.filter((s) => !hasGuardian(s)).length, WITH: studentsInClassroom.filter(hasGuardian).length }
    : { ALL: guardians.length, WITHOUT: guardians.filter((g) => g.students.length === 0).length, WITH: guardians.filter((g) => g.students.length > 0).length }
  const linkFilterLabels: Record<LinkFilter, string> = tab === 'students'
    ? { ALL: 'Todos', WITHOUT: 'Sin apoderado', WITH: 'Con apoderado' }
    : { ALL: 'Todos', WITHOUT: 'Sin alumno', WITH: 'Con alumno' }

  return (
    <AnimatePresence>{open && (
      <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.section
          className="relative mx-auto min-h-[70vh] max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          onMouseDown={(e) => e.stopPropagation()}
          initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brand-navy dark:text-brand-gold"><Users size={15} /> Padrón</p>
                <h2 className="mt-1 text-2xl font-black">Alumnos y apoderados</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {students.length} alumnos · {guardians.length} apoderados
                  {withoutGuardian > 0 && (
                    <> · <button type="button" onClick={() => { setTab('students'); setClassroomFilter('ALL'); setLinkFilter('WITHOUT') }} className="font-black text-red-600 underline-offset-2 hover:underline dark:text-red-400">{withoutGuardian} sin apoderado</button></>
                  )}
                </p>
              </div>
              <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant={tab === 'students' ? 'default' : 'outline'} onClick={() => setTab('students')}>Alumnos</Button>
              <Button variant={tab === 'guardians' ? 'default' : 'outline'} onClick={() => setTab('guardians')}>Apoderados</Button>
              <Button variant="default" className="ml-auto" onClick={() => setEditing({ kind: tab === 'students' ? 'student' : 'guardian', id: null })}>
                <Plus size={16} className="mr-1.5" />{tab === 'students' ? 'Nuevo alumno' : 'Nuevo apoderado'}
              </Button>
            </div>
          </header>

          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
                <Input className="pl-12" placeholder={tab === 'students' ? 'Buscar alumno, DNI o apoderado...' : 'Buscar apoderado, DNI o teléfono...'} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {tab === 'students' && (
                <select className={`${selectClass} sm:w-56`} value={classroomFilter} onChange={(e) => setClassroomFilter(e.target.value)}>
                  <option value="ALL">Todas las aulas</option>
                  {classrooms.map((c) => <option key={c.id} value={c.id}>{c.grade} {c.section} · {c.level}</option>)}
                </select>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(['ALL', 'WITHOUT', 'WITH'] as LinkFilter[]).map((value) => {
                const active = linkFilter === value
                const tone = value === 'WITHOUT'
                  ? active ? 'border-red-500 bg-red-500 text-white' : 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40'
                  : active ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                return (
                  <button key={value} type="button" onClick={() => setLinkFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-black transition-colors ${tone}`}>
                    {linkFilterLabels[value]} <span className="ml-1 opacity-75">{linkCounts[value]}</span>
                  </button>
                )
              })}
            </div>

            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
            {loading && <p className="mt-4 text-sm text-slate-500">Cargando...</p>}

            <div className="mt-4 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {tab === 'students' ? (
                filteredStudents.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No hay alumnos para este filtro.</p>
                : filteredStudents.map((s) => (
                  <button key={s.id} type="button" onClick={() => setEditing({ kind: 'student', id: s.id })} className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors ${hasGuardian(s) ? 'border-slate-200 bg-white hover:border-brand-gold dark:border-slate-800 dark:bg-slate-900' : 'border-red-500 bg-red-50 motion-safe:animate-blinkRed dark:bg-red-950/30'}`}>
                    <div className="min-w-0">
                      <p className="truncate font-black">{s.lastName}, {s.firstName}</p>
                      <p className="truncate text-xs text-slate-500">{classroomLabel(classrooms, s.classroomId)}{s.dni && ` · DNI ${s.dni}`}</p>
                      <p className={`truncate text-xs ${hasGuardian(s) ? 'text-slate-500' : 'font-black text-red-600 dark:text-red-400'}`}>
                        {hasGuardian(s) ? (s.guardians ?? []).map((g) => `${g.fullName} (${g.relationship || '—'})`).join(' · ') : '⚠ Falta vincular apoderado'}
                      </p>
                    </div>
                    <Pencil size={16} className="shrink-0 text-slate-400" />
                  </button>
                ))
              ) : (
                filteredGuardians.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No hay apoderados para este filtro.</p>
                : filteredGuardians.map((g) => (
                  <button key={g.id} type="button" onClick={() => setEditing({ kind: 'guardian', id: g.id })} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-brand-gold dark:border-slate-800 dark:bg-slate-900">
                    <div className="min-w-0">
                      <p className="truncate font-black">{g.fullName}</p>
                      <p className="truncate text-xs text-slate-500">{[g.dni && `DNI ${g.dni}`, g.phone].filter(Boolean).join(' · ') || 'Sin DNI ni teléfono'}</p>
                      <p className={`truncate text-xs ${g.students.length ? 'text-slate-500' : 'font-bold text-red-600 dark:text-red-400'}`}>{g.students.length ? `${g.students.length} alumno(s) a cargo` : 'Sin alumno vinculado'}</p>
                    </div>
                    <Pencil size={16} className="shrink-0 text-slate-400" />
                  </button>
                ))
              )}
            </div>
          </div>

          <AnimatePresence>
            {editing?.kind === 'student' && (
              <StudentEditor
                key={editing.id ?? 'new'}
                studentId={editing.id}
                classrooms={classrooms}
                students={students}
                guardians={guardians}
                defaultClassroomId={classroomFilter === 'ALL' ? defaultClassroomId : classroomFilter}
                onSaved={refreshAll}
                onCreated={(id) => setEditing({ kind: 'student', id })}
                onClose={() => setEditing(null)}
              />
            )}
            {editing?.kind === 'guardian' && (
              <GuardianEditor
                key={editing.id ?? 'new'}
                guardian={editing.id ? guardians.find((g) => g.id === editing.id) ?? null : null}
                students={students}
                onSaved={refreshAll}
                onClose={() => setEditing(null)}
              />
            )}
          </AnimatePresence>
        </motion.section>
      </motion.div>
    )}</AnimatePresence>
  )
}
