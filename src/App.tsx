import { useCallback, useEffect, useRef, useState } from 'react'
import Login from '@/pages/Login'
import Attendance from '@/pages/Attendance'
import { getPreferences } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { cleanSingleLine, reportError, safeUserMessage } from '@/lib/security'
import { clearCachedSnapshots } from '@/lib/offlineDb'
import { getClassrooms } from '@/services/schoolService'
import type { Classroom } from '@/types'

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
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><p className="text-sm font-bold uppercase tracking-widest text-slate-400">Tesla</p><h1 className="mt-2 text-2xl font-black">Cargando...</h1></div></main>
  }

  if (!userName || !classroom) {
    return <Login onLogin={() => void loadAuthenticatedWorkspace(false)} externalError={appError} />
  }

  return (
    <Attendance
      userName={userName}
      userRole={userRole}
      classrooms={classrooms}
      classroom={classroom}
      onClassroomChange={setClassroom}
      onLogout={() => void logout()}
    />
  )
}
