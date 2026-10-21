import { useState, type ReactNode } from 'react'
import { Copy, Image as ImageIcon, MessageCircle } from 'lucide-react'
import { reportError } from '@/lib/security'
import { toDateKey } from '@/lib/dates'
import { LiveSheet } from './LiveSheet'
import { renderSummaryImage, summaryToText, type Summary } from './shareSummary'

type Props = {
  open: boolean
  onClose: () => void
  /** Se arma al pulsar para que la hora y las cifras sean las de ese momento. */
  getSummary: () => Summary
}

function Option({ icon, label, description, busy, onClick }: { icon: ReactNode; label: string; description: string; busy?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left active:bg-white/10 disabled:opacity-60">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-sky-300">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">{label}</span><span className="mt-0.5 block text-xs font-medium text-slate-400">{description}</span></span>
    </button>
  )
}

/** Compartir el resumen de tardanzas sin tomar capturas: imagen (PNG), texto para WhatsApp o copiar el texto. */
export function ShareSheet({ open, onClose, getSummary }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run(action: () => Promise<string | void>) {
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      if (result) setMessage(result)
    } catch (error) {
      // Cerrar la hoja de compartir del sistema no es un error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        reportError('LiveTvPanel.share', error)
        setMessage('No se pudo compartir. Inténtalo de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  const shareImage = () => run(async () => {
    const summary = getSummary()
    const blob = await renderSummaryImage(summary)
    const fileName = `tardanzas-${toDateKey()}.png`
    const file = new File([blob], fileName, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Tardanzas de hoy' })
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'Imagen descargada.'
  })

  const shareText = () => run(async () => {
    const text = summaryToText(getSummary())
    if (navigator.share) {
      await navigator.share({ text })
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  })

  const copyText = () => run(async () => {
    await navigator.clipboard.writeText(summaryToText(getSummary()))
    return 'Texto copiado.'
  })

  return (
    <LiveSheet open={open} onClose={() => { setMessage(''); onClose() }} title="Compartir resumen" subtitle="Tardanzas por nivel y grado">
      <div className="space-y-1">
        <Option icon={<ImageIcon size={20} />} label="Imagen" description="Una imagen lista para enviar por WhatsApp" busy={busy} onClick={() => void shareImage()} />
        <Option icon={<MessageCircle size={20} />} label="Texto para WhatsApp" description="La lista de tardanzas como mensaje" busy={busy} onClick={() => void shareText()} />
        <Option icon={<Copy size={20} />} label="Copiar texto" description="Para pegarlo donde quieras" busy={busy} onClick={() => void copyText()} />
      </div>
      <p role="status" aria-live="polite" className="min-h-6 px-2 pt-2 text-sm font-semibold text-sky-300">{message}</p>
    </LiveSheet>
  )
}
