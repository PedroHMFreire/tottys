import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import Card from '@/ui/Card'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { admin } = useRole()

  const nextPath = useMemo(() => {
    const raw = searchParams.get('next')
    if (!raw) return null
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded.startsWith('/')) return decoded
    } catch {}
    return null
  }, [searchParams])

  const afterLogin = nextPath || '/gate'

  async function ensureProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: existing } = await supabase
        .from('profiles')
        .select('company_id, role, nome, email')
        .eq('id', user.id)
        .maybeSingle()

      await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email ?? existing?.email ?? null,
          role: (existing?.role as any) ?? 'VENDEDOR',
          nome: existing?.nome ?? null,
          company_id: existing?.company_id ?? null,
        }, { onConflict: 'id' })
    } catch {
      // Falha silenciosa: não bloqueia o login
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null); setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await ensureProfile()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: prof } = await supabase
        .from('profiles')
        .select('company_id, role')
        .eq('id', user?.id || '')
        .maybeSingle()
      if (!prof?.company_id) {
        const role = (prof?.role as string) || 'VENDEDOR'
        if (['OWNER', 'ADMIN', 'GERENTE'].includes(role)) {
          setMsg('Defina uma empresa para começar.')
          navigate('/adm/companies')
          return
        }
        setMsg('Acesso pendente. Solicite ao administrador para vincular sua empresa.')
        return
      }
      navigate(afterLogin)
    } catch (e: any) {
      setErr(e?.message || 'Falha ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  async function sendReset() {
    if (!email) { setErr('Informe o e-mail para recuperar a senha.'); return }
    setErr(null); setMsg(null); setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      setMsg('Se o e-mail existir, você receberá um link para redefinir a senha.')
    } catch (e: any) {
      setErr(e?.message || 'Não foi possível enviar o e-mail de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">Tottys</h1>
          <p className="text-zinc-500 text-sm mt-1">Acesso rápido ao PDV e Retaguarda</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="text-lg font-semibold">Entrar</div>

          <form onSubmit={onLogin} className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-2xl border px-3 py-2"
              placeholder="E-mail"
              autoComplete="email"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-2xl border px-3 py-2"
              placeholder="Senha"
              autoComplete="current-password"
              required
            />

            {err && <div className="rounded-2xl border p-2 text-sm bg-amber-50 text-amber-900">{err}</div>}
            {msg && <div className="rounded-2xl border p-2 text-sm bg-emerald-50 text-emerald-900">{msg}</div>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Aguarde...' : 'Entrar'}
            </Button>

            <button
              type="button"
              onClick={sendReset}
              className="text-sm text-zinc-600 mt-1 underline"
            >
              Esqueci minha senha
            </button>
          </form>

          {admin && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => navigate('/adm')}
                className="text-xs text-zinc-500 px-3 py-1 rounded hover:bg-zinc-100 border border-transparent"
              >
                Acesso administrativo
              </button>
            </div>
          )}
        </div>

        <Card title="">
          <div className="text-[11px] text-zinc-400 text-center">
            Após entrar, você será levado à tela com as opções <b>LOJA</b> e <b>ADM</b>.
          </div>
        </Card>
      </div>
    </div>
  )
}
