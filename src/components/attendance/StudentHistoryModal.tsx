import { AnimatePresence, motion } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { NotificationPrintData } from '@/lib/notificationTypes'
import { getViolationCount } from '@/lib/presentation'
import { getNotificationLabel } from '@/services/notificationService'
import type { AttendanceRecord, NotificationRecord, PresentationRecord, Student } from '@/types'

type Props = {
  historyStudent: Student | null
  setHistoryStudent: (student: Student | null) => void
  records: AttendanceRecord[]
  presentationRecords: PresentationRecord[]
  notifications: NotificationRecord[]
  setNotificationPreviewData: (data: NotificationPrintData | null) => void
  buildNotificationDataFromNotification: (student: Student, notification: NotificationRecord) => NotificationPrintData | null
}

export default function StudentHistoryModal({ historyStudent, setHistoryStudent, records, presentationRecords, notifications, setNotificationPreviewData, buildNotificationDataFromNotification }: Props) {
  return (
    <AnimatePresence>{historyStudent && (() => {
      const attendanceHistory = records.filter((r) => r.studentId === historyStudent.id).sort((a,b) => b.date.localeCompare(a.date))
      const presentationHistory = presentationRecords.filter((r) => r.studentId === historyStudent.id).sort((a,b) => b.date.localeCompare(a.date))
      const notificationHistory = notifications
        .filter((item) => item.studentId === historyStudent.id)
        .sort((a,b) => b.date.localeCompare(a.date) || b.generatedAt.localeCompare(a.generatedAt))
      const lateTotal = attendanceHistory.filter((r) => r.status === 'LATE').length
      const incidentTotal = presentationHistory.filter((r) => r.status === 'NON_COMPLIANT').length
      const dates = Array.from(new Set([...attendanceHistory.map(r => r.date), ...presentationHistory.map(r => r.date)])).sort((a,b) => b.localeCompare(a))
      return (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setHistoryStudent(null)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
          <motion.section className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6" onMouseDown={(e) => e.stopPropagation()} initial={{scale:0.96,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Historial mensual</p><h2 className="mt-1 text-xl font-black">{historyStudent.firstName} {historyStudent.lastName}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Datos persistentes almacenados en PostgreSQL.</p></div>
              <Button variant="ghost" onClick={() => setHistoryStudent(null)}><X size={20}/></Button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="p-4"><p className="text-xs text-slate-500">Ingresos</p><p className="mt-1 text-2xl font-black">{attendanceHistory.length}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Tardanzas</p><p className="mt-1 text-2xl font-black text-amber-600">{lateTotal}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Incidencias</p><p className="mt-1 text-2xl font-black text-amber-600">{incidentTotal}</p></Card>
              <Card className="p-4"><p className="text-xs text-slate-500">Reincidencias</p><p className="mt-1 text-2xl font-black text-rose-600">{notificationHistory.length}</p></Card>
            </div>
            <div className="mt-5 space-y-3">
              {dates.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Aún no hay historial este mes.</div> : dates.map((date) => {
                const att = attendanceHistory.find(r => r.date === date)
                const pre = presentationHistory.find(r => r.date === date)
                return <div key={date} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="font-black">{new Date(date + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}</p>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    <p><b>Ingreso:</b> {att ? `${att.time} · ${att.status === 'ON_TIME' ? 'A tiempo' : 'Tardanza'}` : 'Sin registro'}</p>
                    <p><b>Presentación:</b> {pre ? (pre.status === 'COMPLIANT' ? 'Conforme' : `${getViolationCount(pre)} incidencia(s)`) : 'Sin revisar'}</p>
                  </div>
                </div>
              })}
            </div>

            <div className="mt-7 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Reincidencias</p>
                  <h3 className="mt-1 font-black">Historial de notificaciones</h3>
                </div>
                {(() => {
                  const currentValid = notificationHistory.find((item) => !item.voided)
                  return currentValid && (
                    <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      Nivel actual: {getNotificationLabel(currentValid.notificationNumber)}
                    </span>
                  )
                })()}
              </div>

              <div className="mt-3 space-y-2">
                {notificationHistory.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700">
                    El alumno aún no tiene notificaciones registradas.
                  </div>
                ) : notificationHistory.map((item) => {
                  const previewData = item.voided ? null : buildNotificationDataFromNotification(historyStudent, item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!previewData}
                      onClick={() => {
                        if (!previewData) return
                        setNotificationPreviewData(previewData)
                        setHistoryStudent(null)
                      }}
                      className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between disabled:cursor-not-allowed ${item.voided ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900/40' : 'border-slate-200 dark:border-slate-800 enabled:hover:border-sky-400 enabled:hover:bg-sky-50 dark:enabled:hover:bg-sky-950/30 disabled:opacity-60'}`}
                    >
                      <div>
                        <p className={`font-black ${item.voided ? 'line-through decoration-slate-400' : ''}`}>
                          {getNotificationLabel(item.notificationNumber)}
                          {item.voided && (
                            <span className="ml-2 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-black no-underline text-slate-600 dark:bg-slate-700 dark:text-slate-300">ANULADA</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Registro #{item.id}{!item.voided && !previewData && ' · sin ficha vinculada'}</p>
                        {item.voided && item.voidedReason && (
                          <p className="mt-1 max-w-md text-xs italic text-slate-500 dark:text-slate-400">{item.voidedReason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                          {new Date(item.date + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}
                        </p>
                        {previewData && <Download size={16} className="text-brand-navy dark:text-brand-gold" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )
    })()}</AnimatePresence>
  )
}
