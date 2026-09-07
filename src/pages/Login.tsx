import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { supabase, getRememberSession, setRememberSession } from '@/lib/supabase'
import { reportError } from '@/lib/security'

type Props = { onLogin: () => void; externalError?: string }

export default function Login({ onLogin, externalError = '' }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [rememberSession, setRememberSessionState] = useState(getRememberSession())

  async function handleLogin() {
    if (!email || !password || loading) return
    setLoading(true); setErrorMessage('')
    try {
      setRememberSession(rememberSession)
      const normalizedEmail = email.trim().toLowerCase().slice(0, 254)
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error || !data.user) { setErrorMessage(error?.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : (error?.message ?? 'No se pudo iniciar sesión.')); return }
      onLogin()
    } catch (error) {
      reportError('login', error); setErrorMessage('Ocurrió un error al iniciar sesión.')
    } finally { setLoading(false) }
  }

  const displayedError = errorMessage || externalError
  return <main className="relative min-h-screen overflow-hidden bg-[#020817] px-5 py-8 text-slate-950">
    <div className="pointer-events-none absolute inset-0"><div className="absolute -left-24 -top-20 h-80 w-80 rounded-full bg-brand-navy/20 blur-3xl"/><div className="absolute -bottom-24 -right-20 h-96 w-96 rounded-full bg-brand-navy/20 blur-3xl"/><div className="absolute left-[-120px] top-16 h-[2px] w-[520px] rotate-[-20deg] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80"/><div className="absolute bottom-20 right-[-140px] h-[2px] w-[520px] rotate-[-20deg] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80"/><div className="absolute right-8 top-24 select-none text-[260px] font-black leading-none text-brand-gold/[0.035]">N</div></div>
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
      <div className="mb-7 text-center">
        <motion.div
          className="relative mx-auto mb-5 w-fit rounded-3xl bg-white p-2 shadow-2xl"
          initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.05 }}
        >
          <motion.span
            className="absolute inset-0 -z-10 rounded-3xl bg-brand-gold/40 blur-xl"
            animate={{ opacity: [0.5, 0.9, 0.5], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <img src="/images/logo-nikola-tesla.png" alt="IEPr Nikola Tesla" className="h-32 w-auto object-contain sm:h-36"/>
        </motion.div>
        <motion.h1
          className="text-3xl font-black tracking-tight text-white sm:text-4xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          Tesla Control Escolar
        </motion.h1>
        <motion.p
          className="mt-2 text-sm font-semibold tracking-wide text-slate-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          IEPr “Nikola Tesla”
        </motion.p>
        <div className="mt-4 flex items-center justify-center gap-4"><div className="h-px w-20 bg-gradient-to-r from-transparent to-brand-gold"/><span className="text-xs font-semibold text-slate-500">v0.7</span><div className="h-px w-20 bg-gradient-to-l from-transparent to-brand-gold"/></div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.2, 0.8, 0.25, 1] }}
      >
      <Card className="rounded-[28px] border border-white/10 bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8"><div className="space-y-5"><div><label className="mb-2 block text-sm font-bold text-slate-900">Correo</label><div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/><Input className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-[15px]" type="email" maxLength={254} value={email} onChange={(e)=>{setEmail(e.target.value);setErrorMessage('')}} autoComplete="email"/></div></div><div><label className="mb-2 block text-sm font-bold text-slate-900">Contraseña</label><div className="relative"><LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/><Input className="h-14 rounded-2xl border-slate-200 bg-white pl-12 pr-12 text-[15px]" type={showPassword?'text':'password'} maxLength={256} value={password} onChange={(e)=>{setPassword(e.target.value);setErrorMessage('')}} onKeyDown={(e)=>{if(e.key==='Enter')void handleLogin()}} autoComplete="current-password"/><button type="button" onClick={()=>setShowPassword((v)=>!v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700" aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'}>{showPassword?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>{displayedError&&<motion.div initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{displayedError}</motion.div>}<label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={rememberSession} onChange={(e)=>setRememberSessionState(e.target.checked)}/> Mantener la sesión iniciada en este dispositivo</label><Button className="h-14 w-full rounded-2xl bg-gradient-to-r from-brand-navy to-brand-navyMid text-base font-bold text-white shadow-lg shadow-brand-navyDeep/20 transition-all hover:shadow-xl hover:shadow-brand-gold/20 active:scale-[.98]" disabled={!email||!password||loading} onClick={()=>void handleLogin()}>{loading?<motion.span animate={{opacity:[0.5,1,0.5]}} transition={{duration:1.2,repeat:Infinity}}>Ingresando...</motion.span>:<span className="flex items-center justify-center gap-2">Ingresar <motion.span aria-hidden animate={{x:[0,3,0]}} transition={{duration:1.4,repeat:Infinity,ease:'easeInOut'}}>→</motion.span></span>}</Button></div></Card>
      </motion.div>
      <div className="mt-8 flex items-center justify-center gap-4"><div className="h-px flex-1 bg-gradient-to-r from-transparent to-brand-gold/60"/><p className="whitespace-nowrap text-[10px] font-bold tracking-[0.35em] text-slate-500 sm:text-xs">PASIÓN POR EDUCAR</p><div className="h-px flex-1 bg-gradient-to-l from-transparent to-brand-gold/60"/></div>
    </div>
  </main>
}
