import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Clock3 } from 'lucide-react'
import type { Classroom } from '@/types'
import { FilteredStudentList } from '@/components/livetv/FilteredStudentList'
import { gradeLabel, lateCountLabel, type LateLevelGroup, type LateRow } from '../panelData'
import { Empty, StudentRow, TAP_CLASS, TvCard, scrollClass, tap, useFlashClass, type CardProps, type SelectStudent } from './shared'

export function LateStudentsCard({ data, mobile, onSelect }: CardProps) {
  return <TvCard title="Alumnos con tardanza" subtitle={`${lateCountLabel(data.late, data.lateJustified)} hoy`} icon={<Clock3 size={20} />} strong><FilteredStudentList items={data.lateStudents.map(({ record, student }) => ({ record, student, classroom: data.classroomById.get(student.classroomId) }))} mobile={mobile} scrollClass={scrollClass(mobile, 30)} empty={<Empty text="No hay tardanzas registradas hoy." />} keyOf={({ record, student }) => record.id ?? `${student.id}-${record.time}`} renderItem={({ record, student, classroom }) => <StudentRow student={student} classroom={classroom} time={record.time} status="LATE" icon={<AlertTriangle size={18} />} showStatus={false} hideTime onSelect={onSelect} />} /></TvCard>
}

export function LateByGradeCard({ data, mobile, onSelect }: CardProps) {
  return <TvCard title="Tardanzas por nivel y grado" subtitle={`${lateCountLabel(data.late, data.lateJustified)} hoy · actualización automática`} icon={<Clock3 size={20} />} strong><div className="grid gap-4 xl:grid-cols-2">{data.lateByLevel.map((group) => <LateLevelColumn key={group.level} group={group} mobile={mobile} onSelect={onSelect} />)}</div></TvCard>
}

export function LateByLevelCard({ data, mobile, onSelect, level }: CardProps & { level: Classroom['level'] }) {
  const group = data.lateByLevel.find((item) => item.level === level)
  return <TvCard title={`Tardanzas de ${level.toLowerCase()}`} subtitle={`${lateCountLabel(group?.total ?? 0, group?.justified ?? 0)} hoy · actualización automática`} icon={<Clock3 size={20} />} strong>{group && <LateLevelColumn group={group} mobile={mobile} onSelect={onSelect} />}</TvCard>
}

function LateLevelColumn({ group, mobile, onSelect }: { group: LateLevelGroup; mobile: boolean; onSelect?: SelectStudent }) {
  // En celular los grados se pliegan; si hay pocas tardanzas arrancan abiertos.
  const startOpen = !mobile || group.total <= 8
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[.02] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-black uppercase tracking-wider">{group.level}</h3>
        <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-sm font-black text-amber-300">{group.total}</span>
      </div>
      {group.grades.length === 0 ? <Empty text={`Sin tardanzas en ${group.level.toLowerCase()} hoy.`} /> : (
        <div className={`space-y-3 ${mobile ? '' : 'max-h-[34rem] overflow-auto pr-1'}`}>
          {group.grades.map(({ grade, rows }) => <LateGradeGroup key={grade} level={group.level} grade={grade} rows={rows} collapsible={mobile} startOpen={startOpen} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  )
}

function LateGradeGroup({ level, grade, rows, collapsible, startOpen, onSelect }: { level: Classroom['level']; grade: string; rows: LateRow[]; collapsible: boolean; startOpen: boolean; onSelect?: SelectStudent }) {
  const [open, setOpen] = useState(startOpen)
  const expanded = !collapsible || open
  const title = <><span>{gradeLabel(level, grade)}</span><span className="flex items-center gap-1.5">{rows.length}{collapsible && (expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}</span></>
  return (
    <div>
      {collapsible
        ? <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={expanded} className="mb-1.5 flex min-h-11 w-full items-center justify-between rounded-xl bg-white/[.04] px-3 text-xs font-black uppercase tracking-widest text-slate-300 active:bg-white/10">{title}</button>
        : <p className="mb-1.5 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-400">{title}</p>}
      {expanded && (
        <div className="space-y-1.5">
          {rows.map(({ record, student, classroom }) => (
            <LateRowItem key={record.id ?? student.id} record={record} student={student} classroom={classroom} collapsible={collapsible} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function LateRowItem({ record, student, classroom, collapsible, onSelect }: LateRow & { collapsible: boolean; onSelect?: SelectStudent }) {
  const flash = useFlashClass(student.id)
  return (
    <div {...tap(onSelect, student.id)} className={`${flash} flex items-center gap-3 rounded-xl border border-white/7 bg-white/[.035] px-3 py-2 ${onSelect ? TAP_CLASS : ''}`}>
      <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-white/5 px-1.5 text-xs font-black text-slate-300" title="Sección">{classroom.section}</span>
      <p className={`min-w-0 flex-1 font-black ${collapsible ? 'break-words leading-tight' : 'truncate'}`}>{student.lastName}, {student.firstName}</p>
      {record.justified && <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-sky-300">Justificada</span>}
      <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-amber-300 sm:text-xs">Tardanza</span>
    </div>
  )
}
