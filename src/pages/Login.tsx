import { useState } from 'react'
import { GraduationCap, LockKeyhole, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'

type Props = { onLogin: (name: string) => void }

export default function Login({ onLogin }: Props) {
  const [user, setUser] = useState('auxiliar')
  const [password, setPassword] = useState('123456')

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-950 sm:grid sm:place-items-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-white/10"><GraduationCap size={34} /></div>
          <h1 className="text-3xl font-black tracking-tight">Tesla Control Escolar</h1>
          <p className="mt-2 text-sm text-slate-300">Fase 2 · Puntualidad y tardanzas</p>
        </div>
        <Card className="p-6 sm:p-8">
          <div className="space-y-4">
            <label className="block text-sm font-semibold">Usuario</label>
            <div className="relative"><UserRound className="absolute left-4 top-3.5 text-slate-400" size={20}/><Input className="pl-12" value={user} onChange={(e) => setUser(e.target.value)} /></div>
            <label className="block text-sm font-semibold">Contraseña</label>
            <div className="relative"><LockKeyhole className="absolute left-4 top-3.5 text-slate-400" size={20}/><Input className="pl-12" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button className="mt-2 w-full" disabled={!user || !password} onClick={() => onLogin(user)}>Ingresar</Button>
            <p className="text-center text-xs text-slate-400">Demo: auxiliar / 123456</p>
          </div>
        </Card>
      </div>
    </main>
  )
}
