import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useSubscription } from '@/hooks/useSubscription'
import { PLAN_LABELS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_FEATURES, type Plan } from '@/domain/plans'
import {
  CheckCircle2, XCircle, Loader2, CreditCard, ExternalLink,
  Zap, Shield, Building2, AlertTriangle,
} from 'lucide-react'

const PLANS: Plan[] = ['LOJA', 'GESTAO', 'REDE']

const PLAN_ICONS: Record<Plan, typeof Zap> = {
  LOJA:   Zap,
  GESTAO: Shield,
  REDE:   Building2,
}

export default function Conta() {
  const { plan, status, isTrialing, isPastDue, trialDaysLeft, subscription } = useSubscription()
  const [searchParams] = useSearchParams()
  const justSubscribed = searchParams.get('success') === '1'
  const canceled       = searchParams.get('canceled') === '1'

  const [loadingPlan,   setLoadingPlan]   = useState<Plan | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function subscribe(targetPlan: Plan) {
    setLoadingPlan(targetPlan); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada.')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: targetPlan }),
        },
      )
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao iniciar checkout.')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message)
      setLoadingPlan(null)
    }
  }

  async function openPortal() {
    setLoadingPortal(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada.')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        },
      )
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Falha ao abrir portal.')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingPortal(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Minha Conta</h1>
        <p className="text-xs text-slate-400 mt-0.5">Plano e assinatura</p>
      </div>

      {/* Feedback pós-checkout */}
      {justSubscribed && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="shrink-0" />
          Assinatura ativada com sucesso! Bem-vindo ao Tottys.
        </div>
      )}
      {canceled && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
          <XCircle size={16} className="shrink-0" />
          Checkout cancelado. Você pode assinar quando quiser.
        </div>
      )}
      {isPastDue && (
        <div className="flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          Pagamento em atraso. Atualize seu cartão para continuar usando o Tottys sem interrupção.
          <button onClick={openPortal} className="ml-auto shrink-0 underline font-medium cursor-pointer">
            Atualizar cartão
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Status atual */}
      {plan && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Plano atual</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100">{PLAN_LABELS[plan]}</div>
              <div className="text-sm text-slate-500 mt-0.5">
                {isTrialing
                  ? `Trial — ${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''} restante${trialDaysLeft !== 1 ? 's' : ''}`
                  : `R$ ${PLAN_PRICES[plan]}/mês`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                status === 'active'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                status === 'trialing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                status === 'past_due' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {status === 'active'   ? 'Ativo' :
                 status === 'trialing' ? 'Trial' :
                 status === 'past_due' ? 'Pagamento pendente' :
                 status === 'canceled' ? 'Cancelado' : status}
              </span>
              {subscription?.stripe_customer_id && (
                <button
                  onClick={openPortal}
                  disabled={loadingPortal}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingPortal
                    ? <Loader2 size={11} className="animate-spin" />
                    : <ExternalLink size={11} />}
                  Gerenciar assinatura
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Planos disponíveis */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          {plan ? 'Alterar plano' : 'Escolha um plano'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((p) => {
            const isCurrentPlan = p === plan
            const isRecommended = p === 'GESTAO' && !plan
            const Icon = PLAN_ICONS[p]
            const isLoading = loadingPlan === p
            const features = PLAN_FEATURES[p]

            return (
              <div
                key={p}
                className={`relative rounded-2xl border bg-white dark:bg-slate-800 p-5 flex flex-col gap-4 ${
                  isCurrentPlan
                    ? 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-900'
                    : isRecommended
                    ? 'border-blue-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide uppercase">
                    Plano atual
                  </div>
                )}
                {!isCurrentPlan && isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wide uppercase">
                    Recomendado
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={15} className="text-slate-500" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{PLAN_LABELS[p]}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">R$ {PLAN_PRICES[p]}</span>
                    <span className="text-xs text-slate-400">/mês</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{PLAN_DESCRIPTIONS[p]}</p>
                </div>

                <ul className="space-y-1 flex-1">
                  {features.map(f => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                      {FEATURE_LABELS[f] ?? f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isCurrentPlan && subscribe(p)}
                  disabled={isCurrentPlan || !!loadingPlan}
                  className={`flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    isCurrentPlan
                      ? 'bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                      : 'bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white disabled:opacity-50'
                  }`}
                >
                  {isCurrentPlan ? (
                    'Plano atual'
                  ) : isLoading ? (
                    <><Loader2 size={13} className="animate-spin" /> Aguarde…</>
                  ) : (
                    <><CreditCard size={13} /> Assinar</>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

const FEATURE_LABELS: Record<string, string> = {
  PDV:          'PDV completo',
  CAIXA:        'Controle de caixa',
  ESTOQUE:      'Estoque com grade',
  CLIENTES:     'Cadastro de clientes',
  COLECOES:     'Coleções e promoções',
  CREDIARIO:    'Crediário integrado',
  CASHBACK:     'Programa de cashback',
  FINANCEIRO:   'Financeiro e DRE',
  INSIGHTS:     'Insights e alertas',
  MULTIUSUARIO: 'Multi-usuário com permissões',
  MULTILOJAS:   'Retaguarda multi-lojas',
  AUDITORIA:    'Auditoria de estoque',
  CATALOGO:     'Catálogo digital',
}
