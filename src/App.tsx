import { useState } from 'react'
import Login from '@/pages/Login'
import Attendance from '@/pages/Attendance'
import { classrooms } from '@/data/classrooms'
import { getPreferences } from '@/lib/storage'
import type { Classroom } from '@/types'

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [classroom, setClassroom] = useState<Classroom>(() => {
    const prefs = getPreferences()
    const remembered = prefs.rememberClassroom && prefs.lastClassroomId
      ? classrooms.find((item) => item.id === prefs.lastClassroomId)
      : undefined
    return remembered ?? classrooms.find((item) => item.id === 'p6a') ?? classrooms[0]
  })

  if (!isLoggedIn) {
    return <Login onLogin={(name) => { setUserName(name); setIsLoggedIn(true) }} />
  }

  return (
    <Attendance
      userName={userName}
      classroom={classroom}
      onClassroomChange={setClassroom}
      onLogout={() => { setIsLoggedIn(false); setUserName('') }}
    />
  )
}
