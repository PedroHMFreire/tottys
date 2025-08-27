import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import KPI from '@/ui/KPI'
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
  const { store } = useApp()

  // filtros
  const [tab, setTab] = useState<'oper' | 'gestao'>('oper')
  const [from, setFrom] = useState<string>(toISODate(startOfToday()))
  const [to, setTo] = useState<string>(toISODate(endOfToday()))
  const [seller, setSeller] = useState<string>('') // user_id; vazio = todos

  const [loading, setLoading] = useState(false)
  const [kpis, setKpis] = useState<KpiRow[]>([])
  const [pays, setPays] = useState<PayRow[]>([])
  const [tops, setTops] = useState<TopRow[]>([])
  const [sellers, setSellers] = useState<SellerRow[]>([])
  const [hours, setHours] = useState<HourRow[]>([])
  const [closures, setClosures] = useState<CashCloseRow[]>([])

  const hasStore = !!store?.id

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
    const rows = kpis.filter(r => (!store?.id || r.store_id === store.id))
    const totalCup = rows.reduce((a, r) => a + Number(r.cupons || 0), 0)
    const fat = rows.reduce((a, r) => a + Number(r.faturamento_bruto || 0), 0)
    const desc = rows.reduce((a, r) => a + Number(r.descontos_total || 0), 0)
    const itens = rows.reduce((a, r) => a + Number(r.itens || 0), 0)
    const ticket = totalCup > 0 ? fat / totalCup : 0
    return { totalCup, fat, desc, itens, ticket }
  }, [kpis, store?.id])

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
  const rows = pays.filter(r => (!store?.id || r.store_id === store.id))
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
}, [pays, store?.id])

  // horas (agregado por hora do dia)
  const hoursAgg = useMemo(() => {
    const rows = hours.filter(r => (!store?.id || r.store_id === store.id))
    const map = new Map<number, number>()
    rows.forEach(r => {
      const h = new Date(r.hora_local).getHours()
      map.set(h, (map.get(h) || 0) + Number(r.total_gross || 0))
    })
    const arr = Array.from({ length: 24 }, (_, h) => ({ h, total: map.get(h) || 0 }))
    const max = arr.reduce((m, x) => Math.max(m, x.total), 0) || 1
    return { arr, max }
  }, [hours, store?.id])

  async function loadAll() {
    if (!hasStore) return
    setLoading(true)
    try {
      // período como timestamps
      const fromTs = new Date(`${from}T00:00:00`)
      const toTs = new Date(`${to}T23:59:59`)

      // KPIs
      {
        const { data } = await supabase
          .from('v_report_sales_kpis')
          .select('*')
          .eq('store_id', store!.id)
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
          .order('dia', { ascending: true })
        setKpis((data || []) as KpiRow[])
      }

      // Meios
      {
        const { data } = await supabase
          .from('v_report_payments_method')
          .select('*')
          .eq('store_id', store!.id)
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
          .order('dia', { ascending: true })
        setPays((data || []) as PayRow[])
      }

      // Top produtos
      {
        const { data } = await supabase
          .from('v_report_top_products')
          .select('*')
          .eq('store_id', store!.id)
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
          .order('receita', { ascending: false })
          .limit(50)
        setTops((data || []) as TopRow[])
      }

      // Vendedor
      {
        let q = supabase
          .from('v_report_seller_kpis')
          .select('*')
          .eq('store_id', store!.id)
          .gte('dia', fromTs.toISOString())
          .lte('dia', toTs.toISOString())
        if (seller) q = q.eq('user_id', seller)
        const { data } = await q.order('dia', { ascending: true })
        setSellers((data || []) as SellerRow[])
      }

      // Por hora
      {
        const { data } = await supabase
          .from('v_report_sales_by_hour')
          .select('*')
          .eq('store_id', store!.id)
          .gte('dia_local', fromTs.toISOString())
          .lte('dia_local', toTs.toISOString())
          .order('hora_local', { ascending: true })
        setHours((data || []) as HourRow[])
      }

      // Fechamentos
      {
        const { data } = await supabase
          .from('v_report_cash_closures')
          .select('*')
          .eq('store_id', store!.id)
          .gte('fechamento_at', fromTs.toISOString())
          .lte('fechamento_at', toTs.toISOString())
          .order('fechamento_at', { ascending: false })
          .limit(100)
        setClosures((data || []) as CashCloseRow[])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasStore) loadAll()
  }, [store?.id]) // carrega ao selecionar loja

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

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h2 className="text-xl font-semibold">Relatórios</h2>

      {!hasStore && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
          Selecione uma loja em <b>Config</b> para ver relatórios.
        </div>
      )}

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
          <Button onClick={() => { quickRange('hoje'); hasStore && loadAll() }}>Hoje</Button>
          <Button onClick={() => { quickRange('semana'); hasStore && loadAll() }}>Semana</Button>
          <Button onClick={() => { quickRange('mes'); hasStore && loadAll() }}>Mês</Button>
          <Button onClick={loadAll} disabled={!hasStore || loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>
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
          {/* KPIs */}
          <section className="grid grid-cols-2 gap-2">
            <KPI label="Faturamento" value={formatBRL(kpiAgg.fat)} />
            <KPI label="Cupons" value={String(kpiAgg.totalCup)} />
            <KPI label="Ticket Médio" value={formatBRL(kpiAgg.ticket)} />
            <KPI label="Descontos" value={formatBRL(kpiAgg.desc)} />
            <KPI label="Itens" value={String(kpiAgg.itens)} />
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
              <Button onClick={loadAll} disabled={!hasStore || loading}>{loading ? 'Carregando...' : 'Aplicar'}</Button>
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
