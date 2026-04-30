import { supabase } from '@/lib/supabaseClient'
import type { CrediarioVenda, CrediarioParcela, UUID } from '@/domain/types'

export async function criarCrediario(opts: {
  companyId: UUID
  storeId: UUID
  customerId: UUID
  valorTotal: number
  entrada: number
  numParcelas: number
  primeiraVenc: string
}): Promise<{ crediarioId: UUID; error?: string }> {
  const { data, error } = await supabase.rpc('criar_crediario', {
    p_company_id:    opts.companyId,
    p_store_id:      opts.storeId,
    p_customer_id:   opts.customerId,
    p_valor_total:   opts.valorTotal,
    p_entrada:       opts.entrada,
    p_num_parcelas:  opts.numParcelas,
    p_primeira_venc: opts.primeiraVenc,
  })
  if (error) return { crediarioId: '', error: error.message }
  return { crediarioId: data as UUID }
}

export async function pagarParcela(
  parcelaId: UUID,
  valorPago: number
): Promise<{ error?: string; cashback?: { credito: number; tier_novo: string; subiu_tier: boolean } }> {
  const { data, error } = await supabase.rpc('pagar_parcela', {
    p_parcela_id: parcelaId,
    p_valor_pago: valorPago,
  })
  if (error) return { error: error.message }
  const result = data as any
  const cb = result?.cashback
  if (cb?.ok && cb?.credito > 0) return { cashback: cb }
  return {}
}

export async function fetchParcelasByCrediario(
  crediarioId: UUID
): Promise<CrediarioParcela[]> {
  const { data } = await supabase
    .from('crediario_parcelas')
    .select('*')
    .eq('crediario_id', crediarioId)
    .order('num_parcela')
  return (data || []) as CrediarioParcela[]
}

export async function fetchCrediariosByCustomer(
  customerId: UUID
): Promise<CrediarioVenda[]> {
  const { data } = await supabase
    .from('crediario_vendas')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  return (data || []) as CrediarioVenda[]
}
