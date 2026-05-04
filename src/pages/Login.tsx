import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import type { Role } from '@/domain/types'
import ThemeToggle from '@/components/ThemeToggle'

type NoticeTone = 'info' | 'success' | 'warn' | 'error'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setPermissions } = useApp()

  // Se já tiver sessão ativa, corrige o perfil e redireciona direto
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const role = await ensureProfile()
      setPermissions(role as Role, [])
      navigate(routeForRole(role), { replace: true })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone]       = useState('')
  const [mode, setMode]         = useState<'login' | 'signup'>(
    searchParams.get('modo') === 'signup' ? 'signup' : 'login'
  )
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState<string | null>(null)
  const [msgTone, setMsgTone]   = useState<NoticeTone>('info')
  const [err, setErr]           = useState<string | null>(null)

  function routeForRole(role: string) {
    return (role === 'OWNER' || role === 'ADMIN' || role === 'GERENTE') ? '/adm' : '/loja/sell'
  }

  const nextPath = useMemo(() => {
    const raw = searchParams.get('next')
    if (!raw) return null
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded.startsWith('/')) return decoded
    } catch {}
    return null
  }, [searchParams])

  function clearNotices() { setErr(null); setMsg(null) }
  function setNotice(tone: NoticeTone, text: string) { setMsgTone(tone); setMsg(text) }
  function normalizeEmail(v: string) { return v.trim().toLowerCase() }
  function normalizePhone(v: string) { return v.replace(/\D/g, '') }

  async function ensureProfile(overrides?: { nome?: string | null; forceRole?: string }): Promise<string> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 'COLABORADOR'
      const meta = user.user_metadata as any

      const { data: existing } = await supabase
        .from('profiles')
        .select('role, nome, email, company_id')
        .eq('id', user.id)
        .maybeSingle()

      const existingRole = existing?.role as string | undefined
      const resolvedRole = overrides?.forceRole
        ?? (existingRole && existingRole !== 'COLABORADOR' && existingRole !== 'VENDEDOR' ? existingRole : undefined)
        ?? (meta?.role as string | undefined)
        ?? 'ADMIN'

      await supabase.from('profiles').upsert({
        id:         user.id,
        email:      user.email ?? existing?.email ?? null,
        role:       resolvedRole,
        nome:       existing?.nome ?? overrides?.nome ?? (meta?.nome as string | null) ?? null,
        company_id: (existing as any)?.company_id ?? null,
      }, { onConflict: 'id' })

      return resolvedRole
    } catch {
      return 'COLABORADOR'
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    clearNotices()
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      })
      if (error) throw error
      const role = await ensureProfile()
      setPermissions(role as Role, [])
      navigate(nextPath || routeForRole(role))
    } catch (e: any) {
      setErr(e?.message || 'Falha ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  async function sendReset() {
    if (!email) { setErr('Informe o e-mail para recuperar a senha.'); return }
    clearNotices()
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email))
      if (error) throw error
      setNotice('success', 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
    } catch (e: any) {
      setErr(e?.message || 'Não foi possível enviar o e-mail de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault()
    clearNotices()
    const cleanPhone = normalizePhone(phone)
    if (cleanPhone.length < 10) {
      setErr('Informe um celular válido com DDD.')
      return
    }
    setLoading(true)
    try {
      const cleanEmail = normalizeEmail(email)
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            role: 'ADMIN',
            nome: fullName.trim() || null,
            phone: cleanPhone,
          },
        },
      })
      if (error) throw error

      if (data?.session) {
        const role = await ensureProfile({ nome: fullName.trim() || null, forceRole: 'ADMIN' })
        setPermissions(role as Role, [])
        navigate('/onboarding')
        return
      }
      setNotice('info', 'Conta criada! Verifique seu e-mail para confirmar o acesso.')
    } catch (e: any) {
      setErr(e?.message || 'Não foi possível criar a conta.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    clearNotices()
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;1,400&family=Jost:wght@300;400;500;600&display=swap');
        .login-root { font-family: 'Jost', sans-serif; }
        .login-wordmark { font-family: 'Bodoni Moda', serif; }
        .login-input:focus { outline: none; border-color: #6366F1; }
        .login-input { transition: border-color 150ms ease; }
      `}</style>

      <div className="login-root min-h-screen bg-[#F5F3FF] dark:bg-slate-900 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        {/* Wordmark */}
        <div className="mb-10 text-center select-none">
          <div className="login-wordmark text-[2rem] font-semibold text-navy tracking-tight leading-none">
            Tottys
          </div>
          <div className="mt-2 text-xs font-medium tracking-[0.2em] uppercase text-[#6366F1]">
            {mode === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">

          {/* Tab switcher */}
          <div className="flex border-b border-slate-100">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-4 text-[13px] font-medium tracking-wide cursor-pointer transition-colors duration-200 border-b-2 -mb-px ${
                  mode === m
                    ? 'text-navy border-[#6366F1]'
                    : 'text-slate-400 border-transparent hover:text-slate-500'
                }`}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form
            onSubmit={mode === 'login' ? onLogin : onSignup}
            className="p-8 space-y-5"
          >
            {mode === 'signup' && (
              <>
                <Field label="Nome completo">
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    autoComplete="name"
                    required
                    className="login-input w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy placeholder-slate-300"
                  />
                </Field>

                <Field label="Celular com DDD">
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="11 99999-9999"
                    autoComplete="tel"
                    required
                    className="login-input w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy placeholder-slate-300"
                  />
                </Field>
              </>
            )}

            <Field label="E-mail">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="voce@email.com"
                autoComplete="email"
                required
                className="login-input w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-navy placeholder-slate-300"
              />
            </Field>

            <Field
              label="Senha"
              aside={
                mode === 'login' ? (
                  <button
                    type="button"
                    onClick={sendReset}
                    className="text-xs text-[#6366F1] hover:text-[#4F46E5] cursor-pointer transition-colors duration-200"
                  >
                    Esqueci minha senha
                  </button>
                ) : null
              }
            >
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  className="login-input w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm text-navy placeholder-slate-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors duration-200"
                >
                  {showPassword
                    ? <EyeOff size={15} strokeWidth={1.75} />
                    : <Eye size={15} strokeWidth={1.75} />
                  }
                </button>
              </div>
            </Field>

            {/* Notices */}
            {err && (
              <Notice tone="error">{err}</Notice>
            )}
            {msg && (
              <Notice tone={msgTone}>{msg}</Notice>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#6366F1] hover:bg-[#4F46E5] active:bg-[#4338CA] text-white text-sm font-medium py-3 rounded-xl transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Aguarde…'
                : mode === 'login' ? 'Entrar' : 'Criar minha conta'}
            </button>
          </form>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-[12px] text-slate-400">
          {mode === 'login' ? 'Não tem uma conta? ' : 'Já tem conta? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="text-[#6366F1] hover:text-[#4F46E5] font-medium cursor-pointer transition-colors duration-200"
          >
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>

      </div>
    </>
  )
}

/* ─── Sub-components ─── */

function Field({
  label,
  aside,
  children,
}: {
  label: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold tracking-[0.12em] uppercase text-slate-400">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Notice({ tone, children }: { tone: NoticeTone; children: React.ReactNode }) {
  const styles: Record<NoticeTone, string> = {
    error:   'bg-rose-50 border-rose-100 text-rose-700',
    success: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    info:    'bg-[#EEF2FF] border-[#C7D2FE] text-[#4338CA]',
    warn:    'bg-amber-50 border-amber-100 text-amber-700',
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${styles[tone]}`}>
      {children}
    </div>
  )
}
