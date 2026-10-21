import { LogIn, LogOut, Phone, ShieldAlert } from 'lucide-react'
import type { AttendanceRecord, Classroom, Student } from '@/types'
import { entryTimeLabel } from '@/lib/displayLabels'

type Props = {
  student: Student
  classroom?: Classroom
  record?: AttendanceRecord
  incidents: Array<{ key: string; time: string; labels: string[] }>
}

/** Ficha rápida de un alumno dentro de la hoja inferior del panel: estado de hoy y cómo ubicar a su apoderado. */
export function StudentSheetBody({ student, classroom, record, incidents }: Props) {
  const primary = student.guardians?.find((guardian) => guardian.isPrimary) ?? student.guardians?.[0]
  const guardianName = primary?.fullName || student.guardianName
  const guardianPhone = (primary?.phone || student.guardianPhone || '').replace(/[^\d+]/g, '')
  const entryStatus = !record ? 'Sin ingreso' : record.status === 'LATE' ? (record.justified ? 'Tardanza justificada' : 'Tardanza') : 'A tiempo'
  const entryTone = !record ? 'text-slate-300' : record.status === 'LATE' ? 'text-amber-300' : 'text-emerald-300'

  return (
    <div className="space-y-3 pb-2">
      <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3.5">
        <p className="text-lg font-black leading-tight">{student.firstName} {student.lastName}</p>
        <p className="mt-1 text-sm font-semibold text-slate-400">{classroom ? `${classroom.grade} ${classroom.section} · ${classroom.level}` : 'Sin aula'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400"><LogIn size={14} /> Ingreso</p>
          <p className="mt-1 font-mono text-xl font-black tabular-nums">{record ? entryTimeLabel(record.time) : '—'}</p>
          <p className={`text-xs font-black uppercase tracking-wider ${entryTone}`}>{entryStatus}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400"><LogOut size={14} /> Salida</p>
          <p className="mt-1 font-mono text-xl font-black tabular-nums">{record?.exitTime ? record.exitTime.slice(0, 5) : '—'}</p>
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">{record?.exitTime ? 'Registrada' : 'Sin salida'}</p>
        </div>
      </div>

      {incidents.length > 0 && (
        <div className="rounded-2xl border border-orange-400/20 bg-orange-500/[.06] p-3">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-orange-300"><ShieldAlert size={14} /> Incidencias de hoy</p>
          <ul className="mt-2 space-y-1.5">
            {incidents.map((incident) => (
              <li key={incident.key} className="flex items-center justify-between gap-3 text-sm font-bold text-slate-200">
                <span className="min-w-0">{incident.labels.join(' · ')}</span>
                <span className="shrink-0 font-mono text-slate-400">{incident.time ? incident.time.slice(0, 5) : '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(guardianName || guardianPhone) && (
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">Apoderado{primary?.relationship ? ` · ${primary.relationship}` : ''}</p>
          <p className="mt-1 font-black">{guardianName || 'Sin nombre registrado'}</p>
          {guardianPhone
            ? <a href={`tel:${guardianPhone}`} className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500/15 font-black text-emerald-300 active:bg-emerald-500/25"><Phone size={18} /> Llamar {guardianPhone}</a>
            : <p className="mt-1 text-sm font-semibold text-slate-400">Sin teléfono registrado.</p>}
        </div>
      )}
    </div>
  )
}
