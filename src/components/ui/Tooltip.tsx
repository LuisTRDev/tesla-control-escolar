import { useState, type ReactNode } from 'react'

type Props = { content: string; children: ReactNode; side?: 'top' | 'bottom' }

/** Uso: <Tooltip content="Marca la asistencia del alumno"><Button>...</Button></Tooltip> */
export function Tooltip({ content, children, side = 'top' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className="relative inline-flex shrink-0"
      // Solo con mouse o teclado: en pantallas táctiles el toque no debe dejar el globo abierto.
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setOpen(true) }}
      onPointerLeave={() => setOpen(false)}
      onPointerDown={() => setOpen(false)}
      onFocus={(event) => { if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) setOpen(true) }}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-[150] w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] font-semibold leading-snug text-white shadow-lg animate-popIn dark:bg-slate-100 dark:text-slate-900 ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
