import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, KeyRound, Plus, RefreshCw, Search, ShieldCheck, UserCheck, UserCog, UserX, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/lib/toast'
import { reportError } from '@/lib/security'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errorMessages'
import { matchesQuery } from '@/lib/search'
import {
  createUser, generateTemporaryPassword, listUsers, resetUserPassword, setUserActive, updateUser, USER_ROLES,
  type AppUser, type UserRole,
} from '@/services/adminService'

type Props = { open: boolean; onClose: () => void }

type Editor =
  | { mode: 'create' }
  | { mode: 'edit'; user: AppUser }
  | { mode: 'password'; user: AppUser }

function roleLabel(role: string) {
  return USER_ROLES.find((item) => item.id === role.toUpperCase())?.label ?? (role || 'Sin rol')
}

function lastSeen(value: string | null) {
  if (!value) return 'Nunca inició sesión'
  return `Último ingreso: ${new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

/** Muestra la contraseña recién creada una sola vez, con botón para copiarla. */
function PasswordNotice({ email, password, onDone }: { email: string; password: string; onDone: () => void }) {
  const toast = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Usuario: ${email}\nContraseña: ${password}`)
      toast.success('Datos copiados', 'Pégalos en un mensaje privado para el usuario.')
    } catch {
      toast.warning('No se pudo copiar', 'Anota la contraseña manualmente.')
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Entrégale estos datos al usuario:</p>
        <p className="mt-2 font-mono text-sm">Usuario: <b>{email}</b></p>
        <p className="font-mono text-sm">Contraseña: <b className="select-all">{password}</b></p>
        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">Esta contraseña no se volverá a mostrar. Si se pierde, genera otra con "Cambiar contraseña".</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copy()}><Copy className="mr-2" size={16} /> Copiar usuario y contraseña</Button>
        <Button onClick={onDone}>Listo</Button>
      </div>
    </div>
  )
}

function UserEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const user = editor.mode === 'create' ? null : editor.user
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<UserRole>(() => USER_ROLES.find((item) => item.id === user?.role.toUpperCase())?.id ?? 'AUXILIARY')
  const [password, setPassword] = useState(() => (editor.mode === 'edit' ? '' : generateTemporaryPassword()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  async function save() {
    setSaving(true); setError('')
    try {
      if (editor.mode === 'create') {
        await createUser({ email, password, fullName, role })
        await onSaved()
        setCreated({ email: email.trim().toLowerCase(), password })
        toast.success('Usuario creado', `${fullName} ya puede iniciar sesión.`)
      } else if (editor.mode === 'edit') {
        await updateUser(editor.user.id, { fullName, role })
        await onSaved()
        toast.success('Usuario actualizado')
        onClose()
      } else {
        await resetUserPassword(editor.user.id, password)
        setCreated({ email: editor.user.email, password })
        toast.success('Contraseña cambiada', 'La anterior ya no funciona.')
      }
    } catch (err) {
      reportError('UserManager', err)
      setError(friendlyError(err, 'No se pudo guardar el usuario.'))
    } finally {
      setSaving(false)
    }
  }

  const title = editor.mode === 'create' ? 'Nuevo usuario' : editor.mode === 'edit' ? 'Editar usuario' : 'Cambiar contraseña'

  return (
    <motion.div className="absolute inset-0 z-20 overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="mx-auto w-full max-w-lg" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }}>
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Usuarios</p>
              <h3 className="mt-1 text-lg font-black">{title}</h3>
              {user && <p className="text-sm text-slate-500 dark:text-slate-400">{user.fullName || user.email}</p>}
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={18} /></Button>
          </div>

          {created ? <PasswordNotice email={created.email} password={created.password} onDone={onClose} /> : (
            <div className="mt-4 space-y-3">
              {editor.mode !== 'password' && (
                <>
                  <Field label="Nombre completo *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. María Quispe Rojas" /></Field>
                  {editor.mode === 'create' && (
                    <Field label="Correo (será su usuario) *" hint="Puede ser un correo real o uno interno, como maria@tesla.pe. No se envía ningún correo.">
                      <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@tesla.pe" />
                    </Field>
                  )}
                  <Field label="Rol" hint={role === 'ADMIN' ? 'Puede gestionar alumnos, usuarios, horarios, copias y ver el monitoreo.' : role === 'MANAGEMENT' ? 'Por ahora tiene el mismo acceso que un auxiliar (rol reservado para dirección).' : 'Marca asistencia, presentación, justificaciones y permisos.'}>
                    <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      {USER_ROLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                </>
              )}
              {editor.mode !== 'edit' && (
                <Field label={editor.mode === 'create' ? 'Contraseña inicial *' : 'Nueva contraseña *'} hint="Mínimo 8 caracteres, con letras y números.">
                  <div className="flex gap-2">
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" autoComplete="new-password" />
                    <Button variant="outline" type="button" onClick={() => setPassword(generateTemporaryPassword())} title="Generar otra contraseña"><RefreshCw size={16} /></Button>
                  </div>
                </Field>
              )}
              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button disabled={saving} onClick={() => void save()}>{saving ? 'Guardando...' : editor.mode === 'create' ? 'Crear usuario' : 'Guardar'}</Button>
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  )
}

export default function UserManager({ open, onClose }: Props) {
  const toast = useToast()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    if (open) void supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? null))
  }, [open])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setUsers(await listUsers()) }
    catch (err) { reportError('UserManager', err); setError(friendlyError(err, 'No se pudieron cargar los usuarios.')) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) void load() }, [open, load])

  const visible = useMemo(
    () => users.filter((u) => (showInactive || u.active) && matchesQuery([u.fullName, u.email, roleLabel(u.role)], query)),
    [users, query, showInactive],
  )
  const activeCount = users.filter((u) => u.active).length

  async function toggleActive(user: AppUser) {
    const name = user.fullName || user.email
    const message = user.active
      ? `¿Desactivar a ${name}? No podrá iniciar sesión y se cerrarán sus sesiones abiertas. Sus registros se conservan.`
      : `¿Reactivar a ${name}? Podrá volver a iniciar sesión con su contraseña actual.`
    if (!confirm(message)) return
    try {
      await setUserActive(user.id, !user.active)
      toast.success(user.active ? 'Usuario desactivado' : 'Usuario reactivado', name)
      await load()
    } catch (err) {
      reportError('UserManager', err)
      toast.error('No se pudo cambiar el estado', friendlyError(err))
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div data-screen-overlay className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.section data-screen className="relative mx-auto min-h-[60vh] max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950" initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <header className="border-b border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-slate-500 dark:text-slate-400"><ShieldCheck size={15} /> Solo administrador</p>
                  <h2 className="mt-1 flex items-center gap-2 text-2xl font-black"><Users size={23} /> Usuarios</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeCount} activo{activeCount === 1 ? '' : 's'} · {users.length - activeCount} desactivado{users.length - activeCount === 1 ? '' : 's'}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setEditor({ mode: 'create' })}><Plus className="mr-2" size={16} /> Nuevo usuario</Button>
                  <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
                </div>
              </div>
            </header>

            <div className="p-5 sm:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 text-slate-400" size={19} />
                  <Input className="pl-11" placeholder="Buscar por nombre, correo o rol..." value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar desactivados
                </label>
              </div>

              {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
              {loading && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Cargando usuarios...</p>}

              <div className="mt-5 space-y-2">
                {!loading && !error && visible.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No hay usuarios para este filtro.</div>
                )}
                {visible.map((user) => {
                  const isMe = user.id === myId
                  return (
                    <Card key={user.id} className={`p-4 ${user.active ? '' : 'border-dashed bg-slate-100 opacity-75 dark:bg-slate-900/50'}`}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-bold">
                            <span className={user.active ? '' : 'line-through decoration-slate-400/60'}>{user.fullName || '(sin nombre)'}</span>
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase ${user.role.toUpperCase() === 'ADMIN' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{roleLabel(user.role)}</span>
                            {!user.active && <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-black uppercase text-red-700 dark:bg-red-950/50 dark:text-red-300">Desactivado</span>}
                            {isMe && <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">(tú)</span>}
                          </p>
                          <p className="truncate text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{lastSeen(user.lastSignInAt)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => setEditor({ mode: 'edit', user })}><UserCog className="mr-1.5" size={14} /> Editar</Button>
                          <Button variant="outline" className="min-h-9 px-3 text-xs" onClick={() => setEditor({ mode: 'password', user })}><KeyRound className="mr-1.5" size={14} /> Cambiar contraseña</Button>
                          <Button
                            variant="outline"
                            className={`min-h-9 px-3 text-xs ${user.active ? 'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40' : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40'}`}
                            disabled={isMe && user.active}
                            title={isMe && user.active ? 'No puedes desactivar tu propia cuenta' : undefined}
                            onClick={() => void toggleActive(user)}
                          >
                            {user.active ? <><UserX className="mr-1.5" size={14} /> Desactivar</> : <><UserCheck className="mr-1.5" size={14} /> Reactivar</>}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>

            <AnimatePresence>
              {editor && <UserEditor key={editor.mode + (editor.mode === 'create' ? '' : editor.user.id)} editor={editor} onClose={() => setEditor(null)} onSaved={load} />}
            </AnimatePresence>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
