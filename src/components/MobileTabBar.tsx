import type { ReactNode } from 'react'
import { useHideOnScroll } from '@/hooks/useHideOnScroll'
import { CalendarCheck2, ListChecks, Menu, MessageCircle, Users, Zap } from 'lucide-react'

type Props = {
  onList: () => void
  onQuick: () => void
  onSummary: () => void
  onWhatsApp: () => void
  /** Solo ADMIN: "Alumnos y apoderados" ocupa el lugar de WhatsApp. */
  onRoster?: () => void
  onMenu: () => void
  /** Alumnos del aula aún sin marcar: se muestra como globo en "Lista". */
  pendingCount: number
}

function Tab({ icon, label, onClick, active = false, badge }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold short:flex-row short:gap-1.5 short:py-0 short:text-xs transition-colors active:scale-95 active:bg-slate-100 dark:active:bg-slate-800 ${active ? 'text-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className={`grid h-8 w-12 place-items-center rounded-full transition-colors short:h-7 short:w-8 ${active ? 'bg-slate-200/80 dark:bg-slate-800' : ''}`}>{icon}</span>
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute left-1/2 top-0.5 ml-2 min-w-[18px] rounded-full bg-slate-950 px-1 text-center text-[10px] font-black leading-[18px] text-white dark:bg-white dark:text-slate-950">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

/** Barra de pestañas inferior (solo celular y tablet): las acciones de todos los días a un toque del pulgar. */
export default function MobileTabBar({ onList, onQuick, onSummary, onWhatsApp, onRoster, onMenu, pendingCount }: Props) {
  // Al bajar por la lista la barra se esconde; al subir un poco vuelve.
  const hidden = useHideOnScroll()
  return (
    <nav
      aria-label="Navegación principal"
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-md transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950/95 lg:hidden ${hidden ? 'pointer-events-none translate-y-full' : ''}`}
    >
      <div className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch gap-1 px-2 py-1">
        <Tab icon={<ListChecks size={21} />} label="Lista" active onClick={onList} badge={pendingCount} />
        <Tab icon={<Zap size={21} />} label="Rápido" onClick={onQuick} />
        <Tab icon={<CalendarCheck2 size={21} />} label="Cierre" onClick={onSummary} />
        {onRoster
          ? <Tab icon={<Users size={21} />} label="Alumnos" onClick={onRoster} />
          : <Tab icon={<MessageCircle size={21} />} label="WhatsApp" onClick={onWhatsApp} />}
        <Tab icon={<Menu size={21} />} label="Menú" onClick={onMenu} />
      </div>
    </nav>
  )
}
