import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Building2, Package, Warehouse, BarChart3, Settings,
  Users, ArrowRight, Store, TrendingUp, Wallet, ShoppingCart,
  CreditCard, Download, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import SetupChecklist from '@/components/onboarding/SetupChecklist'

/* ─── Types ─────────────────────────────────────────────────────────── */
type StoreRow    = { id: string; nome: string; company_id?: string | null }
type Company     = { id: string; nome: string }
type CashOpen    = { id: string; store_id: string; abertura_at: string; valor_inicial: number }
type CashTotal   = { cash_id: string; valor_inicial: number; dinheiro: number; suprimentos: number; sangrias: number }
type SaleRow     = { id: string; store_id: string; user_id: string | null; customer_id: string | null; status: string; created_at: string }
type ItemRow     = { sale_id: string; qtde: number; preco_unit: number; desconto: number; product?: { id: string; sku: string; nome: string } | null }
type Profile     = { id: string; nome?: string | null; email?: string | null }
type Customer    = { id: string; nome?: string | null; documento?: string | null }

/* ─── Helpers ────────────────────────────────────────────────────────── */
function csvDownload(name: string, rows: any[]) {
  if (!rows?.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: any) => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc((r as any)[c])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDay(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/* ─── Sub-components ─────────────────────────────────────────────────── */
function SectionCard({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-50">
        <span className="text-xs font-semibold tracking-[0.1em] uppercase text-slate-400">{title}</span>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1,2,3,4].map(i => (
        <div key={i} className="flex justify-between items-center py-1">
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-3 bg-slate-100 rounded w-16" />
        </div>
      ))}
    </div>
  )
}

function BarRow({ label, value, max, rank }: { label: string; value: number; max: number; rank?: number }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-1.5 group">
      {rank !== undefined && (
        <span className="text-xs font-medium text-slate-300 w-4 shrink-0">{rank}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-slate-700 truncate mb-1">{label}</div>
        <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#3B82F6] rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-[12px] font-semibold text-azure-dark shrink-0">{formatBRL(value)}</span>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-navy-ghost flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={15} className="text-[#3B82F6]" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium tracking-wide uppercase text-slate-400 mb-0.5">{label}</div>
        <div className="text-xl font-semibold text-navy leading-tight">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const navigate = useNavigate()
  const { company, setCompany } = useApp()
  const { role } = useRole()
  const isOwner = role === 'OWNER'

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [scope, setScope]       = useState<'company' | 'global'>('company')

  const [companies, setCompanies]     = useState<Company[]>([])
  const [globalCompanyId, setGlobalCompanyId] = useState<string>('')
  const [globalStoreId, setGlobalStoreId]     = useState<string>('')
  const [globalStores, setGlobalStores]       = useState<Array<{ id: string; nome: string; company_id: string }>>([])
  const [stores, setStores]           = useState<StoreRow[]>([])

  const [salesByDay, setSalesByDay]   = useState<Array<{ day: string; valor: number }>>([])
  const [rankSellers, setRankSellers] = useState<Array<{ seller: string; valor: number }>>([])
  const [cashBalances, setCashBalances] = useState<Array<{ store: string; esperado: number }>>([])
  const [companyCashSummary, setCompanyCashSummary] = useState<Array<{ company_id: string; nome: string; esperado: number }>>([])
  const [globalKpis, setGlobalKpis]   = useState({ faturamento: 0, cupons: 0, ticket: 0, caixasAbertos: 0 })
  const [globalStockTotal, setGlobalStockTotal] = useState(0)
  const [companyStockSummary, setCompanyStockSummary] = useState<Array<{ company_id: string; nome: string; total: number }>>([])
  const [revByProduct, setRevByProduct] = useState<Array<{ label: string; valor: number }>>([])
  const [revByCustomer, setRevByCustomer] = useState<Array<{ label: string; valor: number }>>([])
  const [companySummary, setCompanySummary] = useState<Array<{ company_id: string; nome: string; valor: number }>>([])

  const companyMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of companies) m.set(c.id, c.nome)
    return m
  }, [companies])

  const { startISO, endISO } = useMemo(() => {
    const end = new Date(); const start = new Date()
    start.setDate(end.getDate() - 13)
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999)
    return { startISO: start.toISOString(), endISO: end.toISOString() }
  }, [])

  // KPIs rápidos derivados
  const totalFaturamento = salesByDay.reduce((a, d) => a + d.valor, 0)
  const totalCupons = scope === 'global' ? globalKpis.cupons : salesByDay.length
  const ticketMedio = scope === 'global'
    ? globalKpis.ticket
    : (rankSellers.reduce((a, r) => a + r.valor, 0))
  const caixaTotal = cashBalances.reduce((a, c) => a + c.esperado, 0)

  useEffect(() => {
    if (!isOwner) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase.from('companies').select('id, nome').order('nome', { ascending: true })
        if (error) throw error
        if (mounted) setCompanies((data || []) as Company[])
      } catch { /* ignore */ }
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
      } catch { if (mounted) setGlobalStores([]) }
    })()
    return () => { mounted = false }
  }, [isOwner, scope, globalCompanyId])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        let comp: string | null = company?.id ?? null
        if (!comp) {
          const { data: rpcData } = await supabase.rpc('get_my_company')
          if (rpcData && rpcData.length > 0) {
            setCompany(rpcData[0] as any)
            comp = rpcData[0].id
          }
        }
        if (isOwner && scope === 'global') comp = globalCompanyId || null
        if (!comp) {
          const saved = localStorage.getItem('app_selected_store')
          if (saved) { try { comp = JSON.parse(saved)?.company_id ?? null } catch {} }
        }
        if (!comp && !(isOwner && scope === 'global')) { setLoading(false); return }
        if (!mounted) return
        setCompanyId(comp)

        let storeQuery = supabase.from('stores').select('id, nome, company_id').order('nome', { ascending: true })
        if (comp) storeQuery = storeQuery.eq('company_id', comp)
        if (scope === 'global' && globalStoreId) storeQuery = storeQuery.eq('id', globalStoreId)
        const { data: ds } = await storeQuery
        const storeList: StoreRow[] = (ds || []) as any
        if (!mounted) return
        setStores(storeList)

        const storeIds = storeList.map(s => s.id)
        if (storeIds.length === 0) { setError('Sem lojas cadastradas para esta empresa.'); setLoading(false); return }

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

  useEffect(() => { if (company?.id) setCompanyId(company.id) }, [company?.id])

  async function loadSalesAndRevenue(compId: string | null, storeIds: string[], start: string, end: string, mounted: boolean, storeList: StoreRow[]) {
    try {
      let viewQuery = supabase.from('sale_paid').select('paid_at, net, vendedor, user_id, store_id')
        .gte('paid_at', start).lte('paid_at', end).order('paid_at', { ascending: true })
      if (compId) viewQuery = viewQuery.eq('company_id', compId)
      const tryView = await viewQuery
      if (tryView.error) throw tryView.error

      const rows = (tryView.data || []) as Array<{ paid_at: string; net: number; vendedor?: string | null; user_id?: string | null; store_id: string }>
      const storeCompanyMap = new Map(storeList.map(s => [s.id, s.company_id || '']))

      const perDay = new Map<string, number>()
      for (const r of rows) {
        const key = new Date(r.paid_at).toISOString().slice(0, 10)
        perDay.set(key, (perDay.get(key) || 0) + Number(r.net || 0))
      }
      const series = Array.from(perDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, valor]) => ({ day, valor }))

      if (scope === 'global') {
        const faturamento = Array.from(perDay.values()).reduce((a, v) => a + v, 0)
        const cupons = rows.length
        if (mounted) setGlobalKpis(prev => ({ ...prev, faturamento, cupons, ticket: cupons > 0 ? faturamento / cupons : 0 }))
      }

      const perSeller = new Map<string, number>()
      for (const r of rows) {
        const name = (r as any).vendedor || r.user_id || 'Sem vendedor'
        perSeller.set(name, (perSeller.get(name) || 0) + Number(r.net || 0))
      }
      const rank = Array.from(perSeller.entries()).map(([seller, valor]) => ({ seller, valor })).sort((a, b) => b.valor - a.valor).slice(0, 7)

      if (scope === 'global') {
        const perCompany = new Map<string, number>()
        for (const r of rows) {
          const cid = storeCompanyMap.get(r.store_id) || 'SEM'
          perCompany.set(cid, (perCompany.get(cid) || 0) + Number(r.net || 0))
        }
        const summary = Array.from(perCompany.entries()).map(([company_id, valor]) => ({ company_id, nome: companyMap.get(company_id) || company_id, valor })).sort((a, b) => b.valor - a.valor)
        if (mounted) setCompanySummary(summary)
      } else if (mounted) setCompanySummary([])

      const { data: sales } = await supabase.from('sales').select('id, store_id, user_id, customer_id, status, created_at').in('store_id', storeIds).gte('created_at', start).lte('created_at', end)
      const saleIds = (sales || []).filter(s => (s as any).status === 'PAGA').map(s => (s as any).id)
      let items: ItemRow[] = []
      if (saleIds.length > 0) {
        const { data: it } = await supabase.from('sale_items').select('sale_id, qtde, preco_unit, desconto, product:products(id, sku, nome)').in('sale_id', saleIds)
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
      const prodList = Array.from(productMap.entries()).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 7)

      const custMap = new Map<string, number>()
      const byCustomerIds = new Set<string>()
      for (const it of items) {
        const sale = saleById.get(it.sale_id)
        if (!sale || sale.status !== 'PAGA') continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const cid = sale.customer_id
        if (cid) byCustomerIds.add(cid)
        custMap.set(cid || 'SEM', (custMap.get(cid || 'SEM') || 0) + val)
      }
      let custNames = new Map<string, string>()
      if (byCustomerIds.size > 0) {
        try {
          const { data: custs } = await supabase.from('customers').select('id, nome, documento').in('id', Array.from(byCustomerIds))
          for (const c of (custs || []) as Customer[]) custNames.set(c.id, c.nome || c.documento || 'Cliente')
        } catch {}
      }
      const custList = Array.from(custMap.entries()).map(([id, valor]) => ({ label: id === 'SEM' ? 'Sem cadastro' : (custNames.get(id) || 'Cliente'), valor })).sort((a, b) => b.valor - a.valor).slice(0, 7)

      if (!mounted) return
      setSalesByDay(series); setRankSellers(rank); setRevByProduct(prodList); setRevByCustomer(custList)
      return
    } catch {
      // --- fallback ---
      const { data: sales } = await supabase.from('sales').select('id, store_id, user_id, customer_id, status, created_at').in('store_id', storeIds).gte('created_at', start).lte('created_at', end)
      const okSales = (sales || []).filter(s => (s as any).status === 'PAGA') as SaleRow[]
      const saleIds = okSales.map(s => s.id)
      let items: ItemRow[] = []
      if (saleIds.length > 0) {
        const { data: it } = await supabase.from('sale_items').select('sale_id, qtde, preco_unit, desconto, product:products(id, sku, nome)').in('sale_id', saleIds)
        items = (it || []) as any
      }
      const byId = new Map<string, SaleRow>()
      okSales.forEach(s => byId.set(s.id, s))
      const storeCompanyMap = new Map(storeList.map(s => [s.id, s.company_id || '']))
      const perDay = new Map<string, number>()
      for (const it of items) {
        const sale = byId.get(it.sale_id); if (!sale) continue
        const d = new Date(sale.created_at).toISOString().slice(0, 10)
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        perDay.set(d, (perDay.get(d) || 0) + val)
      }
      const series = Array.from(perDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, valor]) => ({ day, valor }))
      if (scope === 'global') {
        const faturamento = Array.from(perDay.values()).reduce((a, v) => a + v, 0)
        const cupons = okSales.length
        if (mounted) setGlobalKpis(prev => ({ ...prev, faturamento, cupons, ticket: cupons > 0 ? faturamento / cupons : 0 }))
      }
      const perSeller = new Map<string, number>()
      const sellerIds = new Set<string>()
      for (const it of items) {
        const sale = byId.get(it.sale_id); if (!sale) continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const uid = sale.user_id || 'SEM'
        if (sale.user_id) sellerIds.add(sale.user_id)
        perSeller.set(uid, (perSeller.get(uid) || 0) + val)
      }
      const names = new Map<string, string>()
      if (sellerIds.size > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, nome, email').in('id', Array.from(sellerIds))
        for (const p of (profs || []) as Profile[]) names.set(p.id, p.nome || p.email || 'Vendedor')
      }
      const rank = Array.from(perSeller.entries()).map(([uid, valor]) => ({ seller: uid === 'SEM' ? 'Sem vendedor' : (names.get(uid) || 'Vendedor'), valor })).sort((a, b) => b.valor - a.valor).slice(0, 7)
      const productMap = new Map<string, number>()
      for (const it of items) {
        const sale = byId.get(it.sale_id); if (!sale) continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const label = it.product?.sku ? `${it.product.sku} — ${it.product?.nome || ''}`.trim() : (it.product?.nome || 'Produto')
        productMap.set(label, (productMap.get(label) || 0) + val)
      }
      const prodList = Array.from(productMap.entries()).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 7)
      if (scope === 'global') {
        const perCompany = new Map<string, number>()
        for (const it of items) {
          const sale = byId.get(it.sale_id); if (!sale) continue
          const cid = storeCompanyMap.get(sale.store_id) || 'SEM'
          perCompany.set(cid, (perCompany.get(cid) || 0) + Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0))
        }
        const summary = Array.from(perCompany.entries()).map(([company_id, valor]) => ({ company_id, nome: companyMap.get(company_id) || company_id, valor })).sort((a, b) => b.valor - a.valor)
        if (mounted) setCompanySummary(summary)
      } else if (mounted) setCompanySummary([])
      const custMap = new Map<string, number>()
      const byCustomerIds = new Set<string>()
      for (const it of items) {
        const sale = byId.get(it.sale_id); if (!sale) continue
        const val = Number(it.qtde) * Number(it.preco_unit) - Number(it.desconto || 0)
        const key = sale.customer_id || 'SEM'
        if (sale.customer_id) byCustomerIds.add(sale.customer_id)
        custMap.set(key, (custMap.get(key) || 0) + val)
      }
      let custNames = new Map<string, string>()
      if (byCustomerIds.size > 0) {
        try {
          const { data: custs } = await supabase.from('customers').select('id, nome, documento').in('id', Array.from(byCustomerIds))
          for (const c of (custs || []) as Customer[]) custNames.set(c.id, c.nome || c.documento || 'Cliente')
        } catch {}
      }
      const custList = Array.from(custMap.entries()).map(([id, valor]) => ({ label: id === 'SEM' ? 'Sem cadastro' : (custNames.get(id) || 'Cliente'), valor })).sort((a, b) => b.valor - a.valor).slice(0, 7)
      if (!mounted) return
      setSalesByDay(series); setRankSellers(rank); setRevByProduct(prodList); setRevByCustomer(custList)
    }
  }

  async function loadCashBalances(storeList: StoreRow[], mounted: boolean) {
    try {
      const storeIds = storeList.map(s => s.id)
      const { data: cs } = await supabase.from('cash_sessions').select('id, store_id, abertura_at, valor_inicial, status, fechamento_at').is('fechamento_at', null).in('store_id', storeIds).eq('status', 'ABERTO')
      const opens: CashOpen[] = (cs || []).map((r: any) => ({ id: r.id, store_id: r.store_id, abertura_at: r.abertura_at, valor_inicial: Number(r.valor_inicial || 0) }))
      if (opens.length === 0) { if (mounted) { setCashBalances([]); setCompanyCashSummary([]) } return }
      const cashIds = opens.map(o => o.id)
      let totals: CashTotal[] = []
      try {
        const { data: vt } = await supabase.from('v_cash_session_totals').select('cash_id, valor_inicial, dinheiro, suprimentos, sangrias').in('cash_id', cashIds)
        totals = (vt || []).map((r: any) => ({ cash_id: r.cash_id, valor_inicial: Number(r.valor_inicial || 0), dinheiro: Number(r.dinheiro || 0), suprimentos: Number(r.suprimentos || 0), sangrias: Number(r.sangrias || 0) }))
      } catch {
        totals = opens.map(o => ({ cash_id: o.id, valor_inicial: o.valor_inicial, dinheiro: 0, suprimentos: 0, sangrias: 0 }))
      }
      const byCash = new Map(totals.map(t => [t.cash_id, t]))
      const list = opens.map(o => {
        const t = byCash.get(o.id)
        const esperado = (t?.valor_inicial || 0) + (t?.dinheiro || 0) + (t?.suprimentos || 0) - (t?.sangrias || 0)
        const st = storeList.find(s => s.id === o.store_id)
        const companyName = st?.company_id ? companyMap.get(st.company_id) : ''
        const storeName = companyName ? `${st?.nome || 'Loja'} · ${companyName}` : (st?.nome || 'Loja')
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
          perCompany.set(cid, (perCompany.get(cid) || 0) + esperado)
        })
        const summary = Array.from(perCompany.entries()).map(([company_id, esperado]) => ({ company_id, nome: companyMap.get(company_id) || company_id, esperado })).sort((a, b) => b.esperado - a.esperado)
        if (mounted) { setCompanyCashSummary(summary); setGlobalKpis(prev => ({ ...prev, caixasAbertos: opens.length })) }
      } else if (mounted) setCompanyCashSummary([])
    } catch { if (mounted) setCashBalances([]) }
  }

  async function loadGlobalStock(compId: string | null, mounted: boolean) {
    try {
      if (scope !== 'global') { if (mounted) { setGlobalStockTotal(0); setCompanyStockSummary([]) } return }
      let q = supabase.from('v_stock_position_detail').select('saldo, company_id')
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
      const summary = Array.from(perCompany.entries()).map(([company_id, total]) => ({ company_id, nome: companyMap.get(company_id) || company_id, total })).sort((a, b) => b.total - a.total)
      if (mounted) setCompanyStockSummary(summary)
    } catch { if (mounted) { setGlobalStockTotal(0); setCompanyStockSummary([]) } }
  }

  /* ─── Tela sem empresa ───────────────────────────────────────────────── */
  if (!loading && !companyId && !(isOwner && scope === 'global')) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-8">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-slate-100 rounded-2xl p-8 space-y-6">
            <div>
              <div className="w-10 h-10 rounded-xl bg-navy-ghost flex items-center justify-center mb-4">
                <Building2 size={18} className="text-[#3B82F6]" strokeWidth={2} />
              </div>
              <h1 className="text-xl font-semibold text-navy">Bem-vindo ao Tottys</h1>
              <p className="text-sm text-slate-500 mt-1">Configure no seu ritmo. Comece por aqui.</p>
            </div>

            <div className="space-y-3">
              {[
                { icon: Building2, label: 'Crie sua empresa', sub: 'CNPJ, razão social ou nome fantasia' },
                { icon: Package,   label: 'Cadastre produtos', sub: 'Importe planilha ou adicione um a um' },
                { icon: Users,     label: 'Importe clientes',  sub: 'Base de clientes e crediário em aberto' },
                { icon: ShoppingCart, label: 'Abra o caixa e venda', sub: 'PDV com cashback e crediário' },
              ].map(({ icon: Icon, label, sub }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={13} className="text-slate-400" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{label}</div>
                    <div className="text-xs text-slate-400">{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate('/adm/companies')}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-[#1D3B9D] text-white text-sm font-medium py-3 rounded-xl transition-colors duration-200 cursor-pointer"
            >
              Criar minha empresa
              <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">Você pode explorar o sistema antes de configurar qualquer coisa.</p>
        </div>
      </div>
    )
  }

  /* ─── Dashboard principal ─────────────────────────────────────────────── */
  const maxSales    = Math.max(...salesByDay.map(d => d.valor), 1)
  const maxSeller   = Math.max(...rankSellers.map(r => r.valor), 1)
  const maxProduct  = Math.max(...revByProduct.map(p => p.valor), 1)
  const maxCustomer = Math.max(...revByCustomer.map(c => c.valor), 1)

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <SetupChecklist />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">Dashboard</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {scope === 'global' ? 'Visão consolidada · todas as empresas' : (company?.nome || 'Últimos 14 dias')}
          </p>
        </div>

        {/* Scope + filtros */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {isOwner && (
            <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-xs">
              {(['company', 'global'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-4 py-2 font-medium transition-colors duration-150 cursor-pointer ${
                    scope === s ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s === 'company' ? 'Por empresa' : 'Global'}
                </button>
              ))}
            </div>
          )}

          {scope === 'company' && isOwner && companies.length > 0 && (
            <select
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-700 bg-white cursor-pointer focus:outline-none focus:border-[#3B82F6]"
              value={company?.id || ''}
              onChange={e => {
                const selected = companies.find(c => c.id === e.target.value)
                if (selected) setCompany(selected as any)
              }}
            >
              <option value="" disabled>Selecione a empresa…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}

          {scope === 'global' && isOwner && (
            <div className="flex gap-2">
              <select
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-700 bg-white cursor-pointer focus:outline-none focus:border-[#3B82F6]"
                value={globalCompanyId}
                onChange={e => { setGlobalCompanyId(e.target.value); setGlobalStoreId('') }}
              >
                <option value="">Todas as empresas</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-700 bg-white cursor-pointer focus:outline-none focus:border-[#3B82F6]"
                value={globalStoreId}
                onChange={e => setGlobalStoreId(e.target.value)}
              >
                <option value="">Todas as lojas</option>
                {globalStores.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}{companyMap.get(s.company_id || '') ? ` · ${companyMap.get(s.company_id || '')}` : ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-100 text-amber-800 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={TrendingUp}   label="Faturamento"   value={formatBRL(scope === 'global' ? globalKpis.faturamento : totalFaturamento)} sub="últimos 14 dias" />
        <KpiCard icon={ShoppingCart} label="Vendas"        value={scope === 'global' ? String(globalKpis.cupons) : String(salesByDay.length > 0 ? rankSellers.reduce((a,r) => a, 0) || salesByDay.length : 0)} sub="cupons emitidos" />
        <KpiCard icon={Wallet}       label="Caixa aberto"  value={formatBRL(scope === 'global' ? globalKpis.caixasAbertos : caixaTotal)} sub={scope === 'global' ? `${globalKpis.caixasAbertos} PDV(s)` : `${cashBalances.length} PDV(s)`} />
        <KpiCard icon={Package}      label="Estoque"       value={scope === 'global' ? String(globalStockTotal) : `${stores.length} loja(s)`} sub="unidades em saldo" />
      </div>

      {/* ── Visão global: resumo por empresa ── */}
      {scope === 'global' && companySummary.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard
            title="Faturamento por empresa"
            action={
              <button onClick={() => csvDownload('faturamento_por_empresa', companySummary)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-azure cursor-pointer transition-colors duration-150">
                <Download size={12} /> CSV
              </button>
            }
          >
            {companySummary.slice(0, 8).map((r, i) => (
              <BarRow key={r.company_id} label={r.nome} value={r.valor} max={companySummary[0]?.valor || 1} rank={i + 1} />
            ))}
          </SectionCard>

          <SectionCard
            title="Caixas abertos por empresa"
            action={
              <button onClick={() => csvDownload('caixa_por_empresa', companyCashSummary)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-azure cursor-pointer transition-colors duration-150">
                <Download size={12} /> CSV
              </button>
            }
          >
            {companyCashSummary.length === 0
              ? <p className="text-xs text-slate-400">Nenhum caixa aberto.</p>
              : companyCashSummary.slice(0, 8).map((r, i) => (
                  <BarRow key={r.company_id} label={r.nome} value={r.esperado} max={companyCashSummary[0]?.esperado || 1} rank={i + 1} />
                ))
            }
          </SectionCard>
        </div>
      )}

      {/* ── Gráfico de vendas + ranking vendedores ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard title="Vendas por dia — últimos 14">
          {loading ? <Skeleton /> : salesByDay.length === 0
            ? <p className="text-xs text-slate-400">Sem vendas no período.</p>
            : salesByDay.map(d => (
              <BarRow key={d.day} label={fmtDay(d.day)} value={d.valor} max={maxSales} />
            ))
          }
        </SectionCard>

        <SectionCard title="Ranking de vendedores">
          {loading ? <Skeleton /> : rankSellers.length === 0
            ? <p className="text-xs text-slate-400">Sem dados de vendedores.</p>
            : rankSellers.map((r, i) => (
              <BarRow key={i} label={r.seller} value={r.valor} max={maxSeller} rank={i + 1} />
            ))
          }
        </SectionCard>
      </div>

      {/* ── Caixas abertos + Top produtos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard title="Saldo em cada PDV">
          {loading ? <Skeleton /> : cashBalances.length === 0
            ? <p className="text-xs text-slate-400">Nenhum caixa aberto no momento.</p>
            : cashBalances.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-[12px] text-slate-700 truncate">{c.store}</span>
                </div>
                <span className="text-[12px] font-semibold text-azure-dark shrink-0 ml-3">{formatBRL(c.esperado)}</span>
              </div>
            ))
          }
        </SectionCard>

        <SectionCard title="Top produtos — faturamento">
          {loading ? <Skeleton /> : revByProduct.length === 0
            ? <p className="text-xs text-slate-400">Sem produtos vendidos no período.</p>
            : revByProduct.map((p, i) => (
              <BarRow key={i} label={p.label} value={p.valor} max={maxProduct} rank={i + 1} />
            ))
          }
        </SectionCard>
      </div>

      {/* ── Top clientes + Ações rápidas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectionCard title="Top clientes — faturamento">
          {loading ? <Skeleton /> : revByCustomer.length === 0
            ? <p className="text-xs text-slate-400">Sem clientes identificados no período.</p>
            : revByCustomer.map((c, i) => (
              <BarRow key={i} label={c.label} value={c.valor} max={maxCustomer} rank={i + 1} />
            ))
          }
        </SectionCard>

        <SectionCard title="Acesso rápido">
          <div className="grid grid-cols-2 gap-1">
            {[
              { to: '/adm/products',  icon: Package,   label: 'Produtos',    external: false },
              { to: '/adm/stock',     icon: Warehouse,  label: 'Estoque',    external: false },
              { to: '/adm/reports',   icon: BarChart3,  label: 'Relatórios', external: false },
              { to: '/adm/users',     icon: Users,      label: 'Usuários',   external: false },
              { to: '/adm/settings',  icon: Settings,   label: 'Config',     external: false },
              { to: '/loja/sell',     icon: Store,      label: 'Ir ao PDV',  external: true  },
            ].map(({ to, icon: Icon, label, external }) => (
              external ? (
                <a
                  key={to}
                  href={to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                >
                  <Icon size={14} className="text-slate-400 group-hover:text-azure transition-colors duration-150" strokeWidth={2} />
                  <span className="text-[12px] font-medium text-slate-600 group-hover:text-navy">{label}</span>
                  <ChevronRight size={11} className="ml-auto text-slate-300 group-hover:text-slate-400 transition-colors duration-150" />
                </a>
              ) : (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                >
                  <Icon size={14} className="text-slate-400 group-hover:text-azure transition-colors duration-150" strokeWidth={2} />
                  <span className="text-[12px] font-medium text-slate-600 group-hover:text-navy">{label}</span>
                  <ChevronRight size={11} className="ml-auto text-slate-300 group-hover:text-slate-400 transition-colors duration-150" />
                </Link>
              )
            ))}
          </div>

          {scope === 'global' && (
            <div className="mt-3 pt-3 border-t border-slate-50">
              <button
                onClick={() => {
                  const all = new Map<string, any>()
                  companySummary.forEach(r => all.set(r.company_id, { company_id: r.company_id, nome: r.nome, faturamento: r.valor }))
                  companyCashSummary.forEach(r => { const cur = all.get(r.company_id) || { company_id: r.company_id, nome: r.nome }; cur.caixa_aberto = r.esperado; all.set(r.company_id, cur) })
                  companyStockSummary.forEach(r => { const cur = all.get(r.company_id) || { company_id: r.company_id, nome: r.nome }; cur.estoque_total = r.total; all.set(r.company_id, cur) })
                  csvDownload('consolidado_por_empresa', Array.from(all.values()))
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-azure cursor-pointer transition-colors duration-150"
              >
                <Download size={12} strokeWidth={2} />
                Exportar consolidado por empresa
              </button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
