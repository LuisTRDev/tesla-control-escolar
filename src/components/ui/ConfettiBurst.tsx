import { useEffect, useState } from 'react'

type Piece = { id: number; left: number; delay: number; color: string; rotate: number }

const COLORS = ['#F0B429', '#E1432E', '#122A47', '#4ADE80']

/**
 * Uso: <ConfettiBurst trigger={celebrationCount} /> — cada vez que `trigger`
 * cambia de valor, lanza una ráfaga breve de confeti (900ms) y desaparece
 * sola. Pensado para momentos positivos puntuales (0 tardanzas en el mes,
 * alumno destacado), NUNCA para acciones rutinarias — el refuerzo pierde
 * valor si aparece todo el tiempo.
 */
export function ConfettiBurst({ trigger }: { trigger: number }) {
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (trigger === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const next = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      delay: Math.random() * 150,
      color: COLORS[i % COLORS.length],
      rotate: Math.random() * 360,
    }))
    setPieces(next)
    const timeout = setTimeout(() => setPieces([]), 1100)
    return () => clearTimeout(timeout)
  }, [trigger])

  if (pieces.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-32 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block h-2.5 w-1.5 animate-confettiFall rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}ms`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  )
}
