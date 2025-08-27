import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import Card from '@/ui/Card'

export default function Login() {
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null); setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/gate') // após login, vai para a tela de opções (LOJA/ADM)
    } catch (e: any) {
      setErr(e?.message || 'Falha ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setMsg(null); setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      if (!data.session) {
        setMsg('Conta criada! Verifique seu e-mail para confirmar e depois faça login.')
      } else {
        // caso o projeto não exija confirmação por e-mail
        navigate('/gate')
      }
    } catch (e: any) {
      setErr(e?.message || 'Falha ao criar a conta.')
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
          <h1 className="text-3xl font-extrabold tracking-tight">Entrar</h1>
          <p className="text-zinc-500 text-sm mt-1">Acesse o PDV e a Retaguarda</p>
        </div>

        <div className="rounded-2xl border bg-white p-2">
          {/* abas Entrar / Criar conta */}
          <div className="flex gap-1 p-1">
            <button
              className={`flex-1 px-3 py-2 rounded-xl ${mode === 'login' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}
              onClick={() => setMode('login')}
            >
              Entrar
            </button>
            <button
              className={`flex-1 px-3 py-2 rounded-xl ${mode === 'signup' ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}
              onClick={() => setMode('signup')}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={mode === 'login' ? onLogin : onSignup} className="p-3 space-y-2">
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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />

            {err && <div className="rounded-2xl border p-2 text-sm bg-amber-50 text-amber-900">{err}</div>}
            {msg && <div className="rounded-2xl border p-2 text-sm bg-emerald-50 text-emerald-900">{msg}</div>}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Aguarde...' : (mode === 'login' ? 'Entrar' : 'Criar conta')}
            </Button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={sendReset}
                className="text-sm text-zinc-600 mt-1 underline"
              >
                Esqueci minha senha
              </button>
            )}
          </form>
        </div>

        {/* Dica simples, sem status de sessão */}
  <Card title="">
          <div className="text-[11px] text-zinc-400 text-center">
            Após entrar, você será levado à tela com as opções <b>LOJA</b> e <b>ADM</b>.
          </div>
        </Card>
      </div>
    </div>
  )
}
