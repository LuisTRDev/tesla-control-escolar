import { AnimatePresence, motion } from 'framer-motion'
import { Download, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { NotificationPrintData } from '@/lib/notificationTypes'
import { downloadNotificationImage, downloadNotificationPdf, downloadNotificationWord } from '@/lib/notificationLoader'
import { getPresentationViolationLabels } from '@/lib/presentation'
import { getNotificationLabel } from '@/services/notificationService'

type Props = {
  notificationPreviewData: NotificationPrintData | null
  setNotificationPreviewData: (data: NotificationPrintData | null) => void
  today: string
}

export default function NotificationPreviewModal({ notificationPreviewData, setNotificationPreviewData, today }: Props) {
  return (
    <AnimatePresence>{notificationPreviewData && (() => {
      const notificationData = notificationPreviewData
      const previewStudent = notificationData.student
      const labels = getPresentationViolationLabels(notificationData.presentation)
      if (notificationData.attendance?.status === 'LATE' && !labels.some((item) => item.startsWith('Tardanza'))) labels.push('Tardanza en el ingreso.')
      return (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-[1px] dark:bg-black/65" onMouseDown={() => setNotificationPreviewData(null)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.18}}>
          <motion.section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6" onMouseDown={(event) => event.stopPropagation()} initial={{scale:0.96,opacity:0,y:12}} animate={{scale:1,opacity:1,y:0}} exit={{scale:0.97,opacity:0,y:8}} transition={{type:'spring',stiffness:380,damping:32}}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ficha oficial · 1/3 A4</p>
                <h2 className="mt-1 text-xl font-black">Notificación sobre incumplimiento de reglamento interno</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Fecha del incidente: {new Date((notificationData.presentation?.date ?? notificationData.attendance?.date ?? today) + 'T12:00:00').toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setNotificationPreviewData(null)} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/60">
              <div className="grid gap-2 sm:grid-cols-2">
                <p><span className="font-black">Estudiante:</span> {previewStudent.firstName} {previewStudent.lastName}</p>
                <p><span className="font-black">Año y sección:</span> {notificationData.classroom.grade} {notificationData.classroom.section}</p>
                <p><span className="font-black">Apoderado:</span> {previewStudent.guardianName}</p>
                <p><span className="font-black">DNI:</span> {previewStudent.guardianDni || 'Sin DNI registrado'}</p>
                <p><span className="font-black">N° de notificación:</span> {notificationData.notificationNumber}</p>
                <p><span className="font-black">Seguimiento:</span> {getNotificationLabel(notificationData.notificationNumber)}</p>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="font-black">Incumplimientos marcados</p>
                <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                  {labels.map((label) => <li key={label}>• {label}</li>)}
                </ul>
                {notificationData.presentation?.observation && (
                  <p className="mt-3"><span className="font-black">Descripción:</span> {notificationData.presentation.observation}</p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button onClick={() => downloadNotificationPdf(notificationData)}>
                <Download className="mr-2" size={18} /> Descargar PDF
              </Button>
              <Button variant="outline" onClick={() => void downloadNotificationWord(notificationData)}>
                <FileText className="mr-2" size={18} /> Descargar Word
              </Button>
              <Button variant="outline" onClick={() => void downloadNotificationImage(notificationData)}>
                <Download className="mr-2" size={18} /> Descargar imagen PNG
              </Button>
            </div>
          </motion.section>
        </motion.div>
      )
    })()}</AnimatePresence>
  )
}
