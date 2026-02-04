import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
import { movingAverage, simpleForecast } from '@/domain/reports/predict'
import { formatBRL } from '@/lib/currency'

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

export default function Reports() {
  const { store, company, setCompany } = useApp()
  const { role } = useRole()
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

  // filtros
  const [tab, setTab] = useState<'oper' | 'gestao'>('oper')
  const [from, setFrom] = useState<string>(toISODate(startOfToday()))
  const [to, setTo] = useState<string>(toISODate(endOfToday()))
  const [seller, setSeller] = useState<string>('') // user_id; vazio = todos
  const [comparePrev, setComparePrev] = useState(false)
  const [prevKpis, setPrevKpis] = useState<KpiRow[]>([])

  const [loading, setLoading] = useState(false)
  const [kpis, setKpis] = useState<KpiRow[]>([])
  const [pays, setPays] = useState<PayRow[]>([])
  const [tops, setTops] = useState<TopRow[]>([])
  const [sellers, setSellers] = useState<SellerRow[]>([])
  const [hours, setHours] = useState<HourRow[]>([])
  const [closures, setClosures] = useState<CashCloseRow[]>([])

  const canLoad = scope === 'global' ? isOwner : !!company?.id
  const storeFilterId = scope === 'company'
    ? (store?.id || null)
    : (globalStoreId || null)

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

  // opções de vendedor (com base na view)
  const sellerOptions = useMemo(() => {
    const map = new Map<string, string>()
    sellers.forEach(s => {
      if (s.user_id) map.set(s.user_id, s.vendedor || '—')
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [sellers])

  // acumulados do período (para KPIs)
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

  // mix por meio (agregado)
  type PayAggRow = {
    meio: string
    qtd: number
    gross: number
    net: number
    fees: number
    pct: number
  }

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
    return { meio: m, qtd, gross, net, fees, pct }
  })
}, [pays, storeFilterId])

  // horas (agregado por hora do dia)
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
      // período como timestamps
      const fromTs = new Date(`${from}T00:00:00`)
      const toTs = new Date(`${to}T23:59:59`)
      const days = Math.max(1, Math.ceil((toTs.getTime() - fromTs.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      const prevTo = new Date(fromTs.getTime() - 1000)
      const prevFrom = new Date(prevTo.getTime() - (days * 24 * 60 * 60 * 1000))
      const compId = scope === 'global' ? (globalCompanyId || null) : (company?.id || null)

      // KPIs
      {
        let q = supabase
          .from('v_report_sales_kpis')
          .select('*')
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
          .order('dia', { ascending: true })
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setKpis((data || []) as KpiRow[])

        if (comparePrev) {
          let qPrev = supabase
            .from('v_report_sales_kpis')
            .select('*')
            .gte('dia', prevFrom.toISOString())
            .lte('dia', prevTo.toISOString())
            .order('dia', { ascending: true })
          if (compId) qPrev = qPrev.eq('company_id', compId)
          if (storeFilterId) qPrev = qPrev.eq('store_id', storeFilterId)
          const { data: prev } = await qPrev
          setPrevKpis((prev || []) as KpiRow[])
        } else {
          setPrevKpis([])
        }
      }

      // Meios
      {
        let q = supabase
          .from('v_report_payments_method')
          .select('*')
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
          .order('dia', { ascending: true })
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setPays((data || []) as PayRow[])
      }

      // Top produtos
      {
        let q = supabase
          .from('v_report_top_products')
          .select('*')
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
          .order('receita', { ascending: false })
          .limit(50)
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setTops((data || []) as TopRow[])
      }

      // Vendedor
      {
        let q = supabase
          .from('v_report_seller_kpis')
          .select('*')
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        if (seller) q = q.eq('user_id', seller)
        const { data } = await q.order('dia', { ascending: true })
        setSellers((data || []) as SellerRow[])
      }

      // Por hora
      {
        let q = supabase
          .from('v_report_sales_by_hour')
          .select('*')
          .gte('dia_local', fromTs.toISOString())
          .lte('dia_local', toTs.toISOString())
          .order('hora_local', { ascending: true })
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setHours((data || []) as HourRow[])
      }

      // Fechamentos
      {
        let q = supabase
          .from('v_report_cash_closures')
          .select('*')
          .gte('fechamento_at', fromTs.toISOString())
          .lte('fechamento_at', toTs.toISOString())
          .order('fechamento_at', { ascending: false })
          .limit(100)
        if (compId) q = q.eq('company_id', compId)
        if (storeFilterId) q = q.eq('store_id', storeFilterId)
        const { data } = await q
        setClosures((data || []) as CashCloseRow[])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canLoad) loadAll()
  }, [store?.id, company?.id, scope, globalCompanyId, globalStoreId, comparePrev]) // carrega ao selecionar loja/empresa/escopo

  function quickRange(preset: 'hoje' | 'semana' | 'mes') {
    const now = new Date()
    if (preset === 'hoje') {
      setFrom(toISODate(startOfToday()))
      setTo(toISODate(endOfToday()))
      return
    }
    if (preset === 'semana') {
      const d1 = new Date(now)
      const day = d1.getDay() || 7 // 1..7
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
    // agrega por vendedor no período (se vierem vários dias)
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
    // calcula ticket/desc%
    map.forEach((v) => {
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
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, valor]) => ({ day, valor }))
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

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h2 className="text-xl font-semibold">Relatórios</h2>

      {!canLoad && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
          Selecione uma empresa em <b>Config</b> para ver relatórios.
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

      {/* Filtros */}
      <Card title="Filtros">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <div className="text-xs text-zinc-500 mb-1">De</div>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="w-full rounded-2xl border px-3 py-2" />
          </div>
          <div>
            <div className="text-xs text-zinc-500 mb-1">Até</div>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="w-full rounded-2xl border px-3 py-2" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { quickRange('hoje'); canLoad && loadAll() }}>Hoje</Button>
          <Button onClick={() => { quickRange('semana'); canLoad && loadAll() }}>Semana</Button>
          <Button onClick={() => { quickRange('mes'); canLoad && loadAll() }}>Mês</Button>
          <Button onClick={loadAll} disabled={!canLoad || loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>
          <label className="text-sm text-zinc-600 flex items-center gap-2">
            <input type="checkbox" checked={comparePrev} onChange={e => setComparePrev(e.target.checked)} />
            Comparar período anterior
          </label>
        </div>
      </Card>

      {/* Abas */}
      <div className="flex gap-2">
        <button onClick={()=>setTab('oper')} className={`px-3 py-2 rounded-2xl border ${tab==='oper'?'border-black font-semibold':'border-zinc-300'}`}>Operação</button>
        <button onClick={()=>setTab('gestao')} className={`px-3 py-2 rounded-2xl border ${tab==='gestao'?'border-black font-semibold':'border-zinc-300'}`}>Gestão</button>
      </div>

      {/* OPERACIONAL */}
      {tab === 'oper' && (
        <>
          {scope === 'global' && (
            <Card title="Resumo por empresa (faturamento)">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-zinc-500">
                  <th className="py-1">Empresa</th><th>Cupons</th><th className="text-right">Faturamento</th>
                </tr></thead>
                <tbody>
                  {companyAgg.slice(0, 10).map((r) => (
                    <tr key={r.company_id} className="border-t">
                      <td className="py-1">{r.nome}</td>
                      <td>{r.cupons}</td>
                      <td className="text-right">{formatBRL(r.fat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2">
                <Button onClick={() => csvDownload('resumo_empresas', companyAgg)}>Exportar CSV</Button>
              </div>
            </Card>
          )}
          {/* KPIs */}
          <section className="grid grid-cols-2 gap-2">
            <KPI label="Faturamento" value={formatBRL(kpiAgg.fat)} />
            <KPI label="Cupons" value={String(kpiAgg.totalCup)} />
            <KPI label="Ticket Médio" value={formatBRL(kpiAgg.ticket)} />
            <KPI label="Descontos" value={formatBRL(kpiAgg.desc)} />
            <KPI label="Itens" value={String(kpiAgg.itens)} />
            {comparePrev && (
              <KPI label="Var. Faturamento" value={`${(((kpiAgg.fat - prevKpiAgg.fat) / (prevKpiAgg.fat || 1)) * 100).toFixed(1)}%`} />
            )}
          </section>

          {/* Mix de meios */}
          <Card title="Vendas por meio">
            <div className="space-y-2">
              {payAgg.map(r => (
                <div key={r.meio} className="flex items-center justify-between text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{r.meio}</div>
                    <div className="h-2 rounded-full bg-zinc-200 overflow-hidden mt-1">
                      <div className="h-2" style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                  <div className="ml-3 text-right">
                    <div className="font-semibold">{formatBRL(r.gross)}</div>
                    <div className="text-xs text-zinc-500">Líquido {formatBRL(r.net)} · Taxas {formatBRL(r.fees)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Button onClick={() => csvDownload('mix_meios', payAgg)}>Exportar CSV</Button>
            </div>
          </Card>

          {/* Vendas por hora */}
          <Card title="Vendas por hora (bruto)">
            <div className="grid grid-cols-6 gap-2">
              {hoursAgg.arr.map(({ h, total }) => (
                <div key={h} className="text-center">
                  <div className="h-16 w-3 mx-auto rounded bg-zinc-200 overflow-hidden">
                    <div className="w-3" style={{ height: `${Math.round((total / (hoursAgg.max || 1)) * 100)}%` }} />
                  </div>
                  <div className="text-[10px] mt-1">{h.toString().padStart(2, '0')}h</div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm mt-2">Total período: <b>{formatBRL(hours.reduce((a, r) => a + Number(r.total_gross || 0), 0))}</b></div>
            <div className="mt-2">
              <Button onClick={() => csvDownload('vendas_por_hora', hours)}>Exportar CSV</Button>
            </div>
          </Card>

          {/* Tendência e previsão */}
          <Card title="Tendência e previsão (simples)">
            <div className="text-xs text-zinc-500 mb-2">Média móvel (3 dias) e previsão dos próximos 3 dias.</div>
            {trend.length === 0 ? (
              <div className="text-sm text-zinc-500">Sem dados suficientes.</div>
            ) : (
              <div className="space-y-1 text-sm">
                {trend.slice(-5).map(t => (
                  <div key={t.day} className="flex items-center justify-between">
                    <div>{new Date(t.day + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                    <div className="font-semibold">{formatBRL(t.valor)}</div>
                  </div>
                ))}
              </div>
            )}
            {forecast.length > 0 && (
              <div className="mt-2 text-sm">
                <div className="text-xs text-zinc-500 mb-1">Previsão</div>
                {forecast.map(f => (
                  <div key={f.day} className="flex items-center justify-between">
                    <div>{new Date(f.day + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                    <div className="font-semibold">{formatBRL(f.valor)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2">
              <Button onClick={() => csvDownload('tendencia_previsao', [...trend, ...forecast])}>Exportar CSV</Button>
            </div>
          </Card>

          <Card title="Indicador rápido">
            <div className="text-sm">
              {trendDelta < 0 ? (
                <div className="text-amber-700">
                  Tendência de queda nas vendas nos últimos dias. Considere ações comerciais.
                </div>
              ) : (
                <div className="text-emerald-700">
                  Tendência estável ou de crescimento.
                </div>
              )}
            </div>
          </Card>

          {/* Top produtos */}
          <Card title="Top produtos (receita)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-zinc-500">
                <th className="py-1">Produto</th><th>Qtde</th><th className="text-right">Receita</th>
              </tr></thead>
              <tbody>
                {tops.slice(0,10).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1">{r.nome}</td>
                    <td>{r.qtde_total}</td>
                    <td className="text-right">{formatBRL(r.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2">
              <Button onClick={() => csvDownload('top_produtos', tops)}>Exportar CSV</Button>
            </div>
          </Card>
        </>
      )}

      {/* GESTÃO */}
      {tab === 'gestao' && (
        <>
          {/* Filtro de vendedor */}
          <Card title="Vendedor">
            <div className="flex gap-2">
              <select value={seller} onChange={e=>setSeller(e.target.value)} className="rounded-2xl border px-3 py-2 flex-1">
                <option value="">Todos</option>
                {sellerOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <Button onClick={loadAll} disabled={!canLoad || loading}>{loading ? 'Carregando...' : 'Aplicar'}</Button>
            </div>
          </Card>

          {/* Performance por vendedor */}
          <Card title="Performance por vendedor (período)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-zinc-500">
                <th className="py-1">Vendedor</th><th>Cupons</th><th>Itens</th><th>Ticket</th><th className="text-right">Faturamento</th>
              </tr></thead>
              <tbody>
                {sellerAgg.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1">{r.vendedor}</td>
                    <td>{r.cupons}</td>
                    <td>{r.itens}</td>
                    <td>{formatBRL(r.ticket)}</td>
                    <td className="text-right">{formatBRL(r.fat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2">
              <Button onClick={() => csvDownload('vendedores', sellerAgg)}>Exportar CSV</Button>
            </div>
          </Card>

          {/* Fechamentos de caixa */}
          <Card title="Fechamentos de caixa">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-zinc-500">
                <th className="py-1">Aberto</th><th>Fechado</th><th>Operador</th><th>Esperado</th><th>Contado</th><th className="text-right">Diferença</th>
              </tr></thead>
              <tbody>
                {closures.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1">{new Date(r.abertura_at).toLocaleString('pt-BR')}</td>
                    <td>{r.fechamento_at ? new Date(r.fechamento_at).toLocaleString('pt-BR') : '—'}</td>
                    <td>{r.operador}</td>
                    <td>{formatBRL(r.esperado_em_dinheiro)}</td>
                    <td>{formatBRL(r.valor_final)}</td>
                    <td className={`text-right ${r.diferenca === 0 ? '' : (r.diferenca > 0 ? 'text-green-600' : 'text-red-600')}`}>
                      {formatBRL(r.diferenca)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2">
              <Button onClick={() => csvDownload('fechamentos_caixa', closures)}>Exportar CSV</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
