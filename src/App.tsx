import { useCallback, useEffect, useRef, useState } from 'react'
import Login from '@/pages/Login'
import Attendance from '@/pages/Attendance'
import { getPreferences } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { cleanSingleLine, reportError, safeUserMessage } from '@/lib/security'
import { clearCachedSnapshots } from '@/lib/offlineDb'
import { getClassrooms } from '@/services/schoolService'
import type { Classroom } from '@/types'
import { ToastProvider } from '@/lib/toast'
import { OnboardingTour, type TourStep } from '@/components/OnboardingTour'

// Recorrido para auxiliares nuevos: sigue el orden de un día normal de trabajo.
const TOUR_STEPS: TourStep[] = [
  { target: '[data-tour="classroom"]', title: '1. Elige tu aula', description: 'La lista muestra solo los alumnos del aula elegida. La app la recuerda para la próxima vez.' },
  { target: '[data-tour="search"]', title: '2. Busca al alumno', description: 'Escribe apellido, nombre o parte del DNI; no importan las tildes. En PC, Enter marca la entrada si queda un solo alumno.' },
  { target: '[data-tour="student-card"]', title: '3. Marca con un toque', description: 'Pulsa "Entrada": la app decide si llegó a tiempo o tarde. Si te equivocas, pulsa "Deshacer" en el aviso (5 segundos).' },
  { target: '[data-tour="quick"]', title: '4. Hora de ingreso', description: 'El Modo rápido es una lista grande para marcar uno tras otro desde el celular, con el contador de quiénes faltan.' },
  { target: '[data-tour="summary"]', title: '5. Al terminar', description: 'En "Resumen / cierre" pulsa "Cerrar día": quien no marcó queda con falta. Si llega después, su falta se borra sola.' },
  { target: '[data-tour="whatsapp"]', title: '6. Avisar a los apoderados', description: 'Arma todos los WhatsApp del día. Envías uno, vuelves y pasas al siguiente.' },
  { target: '[data-tour="sync"]', title: '7. Sin Internet', description: 'Puedes seguir marcando. Aquí ves cuántos cambios faltan enviar; tócalo para ver el detalle. No cierres sesión con pendientes.' },
  { target: '[data-tour="help"]', title: '8. ¿Dudas?', description: 'La Guía de uso explica todo paso a paso y tiene los atajos de teclado. Puedes repetir este recorrido desde ahí.' },
]

/** Módulo pedido por un acceso directo de la app instalada (manifest "shortcuts": /?open=quick). */
export type StartModule = 'quick' | 'pda' | 'summary' | 'whatsapp' | null

function readStartModule(): StartModule {
  try {
    const value = new URLSearchParams(window.location.search).get('open')
    if (value === 'quick' || value === 'pda' || value === 'summary' || value === 'whatsapp') {
      // Se limpia la URL para que recargar no vuelva a abrir el módulo.
      window.history.replaceState(null, '', window.location.pathname)
      return value
    }
  } catch { /* URL inválida: se abre la vista normal */ }
  return null
}

type CachedProfile = { full_name: string; role: string }
const PROFILE_CACHE_KEY = 'tesla_cached_profile'

function readCachedProfile(): CachedProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedProfile>
    if (typeof parsed.full_name !== 'string' || typeof parsed.role !== 'string') return null
    return { full_name: cleanSingleLine(parsed.full_name, 120), role: cleanSingleLine(parsed.role, 60) }
  } catch {
    return null
  }
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [appError, setAppError] = useState('')
  const loadedUserId = useRef<string | null>(null)
  const [startModule] = useState<StartModule>(readStartModule)

  const clearSessionUi = useCallback(() => {
    loadedUserId.current = null
    localStorage.removeItem(PROFILE_CACHE_KEY)
    setUserName('')
    setUserRole('')
    setClassrooms([])
    setClassroom(null)
  }, [])

  const loadAuthenticatedWorkspace = useCallback(async (showBoot = false) => {
    if (showBoot) setBooting(true)
    setAppError('')
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.user) {
        clearSessionUi()
        return
      }

      const classroomData = await getClassrooms()
      if (!classroomData.length) throw new Error('No hay aulas disponibles.')

      let profile: CachedProfile | null = null
      const result = await supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single()
      if (!result.error && result.data) {
        profile = {
          full_name: cleanSingleLine(result.data.full_name, 120),
          role: cleanSingleLine(result.data.role, 60),
        }
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
      } else {
        profile = readCachedProfile()
        if (!profile) throw result.error ?? new Error('No se pudo cargar el perfil.')
      }

      loadedUserId.current = session.user.id
      setUserName(profile.full_name)
      setUserRole(profile.role)
      setClassrooms(classroomData)

      setClassroom((current) => {
        if (current && classroomData.some((item) => item.id === current.id)) return current
        const prefs = getPreferences()
        const remembered = prefs.rememberClassroom && prefs.lastClassroomId
          ? classroomData.find((item) => item.id === prefs.lastClassroomId)
          : undefined
        return remembered ?? classroomData[0]
      })
    } catch (error) {
      reportError('workspace-load', error)
      setAppError(safeUserMessage(error, 'No se pudo iniciar el sistema.'))
    } finally {
      if (showBoot) setBooting(false)
    }
  }, [clearSessionUi])

  useEffect(() => {
    void loadAuthenticatedWorkspace(true)

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        void clearCachedSnapshots().catch((error) => reportError('clear-offline-cache', error))
        clearSessionUi()
        setBooting(false)
        return
      }

      // TOKEN_REFRESHED y los cambios de visibilidad no desmontan Attendance.
      // Solo cargamos el workspace si realmente es otro inicio de sesión/usuario.
      if (event === 'SIGNED_IN' && loadedUserId.current !== session.user.id) {
        void loadAuthenticatedWorkspace(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [clearSessionUi, loadAuthenticatedWorkspace])

  async function logout() {
    try {
      await supabase.auth.signOut()
    } finally {
      await clearCachedSnapshots().catch((error) => reportError('clear-offline-cache', error))
      clearSessionUi()
    }
  }

  if (booting) {
    // Mismo aspecto que la pantalla de carga de index.html: al montar React no hay salto visual.
    return (
      <main role="status" aria-label="Cargando Tesla Control Escolar" className="fixed inset-0 grid place-content-center justify-items-center gap-[18px] bg-slate-950 text-white">
        <img src="/icons/icon-192.png" alt="" width={96} height={96} className="h-24 w-24 rounded-3xl" />
        <p className="text-[13px] font-extrabold uppercase tracking-[.2em] text-slate-400">Tesla Control Escolar</p>
        <div className="relative h-[3px] w-[120px] overflow-hidden rounded-full bg-slate-800"><div className="absolute inset-y-0 left-0 w-[45%] rounded-full bg-amber-400" style={{ animation: 'boot-bar 1.1s ease-in-out infinite' }} /></div>
      </main>
    )
  }

  if (!userName || !classroom) {
    return (
      <ToastProvider>
        <Login onLogin={() => void loadAuthenticatedWorkspace(false)} externalError={appError} />
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
      <Attendance
        userName={userName}
        userRole={userRole}
        classrooms={classrooms}
        classroom={classroom}
        onClassroomChange={setClassroom}
        onLogout={() => void logout()}
        startModule={startModule}
      />
      <OnboardingTour steps={TOUR_STEPS} />
    </ToastProvider>
  )
}
