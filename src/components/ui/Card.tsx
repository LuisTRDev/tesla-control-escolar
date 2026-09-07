import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100', className)}
      {...props}
    />
  ),
)
Card.displayName = 'Card'
