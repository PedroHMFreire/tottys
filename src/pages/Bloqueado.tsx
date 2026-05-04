import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSubscription } from '@/hooks/useSubscription'
import { PLAN_LABELS, PLAN_PRICES, type Plan } from '@/domain/plans'
import { Loader2, ShieldOff, CreditCard, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const PLANS: Plan[] = ['LOJA', 'GESTAO', 'REDE']

export default function Bloqueado() {
  const { status, subscription } = useSubscription()
  const navigate = useNavigate()
  const [loading, setLoading] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isTrialExpired = status === 'trialing' && !subscription?.trial_ends_at
    ? false
    : status === 'trialing' && new Date(subscription?.trial_ends_at ?? 0) <= new Date()
  const isCanceled = status === 'canceled'

  async function subscribe(plan: Plan) {
    setLoading(plan); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan }),
        },
      )
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao iniciar checkout.')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message)
      setLoading(null)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center mx-auto">
            <ShieldOff size={24} className="text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            {isTrialExpired ? 'Seu período de teste encerrou' : 'Assinatura encerrada'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
            {isTrialExpired
              ? 'O trial de 14 dias chegou ao fim. Escolha um plano para continuar usando o Tottys.'
              : 'Sua assinatura foi cancelada. Reative para voltar a acessar o sistema.'}
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 text-center">
            {error}
          </div>
        )}

        {/* Planos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isRecommended = plan === 'GESTAO'
            const isLoading = loading === plan
            return (
              <div
                key={plan}
                className={`relative rounded-2xl border bg-white dark:bg-slate-800 p-5 space-y-4 flex flex-col ${
                  isRecommended
                    ? 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-900'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide uppercase">
                    Recomendado
                  </div>
                )}

                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {PLAN_LABELS[plan]}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      R$ {PLAN_PRICES[plan]}
                    </span>
                    <span className="text-xs text-slate-400">/mês</span>
                  </div>
                </div>

                <button
                  onClick={() => subscribe(plan)}
                  disabled={!!loading}
                  className={`mt-auto flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                    isRecommended
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white'
                  }`}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  {isLoading ? 'Aguarde…' : 'Assinar'}
                </button>
              </div>
            )
          })}
        </div>

        <div className="text-center">
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            Sair da conta
          </button>
        </div>

      </div>
    </div>
  )
}
