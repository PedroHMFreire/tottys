import { supabase } from '@/lib/supabaseClient'
import { isUUID } from '@/lib/utils'

export type SaleItemInput = {
  product_id?: string | null
  variant_id?: string | null
  qtde: number
  preco_unit: number
  desconto?: number
}


/**
 * Cria a venda em `sales` e os itens em `sale_items`.
 * Se não conseguir (ex.: sem login/RLS/loja mock), volta um saleId local (persisted=false).
 */
export async function createSaleWithItems(opts: {
  storeId?: string
  userId?: string
  vendedorId?: string | null
  customerId?: string | null
  items: SaleItemInput[]
  total: number
  desconto?: number
  status?: 'PAGA' | 'PENDENTE' | 'CANCELADA'
}) {
  const { storeId, userId, vendedorId, customerId, items, total } = opts
  const desconto = opts.desconto ?? 0
  const status = opts.status ?? 'PAGA'

  // fallback local (funciona mesmo sem banco)
  const localId = 'sale-' + Date.now()

  // Se a store não é um UUID real (ex.: loja mock), não tenta no banco
  if (!isUUID(storeId)) {
    return { saleId: localId, persisted: false }
  }

  try {
    // cria a venda
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        store_id: storeId,
        user_id: userId ?? null,
        vendedor_id: vendedorId ?? null,
        customer_id: customerId ?? null,
        total,
        desconto,
        status,
      })
      .select()
      .single()

    if (saleErr || !sale) throw saleErr || new Error('Falha ao criar venda')

    // itens
    if (items.length) {
      const payload = items.map(it => ({
        sale_id: sale.id,
        product_id: it.product_id ?? null,
        variant_id: it.variant_id ?? null,
        qtde: it.qtde,
        preco_unit: it.preco_unit,
        desconto: it.desconto ?? 0,
      }))
      const { error: itemsErr } = await supabase.from('sale_items').insert(payload)
      if (itemsErr) throw itemsErr
    }

    return { saleId: sale.id as string, persisted: true }
  } catch (e) {
    console.error('createSaleWithItems error', e)
    return { saleId: localId, persisted: false }
  }
}
