import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Clock3, DoorOpen, IdCard, Search, ShieldAlert, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { AttendanceRecord, Classroom, Student } from '@/types'

type Props = {
  open: boolean
  onClose: () => void
  students: Student[]
  classrooms: Classroom[]
  records: AttendanceRecord[]
  online: boolean
  onEntry: (studentId: string) => Promise<void>
  onExit: (studentId: string) => Promise<void>
}

function androidMajor(): number | null {
  const match = navigator.userAgent.match(/Android\s+(\d+)/i)
  return match ? Number(match[1]) : null
}

export default function PdaMode({ open, onClose, students, classrooms, records, online, onEntry, onExit }: Props) {
  const [dni, setDni] = useState('')
  const [selected, setSelected] = useState<Student | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'ENTRY' | 'EXIT' | null>(null)
  const classroomMap = useMemo(() => new Map(classrooms.map((room) => [room.id, room])), [classrooms])
  const record = selected ? records.find((item) => item.studentId === selected.id) : undefined
  const authorized = selected?.accessAuthorized !== false
  const android = androidMajor()

  useEffect(() => {
    if (!open) return
    setDni('')
    setSelected(null)
    setMessage('')
  }, [open])

  if (!open) return null

  function lookup() {
    const clean = dni.replace(/\D/g, '').slice(0, 8)
    console.log('Buscando:', JSON.stringify(clean))
    console.log('Total alumnos cargados:', students.length)
    console.log('Primeros 5 DNIs:', students.slice(0, 5).map(s => JSON.stringify(s.dni)))
    console.log('¿Existe ese DNI en el array?', students.some(s => s.dni === clean))
    if (clean.length !== 8) { setSelected(null); setMessage('Ingresa o escanea un DNI de 8 dígitos.'); return }
    const found = students.find((student) => (student.dni ?? '').replace(/\D/g, '') === clean)
    if (!found) { setSelected(null); setMessage('DNI no encontrado en la base de alumnos.'); return }
    setSelected(found)
    setMessage('')
  }

  async function run(type: 'ENTRY' | 'EXIT') {
    if (!selected || !online || !authorized) return
    setBusy(type)
    setMessage('')
    try {
      if (type === 'ENTRY') await onEntry(selected.id)
      else await onExit(selected.id)
      setMessage(type === 'ENTRY' ? 'Entrada registrada correctamente.' : 'Salida registrada correctamente.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el movimiento.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[85] bg-slate-950 p-3 text-white sm:p-5" onMouseDown={onClose}>
      <section className="mx-auto flex h-full max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 p-5">
          <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-400"><Smartphone size={16}/> Modo PDA</p><h2 className="mt-1 text-2xl font-black">Control por DNI</h2><p className="mt-1 text-sm text-slate-400">Compatible con ingreso manual y lectores que escriben el DNI como teclado.</p></div>
          <Button variant="ghost" className="text-white" onClick={onClose}><X size={20}/></Button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className={`mb-4 rounded-2xl border p-3 text-sm font-bold ${online ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
            {online ? '● Conectado · autorización validada con los datos actuales' : '● Sin conexión · el modo PDA queda solo lectura para evitar validar permisos desactualizados'}
          </div>
          {android !== null && android < 10 && <div className="mb-4 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-300">Android {android} detectado. Se recomienda Android 10 o superior.</div>}

          <div className="flex gap-2">
            <div className="relative flex-1"><IdCard className="absolute left-4 top-3.5 text-slate-500" size={19}/><Input autoFocus inputMode="numeric" autoComplete="off" className="border-slate-700 bg-slate-950 pl-11 text-lg font-black tracking-widest text-white" placeholder="DNI 8 dígitos" value={dni} onChange={(e)=>{setDni(e.target.value.replace(/\D/g,'').slice(0,8));setMessage('')}} onKeyDown={(e)=>{if(e.key==='Enter')lookup()}}/></div>
            <Button onClick={lookup}><Search className="mr-2" size={18}/>Buscar</Button>
          </div>

          {selected && (() => {
            const room = classroomMap.get(selected.classroomId)
            return <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
              <div className="flex items-start gap-4">
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${authorized ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{authorized ? <BadgeCheck size={30}/> : <ShieldAlert size={30}/>}</div>
                <div className="min-w-0 flex-1"><p className="text-xl font-black">{selected.firstName} {selected.lastName}</p><p className="mt-1 text-sm text-slate-400">DNI {selected.dni || 'sin registrar'} · {room ? `${room.grade} ${room.section} · ${room.level}` : 'Sin aula'}</p><p className="mt-1 text-xs text-slate-500">Apoderado: {selected.guardianName}</p></div>
              </div>

              <div className={`mt-5 rounded-2xl p-4 ${authorized ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'}`}>
                <p className="text-xs font-black uppercase tracking-widest">{authorized ? 'AUTORIZADO' : 'NO AUTORIZADO'}</p>
                <p className="mt-1 text-sm">{selected.accessNote || (authorized ? 'Sin restricciones de acceso registradas.' : 'Acceso bloqueado por configuración del alumno.')}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/[0.05] p-4"><p className="text-xs font-bold text-slate-500">ENTRADA</p><p className="mt-1 text-2xl font-black">{record?.time || '--:--'}</p><p className={`text-xs font-bold ${record?.status === 'LATE' ? 'text-amber-300' : 'text-emerald-300'}`}>{record ? (record.status === 'LATE' ? 'Tardanza' : 'A tiempo') : 'Sin registrar'}</p></div>
                <div className="rounded-2xl bg-white/[0.05] p-4"><p className="text-xs font-bold text-slate-500">SALIDA</p><p className="mt-1 text-2xl font-black">{record?.exitTime || '--:--'}</p><p className="text-xs font-bold text-slate-400">{record?.exitTime ? 'Registrada' : 'Sin registrar'}</p></div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Button className="h-14" disabled={!online || !authorized || Boolean(record) || busy !== null} onClick={()=>void run('ENTRY')}><Clock3 className="mr-2" size={19}/>{busy === 'ENTRY' ? 'Registrando...' : 'Marcar entrada'}</Button>
                <Button className="h-14" variant="outline" disabled={!online || !authorized || !record || Boolean(record.exitTime) || busy !== null} onClick={()=>void run('EXIT')}><DoorOpen className="mr-2" size={19}/>{busy === 'EXIT' ? 'Registrando...' : 'Marcar salida'}</Button>
              </div>
            </div>
          })()}

          {message && <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-sm font-bold text-slate-200">{message}</div>}
        </div>
      </section>
    </div>
  )
}
