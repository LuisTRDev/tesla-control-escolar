import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useBackClose } from '@/lib/backClose'
import { cn } from '@/lib/utils'

type Props = {
  /** Hora en formato 24 h "HH:MM" (vacío = sin hora). */
  value: string
  onChange: (value: string) => void
  /** Título del diálogo, ej. "Hora límite". */
  label?: string
  /** Texto de ayuda bajo la hora grande, ej. "Límite: 07:50". */
  hint?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

type Parts = { hour12: number; minute: number; pm: boolean }

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const pad = (n: number) => String(n).padStart(2, '0')

function toParts(value: string): Parts {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  const h = match ? Math.min(23, Number(match[1])) : 7
  const m = match ? Math.min(59, Number(match[2])) : 30
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 }
}

function toValue({ hour12, minute, pm }: Parts): string {
  const h = (hour12 % 12) + (pm ? 12 : 0)
  return `${pad(h)}:${pad(minute)}`
}

/** "07:50" → "7:50 a. m." */
export function formatTime12(value: string): string {
  if (!/^\d{1,2}:\d{2}/.test(value)) return ''
  const p = toParts(value)
  return `${p.hour12}:${pad(p.minute)} ${p.pm ? 'p. m.' : 'a. m.'}`
}

/** Suma minutos con acarreo de hora y de a. m./p. m. (da la vuelta a medianoche). */
function addMinutes(parts: Parts, delta: number): Parts {
  const [h, m] = toValue(parts).split(':').map(Number)
  const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440
  return toParts(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`)
}

/** Selector de hora propio (reemplaza al nativo): hora grande, cuadrículas de hora y minutos y ajuste fino de ±1 minuto. */
export function TimePicker({ value, onChange, label = 'Elegir hora', hint, disabled, className, placeholder = 'Elegir hora' }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Parts>(() => toParts(value))
  const [mode, setMode] = useState<'hour' | 'minute'>('hour')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) { setDraft(toParts(value)); setMode('hour') } }, [open, value])
  useBackClose(open, () => setOpen(false))
  // Foco en el panel al abrir, para que funcionen Enter, Esc y las flechas.
  useEffect(() => { if (open) panelRef.current?.focus() }, [open])

  function confirm() {
    const next = toValue(draft)
    setOpen(false)
    if (next !== value) onChange(next)
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
    else if (event.key === 'Enter') { event.preventDefault(); confirm() }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setDraft((d) => addMinutes(d, mode === 'hour' ? 60 : 1)) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setDraft((d) => addMinutes(d, mode === 'hour' ? -60 : -1)) }
  }

  const display = formatTime12(value)
  const segment = (active: boolean) => cn(
    'rounded-2xl px-3 py-1 tabular-nums transition-colors',
    active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800',
  )
  const chip = (active: boolean) => cn(
    'h-12 rounded-xl text-base font-bold tabular-nums transition-colors active:scale-[.97]',
    active ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  )

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn('flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-bold text-slate-950 outline-none transition-colors hover:border-slate-300 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:focus-visible:ring-slate-800', className)}
        aria-haspopup="dialog"
      >
        <span className={cn('truncate tabular-nums', !display && 'font-normal text-slate-400 dark:text-slate-500')}>{display || placeholder}</span>
        <Clock3 size={18} className="shrink-0 text-slate-500 dark:text-slate-400" />
      </button>

      {createPortal(
        <AnimatePresence>{open && (
          <motion.div
            data-sheet-overlay
            className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
            onMouseDown={() => setOpen(false)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          >
            <motion.div
              data-sheet
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              ref={panelRef}
              onKeyDown={handleKey}
              onMouseDown={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
                <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" aria-label="Cerrar"><X size={18} /></button>
              </div>

              {/* Hora grande: tocar la hora o los minutos elige qué se edita. */}
              <div className="mt-3 flex items-center justify-center gap-3">
                <div className="flex items-center text-5xl font-black">
                  <button type="button" className={segment(mode === 'hour')} onClick={() => setMode('hour')} aria-label="Editar hora">{pad(draft.hour12)}</button>
                  <span className="px-0.5 text-slate-300 dark:text-slate-600">:</span>
                  <button type="button" className={segment(mode === 'minute')} onClick={() => setMode('minute')} aria-label="Editar minutos">{pad(draft.minute)}</button>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
                  {[false, true].map((pm) => (
                    <button
                      key={String(pm)}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, pm }))}
                      className={cn('rounded-xl px-3 py-1.5 text-xs font-black transition-colors', draft.pm === pm ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}
                    >
                      {pm ? 'p. m.' : 'a. m.'}
                    </button>
                  ))}
                </div>
              </div>
              {hint && <p className="mt-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</p>}

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{mode === 'hour' ? 'Hora' : 'Minutos'}</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {mode === 'hour'
                  ? HOURS.map((h) => (
                    <button key={h} type="button" className={chip(draft.hour12 === h)} onClick={() => { setDraft((d) => ({ ...d, hour12: h })); setMode('minute') }}>{h}</button>
                  ))
                  : MINUTES.map((m) => (
                    <button key={m} type="button" className={chip(draft.minute === m)} onClick={() => setDraft((d) => ({ ...d, minute: m }))}>{pad(m)}</button>
                  ))}
              </div>

              {/* Ajuste fino: minuto a minuto, con acarreo de hora. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDraft((d) => addMinutes(d, -1))} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Minus size={16} /> 1 min</button>
                <button type="button" onClick={() => setDraft((d) => addMinutes(d, 1))} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Plus size={16} /> 1 min</button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button variant="default" onClick={confirm}>Listo · {formatTime12(toValue(draft))}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}
