import type { ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  CalendarCheck2,
  CalendarDays,
  Download,
  FileText,
  Home,
  LogOut,
  RotateCcw,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react'

export type SidebarSection = 'home' | 'dashboard' | 'reports' | 'alerts' | 'summary' | 'audit'

type Props = {
  open: boolean
  onClose: () => void
  userName: string
  userRole: string
  formattedDate: string
  onHome: () => void
  onDashboard: () => void
  onReports: () => void
  onNotifications: () => void
  onAlerts: () => void
  onDailySummary: () => void
  onAudit: () => void
  onSettings: () => void
  onResetToday: () => void
  onLogout: () => void
  active?: SidebarSection
}

type NavButtonProps = { icon: ReactNode; label: string; active?: boolean; danger?: boolean; badge?: string; onClick: () => void }
function NavButton({ icon, label, active=false, danger=false, badge, onClick }:NavButtonProps){return <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${active?'bg-white text-slate-950 shadow-sm dark:bg-slate-100 dark:text-slate-950':danger?'text-red-300 hover:bg-red-500/10 hover:text-red-200':'text-slate-300 hover:bg-white/10 hover:text-white'}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5">{icon}</span><span className="flex-1">{label}</span>{badge&&<span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-black text-blue-200">{badge}</span>}</button>}

export default function Sidebar({open,onClose,userName,userRole,formattedDate,onHome,onDashboard,onReports,onNotifications,onAlerts,onDailySummary,onAudit,onSettings,onResetToday,onLogout,active='home'}:Props){
  const run=(action:()=>void)=>{action();onClose()}
  return <>{open&&<button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] lg:hidden" onClick={onClose}/>}<aside className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-800 bg-slate-950 text-white shadow-2xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none ${open?'translate-x-0':'-translate-x-full'}`}>
    <div className="flex h-20 items-center justify-between border-b border-slate-800 px-5"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-400">Tesla</p><h1 className="mt-0.5 text-lg font-black tracking-tight">Control Escolar</h1><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">Fase 6 · Automatización</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"><X size={19}/></button></div>
    <div className="flex-1 overflow-y-auto px-3 py-5">
      <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Operación</p><div className="space-y-1"><NavButton icon={<Home size={18}/>} label="Inicio" active={active==='home'} onClick={()=>run(onHome)}/><NavButton icon={<BarChart3 size={18}/>} label="Dashboard" active={active==='dashboard'} onClick={()=>run(onDashboard)}/><NavButton icon={<Download size={18}/>} label="Reportes" active={active==='reports'} onClick={()=>run(onReports)}/><NavButton icon={<FileText size={18}/>} label="Notificaciones" onClick={()=>run(onNotifications)}/></div>
      <div className="my-5 border-t border-slate-800"/><p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Automatización</p><div className="space-y-1"><NavButton icon={<Bell size={18}/>} label="Centro de alertas" active={active==='alerts'} badge="AUTO" onClick={()=>run(onAlerts)}/><NavButton icon={<CalendarCheck2 size={18}/>} label="Resumen diario" active={active==='summary'} onClick={()=>run(onDailySummary)}/></div>
      <div className="my-5 border-t border-slate-800"/><p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Sistema</p><div className="space-y-1"><NavButton icon={<ShieldCheck size={18}/>} label="Auditoría" active={active==='audit'} onClick={()=>run(onAudit)}/><NavButton icon={<Settings size={18}/>} label="Configuración" onClick={()=>run(onSettings)}/><NavButton icon={<RotateCcw size={18}/>} label="Reiniciar hoy" danger onClick={()=>run(onResetToday)}/></div>
    </div>
    <div className="border-t border-slate-800 p-3"><div className="mb-2 rounded-xl bg-white/5 p-3"><div className="flex items-center gap-2 text-xs text-slate-400"><CalendarDays size={14}/><span className="capitalize">{formattedDate}</span></div><p className="mt-3 truncate text-sm font-bold text-white">{userName}</p><p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{userRole}</p></div><NavButton icon={<LogOut size={18}/>} label="Salir" danger onClick={()=>run(onLogout)}/></div>
  </aside></>}
