import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'

type Props = { onLogin: () => void; externalError?: string }

export default function Login({ onLogin, externalError = '' }: Props) {
  const [email, setEmail] = useState('auxiliar@tesla.test')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogin() {
    if (!email || !password || loading) return
    setLoading(true); setErrorMessage('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) { setErrorMessage(error?.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : (error?.message ?? 'No se pudo iniciar sesión.')); return }
      onLogin()
    } catch (error) {
      console.error(error); setErrorMessage('Ocurrió un error al iniciar sesión.')
    } finally { setLoading(false) }
  }

  const displayedError = errorMessage || externalError
  return <main className="relative min-h-screen overflow-hidden bg-[#020817] px-5 py-8 text-slate-950">
    <div className="pointer-events-none absolute inset-0"><div className="absolute -left-24 -top-20 h-80 w-80 rounded-full bg-blue-800/20 blur-3xl"/><div className="absolute -bottom-24 -right-20 h-96 w-96 rounded-full bg-blue-700/20 blur-3xl"/><div className="absolute left-[-120px] top-16 h-[2px] w-[520px] rotate-[-20deg] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80"/><div className="absolute bottom-20 right-[-140px] h-[2px] w-[520px] rotate-[-20deg] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80"/><div className="absolute right-8 top-24 select-none text-[260px] font-black leading-none text-blue-500/[0.035]">N</div></div>
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
      <div className="mb-7 text-center"><div className="mx-auto mb-5 w-fit rounded-3xl bg-white p-2 shadow-2xl"><img src="/images/logo-nikola-tesla.png" alt="IEPr Nikola Tesla" className="h-32 w-auto object-contain sm:h-36"/></div><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Tesla Control Escolar</h1><p className="mt-2 text-sm font-semibold tracking-wide text-slate-400">IEPr “Nikola Tesla”</p><div className="mt-4 flex items-center justify-center gap-4"><div className="h-px w-20 bg-gradient-to-r from-transparent to-blue-500"/><span className="text-xs font-semibold text-slate-500">v0.6</span><div className="h-px w-20 bg-gradient-to-l from-transparent to-blue-500"/></div></div>
      <Card className="rounded-[28px] border border-white/10 bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8"><div className="space-y-5"><div><label className="mb-2 block text-sm font-bold text-slate-900">Correo</label><div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/><Input className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-[15px]" type="email" value={email} onChange={(e)=>{setEmail(e.target.value);setErrorMessage('')}} autoComplete="email"/></div></div><div><label className="mb-2 block text-sm font-bold text-slate-900">Contraseña</label><div className="relative"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/><Input className="h-14 rounded-2xl border-slate-200 bg-white pl-12 pr-12 text-[15px]" type={showPassword?'text':'password'} value={password} onChange={(e)=>{setPassword(e.target.value);setErrorMessage('')}} onKeyDown={(e)=>{if(e.key==='Enter')void handleLogin()}} autoComplete="current-password"/><button type="button" onClick={()=>setShowPassword((v)=>!v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700" aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'}>{showPassword?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>{displayedError&&<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{displayedError}</div>}<Button className="h-14 w-full rounded-2xl bg-gradient-to-r from-blue-700 to-blue-600 text-base font-bold text-white shadow-lg shadow-blue-900/20 hover:from-blue-600 hover:to-blue-500" disabled={!email||!password||loading} onClick={()=>void handleLogin()}>{loading?'Ingresando...':<span className="flex items-center justify-center gap-2">Ingresar <span aria-hidden>→</span></span>}</Button></div></Card>
      <div className="mt-8 flex items-center justify-center gap-4"><div className="h-px flex-1 bg-gradient-to-r from-transparent to-blue-500/60"/><p className="whitespace-nowrap text-[10px] font-bold tracking-[0.35em] text-slate-500 sm:text-xs">PASIÓN POR EDUCAR</p><div className="h-px flex-1 bg-gradient-to-l from-transparent to-blue-500/60"/></div>
    </div>
  </main>
}
