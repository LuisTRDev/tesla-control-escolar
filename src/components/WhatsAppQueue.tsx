import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, FileText, MessageCircle, RotateCcw, Send, SkipForward, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_MESSAGE_TYPES, WHATSAPP_PLACEHOLDERS,
  getWhatsAppTypeLabel, renderWhatsAppTemplate, sendWhatsApp,
  type WhatsAppMessageType, type WhatsAppTemplates,
} from '@/services/communicationService'
import type { Student } from '@/types'

export type WhatsAppQueueItem = {
  key: string
  student: Student
  classroomId: string
  classroomLabel: string
  type: WhatsAppMessageType
  message: string
  phoneValid: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  items: WhatsAppQueueItem[]
  today: string
  currentClassroomId: string
  currentClassroomLabel: string
  isAdmin: boolean
  templates: WhatsAppTemplates
  templatesShared: boolean
  onSaveTemplates: (templates: WhatsAppTemplates) => Promise<void>
}

type Scope = 'CLASSROOM' | 'ALL'

const sentKey = (today: string) => `tesla-wa-sent-${today}`

function readSent(today: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(sentKey(today)) ?? '[]') as string[]) } catch { return new Set() }
}

function writeSent(today: string, sent: Set<string>) {
  try { localStorage.setItem(sentKey(today), JSON.stringify([...sent])) } catch { /* sin almacenamiento: solo dura la sesión */ }
}

const SAMPLE = { phone: '987654321', guardianName: 'María López', studentName: 'Juan Pérez Ramos', time: '07:52', notificationNumber: 2, observation: 'Ingresó sin corbata.', violations: ['Uso inadecuado o incompleto del uniforme.'] }

export default function WhatsAppQueue({ open, onClose, items, today, currentClassroomId, currentClassroomLabel, isAdmin, templates, templatesShared, onSaveTemplates }: Props) {
  const [tab, setTab] = useState<'queue' | 'templates'>('queue')
  const [scope, setScope] = useState<Scope>('CLASSROOM')
  const [sent, setSent] = useState<Set<string>>(() => readSent(today))
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [editType, setEditType] = useState<WhatsAppMessageType>('LATE')
  const [drafts, setDrafts] = useState<WhatsAppTemplates>(templates)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => { if (open) { setSent(readSent(today)); setSkipped(new Set()); setError(''); setDrafts(templates); setSaveMessage('') } }, [open, today, templates])

  const scoped = useMemo(() => items.filter((item) => scope === 'ALL' || item.classroomId === currentClassroomId), [items, scope, currentClassroomId])
  const sendable = scoped.filter((item) => item.phoneValid)
  const invalid = scoped.filter((item) => !item.phoneValid)
  const sentCount = sendable.filter((item) => sent.has(item.key)).length
  const next = sendable.find((item) => !sent.has(item.key) && !skipped.has(item.key))

  function toggleSent(key: string, value: boolean) {
    setSent((curr) => {
      const copy = new Set(curr)
      if (value) copy.add(key); else copy.delete(key)
      writeSent(today, copy)
      return copy
    })
  }

  async function sendNext() {
    if (!next) return
    setError('')
    try {
      // window.open con noopener siempre devuelve null, así que no se puede
      // saber si el navegador bloqueó la ventana: se marca como abierto.
      await sendWhatsApp({ phone: next.student.guardianPhone, message: next.message })
      toggleSent(next.key, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir WhatsApp.')
    }
  }

  async function saveTemplates() {
    setSaving(true)
    setSaveMessage('')
    try {
      await onSaveTemplates(drafts)
      setSaveMessage('Plantillas guardadas.')
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'No se pudieron guardar las plantillas.')
    } finally {
      setSaving(false)
    }
  }

  const draftText = drafts[editType] ?? DEFAULT_WHATSAPP_TEMPLATES[editType]
  const preview = renderWhatsAppTemplate(draftText, { ...SAMPLE, type: editType, date: today })
  const progress = sendable.length ? Math.round((sentCount / sendable.length) * 100) : 0

  return (
    <AnimatePresence>{open && (
      <motion.div className="fixed inset-0 z-[75] bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <motion.section className="mx-auto flex h-full max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400"><MessageCircle size={15} /> WhatsApp en lote</p>
              <h2 className="mt-1 text-2xl font-black">Cola de mensajes de hoy</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cada toque abre el siguiente mensaje listo en WhatsApp; solo revisas y pulsas Enviar.</p>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
          </header>

          {isAdmin && (
            <div className="flex gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <Button variant={tab === 'queue' ? 'default' : 'outline'} onClick={() => setTab('queue')}><Send className="mr-2" size={16} /> Cola</Button>
              <Button variant={tab === 'templates' ? 'default' : 'outline'} onClick={() => setTab('templates')}><FileText className="mr-2" size={16} /> Plantillas</Button>
            </div>
          )}

          {tab === 'queue' ? (
            <>
              <div className="border-b border-slate-200 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant={scope === 'CLASSROOM' ? 'default' : 'outline'} onClick={() => setScope('CLASSROOM')}>{currentClassroomLabel}</Button>
                  <Button variant={scope === 'ALL' ? 'default' : 'outline'} onClick={() => setScope('ALL')}>Todo el colegio</Button>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm font-black">
                    <span>{sentCount} de {sendable.length} abiertos</span>
                    {skipped.size > 0 && <button type="button" className="text-xs font-bold text-brand-navy hover:underline dark:text-brand-gold" onClick={() => setSkipped(new Set())}>Volver a incluir {skipped.size} saltado{skipped.size !== 1 ? 's' : ''}</button>}
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {next ? (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Siguiente</p>
                    <p className="mt-1 text-lg font-black">{next.student.lastName}, {next.student.firstName}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{next.classroomLabel} · {getWhatsAppTypeLabel(next.type)} · {next.student.guardianName}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Button className="h-14 bg-emerald-600 text-base text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-white dark:hover:bg-emerald-400" onClick={() => void sendNext()}>
                        <Send className="mr-2" size={19} /> Abrir WhatsApp
                      </Button>
                      <Button variant="outline" className="h-14" onClick={() => setSkipped((curr) => new Set(curr).add(next.key))}>
                        <SkipForward className="mr-2" size={18} /> Saltar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {sendable.length === 0 ? 'No hay mensajes pendientes para enviar hoy.' : 'Listo: todos los mensajes de la cola ya se abrieron.'}
                  </div>
                )}
                {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-5">
                {sendable.map((item) => {
                  const done = sent.has(item.key)
                  return (
                    <div key={item.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${done ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20' : skipped.has(item.key) ? 'border-slate-200 opacity-60 dark:border-slate-800' : 'border-slate-200 dark:border-slate-800'}`}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{done ? <Check size={15} /> : <MessageCircle size={14} />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{item.student.lastName}, {item.student.firstName}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.classroomLabel} · {getWhatsAppTypeLabel(item.type)}{skipped.has(item.key) ? ' · saltado' : ''}</p>
                      </div>
                      {done && <button type="button" onClick={() => toggleSent(item.key, false)} className="shrink-0 text-xs font-bold text-slate-500 hover:underline dark:text-slate-400">Desmarcar</button>}
                    </div>
                  )
                })}
                {invalid.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
                    <p className="text-sm font-black text-red-700 dark:text-red-300">{invalid.length} sin celular válido del apoderado</p>
                    <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">Corrígelos en «Alumnos y apoderados» para poder avisarles.</p>
                    <ul className="mt-2 space-y-1 text-sm text-red-800 dark:text-red-200">
                      {invalid.map((item) => <li key={item.key}>• {item.student.lastName}, {item.student.firstName} · {item.classroomLabel} · {item.student.guardianPhone || 'sin número'}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              {!templatesShared && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                  Las plantillas se guardarán solo en este dispositivo. Para que lleguen a todos los auxiliares, ejecuta <b>supabase/phase11_whatsapp_templates.sql</b> en Supabase.
                </div>
              )}
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tipo de mensaje</span>
                <div className="relative">
                  <select value={editType} onChange={(e) => setEditType(e.target.value as WhatsAppMessageType)} className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 pr-10 text-sm font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    {WHATSAPP_MESSAGE_TYPES.map((type) => <option key={type} value={type}>{getWhatsAppTypeLabel(type)}{drafts[type] ? ' · personalizada' : ''}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3.5 text-slate-400" size={20} />
                </div>
              </label>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>Plantilla</span>
                    <button type="button" className="flex items-center gap-1 normal-case tracking-normal text-brand-navy hover:underline dark:text-brand-gold" onClick={() => setDrafts((curr) => { const copy = { ...curr }; delete copy[editType]; return copy })}>
                      <RotateCcw size={13} /> Texto por defecto
                    </button>
                  </span>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDrafts((curr) => ({ ...curr, [editType]: e.target.value }))}
                    rows={14}
                    className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-xs leading-5 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-800"
                  />
                </label>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vista previa (datos de ejemplo)</p>
                  <pre className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-sans text-xs leading-5 text-slate-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-slate-200">{preview}</pre>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Marcadores disponibles</p>
                <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  {WHATSAPP_PLACEHOLDERS.map((item) => <li key={item.key}><code className="font-black text-brand-navy dark:text-brand-gold">{item.key}</code> <span className="text-slate-500 dark:text-slate-400">{item.description}</span></li>)}
                </ul>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Usa *texto* para negrita en WhatsApp.</p>
              </div>

              <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                {saveMessage && <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 sm:mr-auto">{saveMessage}</p>}
                <Button onClick={() => void saveTemplates()} disabled={saving}>{saving ? 'Guardando...' : 'Guardar plantillas'}</Button>
              </div>
            </div>
          )}
        </motion.section>
      </motion.div>
    )}</AnimatePresence>
  )
}
