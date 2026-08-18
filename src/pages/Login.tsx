import { useState } from 'react'
import { GraduationCap, LockKeyhole, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'

type Props = { onLogin: () => void; externalError?: string }

export default function Login({ onLogin, externalError = '' }: Props) {
  const [email, setEmail] = useState('auxiliar@nikolatesla.test')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setErrorMessage('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      setErrorMessage(error?.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : (error?.message ?? 'No se pudo iniciar sesión.'))
      setLoading(false)
      return
    }
    onLogin()
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-950 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-white/10"><GraduationCap size={34} /></div>
          <h1 className="text-3xl font-black tracking-tight">Tesla Control Escolar</h1>
          <p className="mt-2 text-sm text-slate-300">v1.0</p>
        </div>
        <Card className="p-6 sm:p-8">
          <div className="space-y-4">
            <div><label className="mb-2 block text-sm font-semibold">Correo</label><div className="relative"><Mail className="absolute left-4 top-3.5 text-slate-400" size={20}/><Input className="pl-12" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></div></div>
            <div><label className="mb-2 block text-sm font-semibold">Contraseña</label><div className="relative"><LockKeyhole className="absolute left-4 top-3.5 text-slate-400" size={20}/><Input className="pl-12" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')void handleLogin()}} /></div></div>
            {(errorMessage || externalError) && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{errorMessage || externalError}</div>}
            <Button className="mt-2 w-full" disabled={!email || !password || loading} onClick={() => void handleLogin()}>{loading ? 'Ingresando...' : 'Ingresar'}</Button>
          </div>
        </Card>
      </div>
    </main>
  )
}
