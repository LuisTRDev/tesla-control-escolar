import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Clock3,
  LogOut,
  RotateCcw,
  Search,
  Settings2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { classrooms } from '@/data/classrooms'
import { students } from '@/data/students'
import {
  clearTodayAttendance,
  getAttendance,
  getEntryLimit,
  getTodayKey,
  recalculateTodayAttendance,
  registerAttendance,
  saveEntryLimit,
} from '@/lib/storage'
import type { AttendanceFilter, AttendanceRecord, Classroom } from '@/types'

type Props = {
  userName: string
  classroom: Classroom
  onClassroomChange: (classroom: Classroom) => void
  onLogout: () => void
}

const filters: Array<{ id: AttendanceFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'ON_TIME', label: 'A tiempo' },
  { id: 'LATE', label: 'Tardanza' },
  { id: 'PENDING', label: 'Pendientes' },
]

export default function Attendance({ userName, classroom, onClassroomChange, onLogout }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttendanceFilter>('ALL')
  const [records, setRecords] = useState<AttendanceRecord[]>(() => getAttendance())
  const [entryLimit, setEntryLimit] = useState(() => getEntryLimit())
  const today = getTodayKey()

  const classroomStudents = useMemo(
    () => students.filter((student) => student.classroomId === classroom.id),
    [classroom.id],
  )

  const todayRecords = records.filter((record) => record.date === today)
  const classroomRecords = todayRecords.filter((record) =>
    classroomStudents.some((student) => student.id === record.studentId),
  )

  const onTimeCount = classroomRecords.filter((record) => record.status === 'ON_TIME').length
  const lateCount = classroomRecords.filter((record) => record.status === 'LATE').length
  const presentCount = classroomRecords.length
  const pendingCount = classroomStudents.length - presentCount

  const filtered = classroomStudents.filter((student) => {
    const nameMatches = `${student.firstName} ${student.lastName}`
      .toLowerCase()
      .includes(query.toLowerCase())
    if (!nameMatches) return false

    const record = todayRecords.find((item) => item.studentId === student.id)
    if (filter === 'ON_TIME') return record?.status === 'ON_TIME'
    if (filter === 'LATE') return record?.status === 'LATE'
    if (filter === 'PENDING') return !record
    return true
  })

  function mark(studentId: string) {
    setRecords(registerAttendance(studentId, entryLimit))
  }

  function resetToday() {
    if (confirm('¿Borrar los registros de ingreso de hoy?')) {
      setRecords(clearTodayAttendance())
    }
  }

  function changeClassroom(classroomId: string) {
    const selected = classrooms.find((item) => item.id === classroomId)
    if (!selected) return
    setQuery('')
    setFilter('ALL')
    onClassroomChange(selected)
  }

  function updateEntryLimit(value: string) {
    setEntryLimit(value)
    saveEntryLimit(value)
    setRecords(recalculateTodayAttendance(value))
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Tesla</p>
              <h1 className="text-lg font-black">Control Escolar</h1>
              <p className="mt-0.5 text-xs text-slate-500">Auxiliar: {userName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetToday}>
                <RotateCcw className="mr-2" size={17} />
                Reiniciar hoy
              </Button>
              <Button variant="ghost" onClick={onLogout}>
                <LogOut className="mr-2" size={18} />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Control de ingreso</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Lista de alumnos</h2>
              <p className="mt-1 text-sm text-slate-500">Registra la llegada y el sistema detectará automáticamente las tardanzas.</p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto">
              <label className="block sm:w-64">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Aula</span>
                <div className="relative">
                  <select
                    className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    value={classroom.id}
                    onChange={(event) => changeClassroom(event.target.value)}
                  >
                    {classrooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.grade} {item.section} · {item.level}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={20} />
                </div>
              </label>

              <label className="block sm:w-48">
                <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Settings2 size={14} /> Hora límite
                </span>
                <Input
                  type="time"
                  value={entryLimit}
                  onChange={(event) => updateEntryLimit(event.target.value)}
                  className="font-bold"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{classroom.level}</p>
            <h3 className="text-2xl font-black">{classroom.grade} {classroom.section}</h3>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
            Hora límite: <span className="font-black text-slate-950">{entryLimit}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-slate-500">Alumnos</p>
            <p className="mt-1 text-2xl font-black">{classroomStudents.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">A tiempo</p>
            <p className="mt-1 text-2xl font-black text-emerald-700">{onTimeCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Tardanzas</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{lateCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Pendientes</p>
            <p className="mt-1 text-2xl font-black">{pendingCount}</p>
          </Card>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-slate-400" size={20} />
            <Input
              className="pl-12"
              placeholder={`Buscar alumno en ${classroom.grade} ${classroom.section}...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {filters.map((item) => (
              <Button
                key={item.id}
                variant={filter === item.id ? 'default' : 'outline'}
                className="whitespace-nowrap"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {filtered.map((student) => {
            const record = todayRecords.find((item) => item.studentId === student.id)

            return (
              <Card key={student.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <h3 className="font-bold">{student.firstName} {student.lastName}</h3>
                    <p className="mt-1 text-sm text-slate-500">{classroom.grade} {classroom.section} · {classroom.level}</p>
                  </div>

                  {record ? (
                    record.status === 'ON_TIME' ? (
                      <div className="flex min-w-44 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 font-bold text-emerald-700">
                        <Check size={18} />
                        {record.time} · A tiempo
                      </div>
                    ) : (
                      <div className="flex min-w-44 items-center justify-center gap-2 rounded-xl bg-amber-50 px-4 py-3 font-bold text-amber-700">
                        <TriangleAlert size={18} />
                        {record.time} · Tardanza
                      </div>
                    )
                  ) : (
                    <Button className="w-full sm:w-auto" onClick={() => mark(student.id)}>
                      <Clock3 className="mr-2" size={18} />
                      Marcar entrada
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">No hay alumnos que coincidan con este filtro.</div>
          )}
        </div>
      </section>
    </main>
  )
}
