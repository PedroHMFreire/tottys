// Planos disponíveis no Tottys
export type Plan = 'LOJA' | 'GESTAO' | 'REDE'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'

// Features controladas por plano (verificadas no frontend e reforçadas pelas RLS/Edge Functions)
export type PlanFeature =
  | 'PDV'
  | 'CAIXA'
  | 'ESTOQUE'
  | 'CLIENTES'
  | 'COLECOES'
  | 'CREDIARIO'
  | 'CASHBACK'
  | 'FINANCEIRO'
  | 'INSIGHTS'
  | 'MULTIUSUARIO'
  | 'MULTILOJAS'
  | 'AUDITORIA'
  | 'CATALOGO'

// Mapa: quais features cada plano inclui
export const PLAN_FEATURES: Record<Plan, PlanFeature[]> = {
  LOJA: [
    'PDV', 'CAIXA', 'ESTOQUE', 'CLIENTES', 'COLECOES',
  ],
  GESTAO: [
    'PDV', 'CAIXA', 'ESTOQUE', 'CLIENTES', 'COLECOES',
    'CREDIARIO', 'CASHBACK', 'FINANCEIRO', 'INSIGHTS', 'MULTIUSUARIO',
  ],
  REDE: [
    'PDV', 'CAIXA', 'ESTOQUE', 'CLIENTES', 'COLECOES',
    'CREDIARIO', 'CASHBACK', 'FINANCEIRO', 'INSIGHTS', 'MULTIUSUARIO',
    'MULTILOJAS', 'AUDITORIA', 'CATALOGO',
  ],
}

export const PLAN_LABELS: Record<Plan, string> = {
  LOJA:   'Plano Loja',
  GESTAO: 'Plano Gestão',
  REDE:   'Plano Rede',
}

export const PLAN_PRICES: Record<Plan, number> = {
  LOJA:   129,
  GESTAO: 249,
  REDE:   399,
}

export const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  LOJA:   'PDV, estoque e clientes para lojas individuais',
  GESTAO: 'Crediário, cashback, financeiro e insights incluídos',
  REDE:   'Multi-lojas, auditoria e catálogo digital para redes',
}

// Hierarquia de planos (para comparação)
const PLAN_RANK: Record<Plan, number> = { LOJA: 1, GESTAO: 2, REDE: 3 }

export function planIncludes(plan: Plan | undefined | null, feature: PlanFeature): boolean {
  if (!plan) return false
  return PLAN_FEATURES[plan]?.includes(feature) ?? false
}

export function planRank(plan: Plan): number {
  return PLAN_RANK[plan]
}

// Plano mínimo que inclui uma feature
export function minPlanFor(feature: PlanFeature): Plan {
  const order: Plan[] = ['LOJA', 'GESTAO', 'REDE']
  return order.find(p => planIncludes(p, feature)) ?? 'REDE'
}

// Texto amigável de qual plano upgrade é necessário
export function upgradeLabel(currentPlan: Plan | undefined | null, feature: PlanFeature): string {
  const needed = minPlanFor(feature)
  return `Disponível no ${PLAN_LABELS[needed]}`
}
