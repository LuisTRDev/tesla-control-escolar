import { cn } from '@/lib/utils'

/** Uso: <Skeleton className="h-4 w-32" /> — reemplaza "Cargando..." por la forma real del contenido. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>
  )
}

/** Bloque listo para reemplazar "Cargando expediente..." u otros paneles similares. */
export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}
