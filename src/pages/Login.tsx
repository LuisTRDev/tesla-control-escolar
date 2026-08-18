import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'

type Props = {
  onLogin: (name: string) => void
  externalError?: string
}

export default function Login({
  onLogin,
  externalError = '',
}: Props) {
  const [email, setEmail] = useState('auxiliar@tesla.test')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogin() {
    if (!email || !password || loading) return

    setLoading(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('Error de autenticación:', error)
        setErrorMessage('Correo o contraseña incorrectos.')
        return
      }

      if (!data.user) {
        setErrorMessage('No se pudo iniciar sesión.')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .single()

      if (profileError) {
        console.error('Error cargando perfil:', profileError)

        setErrorMessage(
          'Se inició sesión, pero no se pudo cargar el perfil.'
        )

        return
      }

      if (!profile?.full_name) {
        setErrorMessage('El usuario no tiene un perfil configurado.')
        return
      }

      onLogin(profile.full_name)
    } catch (error) {
      console.error('Error inesperado:', error)
      setErrorMessage('Ocurrió un error al iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  const displayedError = errorMessage || externalError

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020817] px-5 py-8 text-slate-950">
      {/* Fondo decorativo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-20 h-80 w-80 rounded-full bg-blue-800/20 blur-3xl" />

        <div className="absolute -bottom-24 -right-20 h-96 w-96 rounded-full bg-blue-700/20 blur-3xl" />

        <div className="absolute left-[-120px] top-16 h-[2px] w-[520px] rotate-[-20deg] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80" />

        <div className="absolute bottom-20 right-[-140px] h-[2px] w-[520px] rotate-[-20deg] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80" />

        <div className="absolute right-8 top-24 select-none text-[260px] font-black leading-none text-blue-500/[0.035]">
          N
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        {/* Logo */}
        <div className="mb-7 text-center">
          <img
            src="/images/logo-nikola-tesla.png"
            alt="IEPr Nikola Tesla"
            className="mx-auto mb-5 h-36 w-auto object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)] sm:h-40"
          />

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Tesla Control Escolar
          </h1>

          <p className="mt-2 text-sm font-semibold tracking-wide text-slate-400">
            IEPr “Nikola Tesla”
          </p>

          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="h-px w-20 bg-gradient-to-r from-transparent to-blue-500" />

            <span className="text-xs font-semibold text-slate-500">
              v1.0
            </span>

            <div className="h-px w-20 bg-gradient-to-l from-transparent to-blue-500" />
          </div>
        </div>

        {/* Card */}
        <Card className="rounded-[28px] border border-white/10 bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="space-y-5">
            {/* Correo */}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-900">
                Correo
              </label>

              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={20}
                />

                <Input
                  className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-[15px]"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setErrorMessage('')
                  }}
                  placeholder="correo@nikolatesla.edu.pe"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-900">
                Contraseña
              </label>

              <div className="relative">
                <LockKeyhole
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={20}
                />

                <Input
                  className="h-14 rounded-2xl border-slate-200 bg-white pl-12 pr-12 text-[15px]"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setErrorMessage('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleLogin()
                    }
                  }}
                  autoComplete="current-password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  aria-label={
                    showPassword
                      ? 'Ocultar contraseña'
                      : 'Mostrar contraseña'
                  }
                >
                  {showPassword ? (
                    <EyeOff size={20} />
                  ) : (
                    <Eye size={20} />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {displayedError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {displayedError}
              </div>
            )}

            {/* Botón */}
            <Button
              className="h-14 w-full rounded-2xl bg-gradient-to-r from-blue-700 to-blue-600 text-base font-bold text-white shadow-lg shadow-blue-900/20 transition hover:from-blue-600 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!email || !password || loading}
              onClick={handleLogin}
            >
              {loading ? (
                'Ingresando...'
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Ingresar
                  <span aria-hidden>→</span>
                </span>
              )}
            </Button>
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-blue-500/60" />

          <p className="whitespace-nowrap text-[10px] font-bold tracking-[0.35em] text-slate-500 sm:text-xs">
            PASIÓN POR EDUCAR
          </p>

          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-blue-500/60" />
        </div>
      </div>
    </main>
  )
}