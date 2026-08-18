import { useState } from 'react'
import { DatabaseBackup, Download, HardDrive, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { exportOfflineState } from '@/lib/offlineDb'

type Props = { open: boolean; onClose: () => void; online: boolean }

const TABLES = ['classrooms','students','guardians','attendance','presentation_controls','presentation_violations','notifications','alerts','attendance_closures'] as const

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url)
}

export default function BackupCenter({ open, onClose, online }: Props) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  if (!open) return null

  async function exportCloudBackup() {
    if (!online) { setMessage('Necesitas conexión para descargar una copia de Supabase.'); return }
    setLoading(true); setMessage('')
    try {
      const backup: Record<string, unknown> = { generatedAt: new Date().toISOString(), version: '0.7.0' }
      for (const table of TABLES) {
        const { data, error } = await supabase.from(table).select('*')
        if (error) throw error
        backup[table] = data ?? []
      }
      downloadJson(backup, `tesla-backup-${new Date().toISOString().slice(0,10)}.json`)
      setMessage('Copia lógica descargada correctamente.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo generar la copia.') }
    finally { setLoading(false) }
  }

  async function exportLocalBackup() {
    const state = await exportOfflineState()
    downloadJson({ generatedAt:new Date().toISOString(), ...state }, `tesla-offline-${new Date().toISOString().slice(0,10)}.json`)
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900" onMouseDown={(e)=>e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Fase 7</p><h2 className="mt-1 flex items-center gap-2 text-2xl font-black"><DatabaseBackup size={23}/> Backups</h2><p className="mt-1 text-sm text-slate-500">Copia lógica manual para contingencia. No sustituye los backups administrados de PostgreSQL/Supabase.</p></div><Button variant="ghost" onClick={onClose}><X size={20}/></Button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button onClick={()=>void exportCloudBackup()} disabled={loading||!online} className="rounded-2xl border border-slate-200 p-5 text-left hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"><Download size={22}/><p className="mt-3 font-black">Copia de Supabase</p><p className="mt-1 text-xs text-slate-500">Exporta las tablas operativas a un JSON descargable.</p></button>
        <button onClick={()=>void exportLocalBackup()} className="rounded-2xl border border-slate-200 p-5 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><HardDrive size={22}/><p className="mt-3 font-black">Estado offline</p><p className="mt-1 text-xs text-slate-500">Exporta cola pendiente y metadatos locales del dispositivo.</p></button>
      </div>
      {message && <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold dark:bg-slate-800">{message}</div>}
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"><strong>Política recomendada:</strong> mantener backups automáticos del proveedor cuando estén disponibles y descargar una copia lógica antes de migraciones importantes.</div>
    </section>
  </div>
}
