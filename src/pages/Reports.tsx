import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
import { movingAverage, simpleForecast } from '@/domain/reports/predict'
import { formatBRL } from '@/lib/currency'
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import TabBar from '@/ui/TabBar'
import { useTheme } from '@/hooks/useTheme'

type KpiRow = {
  company_id: string
  store_id: string
  dia: string
  cupons: number
  faturamento_bruto: number
  descontos_total: number
  itens: number
  ticket_medio: number
}
type PayRow = {
  company_id: string
  store_id: string
  dia: string
  meio: 'DINHEIRO' | 'PIX' | 'CARTAO'
  brand: string
  mode: string
  qtd: number
  total_gross: number
  total_net: number
  total_fees: number
}
type TopRow = {
  company_id: string
  store_id: string
  dia: string
  product_id: string | null
  sku: string | null
  nome: string
  qtde_total: number
  receita: number
}
type SellerRow = {
  company_id: string
  store_id: string
  dia: string
  user_id: string | null
  vendedor: string
  cupons: number
  faturamento_bruto: number
  descontos_total: number
  itens: number
  ticket_medio: number
  desconto_pct: number
}
type HourRow = {
  company_id: string
  store_id: string
  hora_local: string
  dia_local: string
  meio: 'DINHEIRO' | 'PIX' | 'CARTAO'
  qtd: number
  total_gross: number
}
type CashCloseRow = {
  company_id: string
  store_id: string
  cash_id: string
  operador_id: string | null
  operador: string
  abertura_at: string
  fechamento_at: string
  valor_inicial: number
  valor_final: number
  dinheiro: number
  pix: number
  cartao: number
  suprimentos: number
  sangrias: number
  esperado_em_dinheiro: number
  diferenca: number
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function endOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}
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

const PIE_COLORS: Record<string, string> = {
  DINHEIRO: '#1E40AF',
  PIX: '#3B82F6',
  CARTAO: '#60A5FA',
}
const MEIO_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO: 'Cartão',
}

export default function Reports() {
  const { store, company, setCompany } = useApp()
  const { role } = useRole()
  const { isDark } = useTheme()
  const { pathname } = useLocation()
  const isPDV = !pathname.startsWith('/adm')
  const isOwner = role === 'OWNER'
  const [scope, setScope] = useState<'company' | 'global'>('company')
  const [companies, setCompanies] = useState<Array<{ id: string; nome: string }>>([])
  const [globalCompanyId, setGlobalCompanyId] = useState<string>('')
  const [globalStoreId, setGlobalStoreId] = useState<string>('')
  const [globalStores, setGlobalStores] = useState<Array<{ id: string; nome: string; company_id: string }>>([])
  const companyMap = useMemo(() => {
    const map = new Map<string, string>()
    companies.forEach(c => map.set(c.id, c.nome))
    return map
  }, [companies])

  const [tab, setTab] = useState<'oper' | 'gestao' | 'moda'>('oper')
  const [from, setFrom] = useState<string>(toISODate(startOfToday()))
  const [to, setTo] = useState<string>(toISODate(endOfToday()))
  const [seller, setSeller] = useState<string>('')
  const [comparePrev, setComparePrev] = useState(false)
  const [prevKpis, setPrevKpis] = useState<KpiRow[]>([])

  const [loading, setLoading] = useState(false)
  const [kpis, setKpis] = useState<KpiRow[]>([])
  const [pays, setPays] = useState<PayRow[]>([])
  const [tops, setTops] = useState<TopRow[]>([])
  const [sellers, setSellers] = useState<SellerRow[]>([])
  const [hours, setHours] = useState<HourRow[]>([])

  const isAdmin = role === 'OWNER' || role === 'ADMIN' || role === 'GERENTE'
  type SaleRow = { id: string; created_at: string; total: number; desconto: number; status: string; customer_nome: string | null; store_nome: string | null; user_nome: string | null; items_count: number }
  type SaleItem = { id: string; nome: string; qtde: number; preco_unit: number; desconto: number }
  const [salesHistory, setSalesHistory] = useState<SaleRow[]>([])
  const [loadingSales, setLoadingSales] = useState(false)
  const [saleItemsMap, setSaleItemsMap] = useState<Map<string, SaleItem[]>>(new Map())
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null)
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [salesFilter, setSalesFilter] = useState<'all' | 'PAGA' | 'PENDENTE' | 'CANCELADA'>('all')

  async function loadSalesHistory() {
    const cid = scope === 'global' ? (globalCompanyId || null) : (company?.id || store?.company_id || null)
    if (!cid) return
    setLoadingSales(true)
    try {
      let q = supabase
        .from('sales')
        .select('id, created_at, total, desconto, status, store_id, user_id, customer_id, stores(nome), customers(nome), profiles(nome)')
        .order('created_at', { ascending: false })
        .limit(100)
      const { data: storeRows } = await supabase.from('stores').select('id').eq('company_id', cid)
      const storeIds = (storeRows || []).map((s: any) => s.id)
      if (storeIds.length > 0) q = q.in('store_id', storeIds)
      else { setSalesHistory([]); return }
      const { data } = await q
      setSalesHistory(((data || []) as any[]).map(s => ({
        id: s.id,
        created_at: s.created_at,
        total: Number(s.total),
        desconto: Number(s.desconto || 0),
        status: s.status,
        customer_nome: s.customers?.nome || null,
        store_nome: s.stores?.nome || null,
        user_nome: s.profiles?.nome || null,
        items_count: 0,
      })))
    } finally {
      setLoadingSales(false)
    }
  }

  async function toggleSaleItems(saleId: string) {
    if (expandedSaleId === saleId) { setExpandedSaleId(null); return }
    setExpandedSaleId(saleId)
    if (saleItemsMap.has(saleId)) return
    const { data } = await supabase
      .from('sale_items')
      .select('id, qtde, preco_unit, desconto, products(nome)')
      .eq('sale_id', saleId)
    const items: SaleItem[] = ((data || []) as any[]).map(i => ({
      id: i.id, nome: i.products?.nome || '—',
      qtde: Number(i.qtde), preco_unit: Number(i.preco_unit), desconto: Number(i.desconto || 0),
    }))
    setSaleItemsMap(prev => new Map(prev).set(saleId, items))
  }

  async function cancelSale(id: string) {
    setCancelling(true)
    try {
      const { error } = await supabase.from('sales').update({ status: 'CANCELADA' }).eq('id', id)
      if (error) throw error
      setSalesHistory(prev => prev.map(s => s.id === id ? { ...s, status: 'CANCELADA' } : s))
      setCancelConfirmId(null)
    } catch (e: any) {
      alert(e?.message || 'Não foi possível cancelar a venda.')
    } finally {
      setCancelling(false)
    }
  }
  const [closures, setClosures] = useState<CashCloseRow[]>([])

  type RupturaRow = {
    product_id: string
    produto_nome: string
    produto_sku: string
    variant_id: string
    tamanho: string
    cor: string
    store_id: string
    qty: number
  }
  const [ruptura, setRuptura] = useState<RupturaRow[]>([])
  const [loadingRuptura, setLoadingRuptura] = useState(false)

  type RankingVarianteRow = { tamanho: string; cor: string; produto_nome: string; produto_sku: string; qtde_total: number; receita: number }
  type GiroColecaoRow = { collection_id: string | null; colecao_nome: string; num_vendas: number; qtde_total: number; receita: number }
  type CurvaAbcRow = { product_id: string; nome: string; sku: string; qtde_total: number; receita: number; curva?: 'A' | 'B' | 'C' }
  type InadimplenciaRow = { customer_id: string; nome: string; contato: string | null; score_interno: string; parcelas_atrasadas: number; total_aberto: number; total_atrasado: number; primeiro_atraso: string | null }

  const [rankingVariante, setRankingVariante] = useState<RankingVarianteRow[]>([])
  const [giroColecao, setGiroColecao] = useState<GiroColecaoRow[]>([])
  const [curvaAbc, setCurvaAbc] = useState<CurvaAbcRow[]>([])
  const [inadimplencia, setInadimplencia] = useState<InadimplenciaRow[]>([])
  const [loadingFashion, setLoadingFashion] = useState(false)

  const canLoad = scope === 'global' ? isOwner : !!company?.id
  const storeFilterId = scope === 'company'
    ? (store?.id || null)
    : (globalStoreId || null)

  useEffect(() => {
    if (!isOwner) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase.from('companies').select('id, nome').order('nome', { ascending: true })
        if (error) throw error
        if (mounted) setCompanies((data || []) as any[])
      } catch { }
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

  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>()
    sellers.forEach(s => { if (s.user_id) map.set(s.user_id, s.vendedor || '—') })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sellers])

  const kpiAgg = useMemo(() => {
    const rows = kpis.filter(r => (!storeFilterId || r.store_id === storeFilterId))
    const totalCup = rows.reduce((a, r) => a + Number(r.cupons || 0), 0)
    const fat = rows.reduce((a, r) => a + Number(r.faturamento_bruto || 0), 0)
    const desc = rows.reduce((a, r) => a + Number(r.descontos_total || 0), 0)
    const itens = rows.reduce((a, r) => a + Number(r.itens || 0), 0)
    const ticket = totalCup > 0 ? fat / totalCup : 0
    return { totalCup, fat, desc, itens, ticket }
  }, [kpis, storeFilterId])

  const prevKpiAgg = useMemo(() => {
    if (!comparePrev) return { totalCup: 0, fat: 0, desc: 0, itens: 0, ticket: 0 }
    const rows = prevKpis.filter(r => (!storeFilterId || r.store_id === storeFilterId))
    const totalCup = rows.reduce((a, r) => a + Number(r.cupons || 0), 0)
    const fat = rows.reduce((a, r) => a + Number(r.faturamento_bruto || 0), 0)
    const desc = rows.reduce((a, r) => a + Number(r.descontos_total || 0), 0)
    const itens = rows.reduce((a, r) => a + Number(r.itens || 0), 0)
    const ticket = totalCup > 0 ? fat / totalCup : 0
    return { totalCup, fat, desc, itens, ticket }
  }, [prevKpis, comparePrev, storeFilterId])

  type PayAggRow = { meio: string; qtd: number; gross: number; net: number; fees: number; pct: number }

  const payAgg = useMemo(() => {
    const rows = pays.filter(r => (!storeFilterId || r.store_id === storeFilterId))
    const totalGross = rows.reduce((a, r) => a + Number(r.total_gross || 0), 0) || 1
    return (['DINHEIRO', 'PIX', 'CARTAO'] as const).map(m => {
      const f = rows.filter(r => r.meio === m)
      const qtd   = f.reduce((a, r) => a + r.qtd, 0)
      const gross = f.reduce((a, r) => a + Number(r.total_gross || 0), 0)
      const net   = f.reduce((a, r) => a + Number(r.total_net || 0), 0)
      const fees  = f.reduce((a, r) => a + Number(r.total_fees || 0), 0)
      const pct   = Math.round((gross / totalGross) * 100)
      return { meio: m, qtd, gross, net, fees, pct } as PayAggRow
    })
  }, [pays, storeFilterId])

  const hoursAgg = useMemo(() => {
    const rows = hours.filter(r => (!storeFilterId || r.store_id === storeFilterId))
    const map = new Map<number, number>()
    rows.forEach(r => {
      const h = new Date(r.hora_local).getHours()
      map.set(h, (map.get(h) || 0) + Number(r.total_gross || 0))
    })
    const arr = Array.from({ length: 24 }, (_, h) => ({ h, total: map.get(h) || 0 }))
    const max = arr.reduce((m, x) => Math.max(m, x.total), 0) || 1
    return { arr, max }
  }, [hours, storeFilterId])

  async function loadAll() {
    if (!canLoad) return
    setLoading(true)
    try {
      const fromTs = new Date(`${from}T00:00:00`)
      const toTs = new Date(`${to}T23:59:59`)
      const days = Math.max(1, Math.ceil((toTs.getTime() - fromTs.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      const prevTo = new Date(fromTs.getTime() - 1000)
      const prevFrom = new Date(prevTo.getTime() - (days * 24 * 60 * 60 * 1000))
      const compId = scope === 'global' ? (globalCompanyId || null) : (company?.id || null)

      {
        let q = supabase.from('v_report_sales_kpis').select('*').gte('dia', fromTs.toISOString()).lte('dia', toTs.toISOString()).order('dia', { ascending: true })
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setKpis((data || []) as KpiRow[])
        if (comparePrev) {
          let qPrev = supabase.from('v_report_sales_kpis').select('*').gte('dia', prevFrom.toISOString()).lte('dia', prevTo.toISOString()).order('dia', { ascending: true })
          if (compId) qPrev = qPrev.eq('company_id', compId)
          if (storeFilterId) qPrev = qPrev.eq('store_id', storeFilterId)
          const { data: prev } = await qPrev
          setPrevKpis((prev || []) as KpiRow[])
        } else {
          setPrevKpis([])
        }
      }
      {
        let q = supabase.from('v_report_payments_method').select('*').gte('dia', fromTs.toISOString()).lte('dia', toTs.toISOString()).order('dia', { ascending: true })
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setPays((data || []) as PayRow[])
      }
      {
        let q = supabase.from('v_report_top_products').select('*').gte('dia', fromTs.toISOString()).lte('dia', toTs.toISOString()).order('receita', { ascending: false }).limit(50)
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setTops((data || []) as TopRow[])
      }
      {
        let q = supabase.from('v_report_seller_kpis').select('*').gte('dia', fromTs.toISOString()).lte('dia', toTs.toISOString())
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        if (seller) q = q.eq('user_id', seller)
        const { data } = await q.order('dia', { ascending: true })
        setSellers((data || []) as SellerRow[])
      }
      {
        let q = supabase.from('v_report_sales_by_hour').select('*').gte('dia_local', fromTs.toISOString()).lte('dia_local', toTs.toISOString()).order('hora_local', { ascending: true })
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setHours((data || []) as HourRow[])
      }
      {
        let q = supabase.from('v_report_cash_closures').select('*').gte('fechamento_at', fromTs.toISOString()).lte('fechamento_at', toTs.toISOString()).order('fechamento_at', { ascending: false }).limit(100)
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setClosures((data || []) as CashCloseRow[])
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadRuptura() {
    const storeId = storeFilterId
    if (!storeId) return
    setLoadingRuptura(true)
    try {
      const { data } = await supabase.from('v_grade_ruptura').select('*').eq('store_id', storeId).order('produto_nome', { ascending: true })
      setRuptura((data || []) as RupturaRow[])
    } finally {
      setLoadingRuptura(false)
    }
  }

  useEffect(() => {
    if (canLoad) loadAll()
  }, [store?.id, company?.id, scope, globalCompanyId, globalStoreId, comparePrev])

  async function loadFashionReports() {
    const cId = scope === 'global' ? globalCompanyId : company?.id
    if (!cId) return
    const sId = storeFilterId || null
    setLoadingFashion(true)
    try {
      const fromTs = new Date(from + 'T00:00:00').toISOString()
      const toTs   = new Date(to   + 'T23:59:59').toISOString()
      const [rv, gc, abc, inadimp] = await Promise.all([
        supabase.rpc('fn_ranking_variante',     { p_company_id: cId, p_store_id: sId, p_from: fromTs, p_to: toTs }),
        supabase.rpc('fn_giro_colecao',         { p_company_id: cId, p_store_id: sId, p_from: fromTs, p_to: toTs }),
        supabase.rpc('fn_curva_abc',            { p_company_id: cId, p_store_id: sId, p_from: fromTs, p_to: toTs }),
        supabase.rpc('fn_inadimplencia_resumo', { p_company_id: cId }),
      ])
      setRankingVariante((rv.data || []) as RankingVarianteRow[])
      setGiroColecao((gc.data || []) as GiroColecaoRow[])
      const abcRows = (abc.data || []) as CurvaAbcRow[]
      const totalRec = abcRows.reduce((a, r) => a + Number(r.receita), 0)
      let acc = 0
      const classified = abcRows.map(r => {
        acc += Number(r.receita)
        const pct = totalRec > 0 ? acc / totalRec : 0
        return { ...r, curva: pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C' } as CurvaAbcRow
      })
      setCurvaAbc(classified)
      setInadimplencia((inadimp.data || []) as InadimplenciaRow[])
    } finally {
      setLoadingFashion(false)
    }
  }

  useEffect(() => {
    if (tab === 'moda' && canLoad) { loadRuptura(); loadFashionReports() }
  }, [tab, store?.id, globalStoreId])

  function quickRange(preset: 'hoje' | 'semana' | 'mes') {
    const now = new Date()
    if (preset === 'hoje') {
      setFrom(toISODate(startOfToday()))
      setTo(toISODate(endOfToday()))
      return
    }
    if (preset === 'semana') {
      const d1 = new Date(now)
      const day = d1.getDay() || 7
      d1.setDate(d1.getDate() - (day - 1))
      d1.setHours(0, 0, 0, 0)
      const d2 = new Date(d1)
      d2.setDate(d1.getDate() + 6)
      d2.setHours(23, 59, 59, 999)
      setFrom(toISODate(d1))
      setTo(toISODate(d2))
      return
    }
    if (preset === 'mes') {
      const d1 = new Date(now.getFullYear(), now.getMonth(), 1)
      const d2 = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setFrom(toISODate(d1))
      setTo(toISODate(d2))
      return
    }
  }

  const sellerAgg = useMemo(() => {
    const map = new Map<string, { vendedor: string; cupons: number; fat: number; desc: number; itens: number; ticket: number; descPct: number }>()
    sellers.forEach(r => {
      const key = r.user_id || '—'
      const cur = map.get(key) || { vendedor: r.vendedor, cupons: 0, fat: 0, desc: 0, itens: 0, ticket: 0, descPct: 0 }
      cur.cupons += Number(r.cupons || 0)
      cur.fat += Number(r.faturamento_bruto || 0)
      cur.desc += Number(r.descontos_total || 0)
      cur.itens += Number(r.itens || 0)
      map.set(key, cur)
    })
    map.forEach(v => {
      v.ticket = v.cupons > 0 ? v.fat / v.cupons : 0
      v.descPct = v.fat > 0 ? (v.desc * 100) / v.fat : 0
    })
    return Array.from(map.values()).sort((a, b) => b.fat - a.fat)
  }, [sellers])

  const companyAgg = useMemo(() => {
    if (scope !== 'global') return []
    const map = new Map<string, { company_id: string; nome: string; cupons: number; fat: number; desc: number; itens: number }>()
    kpis.forEach(r => {
      const name = companyMap.get(r.company_id) || r.company_id
      const cur = map.get(r.company_id) || { company_id: r.company_id, nome: name, cupons: 0, fat: 0, desc: 0, itens: 0 }
      cur.cupons += Number(r.cupons || 0)
      cur.fat += Number(r.faturamento_bruto || 0)
      cur.desc += Number(r.descontos_total || 0)
      cur.itens += Number(r.itens || 0)
      map.set(r.company_id, cur)
    })
    return Array.from(map.values()).sort((a, b) => b.fat - a.fat)
  }, [kpis, scope, companyMap])

  const salesByDaySeries = useMemo(() => {
    const map = new Map<string, number>()
    kpis.forEach(r => {
      const key = new Date(r.dia).toISOString().slice(0, 10)
      map.set(key, (map.get(key) || 0) + Number(r.faturamento_bruto || 0))
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, valor]) => ({ day, valor }))
  }, [kpis])

  const trend = useMemo(() => {
    if (!salesByDaySeries.length) return []
    return movingAverage(salesByDaySeries, 3)
  }, [salesByDaySeries])

  const forecast = useMemo(() => {
    if (!salesByDaySeries.length) return []
    return simpleForecast(salesByDaySeries, 3)
  }, [salesByDaySeries])

  const trendDelta = useMemo(() => {
    if (trend.length < 2) return 0
    const a = trend[trend.length - 2].valor
    const b = trend[trend.length - 1].valor
    return b - a
  }, [trend])

  const trendChartData = useMemo(() => {
    const map = new Map<string, { day: string; vendas?: number; tendencia?: number; previsao?: number }>()
    salesByDaySeries.forEach(r => { map.set(r.day, { ...map.get(r.day), day: r.day, vendas: r.valor }) })
    trend.forEach(r => { map.set(r.day, { ...map.get(r.day), day: r.day, tendencia: r.valor }) })
    forecast.forEach(r => { map.set(r.day, { ...map.get(r.day), day: r.day, previsao: r.valor }) })
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day))
  }, [salesByDaySeries, trend, forecast])

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-20">

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-2.5 space-y-2">

          {/* Scope selector — OWNER only */}
          {isOwner && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5">
                {(['company', 'global'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={`px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all cursor-pointer ${scope === s ? 'bg-white text-azure shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {s === 'company' ? 'Empresa' : 'Global'}
                  </button>
                ))}
              </div>

              {scope === 'company' && (
                <select
                  className="flex-1 min-w-0 max-w-xs border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-navy focus:outline-none focus:border-azure bg-white cursor-pointer"
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

              {scope === 'global' && (
                <div className="flex gap-2 flex-1">
                  <select
                    className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-navy focus:outline-none focus:border-azure bg-white cursor-pointer"
                    value={globalCompanyId}
                    onChange={e => { setGlobalCompanyId(e.target.value); setGlobalStoreId('') }}
                  >
                    <option value="">Todas empresas</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <select
                    className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-navy focus:outline-none focus:border-azure bg-white cursor-pointer"
                    value={globalStoreId}
                    onChange={e => setGlobalStoreId(e.target.value)}
                  >
                    <option value="">Todas lojas</option>
                    {globalStores.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nome}{companyMap.get(s.company_id) ? ` · ${companyMap.get(s.company_id)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Date + quick pills + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5">
              {(['hoje', 'semana', 'mes'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => { quickRange(p); canLoad && loadAll() }}
                  className="px-3 py-1.5 rounded-[10px] text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                >
                  {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>

            <input
              type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-navy focus:outline-none focus:border-azure bg-white"
            />
            <span className="text-slate-300 text-xs">–</span>
            <input
              type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-navy focus:outline-none focus:border-azure bg-white"
            />

            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={comparePrev} onChange={e => setComparePrev(e.target.checked)} className="rounded" />
              Comparar
            </label>

            <button
              onClick={loadAll}
              disabled={!canLoad || loading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors hover:bg-azure-dark"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Buscando…' : 'Atualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-6 space-y-4">

        {!canLoad && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">
            Selecione uma empresa em <b>Config</b> para ver relatórios.
          </div>
        )}

        {/* ── Tab pills ── */}
        <div className="flex p-1 bg-slate-100 rounded-2xl w-fit">
          {(['oper', 'gestao', 'moda'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                tab === t ? 'bg-white text-azure shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'oper' ? 'Operação' : t === 'gestao' ? 'Gestão' : 'Moda'}
            </button>
          ))}
        </div>

        {/* ══ OPERACIONAL ══ */}
        {tab === 'oper' && (
          <>
            {/* Global company table */}
            {scope === 'global' && (
              <Card title="Resumo por empresa">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Empresa</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Cupons</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyAgg.slice(0, 10).map((r, i) => (
                        <tr key={r.company_id} className={`border-b border-slate-50 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">{r.nome}</td>
                          <td className="py-2.5 px-3 text-slate-500">{r.cupons}</td>
                          <td className="py-2.5 px-3 text-right font-semibold text-azure">{formatBRL(r.fat)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3">
                  <Button onClick={() => csvDownload('resumo_empresas', companyAgg)}>Exportar CSV</Button>
                </div>
              </Card>
            )}

            {/* ── KPI Hero + secondary ── */}
            {loading && kpis.length === 0 ? (
              <>
                <div className="rounded-2xl bg-slate-200 animate-pulse h-32" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-xl bg-slate-100 animate-pulse h-20" />
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Hero: Faturamento */}
                <div className="bg-gradient-to-br from-primary to-azure-dark rounded-2xl p-5 text-white shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-1">Faturamento do período</div>
                      <div className="text-4xl font-bold tracking-tight">{formatBRL(kpiAgg.fat)}</div>
                    </div>
                    {comparePrev && prevKpiAgg.fat > 0 && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold shrink-0 ${
                        kpiAgg.fat >= prevKpiAgg.fat ? 'bg-emerald-500/20 text-emerald-200' : 'bg-rose-500/20 text-rose-200'
                      }`}>
                        {kpiAgg.fat >= prevKpiAgg.fat ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {(((kpiAgg.fat - prevKpiAgg.fat) / prevKpiAgg.fat) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm opacity-70">
                    <span>{kpiAgg.totalCup} cupons</span>
                    <span>·</span>
                    <span>Ticket {formatBRL(kpiAgg.ticket)}</span>
                    <span>·</span>
                    <span>{kpiAgg.itens} itens</span>
                    {comparePrev && prevKpiAgg.fat > 0 && (
                      <><span>·</span><span>Anterior {formatBRL(prevKpiAgg.fat)}</span></>
                    )}
                  </div>
                </div>

                {/* Secondary KPIs 2×2 / 4-col */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPI label="Cupons" value={String(kpiAgg.totalCup)} />
                  <KPI label="Ticket Médio" value={formatBRL(kpiAgg.ticket)} />
                  <KPI label="Descontos" value={formatBRL(kpiAgg.desc)} />
                  <KPI label="Itens vendidos" value={String(kpiAgg.itens)} />
                </div>
              </>
            )}

            {/* ── Charts row: Mix + Horas ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Payment mix */}
              <Card title="Mix de pagamentos">
                {loading && pays.length === 0 ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {payAgg.map(r => {
                        const color = PIE_COLORS[r.meio] || '#94A3B8'
                        return (
                          <div key={r.meio}>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                                <span className="text-sm font-medium text-slate-700">{MEIO_LABEL[r.meio]}</span>
                                <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{r.pct}%</span>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold text-slate-800">{formatBRL(r.gross)}</div>
                                {r.fees > 0 && <div className="text-xs text-slate-400">-{formatBRL(r.fees)} taxas</div>}
                              </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${r.pct}%`, background: color }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-4">
                      <Button onClick={() => csvDownload('mix_meios', payAgg)}>Exportar CSV</Button>
                    </div>
                  </>
                )}
              </Card>

              {/* Vendas por hora */}
              <Card title="Vendas por hora">
                {loading && hours.length === 0 ? (
                  <div className="h-[160px] bg-slate-100 rounded-xl animate-pulse" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={hoursAgg.arr} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                        <XAxis
                          dataKey="h"
                          tickFormatter={(h: number) => h % 6 === 0 ? `${h}h` : ''}
                          tick={{ fontSize: 10, fill: '#94A3B8' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide />
                        <Tooltip
                          cursor={{ fill: isDark ? '#334155' : '#F1F5F9' }}
                          content={({ active, payload }: any) => {
                            if (!active || !payload?.length) return null
                            const h = payload[0]?.payload?.h
                            return (
                              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                                <div className="font-semibold text-slate-600 mb-0.5">{String(h).padStart(2, '0')}h</div>
                                <div className="text-azure font-bold">{formatBRL(payload[0]?.value as number || 0)}</div>
                              </div>
                            )
                          }}
                        />
                        <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={18}>
                          {hoursAgg.arr.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.total > 0 && entry.total === hoursAgg.max ? '#1E40AF' : isDark ? '#1E3A8A' : '#BFDBFE'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-between mt-1 text-xs text-slate-400">
                      <span>Pico destacado em azul</span>
                      <span>Total: <span className="font-semibold text-slate-600">{formatBRL(hours.reduce((a, r) => a + Number(r.total_gross || 0), 0))}</span></span>
                    </div>
                    <div className="mt-2.5">
                      <Button onClick={() => csvDownload('vendas_por_hora', hours)}>Exportar CSV</Button>
                    </div>
                  </>
                )}
              </Card>
            </div>

            {/* ── Trend + Forecast (full width) ── */}
            <Card
              title="Tendência e previsão"
              action={
                trendChartData.length > 0 ? (
                  <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    trendDelta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {trendDelta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {trendDelta >= 0 ? 'Em crescimento' : 'Queda recente'}
                  </span>
                ) : null
              }
            >
              {loading && trendChartData.length === 0 ? (
                <div className="h-[200px] bg-slate-100 rounded-xl animate-pulse" />
              ) : trendChartData.length === 0 ? (
                <div className="h-[100px] flex items-center justify-center text-sm text-slate-400">Sem dados suficientes para o período.</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trendChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#93C5FD" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#93C5FD" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradPrevisao" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FCD34D" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#FCD34D" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="day"
                        tickFormatter={(d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        tick={{ fontSize: 10, fill: '#94A3B8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        tick={{ fontSize: 10, fill: '#94A3B8' }}
                        axisLine={false}
                        tickLine={false}
                        width={32}
                      />
                      <Tooltip
                        formatter={(v: any, name: string) => [
                          formatBRL(v as number),
                          name === 'vendas' ? 'Vendas' : name === 'tendencia' ? 'Tendência (MM3)' : 'Previsão',
                        ]}
                        labelFormatter={(l: string) => new Date(l + 'T00:00:00').toLocaleDateString('pt-BR')}
                        contentStyle={{ background: isDark ? '#1E293B' : '#fff', border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`, borderRadius: '12px', fontSize: '12px', color: isDark ? '#E2E8F0' : '#334155', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                      <Area type="monotone" dataKey="vendas"    stroke="#93C5FD" strokeWidth={1.5} fill="url(#gradVendas)"   dot={false} connectNulls={false} name="vendas" />
                      <Area type="monotone" dataKey="tendencia" stroke="#1E40AF" strokeWidth={2}   fill="none"                dot={false} connectNulls={true}  name="tendencia" />
                      <Area type="monotone" dataKey="previsao"  stroke="#D97706" strokeWidth={2}   fill="url(#gradPrevisao)" strokeDasharray="5 5" dot={false} connectNulls={true} name="previsao" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-px bg-[#93C5FD]" style={{ borderTop: '2px solid #93C5FD' }} />Vendas</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-px" style={{ borderTop: '2px solid #1E40AF' }} />Tendência</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-px" style={{ borderTop: '2px dashed #D97706' }} />Previsão</span>
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('tendencia_previsao', [...trend, ...forecast])}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>

            {/* ── Top produtos: horizontal bars ── */}
            <Card title="Top produtos — receita">
              {loading && tops.length === 0 ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />)}
                </div>
              ) : tops.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">Sem dados de produtos para o período.</div>
              ) : (() => {
                const maxRec = tops[0]?.receita || 1
                return (
                  <>
                    <div className="space-y-3">
                      {tops.slice(0, 10).map((r, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-slate-300 w-5 text-right shrink-0">{i + 1}</span>
                              <span className="text-sm text-slate-700 font-medium truncate">{r.nome}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-xs text-slate-400">{r.qtde_total} un.</span>
                              <span className="text-sm font-bold text-azure">{formatBRL(r.receita)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-7">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${(r.receita / maxRec) * 100}%`,
                                background: i === 0 ? '#1E40AF' : i < 3 ? '#3B82F6' : '#BFDBFE',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <Button onClick={() => csvDownload('top_produtos', tops)}>Exportar CSV</Button>
                    </div>
                  </>
                )
              })()}
            </Card>
          </>
        )}

        {/* ══ MODA ══ */}
        {tab === 'moda' && (
          <>
            <Card title="Grade furada — ruptura parcial">
              <div className="text-xs text-slate-400 mb-3">
                Variantes sem estoque enquanto outros tamanhos/cores do mesmo produto ainda têm. São vendas perdidas esperando reposição.
              </div>
              {!storeFilterId ? (
                <div className="text-sm text-amber-600 bg-amber-50 rounded-xl px-3 py-2.5">Selecione uma loja para ver a grade furada.</div>
              ) : loadingRuptura ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : ruptura.length === 0 ? (
                <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">Nenhuma ruptura parcial de grade. Estoque completo!</div>
              ) : (
                <>
                  <div className="text-xs text-slate-400 mb-2">{ruptura.length} variante(s) com ruptura</div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {ruptura.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-slate-800 truncate">{r.produto_nome}</div>
                          <div className="text-xs text-slate-400">{r.produto_sku}</div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          {r.tamanho && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{r.tamanho}</span>}
                          {r.cor && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{r.cor}</span>}
                          <span className="text-xs text-rose-500 font-bold">0 un.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('grade_furada', ruptura)}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>

            <Card title="O que fazer com esta lista">
              <div className="space-y-2">
                {[
                  'Contate seu fornecedor para repor os tamanhos/cores zerados',
                  'Priorize os itens de maior venda (curva A)',
                  'Considere transferência de estoque de outra loja se disponível',
                  'Produtos com grade furada há mais de 15 dias podem indicar never-sell — avalie descontinuar',
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {tip}
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-400">Relatórios do período selecionado</div>
              <Button onClick={loadFashionReports} disabled={!canLoad || loadingFashion}>
                {loadingFashion ? 'Carregando…' : 'Atualizar'}
              </Button>
            </div>

            <Card title="Ranking tamanho × cor">
              <div className="text-xs text-slate-400 mb-3">Variantes mais vendidas no período.</div>
              {loadingFashion ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : rankingVariante.length === 0 ? (
                <div className="text-sm text-slate-400">Nenhuma venda de variante no período.</div>
              ) : (
                <>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {rankingVariante.slice(0, 20).map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-sm text-slate-800">{r.produto_nome}</div>
                          <div className="flex gap-1 mt-0.5">
                            {r.tamanho !== '—' && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{r.tamanho}</span>}
                            {r.cor !== '—' && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{r.cor}</span>}
                          </div>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <div className="font-semibold text-azure text-sm">{formatBRL(r.receita)}</div>
                          <div className="text-xs text-slate-400">{r.qtde_total} un.</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('ranking_variante', rankingVariante)}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>

            <Card title="Giro por coleção">
              <div className="text-xs text-slate-400 mb-3">Faturamento e volume de peças por coleção.</div>
              {loadingFashion ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : giroColecao.length === 0 ? (
                <div className="text-sm text-slate-400">Nenhuma venda no período.</div>
              ) : (() => {
                const totalGiro = giroColecao.reduce((a, r) => a + Number(r.receita), 0)
                return (
                  <>
                    <div className="space-y-3">
                      {giroColecao.map((r, i) => {
                        const pct = totalGiro > 0 ? (Number(r.receita) / totalGiro) * 100 : 0
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between text-sm mb-1.5">
                              <span className="font-medium text-slate-700 truncate">{r.colecao_nome}</span>
                              <span className="ml-2 shrink-0 text-slate-500 text-xs">{formatBRL(r.receita)} · {r.qtde_total} un.</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3">
                      <Button onClick={() => csvDownload('giro_colecao', giroColecao)}>Exportar CSV</Button>
                    </div>
                  </>
                )
              })()}
            </Card>

            <Card title="Curva ABC — produtos">
              <div className="text-xs text-slate-400 mb-3">A = top 80% da receita · B = 80–95% · C = cauda longa</div>
              {loadingFashion ? (
                <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : curvaAbc.length === 0 ? (
                <div className="text-sm text-slate-400">Nenhuma venda no período.</div>
              ) : (
                <>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {curvaAbc.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            r.curva === 'A' ? 'bg-emerald-100 text-emerald-700' : r.curva === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                          }`}>{r.curva}</span>
                          <span className="truncate text-sm text-slate-700">{r.nome}</span>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <div className="font-semibold text-azure text-sm">{formatBRL(r.receita)}</div>
                          <div className="text-xs text-slate-400">{r.qtde_total} un.</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('curva_abc', curvaAbc)}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>

            <Card title="Inadimplência — crediário">
              <div className="text-xs text-slate-400 mb-3">Clientes com parcelas atrasadas.</div>
              {loadingFashion ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : inadimplencia.length === 0 ? (
                <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2.5">Nenhuma parcela atrasada. Parabéns!</div>
              ) : (
                <>
                  <div className="text-xs text-slate-400 mb-2">
                    {inadimplencia.length} cliente(s) · <span className="text-rose-500 font-semibold">{formatBRL(inadimplencia.reduce((a, r) => a + Number(r.total_atrasado), 0))}</span> em atraso
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {inadimplencia.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-slate-800 truncate">{r.nome}</div>
                          <div className="text-xs text-slate-400">
                            {r.contato || 'Sem contato'} · {r.parcelas_atrasadas} parcela(s)
                            {r.primeiro_atraso && ` · desde ${new Date(r.primeiro_atraso + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                          </div>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <div className="font-semibold text-rose-600 text-sm">{formatBRL(r.total_atrasado)}</div>
                          <div className="text-xs text-slate-400">{formatBRL(r.total_aberto)} total</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('inadimplencia', inadimplencia)}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>
          </>
        )}

        {/* ══ GESTÃO ══ */}
        {tab === 'gestao' && (
          <>
            <Card title="Filtrar por vendedor">
              <div className="flex gap-2">
                <select
                  value={seller}
                  onChange={e => setSeller(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy focus:outline-none focus:border-azure bg-white flex-1 cursor-pointer"
                >
                  <option value="">Todos os vendedores</option>
                  {sellerOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <Button onClick={loadAll} disabled={!canLoad || loading}>{loading ? 'Carregando…' : 'Aplicar'}</Button>
              </div>
            </Card>

            <Card title="Performance por vendedor">
              {loading && sellerAgg.length === 0 ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : sellerAgg.length === 0 ? (
                <div className="text-sm text-slate-400 py-4 text-center">Sem dados de vendedores para o período.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Vendedor</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Cupons</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Itens</th>
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Ticket</th>
                          <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3">Faturamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sellerAgg.map((r, i) => (
                          <tr key={i} className={`border-b border-slate-50 ${i % 2 === 1 ? 'bg-slate-50/60' : ''}`}>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{r.vendedor}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.cupons}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.itens}</td>
                            <td className="py-2.5 px-3 text-slate-500">{formatBRL(r.ticket)}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-azure">{formatBRL(r.fat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('vendedores', sellerAgg)}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>

            <Card title="Fechamentos de caixa">
              {closures.length === 0 && !loading ? (
                <div className="text-sm text-slate-400 py-4 text-center">Nenhum fechamento no período.</div>
              ) : loading && closures.length === 0 ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {['Aberto', 'Fechado', 'Operador', 'Esperado', 'Contado', 'Diferença'].map(h => (
                            <th key={h} className={`text-xs font-semibold text-slate-500 uppercase tracking-wider py-2.5 px-3 ${h === 'Diferença' ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {closures.map((r, i) => (
                          <tr key={i} className={`border-b border-slate-50 ${i % 2 === 1 ? 'bg-slate-50/60' : ''}`}>
                            <td className="py-2.5 px-3 text-slate-600">{new Date(r.abertura_at).toLocaleString('pt-BR')}</td>
                            <td className="py-2.5 px-3 text-slate-600">{r.fechamento_at ? new Date(r.fechamento_at).toLocaleString('pt-BR') : '—'}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">{r.operador}</td>
                            <td className="py-2.5 px-3 text-slate-600">{formatBRL(r.esperado_em_dinheiro)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{formatBRL(r.valor_final)}</td>
                            <td className={`py-2.5 px-3 text-right font-semibold ${r.diferenca === 0 ? 'text-slate-500' : r.diferenca > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatBRL(r.diferenca)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3">
                    <Button onClick={() => csvDownload('fechamentos_caixa', closures)}>Exportar CSV</Button>
                  </div>
                </>
              )}
            </Card>
          </>
        )}

        {/* ══ Histórico de vendas (admin) ══ */}
        {isAdmin && (
          <Card title="Histórico de vendas">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'PAGA', 'PENDENTE', 'CANCELADA'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSalesFilter(f)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                      salesFilter === f ? 'bg-primary text-white border-azure' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f === 'all' ? 'Todas' : f === 'PAGA' ? 'Pagas' : f === 'PENDENTE' ? 'Pendentes' : 'Canceladas'}
                  </button>
                ))}
              </div>
              <button
                onClick={loadSalesHistory}
                disabled={loadingSales}
                className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loadingSales ? 'Carregando…' : salesHistory.length === 0 ? 'Carregar vendas' : 'Atualizar'}
              </button>
            </div>

            {salesHistory.length === 0 && !loadingSales && (
              <div className="text-sm text-slate-400 py-8 text-center">Clique em "Carregar vendas" para ver o histórico.</div>
            )}
            {loadingSales && (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            )}

            {salesHistory.length > 0 && (
              <div className="space-y-1.5">
                {salesHistory
                  .filter(s => salesFilter === 'all' || s.status === salesFilter)
                  .map(s => {
                    const isExpanded = expandedSaleId === s.id
                    const items = saleItemsMap.get(s.id) || []
                    const statusColor = s.status === 'PAGA'
                      ? 'bg-emerald-50 text-emerald-700'
                      : s.status === 'CANCELADA'
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-amber-50 text-amber-600'
                    return (
                      <div key={s.id} className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-navy">{formatBRL(s.total)}</span>
                              {s.desconto > 0 && <span className="text-xs text-slate-400">-{formatBRL(s.desconto)}</span>}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{s.status}</span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                              <span>{new Date(s.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              {s.store_nome && <span>· {s.store_nome}</span>}
                              {s.customer_nome && <span>· {s.customer_nome}</span>}
                              {s.user_nome && <span>· {s.user_nome}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleSaleItems(s.id)}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isExpanded ? 'text-azure bg-navy-ghost' : 'text-slate-400 hover:text-azure hover:bg-navy-ghost'}`}
                              title="Ver itens"
                            >
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'} />
                              </svg>
                            </button>
                            {s.status !== 'CANCELADA' && (
                              cancelConfirmId === s.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => cancelSale(s.id)}
                                    disabled={cancelling}
                                    className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-2 py-1 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                                  >
                                    {cancelling ? '…' : 'Confirmar'}
                                  </button>
                                  <button onClick={() => setCancelConfirmId(null)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer px-1">×</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setCancelConfirmId(s.id)}
                                  className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg cursor-pointer transition-colors font-medium"
                                  title="Cancelar venda"
                                >
                                  Cancelar
                                </button>
                              )
                            )}
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2 space-y-1">
                            {items.length === 0 && <div className="text-xs text-slate-400">Carregando itens…</div>}
                            {items.map(item => (
                              <div key={item.id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-700">{item.qtde}× {item.nome}</span>
                                <span className="text-slate-500">
                                  {formatBRL(item.preco_unit)}
                                  {item.desconto > 0 && <span className="text-slate-400 ml-1">-{formatBRL(item.desconto)}</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
            <div className="mt-3 text-xs text-slate-400">
              Cancelar uma venda altera apenas o status. Ajuste o estoque manualmente em Estoque se necessário.
            </div>
          </Card>
        )}
      </div>
      {isPDV && <TabBar />}
    </div>
  )
}
