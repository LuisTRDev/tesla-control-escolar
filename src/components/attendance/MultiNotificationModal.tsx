import { AnimatePresence, motion } from 'framer-motion'
import { Download, FileText, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MAX_NOTIFICATIONS_PER_PAGE, type NotificationPrintData } from '@/lib/notificationTypes'
import { downloadMultiNotificationImage, downloadMultiNotificationPdf, downloadMultiNotificationWord } from '@/lib/notificationLoader'
import type { AttendanceRecord, Classroom, PresentationRecord, Student } from '@/types'

type Props = {
  multiNotificationOpen: boolean
  setMultiNotificationOpen: (open: boolean) => void
  records: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  classrooms: Classroom[]
  today: string
  selectedNotificationIds: string[]
  setSelectedNotificationIds: (ids: string[]) => void
  notificationSearch: string
  setNotificationSearch: (value: string) => void
  multiNotificationDate: string
  setMultiNotificationDate: (value: string) => void
  getNotificationNumber: (studentId: string, date: string, presentationId?: string, attendanceId?: string) => number
  notificationCandidates: Student[]
  selectedNotificationData: NotificationPrintData[]
  toggleNotificationStudent: (studentId: string) => void
}

export default function MultiNotificationModal({ multiNotificationOpen, setMultiNotificationOpen, records, presentationRecords, classrooms, today, selectedNotificationIds, setSelectedNotificationIds, notificationSearch, setNotificationSearch, multiNotificationDate, setMultiNotificationDate, getNotificationNumber, notificationCandidates, selectedNotificationData, toggleNotificationStudent }: Props) {
  return (
    <AnimatePresence>{multiNotificationOpen && (
      <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-[1px] dark:bg-black/70" onMouseDown={() => setMultiNotificationOpen(false)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
        <motion.section className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100" onMouseDown={(event) => event.stopPropagation()} initial={{scale:0.96,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Impresión optimizada</p>
              <h2 className="mt-1 text-xl font-black">Multinotificación</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Selecciona hasta 3 estudiantes. Se generará una hoja A4 vertical con una ficha de 210 × 99 mm por alumno.</p>
            </div>
            <Button variant="ghost" onClick={() => setMultiNotificationOpen(false)} aria-label="Cerrar"><X size={20} /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="w-full sm:w-48">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fecha de la incidencia</span>
                <Input
                  type="date"
                  value={multiNotificationDate}
                  min={`${today.slice(0,7)}-01`}
                  max={today}
                  onChange={(event) => { setMultiNotificationDate(event.target.value); setSelectedNotificationIds([]) }}
                  className="font-bold"
                />
              </label>
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-slate-500 dark:text-slate-400" size={20} />
                <Input className="pl-12" placeholder="Buscar por alumno, grado o aula..." value={notificationSearch} onChange={(event) => setNotificationSearch(event.target.value)} />
              </div>
              <div className={`rounded-xl px-4 py-2 text-sm font-black ${selectedNotificationIds.length === MAX_NOTIFICATIONS_PER_PAGE ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                {selectedNotificationIds.length} / {MAX_NOTIFICATIONS_PER_PAGE} seleccionados
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {multiNotificationDate === today
                ? 'Aparecen estudiantes con incumplimiento del reglamento o tardanza registrada hoy.'
                : <>Aparecen estudiantes con incumplimiento del reglamento o tardanza registrada el {new Date(multiNotificationDate + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}.</>
              } Puedes combinar alumnos de distintas aulas.
            </p>

            <div className="mt-4 space-y-2">
              {notificationCandidates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500 dark:border-slate-700">No hay alumnos con incidencias que coincidan con la búsqueda.</div>
              ) : notificationCandidates.map((student) => {
                const studentClassroom = classrooms.find((item) => item.id === student.classroomId)
                const checked = selectedNotificationIds.includes(student.id)
                const disabled = !checked && selectedNotificationIds.length >= MAX_NOTIFICATIONS_PER_PAGE
                return (
                  <label key={student.id} className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors ${checked ? 'border-slate-950 bg-slate-50 dark:border-slate-200 dark:bg-slate-800' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                    <input type="checkbox" className="h-5 w-5" checked={checked} disabled={disabled} onChange={() => toggleNotificationStudent(student.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="font-black">{student.firstName} {student.lastName}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{studentClassroom ? `${studentClassroom.grade} ${studentClassroom.section} · ${studentClassroom.level}` : 'Aula no encontrada'} · Apoderado: {student.guardianName}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">N° {getNotificationNumber(student.id, multiNotificationDate, presentationRecords.find((item) => item.studentId === student.id && item.date === multiNotificationDate)?.id, records.find((item) => item.studentId === student.id && item.date === multiNotificationDate && item.status === 'LATE')?.id)}</span>
                  </label>
                )
              })}
            </div>

            {selectedNotificationIds.length >= MAX_NOTIFICATIONS_PER_PAGE && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">Máximo 3 estudiantes por hoja. Quita uno para seleccionar otro.</div>
            )}
          </div>

          <div className="border-t border-slate-200 p-5 dark:border-slate-800 sm:p-6">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={selectedNotificationData.length === 0} onClick={() => downloadMultiNotificationPdf(selectedNotificationData)}>
                <Download className="mr-2" size={18} /> Generar PDF A4
              </Button>
              <Button variant="outline" disabled={selectedNotificationData.length === 0} onClick={() => void downloadMultiNotificationWord(selectedNotificationData)}>
                <FileText className="mr-2" size={18} /> Generar Word A4
              </Button>
              <Button variant="outline" disabled={selectedNotificationData.length === 0} onClick={() => void downloadMultiNotificationImage(selectedNotificationData)}>
                <Download className="mr-2" size={18} /> Generar imagen PNG
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">Si eliges 1 o 2 alumnos, los espacios restantes quedan vacíos para conservar el formato de corte.</p>
          </div>
        </motion.section>
      </motion.div>
    )}</AnimatePresence>
  )
}
