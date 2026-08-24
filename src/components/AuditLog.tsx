import { useEffect, useMemo, useState } from 'react'
import { Activity, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { getAuditLogs, type AuditLogRecord } from '@/services/phase6Service'

type Props = { open: boolean; onClose: () => void; refreshKey?: number }

const entityLabels: Record<string,string> = { attendance:'Asistencia', presentation_controls:'Presentación', notifications:'Notificación' }
const actionLabels: Record<string,string> = { INSERT:'Creación', UPDATE:'Actualización', DELETE:'Eliminación' }

export default function AuditLog({ open, onClose, refreshKey = 0 }: Props) {
  const [logs,setLogs]=useState<AuditLogRecord[]>([])
  const [query,setQuery]=useState('')
  const [entity,setEntity]=useState('ALL')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  async function load(silent=false){if(!silent)setLoading(true);setError('');try{setLogs(await getAuditLogs(150))}catch(err){console.error(err);setError(err instanceof Error?err.message:'No se pudo cargar la auditoría.')}finally{if(!silent)setLoading(false)}}
  useEffect(()=>{if(open)void load()},[open])
  useEffect(()=>{if(open&&refreshKey>0)void load(true)},[refreshKey])
  const filtered=useMemo(()=>logs.filter((item)=>{if(entity!=='ALL'&&item.entityType!==entity)return false;const text=`${item.action} ${item.entityType} ${item.entityId??''} ${item.userId??''}`.toLowerCase();return text.includes(query.toLowerCase())}),[logs,query,entity])
  if(!open)return null
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm dark:bg-black/70 sm:p-6"><section className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"><header className="border-b border-slate-200 bg-white px-5 py-5 dark:border-slate-800 dark:bg-slate-900 sm:px-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-slate-400"><ShieldCheck size={15}/> Seguridad y trazabilidad</p><h2 className="mt-1 text-2xl font-black">Auditoría del sistema</h2><p className="mt-1 text-sm text-slate-500">Registro automático de cambios importantes realizados en PostgreSQL.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>void load()}><RefreshCw className="mr-2" size={16}/>Actualizar</Button><Button variant="ghost" onClick={onClose}><X size={20}/></Button></div></div></header><div className="p-5 sm:p-7"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute left-4 top-3.5 text-slate-400" size={19}/><Input className="pl-11" placeholder="Buscar acción, registro o usuario..." value={query} onChange={(e)=>setQuery(e.target.value)}/></div><select value={entity} onChange={(e)=>setEntity(e.target.value)} className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-900"><option value="ALL">Todas las entidades</option><option value="attendance">Asistencia</option><option value="presentation_controls">Presentación</option><option value="notifications">Notificaciones</option></select></div>{error&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div>}{loading&&<p className="mt-4 text-sm text-slate-500">Cargando movimientos...</p>}<div className="mt-5 space-y-2">{!loading&&filtered.length===0?<div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No hay movimientos para este filtro.</div>:filtered.map((item)=><Card key={item.id} className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800"><Activity size={18}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{actionLabels[item.action]??item.action}</span><b>{entityLabels[item.entityType]??item.entityType}</b><span className="text-xs text-slate-400">#{item.entityId??'—'}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('es-PE')} · Usuario {item.userId?item.userId.slice(0,8)+'…':'sistema'}</p></div></div></Card>)}</div></div></section></div>
}
