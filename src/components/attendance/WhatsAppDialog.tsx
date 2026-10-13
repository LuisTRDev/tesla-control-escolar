import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getWhatsAppTypeLabel, isValidPeruWhatsApp, type WhatsAppMessageType } from '@/services/communicationService'
import type { Student } from '@/types'

type Props = {
  whatsAppStudent: Student | null
  setWhatsAppStudent: (student: Student | null) => void
  whatsAppType: WhatsAppMessageType
  whatsAppMessage: string
  setWhatsAppMessage: (message: string) => void
  whatsAppError: string
  openingWhatsApp: boolean
  getWhatsAppOptions: (student: Student) => Array<{ type: WhatsAppMessageType; label: string }>
  buildStudentWhatsAppMessage: (student: Student, type: WhatsAppMessageType) => string
  changeWhatsAppType: (type: WhatsAppMessageType) => void
  handleOpenWhatsApp: () => Promise<void>
}

export default function WhatsAppDialog({ whatsAppStudent, setWhatsAppStudent, whatsAppType, whatsAppMessage, setWhatsAppMessage, whatsAppError, openingWhatsApp, getWhatsAppOptions, buildStudentWhatsAppMessage, changeWhatsAppType, handleOpenWhatsApp }: Props) {
  return (
    <AnimatePresence>{whatsAppStudent && (() => {
      const options = getWhatsAppOptions(whatsAppStudent)
      const normalizedOk = isValidPeruWhatsApp(whatsAppStudent.guardianPhone)
      return (
        <motion.div
          data-sheet-overlay
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-[1px] dark:bg-black/70"
          onMouseDown={() => setWhatsAppStudent(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.section
            data-sheet
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">WhatsApp · Fase 5.2</p>
                <h2 className="mt-1 text-xl font-black">Comunicar al apoderado</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  El mensaje se abrirá listo en WhatsApp. La auxiliar solo tendrá que revisar y pulsar Enviar.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setWhatsAppStudent(null)} aria-label="Cerrar"><X size={20} /></Button>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/60 sm:grid-cols-2">
              <p><span className="font-black">Estudiante:</span> {whatsAppStudent.firstName} {whatsAppStudent.lastName}</p>
              <p><span className="font-black">Apoderado:</span> {whatsAppStudent.guardianName}</p>
              <p className="sm:col-span-2">
                <span className="font-black">WhatsApp:</span>{' '}
                <span className={normalizedOk ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}>
                  {whatsAppStudent.guardianPhone || 'Sin número registrado'}
                </span>
              </p>
            </div>

            {options.length > 1 && (
              <label className="mt-5 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Motivo de comunicación</span>
                <div className="relative">
                  <select
                    value={whatsAppType}
                    onChange={(event) => changeWhatsAppType(event.target.value as WhatsAppMessageType)}
                    className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 pr-10 text-sm font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {options.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-500 dark:text-slate-400" size={20} />
                </div>
              </label>
            )}

            {options.length === 1 && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                Motivo: {getWhatsAppTypeLabel(options[0].type)}
              </div>
            )}

            <label className="mt-5 block">
              <span className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Mensaje</span>
                <button
                  type="button"
                  onClick={() => setWhatsAppMessage(buildStudentWhatsAppMessage(whatsAppStudent, whatsAppType))}
                  className="normal-case tracking-normal text-brand-navy hover:underline dark:text-brand-gold"
                >
                  Restaurar texto automático
                </button>
              </span>
              <textarea
                value={whatsAppMessage}
                onChange={(event) => setWhatsAppMessage(event.target.value)}
                rows={11}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
              />
            </label>

            {!normalizedOk && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
                El teléfono registrado no parece un celular peruano válido. Guarda en Supabase un número como 987654321 o +51987654321.
              </div>
            )}

            {whatsAppError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
                {whatsAppError}
              </div>
            )}

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              <b>Modo actual:</b> wa.me (sin costo de API). Este botón no confirma que el mensaje fue enviado; abre WhatsApp con el destinatario y texto preparados. El servicio está aislado para poder cambiarlo luego por WhatsApp Cloud API sin rediseñar esta pantalla.
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setWhatsAppStudent(null)}>Cancelar</Button>
              <Button
                onClick={() => void handleOpenWhatsApp()}
                disabled={!normalizedOk || !whatsAppMessage.trim() || openingWhatsApp}
                className="bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-white dark:hover:bg-emerald-400"
              >
                <Send className="mr-2" size={18} /> {openingWhatsApp ? 'Abriendo...' : 'Abrir WhatsApp'}
              </Button>
            </div>
          </motion.section>
        </motion.div>
      )
    })()}</AnimatePresence>
  )
}
