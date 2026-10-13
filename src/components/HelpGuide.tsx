import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen, CalendarCheck2, ChevronDown, Clock3, CloudOff, FileCheck2, Keyboard, LifeBuoy, MessageCircle, PlayCircle, Shirt, Smartphone, UserCheck, X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SHORTCUTS } from '@/lib/shortcuts'
import { startTour } from '@/components/OnboardingTour'

type Props = { open: boolean; onClose: () => void }

type Section = { id: string; icon: ReactNode; title: string; body: ReactNode }

const SECTIONS: Section[] = [
  {
    id: 'start', icon: <Smartphone size={18} />, title: '1. Antes de empezar',
    body: (
      <ul>
        <li>Entra con el correo y la contraseña que te dio el administrador. Si la olvidas, pídele que te genere una nueva.</li>
        <li><b>Instala la app en tu celular:</b> en Chrome, abre el menú (⋮) y elige <b>"Agregar a pantalla de inicio"</b> o <b>"Instalar app"</b>; en iPhone usa Compartir → <b>"Agregar a inicio"</b>.</li>
        <li>Al <b>mantener presionado</b> el ícono instalado aparecen accesos directos: <b>Modo rápido</b>, <b>Modo PDA</b> y <b>Resumen del día</b>.</li>
        <li>Elige tu aula en el selector <b>Aula</b>. La app la recuerda para la próxima vez.</li>
      </ul>
    ),
  },
  {
    id: 'mark', icon: <Clock3 size={18} />, title: '2. Marcar la entrada',
    body: (
      <ul>
        <li>Busca al alumno por <b>apellido, nombre o parte del DNI</b>. No importan las tildes ni pequeños errores.</li>
        <li>Toca <b>Entrada</b>. La app decide sola si llegó <b>a tiempo</b> o con <b>tardanza</b> según la hora límite del nivel.</li>
        <li>Suena y vibra distinto según el resultado. Si te equivocaste, pulsa <b>Deshacer</b> en el aviso (tienes 5 segundos).</li>
        <li>Para corregir después, usa <b>Editar ingreso</b> en la tarjeta del alumno: puedes cambiar la hora o borrar la marca.</li>
        <li>Los alumnos <b>inhabilitados</b> (retiro, suspensión…) aparecen en gris y no se pueden marcar.</li>
      </ul>
    ),
  },
  {
    id: 'quick', icon: <UserCheck size={18} />, title: '3. Hora de ingreso: Modo rápido',
    body: (
      <ul>
        <li>Pulsa <b>Modo rápido</b>: una lista grande pensada para marcar uno tras otro con el celular.</li>
        <li>El contador muestra cuántos ingresaron y cuántos faltan. El filtro <b>"Faltan por llegar"</b> los ordena por aula.</li>
        <li>Si entraron muchos a la vez sin marcar, usa <b>"Marcar el resto a tiempo"</b> y desmarca a quienes sepas que faltaron.</li>
      </ul>
    ),
  },
  {
    id: 'presentation', icon: <Shirt size={18} />, title: '4. Presentación y notificaciones',
    body: (
      <ul>
        <li>En la tarjeta del alumno, <b>Presentación</b> registra si está conforme o qué incumple (peinado, uniforme, prenda, conducta).</li>
        <li>Cada incumplimiento o tardanza genera una <b>notificación numerada</b>; a la tercera aparece en el <b>Centro de alertas</b>.</li>
        <li><b>Notificaciones</b> (menú) permite imprimir varias en una hoja.</li>
      </ul>
    ),
  },
  {
    id: 'justify', icon: <FileCheck2 size={18} />, title: '5. Justificaciones, permisos y salidas',
    body: (
      <ul>
        <li><b>Justificar</b> aparece en tardanzas y faltas: escribe el motivo y, si el administrador lo habilitó, adjunta una foto del documento.</li>
        <li><b>Permiso</b> registra con anticipación que el alumno no vendrá o llegará tarde, para que no cuente como falta.</li>
        <li><b>Salida anticipada</b>: elige quién recoge al alumno. Si la persona no está en la lista de autorizados, la app avisa.</li>
      </ul>
    ),
  },
  {
    id: 'close', icon: <CalendarCheck2 size={18} />, title: '6. Cerrar el día',
    body: (
      <ul>
        <li>Al terminar el ingreso, abre <b>Resumen / cierre</b> y pulsa <b>Cerrar día</b>: quien no marcó queda con <b>falta</b>.</li>
        <li>Si un alumno llega después del cierre, márcalo normal: su falta se borra sola.</li>
        <li>En días feriados o sin clases (calendario escolar) no se generan faltas.</li>
      </ul>
    ),
  },
  {
    id: 'whatsapp', icon: <MessageCircle size={18} />, title: '7. Avisar a los apoderados',
    body: (
      <ul>
        <li><b>WhatsApp en lote</b> arma todos los avisos pendientes del día. Toca <b>Enviar</b>, vuelve a la app y pasa al <b>siguiente</b>.</li>
        <li>Los apoderados sin número válido aparecen marcados para que el administrador los corrija.</li>
      </ul>
    ),
  },
  {
    id: 'offline', icon: <CloudOff size={18} />, title: '8. Sin Internet',
    body: (
      <ul>
        <li>Puedes <b>seguir marcando</b>. Los cambios se guardan en el celular y se envían solos al volver la señal.</li>
        <li>El botón de arriba (nube) muestra cuántos cambios están <b>pendientes</b>. Tócalo para ver el <b>panel de sincronización</b>: qué falta enviar, qué falló y por qué.</li>
        <li><b>No cierres sesión ni borres los datos del navegador</b> mientras haya pendientes: se perderían.</li>
        <li>Si dos auxiliares marcan al mismo alumno sin señal, la app se queda con la <b>hora más temprana</b> y te lo muestra en el panel.</li>
      </ul>
    ),
  },
  {
    id: 'errors', icon: <LifeBuoy size={18} />, title: '9. Si algo falla',
    body: (
      <ul>
        <li>Lee el mensaje rojo: dice qué pasó y qué hacer (revisar la señal, volver a iniciar sesión, pedir permiso al administrador…).</li>
        <li>Los errores quedan registrados automáticamente para el administrador, pero si algo te impide trabajar, avísale de inmediato.</li>
        <li>Si la pantalla se queda en blanco, pulsa <b>Recargar</b> o cierra y abre la app: lo marcado no se pierde.</li>
      </ul>
    ),
  },
]

export default function HelpGuide({ open, onClose }: Props) {
  const [openSection, setOpenSection] = useState<string | null>('start')

  function runTour() {
    onClose()
    window.setTimeout(startTour, 250)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div data-screen-overlay className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.section data-screen role="dialog" aria-modal="true" aria-labelledby="help-title" className="mx-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onMouseDown={(e) => e.stopPropagation()} initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400"><BookOpen size={15} /> Para auxiliares</p>
                <h2 id="help-title" className="mt-1 text-2xl font-black">Guía de uso</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Todo lo necesario para el trabajo diario, en 5 minutos.</p>
              </div>
              <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={20} /></Button>
            </header>

            <div className="space-y-2 p-5">
              <Button variant="outline" className="mb-2 w-full justify-start" onClick={runTour}>
                <PlayCircle className="mr-2" size={18} /> Ver el recorrido guiado por la pantalla
              </Button>

              {SECTIONS.map((section) => {
                const expanded = openSection === section.id
                return (
                  <div key={section.id} className="rounded-2xl border border-slate-200 dark:border-slate-800">
                    <button type="button" className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={expanded} onClick={() => setOpenSection(expanded ? null : section.id)}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{section.icon}</span>
                      <span className="flex-1 font-bold">{section.title}</span>
                      <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} size={18} />
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 text-sm leading-6 text-slate-700 dark:text-slate-300 [&_li]:ml-5 [&_li]:list-disc [&_li+li]:mt-1.5">
                        {section.body}
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800">
                <button type="button" className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={openSection === 'keys'} onClick={() => setOpenSection(openSection === 'keys' ? null : 'keys')}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Keyboard size={18} /></span>
                  <span className="flex-1 font-bold">10. Atajos de teclado (PC)</span>
                  <ChevronDown className={`shrink-0 text-slate-400 transition-transform ${openSection === 'keys' ? 'rotate-180' : ''}`} size={18} />
                </button>
                {openSection === 'keys' && (
                  <table className="mx-4 mb-4 w-[calc(100%-2rem)] text-sm">
                    <tbody>
                      {SHORTCUTS.map((item) => (
                        <tr key={item.keys.join('+')} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3 align-top">{item.keys.map((key) => <kbd key={key} className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">{key}</kbd>)}</td>
                          <td className="py-2">{item.description}<span className="block text-xs text-slate-500 dark:text-slate-400">{item.where}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
