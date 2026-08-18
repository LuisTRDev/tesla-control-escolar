import { useCallback, useEffect, useState } from 'react'
import Login from '@/pages/Login'
import Attendance from '@/pages/Attendance'
import { getPreferences } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { getClassrooms } from '@/services/schoolService'
import type { Classroom } from '@/types'

export default function App() {
  const [booting, setBooting] = useState(true)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [appError, setAppError] = useState('')

  const loadSession = useCallback(async () => {
    setBooting(true)
    setAppError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setUserName('')
        setUserRole('')
        setClassrooms([])
        setClassroom(null)
        return
      }

      const classroomData = await getClassrooms()
      if (!classroomData.length) throw new Error('No hay aulas disponibles en Supabase ni en la caché local.')

      let profile: { full_name: string; role: string } | null = null
      try {
        const result = await supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single()
        if (result.error) throw result.error
        profile = result.data
        localStorage.setItem('tesla_cached_profile', JSON.stringify(profile))
      } catch (profileError) {
        const cached = localStorage.getItem('tesla_cached_profile')
        if (cached) profile = JSON.parse(cached) as { full_name: string; role: string }
        else throw profileError
      }

      if (!profile) throw new Error('No se pudo recuperar el perfil del usuario.')
      setUserName(profile.full_name)
      setUserRole(profile.role)
      setClassrooms(classroomData)

      const prefs = getPreferences()
      const remembered = prefs.rememberClassroom && prefs.lastClassroomId
        ? classroomData.find((item) => item.id === prefs.lastClassroomId)
        : undefined
      setClassroom(remembered ?? classroomData[0])
    } catch (error) {
      console.error(error)
      setAppError(error instanceof Error ? error.message : 'No se pudo iniciar el sistema.')
    } finally {
      setBooting(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void loadSession() })
    return () => listener.subscription.unsubscribe()
  }, [loadSession])

  async function logout() {
    await supabase.auth.signOut()
    setUserName('')
    setUserRole('')
    setClassroom(null)
    setClassrooms([])
  }

  if (booting) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><p className="text-sm font-bold uppercase tracking-widest text-slate-400">Tesla</p><h1 className="mt-2 text-2xl font-black">Conectando con Supabase...</h1></div></main>
  }

  if (!userName || !classroom) {
    return <Login onLogin={() => void loadSession()} externalError={appError} />
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
