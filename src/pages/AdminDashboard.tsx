import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
import { formatBRL } from '@/lib/currency'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'

type Store = { id: string; nome: string; company_id?: string | null }
type Company = { id: string; nome: string }
type CashOpen = { id: string; store_id: string; abertura_at: string; valor_inicial: number }
type CashTotal = { cash_id: string; valor_inicial: number; dinheiro: number; suprimentos: number; sangrias: number }

type SaleRow = { id: string; store_id: string; user_id: string | null; customer_id: string | null; status: string; created_at: string }
type ItemRow = { sale_id: string; qtde: number; preco_unit: number; desconto: number; product?: { id: string; sku: string; nome: string } | null }
type Profile = { id: string; nome?: string | null; email?: string | null }
type Customer = { id: string; nome?: string | null; documento?: string | null }

export default function AdminDashboard() {
  const { company, setCompany } = useApp()
  const { role } = useRole()
  const isOwner = role === 'OWNER'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [scope, setScope] = useState<'company' | 'global'>('company')
  const [companies, setCompanies] = useState<Company[]>([])
  const [globalCompanyId, setGlobalCompanyId] = useState<string>('')
  const [globalStoreId, setGlobalStoreId] = useState<string>('')
  const [globalStores, setGlobalStores] = useState<Array<{ id: string; nome: string; company_id: string }>>([])
  const [stores, setStores] = useState<Store[]>([])

  // Indicadores
  const [salesByDay, setSalesByDay] = useState<Array<{ day: string; valor: number }>>([])
  const [rankSellers, setRankSellers] = useState<Array<{ seller: string; valor: number }>>([])
  const [cashBalances, setCashBalances] = useState<Array<{ store: string; esperado: number }>>([])
  const [companyCashSummary, setCompanyCashSummary] = useState<Array<{ company_id: string; nome: string; esperado: number }>>([])
  const [globalKpis, setGlobalKpis] = useState<{ faturamento: number; cupons: number; ticket: number; caixasAbertos: number }>({
    faturamento: 0,
    cupons: 0,
    ticket: 0,
    caixasAbertos: 0,
  })
  const [globalStockTotal, setGlobalStockTotal] = useState<number>(0)
  const [companyStockSummary, setCompanyStockSummary] = useState<Array<{ company_id: string; nome: string; total: number }>>([])
  const [revByProduct, setRevByProduct] = useState<Array<{ label: string; valor: number }>>([])
  const [revByCustomer, setRevByCustomer] = useState<Array<{ label: string; valor: number }>>([])
  const [companySummary, setCompanySummary] = useState<Array<{ company_id: string; nome: string; valor: number }>>([])
  const companyMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of companies) map.set(c.id, c.nome)
    return map
  }, [companies])

  function csvDownload(name: string, rows: any[]) {
    if (!rows?.length) return
    const cols = Object.keys(rows[0])
    const esc = (v: any) => {
      const s = v == null ? '' : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc((r as any)[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
    if (!isOwner) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, nome')
          .order('nome', { ascending: true })
        if (error) throw error
        if (mounted) setCompanies((data || []) as Company[])
      } catch {
        // ignore company list error
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
      setLoading(true); setError(null)
      try {
        // 1) Descobrir company_id (perfil do usuário)
        const { data: { user } } = await supabase.auth.getUser()
        let comp: string | null = null
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
          comp = company?.id ?? prof?.company_id ?? null
          if (!company && prof?.company_id) {
            const { data: compRow } = await supabase
              .from('companies')
              .select('id, nome')
              .eq('id', prof.company_id)
              .maybeSingle()
            if (compRow) setCompany(compRow as any)
          }
        }
        if (isOwner && scope === 'global') {
          comp = globalCompanyId || null
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
        if (!comp && !(isOwner && scope === 'global')) {
          setError('Selecione uma empresa para definir o escopo.')
          setLoading(false)
          return
        }
        if (!mounted) return
        setCompanyId(comp)

        // 2) Lojas da empresa
        let storeQuery = supabase
          .from('stores')
          .select('id, nome, company_id')
          .order('nome', { ascending: true })
        if (comp) storeQuery = storeQuery.eq('company_id', comp)
        if (scope === 'global' && globalStoreId) storeQuery = storeQuery.eq('id', globalStoreId)
        const { data: ds } = await storeQuery
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
          loadSalesAndRevenue(comp, storeIds, startISO, endISO, mounted, storeList),
          loadCashBalances(storeList, mounted),
          loadGlobalStock(comp, mounted),
        ])
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Falha ao carregar o dashboard.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [startISO, endISO, company, setCompany, scope, isOwner, globalCompanyId, globalStoreId])

  useEffect(() => {
    if (company?.id) setCompanyId(company.id)
  }, [company?.id])

  // ---------- CARREGA VENDAS/RECEITA (com fallback) ----------
  async function loadSalesAndRevenue(
    compId: string | null,
    storeIds: string[],
    start: string,
    end: string,
    mounted: boolean,
    storeList: Store[],
  ) {
    // Tenta usar a view sale_paid (se existir). Se não, cai para o fallback com sales + sale_items.
    try {
      let viewQuery = supabase
        .from('sale_paid')
        .select('paid_at, net, vendedor, user_id, store_id')
        .gte('paid_at', start)
        .lte('paid_at', end)
        .order('paid_at', { ascending: true })
      if (compId) viewQuery = viewQuery.eq('company_id', compId)
      const tryView = await viewQuery

      if (tryView.error) throw tryView.error

      const rows = (tryView.data || []) as Array<{ paid_at: string; net: number; vendedor?: string | null; user_id?: string | null; store_id: string }>
      const storeCompanyMap = new Map(storeList.map(s => [s.id, s.company_id || '']))

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

      if (scope === 'global') {
        const faturamento = Array.from(perDay.values()).reduce((a, v) => a + v, 0)
        const cupons = rows.length
        const ticket = cupons > 0 ? faturamento / cupons : 0
        if (mounted) setGlobalKpis(prev => ({ ...prev, faturamento, cupons, ticket }))
      }

      // ranking vendedores
      const perSeller = new Map<string, number>()
      for (const r of rows) {
        const name = (r as any).vendedor || r.user_id || 'Sem vendedor'
        perSeller.set(name, (perSeller.get(name) || 0) + Number(r.net || 0))
      }
      const rank = Array.from(perSeller.entries()).map(([seller, valor]) => ({ seller, valor }))
        .sort((a, b) => b.valor - a.valor).slice(0, 7)

      // resumo por empresa (somente global)
      if (scope === 'global') {
        const perCompany = new Map<string, number>()
        for (const r of rows) {
          const cid = storeCompanyMap.get(r.store_id) || 'SEM'
          perCompany.set(cid, (perCompany.get(cid) || 0) + Number(r.net || 0))
        }
        const summary = Array.from(perCompany.entries()).map(([company_id, valor]) => ({
          company_id,
          nome: companyMap.get(company_id) || company_id,
          valor,
        })).sort((a, b) => b.valor - a.valor)
        if (mounted) setCompanySummary(summary)
      } else if (mounted) {
        setCompanySummary([])
      }

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

      const storeCompanyMap = new Map(storeList.map(s => [s.id, s.company_id || '']))

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

      if (scope === 'global') {
        const faturamento = Array.from(perDay.values()).reduce((a, v) => a + v, 0)
        const cupons = okSales.length
        const ticket = cupons > 0 ? faturamento / cupons : 0
        if (mounted) setGlobalKpis(prev => ({ ...prev, faturamento, cupons, ticket }))
      }

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

      // resumo por empresa (fallback)
      if (scope === 'global') {
        const perCompany = new Map<string, number>()
        for (const it of items) {
          const sale = byId.get(it.sale_id)
          if (!sale) continue
          const cid = storeCompanyMap.get(sale.store_id) || 'SEM'
          const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
          perCompany.set(cid, (perCompany.get(cid) || 0) + val)
        }
        const summary = Array.from(perCompany.entries()).map(([company_id, valor]) => ({
          company_id,
          nome: companyMap.get(company_id) || company_id,
          valor,
        })).sort((a, b) => b.valor - a.valor)
        if (mounted) setCompanySummary(summary)
      } else if (mounted) {
        setCompanySummary([])
      }

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
        if (mounted) setCompanyCashSummary([])
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
        const st = storeList.find(s => s.id === o.store_id)
        const base = st?.nome || 'Loja'
        const companyName = st?.company_id ? companyMap.get(st.company_id) : ''
        const storeName = companyName ? `${base} • ${companyName}` : base
        return { store: storeName, esperado }
      })

      if (mounted) setCashBalances(list)

      if (scope === 'global') {
        const storeCompanyMap = new Map(storeList.map(s => [s.id, s.company_id || 'SEM']))
        const perCompany = new Map<string, number>()
        opens.forEach(o => {
          const t = byCash.get(o.id)
          const esperado = (t?.valor_inicial || 0) + (t?.dinheiro || 0) + (t?.suprimentos || 0) - (t?.sangrias || 0)
          const cid = storeCompanyMap.get(o.store_id) || 'SEM'
          perCompany.set(cid, (perCompany.get(cid) || 0) + Number(esperado || 0))
        })
        const summary = Array.from(perCompany.entries()).map(([company_id, esperado]) => ({
          company_id,
          nome: companyMap.get(company_id) || company_id,
          esperado,
        })).sort((a, b) => b.esperado - a.esperado)
        if (mounted) setCompanyCashSummary(summary)
        if (mounted) setGlobalKpis(prev => ({ ...prev, caixasAbertos: opens.length }))
      } else if (mounted) {
        setCompanyCashSummary([])
      }
    } catch {
      if (mounted) setCashBalances([])
    }
  }

  async function loadGlobalStock(compId: string | null, mounted: boolean) {
    try {
      if (scope !== 'global') {
        if (mounted) setGlobalStockTotal(0)
        if (mounted) setCompanyStockSummary([])
        return
      }
      let q = supabase
        .from('v_stock_position_detail')
        .select('saldo, company_id')
      if (compId) q = q.eq('company_id', compId)
      const { data, error } = await q
      if (error) throw error
      const total = (data || []).reduce((a: number, r: any) => a + Number(r.saldo || 0), 0)
      if (mounted) setGlobalStockTotal(total)

      const perCompany = new Map<string, number>()
      for (const r of (data || []) as any[]) {
        const cid = r.company_id || 'SEM'
        perCompany.set(cid, (perCompany.get(cid) || 0) + Number(r.saldo || 0))
      }
      const summary = Array.from(perCompany.entries()).map(([company_id, total]) => ({
        company_id,
        nome: companyMap.get(company_id) || company_id,
        total,
      })).sort((a, b) => b.total - a.total)
      if (mounted) setCompanyStockSummary(summary)
    } catch {
      if (mounted) setGlobalStockTotal(0)
      if (mounted) setCompanyStockSummary([])
    }
  }

  // ---------- RENDER ----------
  return (
    <div className="pb-24 max-w-md mx-auto p-4 space-y-4">
      <div className="rounded-2xl border bg-white p-3 space-y-2">
        <div className="text-sm font-semibold">Visão</div>
        {isOwner ? (
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
        ) : (
          <div className="text-xs text-zinc-500">Você está na visão da sua empresa.</div>
        )}

        {scope === 'company' && isOwner && (
          <div>
            <div className="text-xs text-zinc-500 mb-1">Empresa ativa</div>
            <select
              className="w-full rounded-xl border px-2 py-2 text-sm"
              value={company?.id || ''}
              onChange={e => {
                const id = e.target.value
                const selected = companies.find(c => c.id === id)
                if (selected) setCompany(selected as any)
              }}
            >
              <option value="" disabled>Selecione...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}
        {scope === 'global' && isOwner && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Filtrar por empresa</div>
              <select
                className="w-full rounded-xl border px-2 py-2 text-sm"
                value={globalCompanyId}
                onChange={e => {
                  setGlobalCompanyId(e.target.value)
                  setGlobalStoreId('')
                }}
              >
                <option value="">Todas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Filtrar por loja</div>
              <select
                className="w-full rounded-xl border px-2 py-2 text-sm"
                value={globalStoreId}
                onChange={e => setGlobalStoreId(e.target.value)}
              >
                <option value="">Todas</option>
                {globalStores.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nome} {companyMap.get(s.company_id || '') ? `• ${companyMap.get(s.company_id || '')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="text-xs text-zinc-500">
          {scope === 'global'
            ? 'Visão Global'
            : (company?.nome ? `Empresa: ${company.nome}` : (companyId ? `Empresa: ${companyId.slice(0, 8)}…` : ''))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">{error}</div>
      )}

      {scope === 'global' && companySummary.length > 0 && (
        <Card title="Resumo por empresa (faturamento)">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-zinc-500">
              <th className="py-1">Empresa</th><th className="text-right">Faturamento</th>
            </tr></thead>
            <tbody>
              {companySummary.slice(0, 10).map(r => (
                <tr key={r.company_id} className="border-t">
                  <td className="py-1">{r.nome}</td>
                  <td className="text-right">{formatBRL(r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <Button onClick={() => csvDownload('faturamento_por_empresa', companySummary)}>Exportar CSV</Button>
          </div>
        </Card>
      )}

      {scope === 'global' && companyCashSummary.length > 0 && (
        <Card title="Resumo por empresa (caixa em aberto)">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-zinc-500">
              <th className="py-1">Empresa</th><th className="text-right">Esperado</th>
            </tr></thead>
            <tbody>
              {companyCashSummary.slice(0, 10).map(r => (
                <tr key={r.company_id} className="border-t">
                  <td className="py-1">{r.nome}</td>
                  <td className="text-right">{formatBRL(r.esperado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <Button onClick={() => csvDownload('caixa_por_empresa', companyCashSummary)}>Exportar CSV</Button>
          </div>
        </Card>
      )}

      {scope === 'global' && (
        <Card title="Consolidação Global">
          <div className="grid grid-cols-2 gap-2">
            <KPI label="Faturamento" value={formatBRL(globalKpis.faturamento)} />
            <KPI label="Cupons" value={String(globalKpis.cupons)} />
            <KPI label="Ticket Médio" value={formatBRL(globalKpis.ticket)} />
            <KPI label="Caixas abertos" value={String(globalKpis.caixasAbertos)} />
            <KPI label="Estoque total" value={String(globalStockTotal)} />
          </div>
          <div className="mt-2">
            <Button onClick={() => csvDownload('kpis_globais', [{ ...globalKpis, estoque_total: globalStockTotal }])}>Exportar CSV</Button>
          </div>
        </Card>
      )}

      {scope === 'global' && (
        <Card title="Insights rápidos">
          <div className="text-sm text-zinc-700 space-y-1">
            {companySummary.length > 0 && (
              <div>• Empresa líder: <b>{companySummary[0].nome}</b> ({formatBRL(companySummary[0].valor)})</div>
            )}
            {companyCashSummary.length > 0 && (
              <div>• Maior caixa aberto: <b>{companyCashSummary[0].nome}</b> ({formatBRL(companyCashSummary[0].esperado)})</div>
            )}
            {companyStockSummary.length > 0 && (
              <div>• Maior estoque: <b>{companyStockSummary[0].nome}</b> ({companyStockSummary[0].total})</div>
            )}
          </div>
        </Card>
      )}

      {scope === 'global' && companyStockSummary.length > 0 && (
        <Card title="Resumo por empresa (estoque)">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-zinc-500">
              <th className="py-1">Empresa</th><th className="text-right">Saldo</th>
            </tr></thead>
            <tbody>
              {companyStockSummary.slice(0, 10).map(r => (
                <tr key={r.company_id} className="border-t">
                  <td className="py-1">{r.nome}</td>
                  <td className="text-right">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2">
            <Button onClick={() => csvDownload('estoque_por_empresa', companyStockSummary)}>Exportar CSV</Button>
          </div>
        </Card>
      )}

      {scope === 'global' && (
        <Card title="Consolidado por empresa (CSV)">
          <div className="text-sm text-zinc-600">
            Exporta um CSV com faturamento, caixa em aberto e estoque por empresa.
          </div>
          <div className="mt-2">
            <Button onClick={() => {
              const all = new Map<string, any>()
              companySummary.forEach(r => all.set(r.company_id, {
                company_id: r.company_id,
                nome: r.nome,
                faturamento: r.valor,
              }))
              companyCashSummary.forEach(r => {
                const cur = all.get(r.company_id) || { company_id: r.company_id, nome: r.nome }
                cur.caixa_aberto = r.esperado
                all.set(r.company_id, cur)
              })
              companyStockSummary.forEach(r => {
                const cur = all.get(r.company_id) || { company_id: r.company_id, nome: r.nome }
                cur.estoque_total = r.total
                all.set(r.company_id, cur)
              })
              csvDownload('consolidado_por_empresa', Array.from(all.values()))
            }}>Exportar Consolidado</Button>
          </div>
        </Card>
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
          <a href="/adm/users"><Button>Usuários</Button></a>
          <a href="/loja"><Button className="bg-zinc-800">Ir para PDV</Button></a>
        </div>
      </Card>
    </div>
  )
}
