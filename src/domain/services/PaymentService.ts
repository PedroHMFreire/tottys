// src/domain/services/PaymentService.ts
import { supabase } from '@/lib/supabaseClient'
import { calcCard, type CardRule } from '@/domain/payments/calc'

/** ===== PIX ===== */
export interface PixPayload {
  qrcode: string      // string EMV/QR
  copyPaste: string   // copia-e-cola
  txid: string
}

/**
 * Gera um PIX "fake" para testes (sem gateway).
 * Troque por chamada ao seu PSP quando quiser ir pra produção.
 */
export function generatePix(total: number): PixPayload {
  const txid = 'PDV' + Date.now()
  const valor = total.toFixed(2)
  // payload simplificado p/ testes (NÃO é EMV certificado)
  const payload = `00020126580014BR.GOV.BCB.PIX0136chave-pix@exemplo.com.br520400005303986540${valor}5802BR5909LOJA SANTE6013SAO LUIS - MA6207TXID${txid}6304ABCD`
  return { qrcode: payload, copyPaste: payload, txid }
}

/** ===== CARTÃO ===== */

/**
 * Busca regras de cartão (card_rules) para a loja.
 * Deixe ao menos uma por brand/mode no banco para cálculo correto.
 */
export async function fetchCardRules(storeId: string) {
  const { data, error } = await supabase
    .from('card_rules')
    .select('*')
    .eq('store_id', storeId)
    .order('brand', { ascending: true })
  if (error) throw error
  return (data || []) as Array<{
    id: string
    store_id: string
    brand: string
    mode: 'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARC'
    max_installments: number
    no_interest_up_to: number
    min_installment_value: number
    mdr_pct: number
    fee_fixed: number
    customer_interest_monthly_pct: number
    merchant_interest_monthly_pct: number
  }>
}

/**
 * Calcula o pagamento no cartão usando uma regra vinda do banco.
 * whoPaysInterest: 'CLIENT' (repasse) | 'MERCHANT' (loja absorve)
 */
export function calculateCard(
  total: number,
  rule: CardRule,
  installments: number,
  whoPaysInterest: 'CLIENT' | 'MERCHANT'
) {
  return calcCard({ price: total, installments, rule, whoPaysInterest })
}

/** ===== Persistência ===== */

export type PaymentRecord = {
  sale_id: string
  meio: 'PIX' | 'DINHEIRO' | 'CARTAO'
  // comuns
  valor?: number
  gross?: number
  net?: number
  // cartão
  brand?: string
  mode?: 'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARC'
  installments?: number
  installment_value?: number
  mdr_pct?: number
  fee_fixed?: number
  fee_total?: number
  interest_pct_monthly?: number
  interest_total?: number
  acquirer?: string
  nsu?: string
  auth_code?: string
  received_at?: string | null
}

/**
 * Grava um pagamento na tabela payments (suporta pagamento misto chamando várias vezes).
 * Retorna a linha inserida.
 */
export async function savePayment(p: PaymentRecord) {
  const payload = {
    sale_id: p.sale_id,
    meio: p.meio,
    valor: p.valor ?? p.gross ?? 0,
    brand: p.brand,
    mode: p.mode,
    installments: p.installments ?? 1,
    installment_value: p.installment_value ?? null,
    mdr_pct: p.mdr_pct ?? null,
    fee_fixed: p.fee_fixed ?? null,
    fee_total: p.fee_total ?? null,
    interest_pct_monthly: p.interest_pct_monthly ?? null,
    interest_total: p.interest_total ?? null,
    gross: p.gross ?? null,
    net: p.net ?? null,
    acquirer: p.acquirer ?? null,
    nsu: p.nsu ?? null,
    auth_code: p.auth_code ?? null,
    received_at: p.received_at ?? null,
    bandeira: p.brand ?? null, // compat. com campo anterior
  }
  const { data, error } = await supabase.from('payments').insert(payload).select().single()
  if (error) throw error
  return data
}

/** ===== Helpers prontos para a UI ===== */

/**
 * Confirma pagamento PIX: gera payload e já retorna objeto para salvar.
 * (Deixe a gravação a cargo da tela após o usuário de fato pagar)
 */
export function buildPixPayment(total: number) {
  const pix = generatePix(total)
  return {
    pix,
    record: {
      meio: 'PIX' as const,
      gross: total,
      net: total,
    },
  }
}

/**
 * Confirma pagamento CARTÃO a partir de uma regra já escolhida.
 * Use o resultado para exibir resumo ao cliente e depois salvar com savePayment().
 */
export function buildCardPayment(total: number, rule: CardRule, installments: number, whoPaysInterest: 'CLIENT' | 'MERCHANT') {
  const out = calculateCard(total, rule, installments, whoPaysInterest)
  return {
    summary: out,
    record: {
      meio: 'CARTAO' as const,
      brand: out.brand,
      mode: out.mode,
      installments: out.installments,
      installment_value: out.installmentValue,
      mdr_pct: out.mdrPct,
      fee_fixed: out.feeFixed,
      fee_total: out.feeTotal,
      interest_pct_monthly: out.interestMonthlyPct,
      interest_total: out.interestTotal,
      gross: out.gross,
      net: out.net,
    } as PaymentRecord,
  }
}
