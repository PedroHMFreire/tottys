import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { logActivity } from '@/lib/activity'

type Store = { id: string; nome: string; company_id?: string | null }
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
  stores: Array<{ store_id: string; loja: string; saldo: number; company_id: string }>
}

export default function Stock() {
  const { store, company, setCompany } = useApp()
  const { role } = useRole()
  const isOwner = role === 'OWNER'
  const [scope, setScope] = useState<'company' | 'global'>('company')
  const [companies, setCompanies] = useState<Array<{ id: string; nome: string }>>([])
  const [globalCompanyId, setGlobalCompanyId] = useState<string>('')
  const [globalStoreId, setGlobalStoreId] = useState<string>('')
  const [globalStores, setGlobalStores] = useState<Array<{ id: string; nome: string; company_id: string }>>([])
  const [stores, setStores] = useState<Store[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PositionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [transferProd, setTransferProd] = useState<GroupedProduct | null>(null)
  const [adjustProd, setAdjustProd] = useState<GroupedProduct | null>(null)
  const [adjustStoreId, setAdjustStoreId] = useState<string>('')
  const [adjustQty, setAdjustQty] = useState<string>('1')
  const [adjustType, setAdjustType] = useState<'ENTRADA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'>('ENTRADA')
  const [adjustReason, setAdjustReason] = useState<string>('')

  const companyId = scope === 'global' ? (globalCompanyId || null) : (company?.id || store?.company_id || null)
  const myStoreId = store?.id || null
  const canTransfer = scope === 'company' && !!companyId && !!myStoreId
  const canAdjust = scope === 'company' && !!companyId

  const companyMap = useMemo(() => {
    const map = new Map<string, string>()
    companies.forEach(c => map.set(c.id, c.nome))
    return map
  }, [companies])

  useEffect(() => {
    if (!isOwner) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, nome')
          .order('nome', { ascending: true })
        if (error) throw error
        if (mounted) setCompanies((data || []) as any[])
      } catch {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [isOwner])

  useEffect(() => {
    if (!isOwner || scope !== 'global') return
    let mounted = true
    ;(async () => {
      try {
        let q = supabase.from('stores').select('id, nome, company_id').order('nome', { ascending: true })
        if (globalCompanyId) q = q.eq('company_id', globalCompanyId)
        const { data, error } = await q
        if (error) throw error
        if (mounted) setGlobalStores((data || []) as any[])
      } catch {
        if (mounted) setGlobalStores([])
      }
    })()
    return () => { mounted = false }
  }, [isOwner, scope, globalCompanyId])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!companyId && scope !== 'global') return
      let q = supabase.from('stores').select('id, nome, company_id').order('nome', { ascending: true })
      if (companyId) q = q.eq('company_id', companyId)
      if (scope === 'global' && globalStoreId) q = q.eq('id', globalStoreId)
      const { data, error } = await q
      if (!error && data && mounted) setStores(data as Store[])
    })()
    return () => { mounted = false }
  }, [companyId, scope, globalStoreId])

  async function search() {
    if (!companyId && scope !== 'global') { setError('Selecione uma empresa em Config.'); return }
    setError(null)
    setLoading(true)
    try {
      const term = q.trim()
      let out: PositionRow[] = []

      // Se parece EAN/GTIN (só dígitos, 8–14+), tentamos achar pelo barcode
      const looksLikeEAN = /^[0-9]{8,14,}$/.test(term)

      if (looksLikeEAN) {
        // acha product_id(s) pelo barcode
        let q1 = supabase
          .from('products')
          .select('id, sku, nome')
          .eq('barcode', term)
          .limit(25)
        if (companyId) q1 = q1.eq('company_id', companyId)
        const { data: prods, error: e1 } = await q1
        if (e1) throw e1
        const ids = (prods || []).map(p => p.id)
        if (ids.length > 0) {
          let q2 = supabase
            .from('v_stock_position_detail')
            .select('company_id, product_id, sku, produto, store_id, loja, saldo, last_move_at')
            .in('product_id', ids)
            .order('produto', { ascending: true })
          if (companyId) q2 = q2.eq('company_id', companyId)
          if (scope === 'global' && globalStoreId) q2 = q2.eq('store_id', globalStoreId)
          const { data, error: e2 } = await q2
          if (e2) throw e2
          out = (data || []) as PositionRow[]
        }
      }

      // Se não achou por EAN ou não é EAN, busca por SKU/Nome
      if (out.length === 0) {
        const filter = term ? { q: term } : null
        let query = supabase
          .from('v_stock_position_detail')
          .select('company_id, product_id, sku, produto, store_id, loja, saldo, last_move_at')
          .order('produto', { ascending: true })
          .limit(300)
        if (companyId) query = query.eq('company_id', companyId)
        if (scope === 'global' && globalStoreId) query = query.eq('store_id', globalStoreId)

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
      map.get(r.product_id)!.stores.push({
        store_id: r.store_id,
        loja: r.loja,
        saldo: Number(r.saldo || 0),
        company_id: r.company_id,
      })
    })
    return Array.from(map.values()).sort((a, b) => a.produto.localeCompare(b.produto))
  }, [rows])

  async function submitAdjust() {
    if (!adjustProd) return
    if (!companyId) return alert('Selecione uma empresa.')
    if (!adjustStoreId) return alert('Selecione a loja.')
    const qtyNum = Math.max(1, Number(adjustQty || 0))
    if (!qtyNum) return alert('Informe a quantidade.')

    const delta = adjustType === 'AJUSTE_NEGATIVO' ? -qtyNum : qtyNum

    try {
      // 1) Prefer RPC segura (se existir)
      const rpc = await supabase.rpc('stock_adjust', {
        p_company_id: companyId,
        p_store_id: adjustStoreId,
        p_product_id: adjustProd.product_id,
        p_qty: delta,
        p_type: adjustType,
        p_reason: adjustReason || null,
      })
      if (rpc.error) throw rpc.error
    } catch {
      // 2) Fallback direto (funciona em ambientes sem RPC/trigger)
      try {
        const { data: cur } = await supabase
          .from('product_stock')
          .select('qty')
          .eq('store_id', adjustStoreId)
          .eq('product_id', adjustProd.product_id)
          .maybeSingle()
        const current = Number((cur as any)?.qty || 0)
        const nextQty = Math.max(0, current + delta)
        const { error: upErr } = await supabase
          .from('product_stock')
          .upsert({
            store_id: adjustStoreId,
            product_id: adjustProd.product_id,
            qty: nextQty,
          }, { onConflict: 'store_id,product_id' })
        if (upErr) throw upErr
      } catch (e: any) {
        alert(e?.message || 'Não foi possível ajustar o estoque. Configure o banco para habilitar.')
        return
      }
    }

    alert('Ajuste registrado.')
    logActivity(`Ajuste de estoque • ${adjustType.replace('_', ' ').toLowerCase()} • ${qtyNum}${adjustProd?.produto ? ` • ${adjustProd.produto}` : ''}`, 'info', {
      store_id: adjustStoreId,
      product_id: adjustProd.product_id,
      qty: qtyNum,
      type: adjustType,
    })
    setAdjustProd(null)
    setAdjustQty('1')
    setAdjustReason('')
    setAdjustStoreId('')
    search()
  }

  const stockByCompany = useMemo(() => {
    if (scope !== 'global') return []
    const map = new Map<string, number>()
    rows.forEach(r => {
      map.set(r.company_id, (map.get(r.company_id) || 0) + Number(r.saldo || 0))
    })
    return Array.from(map.entries())
      .map(([company_id, total]) => ({ company_id, nome: companyMap.get(company_id) || company_id, total }))
      .sort((a, b) => b.total - a.total)
  }, [rows, scope, companyMap])

  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Estoque</h1>

      {scope !== 'global' && !companyId && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
          Selecione uma <b>empresa</b> em <b>Config</b> para consultar estoques.
        </div>
      )}

      <Card title="Visão">
        {isOwner ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-xl border px-3 py-2 text-sm ${scope === 'company' ? 'bg-zinc-900 text-white' : 'bg-white'}`}
                onClick={() => setScope('company')}
              >
                Por empresa
              </button>
              <button
                className={`rounded-xl border px-3 py-2 text-sm ${scope === 'global' ? 'bg-zinc-900 text-white' : 'bg-white'}`}
                onClick={() => setScope('global')}
              >
                Global
              </button>
            </div>
            {scope === 'company' && (
              <div>
                <div className="text-xs text-zinc-500 mb-1">Empresa ativa</div>
                <select
                  className="w-full rounded-2xl border px-3 py-2"
                  value={company?.id || ''}
                  onChange={e => {
                    const id = e.target.value
                    const selected = companies.find(c => c.id === id)
                    if (selected) setCompany(selected as any)
                  }}
                >
                  <option value="" disabled>Selecione...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
            {scope === 'global' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Filtrar por empresa</div>
                  <select
                    className="w-full rounded-2xl border px-3 py-2"
                    value={globalCompanyId}
                    onChange={e => {
                      setGlobalCompanyId(e.target.value)
                      setGlobalStoreId('')
                    }}
                  >
                    <option value="">Todas</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Filtrar por loja</div>
                  <select
                    className="w-full rounded-2xl border px-3 py-2"
                    value={globalStoreId}
                    onChange={e => setGlobalStoreId(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {globalStores.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nome} {companyMap.get(s.company_id) ? `• ${companyMap.get(s.company_id)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-zinc-500">Você está na visão da sua empresa.</div>
        )}
      </Card>

      <Card title="Buscar produto">
        <div className="grid grid-cols-1 gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="w-full rounded-2xl border px-3 py-2"
            placeholder="SKU, nome ou EAN"
          />
          <Button onClick={search} disabled={loading || (scope !== 'global' && !companyId)}>
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

      {scope !== 'global' && grouped.length > 0 && (
        <Card title="Alertas rápidos">
          <div className="text-sm text-zinc-700 space-y-1">
            {grouped.filter(g => g.stores.reduce((a, s) => a + (s.saldo || 0), 0) === 0).slice(0, 3).map(g => (
              <div key={g.product_id}>• Sem estoque: {g.produto}</div>
            ))}
            {grouped.filter(g => g.stores.reduce((a, s) => a + (s.saldo || 0), 0) > 0 && g.stores.every(s => s.saldo <= 2)).slice(0, 3).map(g => (
              <div key={g.product_id}>• Estoque baixo: {g.produto}</div>
            ))}
            {grouped.length === 0 && <div>Nenhum alerta.</div>}
          </div>
        </Card>
      )}

      {scope === 'global' && stockByCompany.length > 0 && (
        <Card title="Resumo por empresa (saldo total)">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-zinc-500">
              <th className="py-1">Empresa</th><th className="text-right">Saldo</th>
            </tr></thead>
            <tbody>
              {stockByCompany.slice(0, 10).map(r => (
                <tr key={r.company_id} className="border-t">
                  <td className="py-1">{r.nome}</td>
                  <td className="text-right">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
                          <div className="text-zinc-600">
                            {s.loja}
                            {scope === 'global' && companyMap.get(s.company_id) ? (
                              <span className="text-xs text-zinc-400"> • {companyMap.get(s.company_id)}</span>
                            ) : null}
                          </div>
                          <div className="font-medium">{s.saldo}</div>
                        </div>
                      ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    {canTransfer && canTransferFrom.length > 0 && (
                      <Button onClick={() => setTransferProd(g)}>Solicitar transferência</Button>
                    )}
                    {canAdjust && (
                      <Button className="bg-zinc-800" onClick={() => {
                        setAdjustProd(g)
                        setAdjustStoreId(myStoreId || '')
                        setAdjustQty('1')
                        setAdjustType('ENTRADA')
                        setAdjustReason('')
                      }}>Entrada/Ajuste</Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {transferProd && canTransfer && companyId && (
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

      {adjustProd && canAdjust && companyId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Entrada/Ajuste de estoque</div>
              <button onClick={() => setAdjustProd(null)} className="text-zinc-500">fechar</button>
            </div>
            <div className="text-sm">
              <div><b>Produto:</b> {adjustProd.produto}</div>
              <div className="text-xs text-zinc-500">{adjustProd.sku}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Loja</div>
              <select
                className="w-full rounded-2xl border px-3 py-2"
                value={adjustStoreId}
                onChange={e => setAdjustStoreId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Tipo</div>
                <select
                  className="w-full rounded-2xl border px-3 py-2"
                  value={adjustType}
                  onChange={e => setAdjustType(e.target.value as any)}
                >
                  <option value="ENTRADA">Entrada</option>
                  <option value="AJUSTE_POSITIVO">Ajuste +</option>
                  <option value="AJUSTE_NEGATIVO">Ajuste -</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Quantidade</div>
                <input
                  className="w-full rounded-2xl border px-3 py-2"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Motivo (opcional)</div>
              <input
                className="w-full rounded-2xl border px-3 py-2"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
                placeholder="Ex.: quebra, inventário, recebimento"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button className="bg-zinc-800" onClick={() => setAdjustProd(null)}>Cancelar</Button>
              <Button onClick={submitAdjust}>Salvar</Button>
            </div>
          </div>
        </div>
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
