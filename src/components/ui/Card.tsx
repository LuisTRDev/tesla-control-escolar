import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100', className)} {...props} />
}
