import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSubscription } from '@/hooks/useSubscription'
import {
  PLAN_LABELS, PLAN_PRICES, PLAN_DESCRIPTIONS, PLAN_FEATURES,
  minPlanFor, planRank, type Plan, type PlanFeature,
} from '@/domain/plans'
import { X, CreditCard, Loader2, Zap, Shield, Building2, CheckCircle2 } from 'lucide-react'

const PLAN_ICONS: Record<Plan, typeof Zap> = {
  LOJA:   Zap,
  GESTAO: Shield,
  REDE:   Building2,
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

interface Props {
  feature: PlanFeature
  onClose: () => void
}

const PLANS: Plan[] = ['LOJA', 'GESTAO', 'REDE']

export default function UpgradeModal({ feature, onClose }: Props) {
  const { plan: currentPlan } = useSubscription()
  const neededPlan = minPlanFor(feature)
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eligiblePlans = PLANS.filter(p =>
    planRank(p) >= planRank(neededPlan) &&
    (!currentPlan || planRank(p) > planRank(currentPlan))
  )

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Recurso exclusivo — {PLAN_LABELS[neededPlan]}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Faça upgrade para desbloquear <strong className="text-slate-600 dark:text-slate-300">{FEATURE_LABELS[feature] ?? feature}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Planos elegíveis */}
        <div className="p-5 space-y-3">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${eligiblePlans.length}, 1fr)` }}>
            {eligiblePlans.map((p) => {
              const Icon = PLAN_ICONS[p]
              const isRecommended = p === neededPlan
              const isLoading = loadingPlan === p

              return (
                <div
                  key={p}
                  className={`relative rounded-xl border p-4 flex flex-col gap-3 ${
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
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon size={13} className="text-slate-500" />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{PLAN_LABELS[p]}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold text-slate-900 dark:text-white">R$ {PLAN_PRICES[p]}</span>
                      <span className="text-xs text-slate-400">/mês</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{PLAN_DESCRIPTIONS[p]}</p>
                  </div>

                  <ul className="space-y-1 flex-1">
                    {PLAN_FEATURES[p].map(f => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                        {FEATURE_LABELS[f] ?? f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => subscribe(p)}
                    disabled={!!loadingPlan}
                    className={`flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                      isRecommended
                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                        : 'bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white'
                    }`}
                  >
                    {isLoading
                      ? <><Loader2 size={12} className="animate-spin" /> Aguarde…</>
                      : <><CreditCard size={12} /> Assinar</>}
                  </button>
                </div>
              )
            })}
          </div>

          <p className="text-center text-xs text-slate-400 pt-1">
            Cancele quando quiser. Sem fidelidade.
          </p>
        </div>
      </div>
    </div>
  )
}
