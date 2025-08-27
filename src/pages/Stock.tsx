import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'
import Card from '@/ui/Card'

type Store = { id: string; nome: string }
type PositionRow = {
  company_id: string
  product_id: string
  sku: string
  produto: string
  store_id: string
  loja: string
  saldo: number
  last_move_at: string | null
}

type GroupedProduct = {
  product_id: string
  sku: string
  produto: string
  stores: Array<{ store_id: string; loja: string; saldo: number }>
}

export default function Stock() {
  const { store } = useApp()
  const [stores, setStores] = useState<Store[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PositionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [transferProd, setTransferProd] = useState<GroupedProduct | null>(null)

  const companyId = store?.company_id || null
  const myStoreId = store?.id || null

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, nome')
        .eq('company_id', companyId)
        .order('nome', { ascending: true })
      if (!error && data) setStores(data as Store[])
    })()
  }, [companyId])

  async function search() {
    if (!companyId) { setError('Selecione uma loja (com empresa) em Config.'); return }
    setError(null)
    setLoading(true)
    try {
      const term = q.trim()
      let out: PositionRow[] = []

      // Se parece EAN/GTIN (só dígitos, 8–14+), tentamos achar pelo barcode
      const looksLikeEAN = /^[0-9]{8,14,}$/.test(term)

      if (looksLikeEAN) {
        // acha product_id(s) pelo barcode
        const { data: prods, error: e1 } = await supabase
          .from('products')
          .select('id, sku, nome')
          .eq('company_id', companyId)
          .eq('barcode', term)
          .limit(25)
        if (e1) throw e1
        const ids = (prods || []).map(p => p.id)
        if (ids.length > 0) {
          const { data, error: e2 } = await supabase
            .from('v_stock_position_detail')
            .select('company_id, product_id, sku, produto, store_id, loja, saldo, last_move_at')
            .eq('company_id', companyId)
            .in('product_id', ids)
            .order('produto', { ascending: true })
          if (e2) throw e2
          out = (data || []) as PositionRow[]
        }
      }

      // Se não achou por EAN ou não é EAN, busca por SKU/Nome
      if (out.length === 0) {
        const filter = term ? { q: term } : null
        const query = supabase
          .from('v_stock_position_detail')
          .select('company_id, product_id, sku, produto, store_id, loja, saldo, last_move_at')
          .eq('company_id', companyId)
          .order('produto', { ascending: true })
          .limit(300)

        // aplica filtro simples por SKU/Nome
        if (filter?.q) {
          // Supabase permite usar ilike
          // @ts-ignore
          query.ilike('sku', `%${filter.q}%`)
          // @ts-ignore
          query.or(`produto.ilike.%${filter.q}%`)
        }

        const { data, error: e3 } = await query
        if (e3) throw e3
        out = (data || []) as PositionRow[]
      }

      setRows(out)
    } catch (e: any) {
      setError(e?.message || 'Falha na busca.')
    } finally {
      setLoading(false)
    }
  }

  const grouped = useMemo<GroupedProduct[]>(() => {
    const map = new Map<string, GroupedProduct>()
    rows.forEach(r => {
      if (!map.has(r.product_id)) {
        map.set(r.product_id, {
          product_id: r.product_id,
          sku: r.sku,
          produto: r.produto,
          stores: []
        })
      }
      map.get(r.product_id)!.stores.push({ store_id: r.store_id, loja: r.loja, saldo: Number(r.saldo || 0) })
    })
    return Array.from(map.values()).sort((a, b) => a.produto.localeCompare(b.produto))
  }, [rows])

  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Estoque</h1>

      {!companyId && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
          Selecione uma <b>loja</b> (com empresa vinculada) em <b>Config</b> para consultar estoques.
        </div>
      )}

      <Card title="Buscar produto">
        <div className="grid grid-cols-1 gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="w-full rounded-2xl border px-3 py-2"
            placeholder="SKU, nome ou EAN"
          />
          <Button onClick={search} disabled={!companyId || loading}>
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
          <div className="text-xs text-zinc-500">
            Dica: digite o <b>SKU</b> ou <b>nome</b>. Se digitar apenas números (8–14+), procuramos por <b>EAN</b>.
          </div>
        </div>
      </Card>

      {!!error && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>
      )}

      {/* Resultados */}
      {grouped.length > 0 && (
        <Card title="Resultados">
          <div className="space-y-3">
            {grouped.map(g => {
              const total = g.stores.reduce((a, s) => a + (s.saldo || 0), 0)
              const canTransferFrom = g.stores.filter(s => s.saldo > 0 && s.store_id !== myStoreId)

              return (
                <div key={g.product_id} className="rounded-2xl border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{g.produto}</div>
                      <div className="text-xs text-zinc-500">{g.sku}</div>
                    </div>
                    <div className="text-sm">
                      Total: <b>{total}</b>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1 text-sm">
                    {g.stores
                      .sort((a, b) => a.loja.localeCompare(b.loja))
                      .map(s => (
                        <div key={s.store_id} className="flex items-center justify-between">
                          <div className="text-zinc-600">{s.loja}</div>
                          <div className="font-medium">{s.saldo}</div>
                        </div>
                      ))}
                  </div>

                  {myStoreId && canTransferFrom.length > 0 && (
                    <div className="mt-3">
                      <Button onClick={() => setTransferProd(g)}>Solicitar transferência</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {transferProd && myStoreId && companyId && (
        <RequestTransferModal
          product={transferProd}
          companyId={companyId}
          toStoreId={myStoreId}
          stores={stores}
          onClose={() => setTransferProd(null)}
          onSuccess={() => {
            setTransferProd(null)
            alert('Transferência solicitada com sucesso.')
          }}
        />
      )}
    </div>
  )
}

/** Modal simples para solicitar transferência de um produto */
function RequestTransferModal({
  product,
  companyId,
  toStoreId,
  stores,
  onClose,
  onSuccess,
}: {
  product: GroupedProduct
  companyId: string
  toStoreId: string
  stores: Store[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [fromStoreId, setFromStoreId] = useState<string>('')
  const [qty, setQty] = useState<string>('1')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const canFrom = product.stores.filter(s => s.saldo > 0 && s.store_id !== toStoreId)

  useEffect(() => {
    if (canFrom.length > 0) setFromStoreId(canFrom[0].store_id)
  }, [product.product_id])

  async function submit() {
    const qNum = Math.max(1, Number(qty || 0))
    if (!fromStoreId) return alert('Escolha a loja de origem.')
    if (!qNum) return alert('Informe a quantidade.')

    setLoading(true)
    try {
      // 1) cria a transferência (SOLICITADA)
      const { data: created, error: e1 } = await supabase.rpc('request_transfer', {
        p_company_id: companyId,
        p_from_store: fromStoreId,
        p_to_store: toStoreId,
        p_notes: notes || null
      })
      if (e1) throw e1
      const transferId = Array.isArray(created) ? created[0] : created

      // 2) adiciona o item
      const { error: e2 } = await supabase.rpc('add_transfer_item', {
        p_transfer_id: transferId,
        p_product_id: product.product_id,
        p_qty: qNum
      })
      if (e2) throw e2

      onSuccess()
    } catch (e: any) {
      alert(e?.message || 'Falha ao solicitar transferência.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center overflow-y-auto">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header sticky */}
        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
          <div className="text-lg font-semibold">Solicitar transferência</div>
          <button onClick={onClose} className="text-zinc-500">fechar</button>
        </div>

        <Card title="Produto">
          <div className="text-sm">
            <div className="font-semibold">{product.produto}</div>
            <div className="text-xs text-zinc-500">{product.sku}</div>
          </div>
        </Card>

        <Card title="Origem e quantidade">
          <div className="grid grid-cols-1 gap-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Loja de origem</div>
              <select
                value={fromStoreId}
                onChange={e => setFromStoreId(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
              >
                {canFrom.map(s => (
                  <option key={s.store_id} value={s.store_id}>
                    {stores.find(x => x.id === s.store_id)?.nome || s.loja} · saldo {s.saldo}
                  </option>
                ))}
              </select>
              {canFrom.length === 0 && (
                <div className="text-xs text-amber-700 mt-1">Nenhuma loja com saldo disponível.</div>
              )}
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Quantidade</div>
              <input
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
              />
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Observações</div>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: Reposição vitrine"
              />
            </div>
          </div>
        </Card>

        {/* Footer sticky */}
        <div className="sticky bottom-0 bg-white pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button className="bg-zinc-800" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={loading || canFrom.length === 0}>
              {loading ? 'Enviando...' : 'Solicitar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
