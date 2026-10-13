import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BatteryLow, Monitor, Moon, RotateCcw, Sun, Vibrate, Volume2, X } from 'lucide-react'
import { resetTour } from '@/components/OnboardingTour'
import { Button } from '@/components/ui/Button'
import { resetPreferences, type UserPreferences } from '@/lib/storage'
import type { ToleranceSettings } from '@/services/schoolService'
import type { Classroom } from '@/types'

type Props = {
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  entryLimit: string
  toleranceSettings: ToleranceSettings
  updateTolerance: (next: ToleranceSettings) => void | Promise<void>
  preferences: UserPreferences
  setPreferences: (next: UserPreferences) => void
  updatePreferences: (next: UserPreferences) => void
  classroom: Classroom
  /** Secciones adicionales (horario por nivel y calendario, Fase 14). */
  extraSections?: ReactNode
}

export default function SettingsPanel({ settingsOpen, setSettingsOpen, entryLimit, toleranceSettings, updateTolerance, preferences, setPreferences, updatePreferences, classroom, extraSections }: Props) {
  return (
    <AnimatePresence>{settingsOpen && (
      <motion.div
        className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[1px] dark:bg-black/55"
        onMouseDown={() => setSettingsOpen(false)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.aside
          className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 text-slate-950 shadow-2xl transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          onMouseDown={(event) => event.stopPropagation()}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Preferencias</p>
              <h2 className="text-2xl font-black">Configuración</h2>
            </div>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)} aria-label="Cerrar"><X size={20} /></Button>
          </div>

          <div className="mt-8 space-y-8">
            <section>
              <h3 className="font-black">Apariencia</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Elige cómo quieres ver el sistema.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { id: 'light' as const, label: 'Claro', icon: Sun },
                  { id: 'dark' as const, label: 'Oscuro', icon: Moon },
                  { id: 'system' as const, label: 'Sistema', icon: Monitor },
                ].map((option) => {
                  const Icon = option.icon
                  return (
                    <Button
                      key={option.id}
                      variant={preferences.theme === option.id ? 'default' : 'outline'}
                      onClick={() => updatePreferences({ ...preferences, theme: option.id })}
                    >
                      <Icon className="mr-2" size={16} />{option.label}
                    </Button>
                  )
                })}
              </div>
            </section>

            <section>
              <h3 className="font-black">Asistencia</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Tolerancia sobre la hora límite (configurada en la vista de Asistencia: {entryLimit}).
              </p>

              <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                <span>
                  <b className="block">Tolerancia de ingreso</b>
                  <small className="text-slate-500 dark:text-slate-400">
                    No marcar tardanza dentro de los primeros minutos después de la hora límite
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={toleranceSettings.enabled}
                  onChange={(e) => updateTolerance({ ...toleranceSettings, enabled: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>

              {toleranceSettings.enabled && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                  <span className="text-sm font-semibold">Minutos de tolerancia</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={toleranceSettings.minutes}
                    onChange={(e) => {
                      const minutes = Math.max(0, Math.min(60, Number(e.target.value) || 0))
                      updateTolerance({ ...toleranceSettings, minutes })
                    }}
                    className="ml-auto h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm font-bold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">min</span>
                </div>
              )}

              {toleranceSettings.enabled && toleranceSettings.minutes > 0 && (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                  Con esta configuración, un alumno que ingrese hasta las {(() => {
                    const [h, m] = entryLimit.split(':').map(Number)
                    const total = Math.min(23 * 60 + 59, h * 60 + m + toleranceSettings.minutes)
                    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
                  })()} no contará como tardanza.
                </p>
              )}
            </section>

            {extraSections}

            <section>
              <h3 className="font-black">Interfaz</h3>
              <label className="mt-3 block text-sm font-semibold">Tamaño de interfaz</label>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-800"
                value={preferences.interfaceSize}
                onChange={(e) => updatePreferences({ ...preferences, interfaceSize: e.target.value as 'normal' | 'large' })}
              >
                <option value="normal">Normal</option>
                <option value="large">Grande</option>
              </select>
              <label className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                <span className="flex items-center gap-3">
                  <Volume2 size={19} />
                  <span>
                    <b className="block">Sonido al registrar</b>
                    <small className="text-slate-500 dark:text-slate-400">Un tono si llega a tiempo, dos si es tardanza, grave si hay un problema</small>
                  </span>
                </span>
                <input type="checkbox" checked={preferences.soundEnabled} onChange={(e) => updatePreferences({ ...preferences, soundEnabled: e.target.checked })} className="h-5 w-5" />
              </label>
              <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                <span className="flex items-center gap-3">
                  <Vibrate size={19} />
                  <span>
                    <b className="block">Vibración al registrar</b>
                    <small className="text-slate-500 dark:text-slate-400">Corta si llega a tiempo, doble si es tardanza, larga si hay un problema (solo celulares Android)</small>
                  </span>
                </span>
                <input type="checkbox" checked={preferences.vibrationEnabled} onChange={(e) => updatePreferences({ ...preferences, vibrationEnabled: e.target.checked })} className="h-5 w-5" />
              </label>
              <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                <span className="flex items-center gap-3">
                  <BatteryLow size={19} />
                  <span>
                    <b className="block">Modo bajo consumo</b>
                    <small className="text-slate-500 dark:text-slate-400">Quita animaciones y efectos para celulares de gama baja</small>
                  </span>
                </span>
                <input type="checkbox" checked={preferences.lowPowerMode} onChange={(e) => updatePreferences({ ...preferences, lowPowerMode: e.target.checked })} className="h-5 w-5" />
              </label>
            </section>

            <section>
              <h3 className="font-black">Aula</h3>
              <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors dark:border-slate-700 dark:bg-slate-950/60">
                <span>
                  <b className="block">Recordar última aula</b>
                  <small className="text-slate-500 dark:text-slate-400">Abrir la próxima vez en el aula utilizada</small>
                </span>
                <input
                  type="checkbox"
                  checked={preferences.rememberClassroom}
                  onChange={(e) => updatePreferences({
                    ...preferences,
                    rememberClassroom: e.target.checked,
                    lastClassroomId: e.target.checked ? classroom.id : null,
                  })}
                  className="h-5 w-5"
                />
              </label>
            </section>

            <Button variant="outline" className="w-full" onClick={() => { resetTour(); window.location.reload() }}>
              Ver el recorrido guiado de nuevo
            </Button>

            <Button variant="outline" className="w-full" onClick={() => { const next = resetPreferences(); setPreferences(next) }}>
              <RotateCcw className="mr-2" size={17} /> Restablecer preferencias
            </Button>
          </div>
        </motion.aside>
      </motion.div>
    )}</AnimatePresence>
  )
}
