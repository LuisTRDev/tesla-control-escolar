import { AlertTriangle, BarChart3, Clock3, LayoutDashboard, LogIn, LogOut, Users } from 'lucide-react'
import { FilteredStudentList } from '@/components/livetv/FilteredStudentList'
import { Empty, Metric, MiniStat, StudentRow, TAP_CLASS, TvCard, scrollClass, tap, type CardProps } from './shared'

export function MetricsCard({ data, totalStudents }: CardProps & { totalStudents: number }) {
  return <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1"><Metric icon={<Users size={21} />} label="Alumnos" value={totalStudents} /><Metric icon={<LogIn size={21} />} label="Ingresaron" value={data.entered} accent="emerald" /><Metric icon={<Clock3 size={21} />} label="A tiempo" value={data.onTime} accent="blue" /><Metric icon={<AlertTriangle size={21} />} label="Tardanzas" value={data.late} accent="amber" /><Metric icon={<Users size={21} />} label="Sin marcar" value={data.pending} accent="slate" /></div>
}

export function RecentEntriesCard({ data, onSelect }: CardProps) {
  return <TvCard title="Últimos ingresos" subtitle="Movimientos registrados hoy" icon={<LogIn size={20} />}><div className="space-y-2">{data.recentEntries.length === 0 ? <Empty text="Aún no hay ingresos registrados." /> : data.recentEntries.map(({ record, student }) => <StudentRow key={record.id ?? `${student.id}-${record.time}`} student={student} classroom={data.classroomById.get(student.classroomId)} time={record.time} status={record.status} icon={record.status === 'LATE' ? <AlertTriangle size={18} /> : <LogIn size={18} />} onSelect={onSelect} />)}</div></TvCard>
}

export function AttendanceSummaryCard({ data }: CardProps) {
  return <TvCard title="Resumen de asistencia" subtitle="Estado del día" icon={<BarChart3 size={20} />}><div className="grid grid-cols-2 gap-3"><MiniStat label="Ingresaron" value={data.entered} /> <MiniStat label="A tiempo" value={data.onTime} /> <MiniStat label="Tardanzas" value={data.late} /> <MiniStat label="Cobertura" value={`${data.attendancePercentage}%`} /></div></TvCard>
}

export function ExitSummaryCard({ data }: CardProps) {
  return <TvCard title="Salidas registradas" subtitle="Control de salida" icon={<LogOut size={20} />}><div className="flex items-end justify-between gap-4"><div><p className="text-4xl font-black tabular-nums">{data.exited}</p><p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-500">de {data.entered} ingresados</p></div><div className="rounded-2xl bg-white/5 p-4 text-emerald-300"><LogOut size={30} /></div></div></TvCard>
}

export function PendingStudentsCard({ data, mobile, onSelect }: CardProps) {
  return <TvCard title="Alumnos sin ingreso" subtitle={`${data.pendingStudents.length} pendientes de marcar`} icon={<Users size={20} />}><FilteredStudentList items={data.pendingStudents} mobile={mobile} scrollClass={scrollClass(mobile, 30)} empty={<Empty text="Todos los alumnos tienen registro de ingreso." />} keyOf={({ student }) => student.id} renderItem={({ student, classroom }) => <div {...tap(onSelect, student.id)} className={`flex items-center gap-3 rounded-2xl border border-white/7 bg-white/[.035] p-3 ${onSelect ? TAP_CLASS : ''}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-slate-400"><Clock3 size={17} /></div><div className="min-w-0 flex-1"><p className={mobile ? 'break-words font-black leading-tight' : 'truncate font-black'}>{student.firstName} {student.lastName}</p><p className="text-xs font-semibold text-slate-500">{classroom ? `${classroom.grade} ${classroom.section}` : 'Aula'}</p></div><span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Pendiente</span></div>} /></TvCard>
}

export function ClassroomSummaryCard({ data, mobile }: CardProps) {
  return <TvCard title="Resumen por aula" subtitle="Visión completa del colegio" icon={<LayoutDashboard size={20} />}><div className={`grid grid-cols-2 gap-2 ${scrollClass(mobile, 34)}`}>{data.classroomSummary.map(({ classroom, total, entered, late, pending }) => <div key={classroom.id} className="rounded-2xl border border-white/7 bg-white/[.035] p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="font-black">{classroom.grade} {classroom.section}</p><p className="text-xs font-semibold text-slate-500">{classroom.level}</p></div><span className="rounded-lg bg-white/5 px-2 py-1 text-xs font-black">{entered}/{total}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-emerald-500/8 px-2 py-2"><b className="block text-emerald-300">{Math.max(0, entered - late)}</b><span className="text-slate-500">a tiempo</span></div><div className="rounded-xl bg-amber-500/8 px-2 py-2"><b className="block text-amber-300">{late}</b><span className="text-slate-500">tarde</span></div><div className="rounded-xl bg-white/5 px-2 py-2"><b className="block text-slate-300">{pending}</b><span className="text-slate-500">pend.</span></div></div></div>)}</div></TvCard>
}
