import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export type TourStep = { target: string; title: string; description: string }

const SEEN_KEY = 'tesla_tour_seen_v1'

export function hasSeenTour(): boolean {
  return localStorage.getItem(SEEN_KEY) === '1'
}
function markTourSeen() {
  localStorage.setItem(SEEN_KEY, '1')
}
/** Botón "?" en cualquier parte de la app puede llamar esto para relanzar el tour manualmente. */
export function resetTour() {
  localStorage.removeItem(SEEN_KEY)
}

type Props = { steps: TourStep[]; autoStart?: boolean; onClose?: () => void; forceKey?: number }

export function OnboardingTour({ steps, autoStart = true, onClose, forceKey }: Props) {
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!autoStart) return
    if (hasSeenTour()) return
    // pequeño delay para que el DOM (Sidebar, toolbar) ya esté montado
    const t = setTimeout(() => setActive(true), 600)
    return () => clearTimeout(t)
  }, [autoStart])

  useEffect(() => {
    if (!forceKey) return
    setIndex(0)
    setActive(true)
  }, [forceKey])

  useEffect(() => {
    if (!active) return
    const step = steps[index]
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [active, index, steps])

  function finish() {
    setActive(false)
    markTourSeen()
    onClose?.()
  }

  if (!active) return null
  const step = steps[index]
  const isLast = index === steps.length - 1

  return (
    <div className="fixed inset-0 z-[250]">
      <div className="absolute inset-0 bg-slate-950/60" />
      {rect && (
        <div
          className="absolute rounded-2xl ring-4 ring-brand-gold animate-pulseRing"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}
      <div
        className="absolute w-[300px] max-w-[90vw] animate-popIn rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
        style={
          rect
            ? { top: Math.min(window.innerHeight - 220, rect.bottom + 16), left: Math.min(window.innerWidth - 320, Math.max(16, rect.left)) }
            : { top: '40%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
      >
        <button onClick={finish} className="absolute right-3 top-3 text-slate-400 hover:text-slate-700" aria-label="Cerrar tour">
          <X size={18} />
        </button>
        <p className="text-[11px] font-black uppercase tracking-widest text-brand-gold">
          Paso {index + 1} de {steps.length}
        </p>
        <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{step.title}</h3>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{step.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={finish} className="text-xs font-bold text-slate-400 hover:text-slate-600">
            Saltar
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" className="h-9 px-3 text-xs" onClick={() => setIndex((i) => i - 1)}>
                Atrás
              </Button>
            )}
            <Button className="h-9 px-3 text-xs" onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}>
              {isLast ? 'Entendido' : 'Siguiente'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
