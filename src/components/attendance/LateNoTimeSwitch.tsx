import { useState } from 'react'
import { TimerOff } from 'lucide-react'

const STORAGE_KEY = 'tesla-late-no-time'

/**
 * Modo "Tardanza sin hora": mientras está activo, cada marca de ingreso queda como
 * tardanza sin hora (para cuando el auxiliar registra después y no sabe a qué hora
 * entró el alumno). Dura la sesión del navegador.
 */
export function useLateNoTimeMode(): [boolean, (value: boolean) => void] {
  const [active, setActive] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  function update(value: boolean) {
    setActive(value)
    try { if (value) sessionStorage.setItem(STORAGE_KEY, '1'); else sessionStorage.removeItem(STORAGE_KEY) } catch { /* sin almacenamiento: solo dura mientras la pantalla esté abierta */ }
  }
  return [active, update]
}

type Props = { active: boolean; onChange: (value: boolean) => void; className?: string }

export function LateNoTimeSwitch({ active, onChange, className = '' }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      title="Las marcas quedan como tardanza, sin registrar la hora"
      className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold transition-colors sm:h-11 sm:rounded-xl sm:px-4 ${active
        ? 'border-amber-500 bg-amber-500 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-slate-950'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'} ${className}`}
    >
      <TimerOff size={16} className="shrink-0" />
      Tardanza sin hora
      <span className={`relative h-4 w-7 rounded-full transition-colors ${active ? 'bg-white/40' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${active ? 'left-3.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

/** Aviso visible mientras el modo está activo, para que no se olvide encendido. */
export function LateNoTimeBanner({ active, onChange }: Omit<Props, 'className'>) {
  if (!active) return null
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <span className="flex min-w-0 items-center gap-2"><TimerOff size={16} className="shrink-0" /> Cada alumno que marques quedará como <b>Tardanza</b>, sin hora.</span>
      <button type="button" onClick={() => onChange(false)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-black underline-offset-2 hover:underline">Desactivar</button>
    </div>
  )
}
