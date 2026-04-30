import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { CardRule } from '@/domain/payments/calc'

type LoadState = {
  rules: CardRule[]
  loading: boolean
  error: string
}

/**
 * Busca regras de cartão:
 * 1) Tenta carregar do banco (card_catalog) por company_id.
 * 2) Se não conseguir, usa regras padrão (fallback) para funcionar já.
 *
 * Obs.: Você pode chamar assim:
 * - usePaymentRules(undefined, store?.company_id)  -> recomendado (company)
 * - usePaymentRules(store?.id)                     -> tenta descobrir a company pela store
 * - usePaymentRules()                              -> usa fallback padrão
 */
export function usePaymentRules(storeId?: string, companyId?: string) {
  const [state, setState] = useState<LoadState>({ rules: [], loading: false, error: '' })

  useEffect(() => {
    let aborted = false
    async function run() {
      setState(s => ({ ...s, loading: true, error: '' }))

      // 1) Definir company_id para a consulta (se possível)
      let company = companyId

      // Se não veio companyId e veio storeId, tenta descobrir pelo banco
      if (!company && storeId) {
        try {
          const { data, error } = await supabase
            .from('stores')
            .select('company_id')
            .eq('id', storeId)
            .limit(1)
            .maybeSingle()
          if (!error && data?.company_id) company = data.company_id as string
        } catch {
          // pode falhar por RLS; tudo bem, seguimos para o fallback
        }
      }

      // 2) Tentar ler o catálogo global (card_catalog) por company_id
      if (company) {
        try {
          const { data, error } = await supabase
            .from('card_catalog')
            .select('brand, mode, max_installments, no_interest_up_to, min_installment_value, mdr_pct, fee_fixed, customer_interest_monthly_pct, merchant_interest_monthly_pct')
            .eq('company_id', company)
            .order('brand', { ascending: true })
          if (error) throw error

          const rules = (data || []).map(r => ({
            brand: r.brand,
            mode: r.mode,
            max_installments: Number(r.max_installments),
            no_interest_up_to: Number(r.no_interest_up_to),
            min_installment_value: Number(r.min_installment_value),
            mdr_pct: Number(r.mdr_pct),
            fee_fixed: Number(r.fee_fixed),
            customer_interest_monthly_pct: Number(r.customer_interest_monthly_pct),
            merchant_interest_monthly_pct: Number(r.merchant_interest_monthly_pct),
          })) as CardRule[]

          if (!aborted && rules.length > 0) {
            setState({ rules, loading: false, error: '' })
            return
          }
        } catch {
          // vai para o fallback silenciosamente
        }
      }

      // 3) Fallback padrão (funciona mesmo sem login/banco)
      if (!aborted) {
        setState({
          rules: DEFAULT_RULES,
          loading: false,
          error: '',
        })
      }
    }
    run()
    return () => { aborted = true }
  }, [storeId, companyId])

  return { rules: state.rules, loading: state.loading, error: state.error }
}

/* ===== Regras padrão (fallback) ===== */
const DEFAULT_RULES: CardRule[] = [
  // VISA
  {
    brand: 'VISA',
    mode: 'DEBITO',
    max_installments: 1,
    no_interest_up_to: 1,
    min_installment_value: 5,
    mdr_pct: 1.65,
    fee_fixed: 0,
    customer_interest_monthly_pct: 0,
    merchant_interest_monthly_pct: 0,
  },
  {
    brand: 'VISA',
    mode: 'CREDITO_VISTA',
    max_installments: 1,
    no_interest_up_to: 1,
    min_installment_value: 5,
    mdr_pct: 2.99,
    fee_fixed: 0.2,
    customer_interest_monthly_pct: 0,
    merchant_interest_monthly_pct: 0,
  },
  {
    brand: 'VISA',
    mode: 'CREDITO_PARC',
    max_installments: 12,
    no_interest_up_to: 3,
    min_installment_value: 20,
    mdr_pct: 3.19,
    fee_fixed: 0.2,
    customer_interest_monthly_pct: 2.49,
    merchant_interest_monthly_pct: 1.2,
  },
  // MASTERCARD
  {
    brand: 'MASTERCARD',
    mode: 'DEBITO',
    max_installments: 1,
    no_interest_up_to: 1,
    min_installment_value: 5,
    mdr_pct: 1.65,
    fee_fixed: 0,
    customer_interest_monthly_pct: 0,
    merchant_interest_monthly_pct: 0,
  },
  {
    brand: 'MASTERCARD',
    mode: 'CREDITO_VISTA',
    max_installments: 1,
    no_interest_up_to: 1,
    min_installment_value: 5,
    mdr_pct: 2.99,
    fee_fixed: 0.2,
    customer_interest_monthly_pct: 0,
    merchant_interest_monthly_pct: 0,
  },
  {
    brand: 'MASTERCARD',
    mode: 'CREDITO_PARC',
    max_installments: 12,
    no_interest_up_to: 3,
    min_installment_value: 20,
    mdr_pct: 3.29,
    fee_fixed: 0.2,
    customer_interest_monthly_pct: 2.59,
    merchant_interest_monthly_pct: 1.2,
  },
]
