import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { formatBRL } from '@/lib/currency'

type Store = { id: string; nome: string }
type CashOpen = { id: string; store_id: string; abertura_at: string; valor_inicial: number }
type CashTotal = { cash_id: string; valor_inicial: number; dinheiro: number; suprimentos: number; sangrias: number }

type SaleRow = { id: string; store_id: string; user_id: string | null; customer_id: string | null; status: string; created_at: string }
type ItemRow = { sale_id: string; qtde: number; preco_unit: number; desconto: number; product?: { id: string; sku: string; nome: string } | null }
type Profile = { id: string; nome?: string | null; email?: string | null }
type Customer = { id: string; nome?: string | null; documento?: string | null }

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [stores, setStores] = useState<Store[]>([])

  // Indicadores
  const [salesByDay, setSalesByDay] = useState<Array<{ day: string; valor: number }>>([])
  const [rankSellers, setRankSellers] = useState<Array<{ seller: string; valor: number }>>([])
  const [cashBalances, setCashBalances] = useState<Array<{ store: string; esperado: number }>>([])
  const [revByProduct, setRevByProduct] = useState<Array<{ label: string; valor: number }>>([])
  const [revByCustomer, setRevByCustomer] = useState<Array<{ label: string; valor: number }>>([])

  // Período padrão: últimos 14 dias
  const { startISO, endISO } = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 13)
    // normaliza para 00:00/23:59 do fuso
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { startISO: start.toISOString(), endISO: end.toISOString() }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        // 1) Descobrir company_id (perfil do usuário)
        const { data: { user } } = await supabase.auth.getUser()
        let comp: string | null = null
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
          comp = prof?.company_id ?? null
        }
        if (!comp) {
          // fallback: tenta company da loja selecionada (se houver)
          const saved = localStorage.getItem('app_selected_store')
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              comp = parsed?.company_id ?? null
            } catch {}
          }
        }
        if (!comp) {
          setError('Selecione uma loja em Config para definir a empresa.')
          setLoading(false)
          return
        }
        if (!mounted) return
        setCompanyId(comp)

        // 2) Lojas da empresa
        const { data: ds } = await supabase
          .from('stores')
          .select('id, nome')
          .eq('company_id', comp)
          .order('nome', { ascending: true })
        const storeList: Store[] = (ds || []) as any
        if (!mounted) return
        setStores(storeList)

        const storeIds = storeList.map(s => s.id)
        // Se não houver loja, para por aqui
        if (storeIds.length === 0) {
          setError('Não há lojas para esta empresa.')
          setLoading(false)
          return
        }

        // 3) Indicadores
        await Promise.all([
          loadSalesAndRevenue(comp, storeIds, startISO, endISO, mounted),
          loadCashBalances(storeList, mounted),
        ])
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Falha ao carregar o dashboard.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [startISO, endISO])

  // ---------- CARREGA VENDAS/RECEITA (com fallback) ----------
  async function loadSalesAndRevenue(compId: string, storeIds: string[], start: string, end: string, mounted: boolean) {
    // Tenta usar a view sale_paid (se existir). Se não, cai para o fallback com sales + sale_items.
    try {
      const tryView = await supabase
        .from('sale_paid')
        .select('paid_at, net, vendedor, user_id, store_id')
        .eq('company_id', compId)
        .gte('paid_at', start)
        .lte('paid_at', end)
        .order('paid_at', { ascending: true })

      if (tryView.error) throw tryView.error

      const rows = (tryView.data || []) as Array<{ paid_at: string; net: number; vendedor?: string | null; user_id?: string | null; store_id: string }>

      // vendas por dia
      const perDay = new Map<string, number>()
      for (const r of rows) {
        const d = new Date(r.paid_at)
        const key = d.toISOString().slice(0, 10)
        perDay.set(key, (perDay.get(key) || 0) + Number(r.net || 0))
      }
      const series = Array.from(perDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, valor]) => ({ day, valor }))

      // ranking vendedores
      const perSeller = new Map<string, number>()
      for (const r of rows) {
        const name = (r as any).vendedor || r.user_id || 'Sem vendedor'
        perSeller.set(name, (perSeller.get(name) || 0) + Number(r.net || 0))
      }
      const rank = Array.from(perSeller.entries()).map(([seller, valor]) => ({ seller, valor }))
        .sort((a, b) => b.valor - a.valor).slice(0, 7)

      // faturamento por produto / cliente — se a view não trouxer, calculamos por fallback
      const { data: sales } = await supabase
        .from('sales')
        .select('id, store_id, user_id, customer_id, status, created_at')
        .in('store_id', storeIds)
        .gte('created_at', start)
        .lte('created_at', end)

      const saleIds = (sales || []).filter(s => (s as any).status === 'PAGA').map(s => (s as any).id)
      let items: ItemRow[] = []
      if (saleIds.length > 0) {
        const { data: it } = await supabase
          .from('sale_items')
          .select('sale_id, qtde, preco_unit, desconto, product:products(id, sku, nome)')
          .in('sale_id', saleIds)
        items = (it || []) as any
      }

      const productMap = new Map<string, number>()
      const saleById = new Map<string, SaleRow>()
      ;(sales || []).forEach(s => saleById.set((s as any).id, s as any))

      for (const it of items) {
        const sale = saleById.get(it.sale_id)
        if (!sale || sale.status !== 'PAGA') continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const label = it.product?.sku ? `${it.product.sku} — ${it.product.nome || ''}`.trim() : (it.product?.nome || 'Produto')
        productMap.set(label, (productMap.get(label) || 0) + val)
      }
      const prodList = Array.from(productMap.entries()).map(([label, valor]) => ({ label, valor }))
        .sort((a, b) => b.valor - a.valor).slice(0, 7)

      // clientes
      const custMap = new Map<string, number>()
      const byCustomerIds = new Set<string>()
      for (const it of items) {
        const sale = saleById.get(it.sale_id)
        if (!sale || sale.status !== 'PAGA') continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const cid = sale.customer_id
        if (cid) byCustomerIds.add(cid)
        const key = cid || 'SEM'
        custMap.set(key, (custMap.get(key) || 0) + val)
      }

      let custNames = new Map<string, string>()
      if (byCustomerIds.size > 0) {
        try {
          const { data: custs } = await supabase
            .from('customers')
            .select('id, nome, documento')
            .in('id', Array.from(byCustomerIds))
          for (const c of (custs || []) as Customer[]) {
            custNames.set(c.id, c.nome || c.documento || 'Cliente')
          }
        } catch { /* tabela pode não existir */ }
      }
      const custList = Array.from(custMap.entries()).map(([id, valor]) => ({
        label: id === 'SEM' ? 'Sem cadastro' : (custNames.get(id) || 'Cliente'),
        valor
      })).sort((a, b) => b.valor - a.valor).slice(0, 7)

      if (!mounted) return
      setSalesByDay(series)
      setRankSellers(rank)
      setRevByProduct(prodList)
      setRevByCustomer(custList)
      return
    } catch {
      // Fallback: calcula tudo só com sales + sale_items (usa created_at/status)
      const { data: sales } = await supabase
        .from('sales')
        .select('id, store_id, user_id, customer_id, status, created_at')
        .in('store_id', storeIds)
        .gte('created_at', start)
        .lte('created_at', end)
      const okSales = (sales || []).filter(s => (s as any).status === 'PAGA') as SaleRow[]
      const saleIds = okSales.map(s => s.id)

      let items: ItemRow[] = []
      if (saleIds.length > 0) {
        const { data: it } = await supabase
          .from('sale_items')
          .select('sale_id, qtde, preco_unit, desconto, product:products(id, sku, nome)')
          .in('sale_id', saleIds)
        items = (it || []) as any
      }

      const byId = new Map<string, SaleRow>()
      okSales.forEach(s => byId.set(s.id, s))

      // por dia
      const perDay = new Map<string, number>()
      for (const it of items) {
        const sale = byId.get(it.sale_id)
        if (!sale) continue
        const d = new Date(sale.created_at).toISOString().slice(0, 10)
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        perDay.set(d, (perDay.get(d) || 0) + val)
      }
      const series = Array.from(perDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, valor]) => ({ day, valor }))

      // ranking vendedores
      const perSeller = new Map<string, number>()
      const sellerIds = new Set<string>()
      for (const it of items) {
        const sale = byId.get(it.sale_id)
        if (!sale) continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const uid = sale.user_id || 'SEM'
        if (sale.user_id) sellerIds.add(sale.user_id)
        perSeller.set(uid, (perSeller.get(uid) || 0) + val)
      }
      const names = new Map<string, string>()
      if (sellerIds.size > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, nome, email').in('id', Array.from(sellerIds))
        for (const p of (profs || []) as Profile[]) {
          names.set(p.id, p.nome || p.email || 'Vendedor')
        }
      }
      const rank = Array.from(perSeller.entries()).map(([uid, valor]) => ({
        seller: uid === 'SEM' ? 'Sem vendedor' : (names.get(uid) || 'Vendedor'),
        valor
      })).sort((a, b) => b.valor - a.valor).slice(0, 7)

      // por produto
      const productMap = new Map<string, number>()
      for (const it of items) {
        const sale = byId.get(it.sale_id)
        if (!sale) continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const label = it.product?.sku ? `${it.product.sku} — ${it.product?.nome || ''}`.trim() : (it.product?.nome || 'Produto')
        productMap.set(label, (productMap.get(label) || 0) + val)
      }
      const prodList = Array.from(productMap.entries()).map(([label, valor]) => ({ label, valor }))
        .sort((a, b) => b.valor - a.valor).slice(0, 7)

      // por cliente
      const custMap = new Map<string, number>()
      const byCustomerIds = new Set<string>()
      for (const it of items) {
        const sale = byId.get(it.sale_id)
        if (!sale) continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const key = sale.customer_id || 'SEM'
        if (sale.customer_id) byCustomerIds.add(sale.customer_id)
        custMap.set(key, (custMap.get(key) || 0) + val)
      }
      let custNames = new Map<string, string>()
      if (byCustomerIds.size > 0) {
        try {
          const { data: custs } = await supabase.from('customers').select('id, nome, documento').in('id', Array.from(byCustomerIds))
          for (const c of (custs || []) as Customer[]) {
            custNames.set(c.id, c.nome || c.documento || 'Cliente')
          }
        } catch {}
      }
      const custList = Array.from(custMap.entries()).map(([id, valor]) => ({
        label: id === 'SEM' ? 'Sem cadastro' : (custNames.get(id) || 'Cliente'),
        valor
      })).sort((a, b) => b.valor - a.valor).slice(0, 7)

      if (!mounted) return
      setSalesByDay(series)
      setRankSellers(rank)
      setRevByProduct(prodList)
      setRevByCustomer(custList)
    }
  }

  // ---------- CARREGA SALDO EM CADA PDV ----------
  async function loadCashBalances(storeList: Store[], mounted: boolean) {
    try {
      const storeIds = storeList.map(s => s.id)
      const { data: cs } = await supabase
        .from('cash_sessions')
        .select('id, store_id, abertura_at, valor_inicial, status, fechamento_at')
        .is('fechamento_at', null)
        .in('store_id', storeIds)
        .eq('status', 'ABERTO')
      const opens: CashOpen[] = (cs || []).map((r: any) => ({
        id: r.id,
        store_id: r.store_id,
        abertura_at: r.abertura_at,
        valor_inicial: Number(r.valor_inicial || 0),
      }))

      if (opens.length === 0) {
        if (mounted) setCashBalances([])
        return
      }

      const cashIds = opens.map(o => o.id)
      let totals: CashTotal[] = []
      try {
        const { data: vt } = await supabase
          .from('v_cash_session_totals')
          .select('cash_id, valor_inicial, dinheiro, suprimentos, sangrias')
          .in('cash_id', cashIds)
        totals = (vt || []).map((r: any) => ({
          cash_id: r.cash_id,
          valor_inicial: Number(r.valor_inicial || 0),
          dinheiro: Number(r.dinheiro || 0),
          suprimentos: Number(r.suprimentos || 0),
          sangrias: Number(r.sangrias || 0),
        }))
      } catch {
        // se a view não existir, usa só valor_inicial
        totals = opens.map(o => ({
          cash_id: o.id, valor_inicial: o.valor_inicial, dinheiro: 0, suprimentos: 0, sangrias: 0
        }))
      }

      const byCash = new Map(totals.map(t => [t.cash_id, t]))
      const list = opens.map(o => {
        const t = byCash.get(o.id)
        const esperado = (t?.valor_inicial || 0) + (t?.dinheiro || 0) + (t?.suprimentos || 0) - (t?.sangrias || 0)
        const storeName = storeList.find(s => s.id === o.store_id)?.nome || 'Loja'
        return { store: storeName, esperado }
      })

      if (mounted) setCashBalances(list)
    } catch {
      if (mounted) setCashBalances([])
    }
  }

  // ---------- RENDER ----------
  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="text-xs text-zinc-500">{companyId ? `Empresa: ${companyId.slice(0, 8)}…` : ''}</div>
      </div>

      {error && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>
      )}

      {/* KPIs rápidos */}
      <Card title="Vendas por dia (últimos 14)">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : salesByDay.length === 0 ? (
          <div className="text-sm text-zinc-500">Sem vendas no período.</div>
        ) : (
          <div className="space-y-1 text-sm">
            {salesByDay.map((d) => (
              <div key={d.day} className="flex items-center justify-between">
                <div>{new Date(d.day + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                <div className="font-semibold">{formatBRL(d.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Ranking por vendedor">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : rankSellers.length === 0 ? (
          <div className="text-sm text-zinc-500">Sem dados de vendedores.</div>
        ) : (
          <div className="space-y-1 text-sm">
            {rankSellers.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>{i + 1}. {r.seller}</div>
                <div className="font-semibold">{formatBRL(r.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Saldo em cada PDV (caixas abertos)">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : cashBalances.length === 0 ? (
          <div className="text-sm text-zinc-500">Nenhum caixa aberto.</div>
        ) : (
          <div className="space-y-1 text-sm">
            {cashBalances.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>{c.store}</div>
                <div className="font-semibold">{formatBRL(c.esperado)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Faturamento por produto (Top 7)">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : revByProduct.length === 0 ? (
          <div className="text-sm text-zinc-500">Sem itens vendidos no período.</div>
        ) : (
          <div className="space-y-1 text-sm">
            {revByProduct.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="truncate">{i + 1}. {p.label}</div>
                <div className="font-semibold">{formatBRL(p.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Faturamento por cliente (Top 7)">
        {loading ? (
          <div className="text-sm text-zinc-500">Carregando…</div>
        ) : revByCustomer.length === 0 ? (
          <div className="text-sm text-zinc-500">Sem clientes no período.</div>
        ) : (
          <div className="space-y-1 text-sm">
            {revByCustomer.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="truncate">{i + 1}. {c.label}</div>
                <div className="font-semibold">{formatBRL(c.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Atalhos ADM */}
      <Card title="Ações rápidas">
        <div className="grid grid-cols-2 gap-2">
          <a href="/adm/products"><Button>Produtos</Button></a>
          <a href="/adm/stock"><Button>Estoque</Button></a>
          <a href="/adm/reports"><Button>Relatórios</Button></a>
          <a href="/adm/settings"><Button>Configurações</Button></a>
          <a href="/loja"><Button className="bg-zinc-800">Ir para PDV</Button></a>
        </div>
      </Card>
    </div>
  )
}