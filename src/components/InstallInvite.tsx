import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MoreVertical, Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useMobileLayout } from '@/hooks/useMobileLayout'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { detectInstallPlatform, inviteAllowed, nextInviteMemory, readInviteMemory, saveInviteMemory } from '@/lib/installPrompt'

/** Segundos de uso antes de invitar: nunca interrumpe el inicio de sesión ni la primera marcación. */
const SHOW_AFTER_MS = 25_000

/**
 * Invitación a instalar la app en el celular: con el botón del sistema cuando el navegador lo
 * permite y, si no, con los pasos manuales de su navegador. Si el usuario dice "Ahora no" no
 * vuelve a molestar por 7 días y, la segunda vez, por 90.
 */
export default function InstallInvite() {
  const mobile = useMobileLayout()
  const { installAvailable, installed, install } = usePwaInstall()
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (installed || !mobile) return
    const timer = window.setTimeout(() => setReady(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [installed, mobile])

  const platform = detectInstallPlatform(navigator.userAgent, installAvailable, navigator.maxTouchPoints)

  // La invitación se decide una sola vez por sesión, para que no aparezca y desaparezca sola.
  useEffect(() => {
    if (ready && !installed && platform !== 'none' && inviteAllowed(readInviteMemory(), Date.now())) setOpen(true)
  }, [ready, installed, platform])

  useEffect(() => { if (installed) setOpen(false) }, [installed])

  function dismiss() {
    saveInviteMemory(nextInviteMemory(readInviteMemory(), Date.now()))
    setOpen(false)
  }

  async function accept() {
    const accepted = await install()
    if (accepted) setOpen(false)
    else dismiss()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label="Instalar la app"
          className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-slate-950 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        >
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950"><Smartphone size={22} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-black">Instala Tesla Escolar</p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">Se abre más rápido, a pantalla completa y sigue funcionando sin señal.</p>
            </div>
            <button type="button" onClick={dismiss} aria-label="Cerrar" className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X size={18} /></button>
          </div>

          {platform === 'ios' && (
            <ol className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <li className="flex items-center gap-2">1. Toca <Share size={16} className="shrink-0" aria-label="Compartir" /> <b>Compartir</b> en la barra del navegador.</li>
              <li>2. Elige <b>Añadir a pantalla de inicio</b>.</li>
            </ol>
          )}
          {platform === 'android-menu' && (
            <ol className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <li className="flex items-center gap-2">1. Abre el menú <MoreVertical size={16} className="shrink-0" aria-label="Menú" /> del navegador.</li>
              <li>2. Elige <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li>
            </ol>
          )}

          <div className="mt-3 flex gap-2">
            {platform === 'prompt' && <Button className="flex-1" onClick={() => void accept()}>Instalar</Button>}
            <Button variant="ghost" className={platform === 'prompt' ? '' : 'flex-1'} onClick={dismiss}>{platform === 'prompt' ? 'Ahora no' : 'Entendido'}</Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
