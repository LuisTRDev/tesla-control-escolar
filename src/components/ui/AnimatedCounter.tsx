import { useEffect, useRef, useState } from 'react'

type Props = { value: number; duration?: number; className?: string }

/** Uso: <AnimatedCounter value={metrics.attendance} /> en vez de {metrics.attendance} */
export function AnimatedCounter({ value, duration = 600, className }: Props) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) { setDisplay(value); return }

    const from = fromRef.current
    const start = performance.now()
    let frame: number

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = value
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <span className={className}>{display}</span>
}
