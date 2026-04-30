import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { logActivity } from '@/lib/activity'
import ImportBatchModal from '@/components/products/ImportBatchModal'
import NewProductModal from '@/components/products/NewProductModal'
import ReposicaoModal from '@/components/stock/ReposicaoModal'
import RomaneioModal from '@/components/stock/RomaneioModal'
import * as XLSX from 'xlsx'

type Store = { id: string; nome: string; company_id?: string | null }
type PositionRow = {
  company_id: string
  product_id: string
  sku: string
  produto: string
  store_id: string
  loja: string
  saldo: number
  has_variants: boolean
  last_move_at: string | null
}
type GroupedProduct = {
  product_id: string
  sku: string
  produto: string
  has_variants: boolean
  last_move_at: string | null
  stores: Array<{ store_id: string; loja: string; saldo: number; company_id: string }>
}
type ProductVariantRow = { id: string; tamanho: string; cor: string; sku: string | null }
type ExpandedVariant = ProductVariantRow & { stocks: Array<{ loja: string; qty: number }> }
type ProductMeta = { categoria: string | null; marca: string | null }
type MovementRow = {
  id: string
  type: string
  qty: number
  reason: string | null
  created_at: string
  loja: string | null
  user_nome: string | null
}
type StockFilter = 'all' | 'zero' | 'critical' | 'in-stock' | 'custom'
type SortOption = 'name-asc' | 'name-desc' | 'stock-asc' | 'stock-desc' | 'last-move'

const PAGE_SIZE = 50

const MOVE_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  AJUSTE_POSITIVO: 'Ajuste +',
  AJUSTE_NEGATIVO: 'Ajuste −',
  SAIDA: 'Saída',
  TRANSFER_OUT: 'Saída (transf.)',
  TRANSFER_IN: 'Entrada (transf.)',
  VENDA: 'Venda',
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 7) return `${days}d atrás`
  if (days < 30) return `${Math.floor(days / 7)}sem atrás`
  if (days < 365) return `${Math.floor(days / 30)}m atrás`
  return `${Math.floor(days / 365)}a atrás`
}

function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const cls =
    qty === 0
      ? 'bg-rose-50 text-rose-600'
      : qty <= threshold
      ? 'bg-amber-50 text-amber-600'
      : 'bg-emerald-50 text-emerald-700'
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{qty}</span>
}

function KpiCard({
  label, value, highlight, onClick, active,
}: {
  label: string; value: number; highlight?: 'danger' | 'warn' | 'ok'
  onClick?: () => void; active?: boolean
}) {
  const valueColor =
    highlight === 'danger' ? 'text-rose-500' :
    highlight === 'warn'   ? 'text-amber-500' :
    'text-[#1E1B4B]'
  const border =
    highlight === 'danger' && value > 0
      ? active ? 'border-rose-300 bg-rose-50' : 'border-slate-200 hover:border-rose-200 hover:bg-rose-50'
      : highlight === 'warn' && value > 0
      ? active ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:border-amber-200 hover:bg-amber-50'
      : 'border-slate-200'
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border bg-white p-3 space-y-0.5 transition-colors ${border} ${onClick && value > 0 ? 'cursor-pointer' : ''}`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${valueColor}`}>{value.toLocaleString('pt-BR')}</div>
    </div>
  )
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
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterMarca, setFilterMarca] = useState('')
  const [filterStock, setFilterStock] = useState<StockFilter>('all')
  const [filterStockMin, setFilterStockMin] = useState('')
  const [filterStockMax, setFilterStockMax] = useState('')
  const [filterStoreId, setFilterStoreId] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [criticalThreshold, setCriticalThreshold] = useState(3)
  const [categorias, setCategorias] = useState<string[]>([])
  const [marcas, setMarcas] = useState<string[]>([])
  const [productMeta, setProductMeta] = useState<Map<string, ProductMeta>>(new Map())

  const [rows, setRows] = useState<PositionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedVariants, setExpandedVariants] = useState<ExpandedVariant[]>([])
  const [expandedLoading, setExpandedLoading] = useState(false)

  const [historyProduct, setHistoryProduct] = useState<GroupedProduct | null>(null)
  const [historyRows, setHistoryRows] = useState<MovementRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [showReposicao, setShowReposicao] = useState(false)
  const [showRomaneio, setShowRomaneio] = useState(false)

  const [transferProd, setTransferProd] = useState<GroupedProduct | null>(null)
  const [adjustProd, setAdjustProd] = useState<GroupedProduct | null>(null)
  const [adjustStoreId, setAdjustStoreId] = useState<string>('')
  const [adjustVariantId, setAdjustVariantId] = useState<string>('')
  const [adjustVariants, setAdjustVariants] = useState<ProductVariantRow[]>([])
  const [adjustQty, setAdjustQty] = useState<string>('1')
  const [adjustType, setAdjustType] = useState<'ENTRADA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO'>('ENTRADA')
  const [adjustReason, setAdjustReason] = useState<string>('')
  const [adjusting, setAdjusting] = useState(false)

  const companyId = scope === 'global'
    ? (globalCompanyId || null)
    : (company?.id || store?.company_id || null)
  const myStoreId = store?.id || null
  const canTransfer = scope === 'company' && !!companyId && !!myStoreId
  const canAdjust = scope === 'company' && !!companyId

  const companyMap = useMemo(() => {
    const m = new Map<string, string>()
    companies.forEach(c => m.set(c.id, c.nome))
    return m
  }, [companies])

  useEffect(() => {
    if (!isOwner) return
    supabase.from('companies').select('id, nome').order('nome').then(({ data }) => {
      setCompanies((data || []) as any[])
    })
  }, [isOwner])

  useEffect(() => {
    if (!isOwner || scope !== 'global') return
    let q = supabase.from('stores').select('id, nome, company_id').order('nome')
    if (globalCompanyId) q = q.eq('company_id', globalCompanyId)
    q.then(({ data }) => setGlobalStores((data || []) as any[]))
  }, [isOwner, scope, globalCompanyId])

  useEffect(() => {
    if (!companyId) return
    supabase.from('stores').select('id, nome, company_id').eq('company_id', companyId).order('nome')
      .then(({ data }) => { if (data) setStores(data as Store[]) })
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    supabase.from('products').select('id, categoria, marca').eq('company_id', companyId)
      .then(({ data }) => {
        if (!data) return
        setCategorias(Array.from(new Set(data.map(p => p.categoria).filter(Boolean))).sort() as string[])
        setMarcas(Array.from(new Set(data.map(p => p.marca).filter(Boolean))).sort() as string[])
        const meta = new Map<string, ProductMeta>()
        data.forEach(p => meta.set(p.id, { categoria: p.categoria, marca: p.marca }))
        setProductMeta(meta)
      })
  }, [companyId])

  useEffect(() => {
    if (!adjustProd?.has_variants) { setAdjustVariants([]); setAdjustVariantId(''); return }
    supabase.from('product_variants').select('id, tamanho, cor, sku')
      .eq('product_id', adjustProd.product_id).order('tamanho').order('cor')
      .then(({ data }) => {
        const vars = (data || []) as ProductVariantRow[]
        setAdjustVariants(vars)
        setAdjustVariantId(vars[0]?.id || '')
      })
  }, [adjustProd?.product_id, adjustProd?.has_variants])

  // Debounce text search
  useEffect(() => {
    if (!companyId && scope !== 'global') return
    const t = setTimeout(() => search(0), 400)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger on filter/scope/company changes
  const filterKey = `${companyId}|${scope}|${globalStoreId}|${filterCategoria}|${filterMarca}|${filterStoreId}`
  useEffect(() => {
    if (!companyId && scope !== 'global') return
    search(0)
  }, [filterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function search(newOffset = 0) {
    if (!companyId && scope !== 'global') { setError('Selecione uma empresa em Config.'); return }
    setError(null)
    setLoading(true)

    try {
      // Pre-filter by category / brand
      let allowedIds: string[] | null = null
      if ((filterCategoria || filterMarca) && companyId) {
        let pq = supabase.from('products').select('id').eq('company_id', companyId)
        if (filterCategoria) pq = pq.eq('categoria', filterCategoria)
        if (filterMarca) pq = pq.eq('marca', filterMarca)
        const { data: pdata } = await pq
        allowedIds = (pdata || []).map(p => p.id)
        if (allowedIds.length === 0) {
          if (newOffset === 0) setRows([])
          setHasMore(false)
          setLoading(false)
          return
        }
      }

      const term = q.trim()
      const looksLikeEAN = /^[0-9]{8,}$/.test(term)

      let query = supabase
        .from('v_stock_position_detail')
        .select('company_id, product_id, sku, produto, store_id, loja, saldo, has_variants, last_move_at')
        .order('produto')
        .range(newOffset, newOffset + PAGE_SIZE - 1)

      if (companyId) query = query.eq('company_id', companyId)
      if (scope === 'global' && globalStoreId) query = query.eq('store_id', globalStoreId)
      if (filterStoreId) query = query.eq('store_id', filterStoreId)
      if (allowedIds) query = query.in('product_id', allowedIds)

      if (looksLikeEAN) {
        let bq = supabase.from('products').select('id').eq('barcode', term).limit(25)
        if (companyId) bq = bq.eq('company_id', companyId)
        const { data: bdata } = await bq
        const bIds = (bdata || []).map(p => p.id)
        if (bIds.length > 0) {
          const ids = allowedIds ? bIds.filter(id => allowedIds!.includes(id)) : bIds
          query = query.in('product_id', ids)
        }
      } else if (term) {
        query = query.or(`produto.ilike.%${term}%,sku.ilike.%${term}%`)
      }

      const { data, error: qErr } = await query
      if (qErr) throw qErr

      const newRows = (data || []) as PositionRow[]
      if (newOffset === 0) {
        setRows(newRows)
      } else {
        setRows(prev => [...prev, ...newRows])
      }
      setHasMore(newRows.length === PAGE_SIZE)
      setOffset(newOffset + newRows.length)
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
          product_id: r.product_id, sku: r.sku, produto: r.produto,
          has_variants: !!r.has_variants, last_move_at: r.last_move_at, stores: [],
        })
      }
      const g = map.get(r.product_id)!
      g.stores.push({ store_id: r.store_id, loja: r.loja, saldo: Number(r.saldo || 0), company_id: r.company_id })
      if (r.last_move_at && (!g.last_move_at || r.last_move_at > g.last_move_at)) g.last_move_at = r.last_move_at
    })
    return Array.from(map.values())
  }, [rows])

  const filteredGrouped = useMemo<GroupedProduct[]>(() => {
    let list = [...grouped]
    const total = (g: GroupedProduct) => g.stores.reduce((a, s) => a + s.saldo, 0)

    if (filterStock === 'zero') list = list.filter(g => total(g) === 0)
    else if (filterStock === 'critical') list = list.filter(g => { const t = total(g); return t > 0 && t <= criticalThreshold })
    else if (filterStock === 'in-stock') list = list.filter(g => total(g) > 0)
    else if (filterStock === 'custom') {
      const min = filterStockMin !== '' ? Number(filterStockMin) : -Infinity
      const max = filterStockMax !== '' ? Number(filterStockMax) : Infinity
      list = list.filter(g => { const t = total(g); return t >= min && t <= max })
    }

    if (sortBy === 'name-asc') list.sort((a, b) => a.produto.localeCompare(b.produto))
    else if (sortBy === 'name-desc') list.sort((a, b) => b.produto.localeCompare(a.produto))
    else if (sortBy === 'stock-asc') list.sort((a, b) => total(a) - total(b))
    else if (sortBy === 'stock-desc') list.sort((a, b) => total(b) - total(a))
    else if (sortBy === 'last-move') list.sort((a, b) => (b.last_move_at || '').localeCompare(a.last_move_at || ''))

    return list
  }, [grouped, filterStock, filterStockMin, filterStockMax, sortBy, criticalThreshold])

  const kpis = useMemo(() => {
    const totalSKUs = filteredGrouped.length
    const totalUnits = filteredGrouped.reduce((acc, g) => acc + g.stores.reduce((a, s) => a + s.saldo, 0), 0)
    const zeroStock = filteredGrouped.filter(g => g.stores.reduce((a, s) => a + s.saldo, 0) === 0).length
    const critical = filteredGrouped.filter(g => {
      const t = g.stores.reduce((a, s) => a + s.saldo, 0); return t > 0 && t <= criticalThreshold
    }).length
    return { totalSKUs, totalUnits, zeroStock, critical }
  }, [filteredGrouped, criticalThreshold])

  const stockByCompany = useMemo(() => {
    if (scope !== 'global') return []
    const map = new Map<string, number>()
    rows.forEach(r => map.set(r.company_id, (map.get(r.company_id) || 0) + Number(r.saldo || 0)))
    return Array.from(map.entries())
      .map(([company_id, total]) => ({ company_id, nome: companyMap.get(company_id) || company_id, total }))
      .sort((a, b) => b.total - a.total)
  }, [rows, scope, companyMap])

  async function toggleExpand(g: GroupedProduct) {
    if (expandedId === g.product_id) { setExpandedId(null); setExpandedVariants([]); return }
    setExpandedId(g.product_id)
    if (!g.has_variants) { setExpandedVariants([]); return }
    setExpandedLoading(true)
    try {
      const { data: vdata } = await supabase
        .from('product_variants').select('id, tamanho, cor, sku')
        .eq('product_id', g.product_id).order('tamanho').order('cor')
      const vars = (vdata || []) as ProductVariantRow[]
      if (vars.length > 0) {
        const { data: sdata } = await supabase
          .from('variant_stock').select('variant_id, store_id, qty, stores(nome)')
          .in('variant_id', vars.map(v => v.id))
        const stockMap = new Map<string, Array<{ loja: string; qty: number }>>()
        ;(sdata || []).forEach((s: any) => {
          if (!stockMap.has(s.variant_id)) stockMap.set(s.variant_id, [])
          stockMap.get(s.variant_id)!.push({ loja: s.stores?.nome || s.store_id, qty: Number(s.qty || 0) })
        })
        setExpandedVariants(vars.map(v => ({ ...v, stocks: stockMap.get(v.id) || [] })))
      } else {
        setExpandedVariants([])
      }
    } finally {
      setExpandedLoading(false)
    }
  }

  async function openHistory(g: GroupedProduct) {
    setHistoryProduct(g)
    setHistoryRows([])
    setHistoryLoading(true)
    try {
      const { data } = await supabase
        .from('stock_movements')
        .select('id, type, qty, reason, created_at, store_id, stores(nome), profiles(nome)')
        .eq('product_id', g.product_id)
        .order('created_at', { ascending: false })
        .limit(50)
      setHistoryRows(((data || []) as any[]).map(r => ({
        id: r.id, type: r.type, qty: Number(r.qty),
        reason: r.reason, created_at: r.created_at,
        loja: r.stores?.nome || null, user_nome: r.profiles?.nome || null,
      })))
    } catch {
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function submitAdjust() {
    if (!adjustProd || !companyId) return
    if (!adjustStoreId) { alert('Selecione a loja.'); return }
    if (adjustProd.has_variants && !adjustVariantId) { alert('Selecione a variante.'); return }
    const qtyNum = Math.max(1, Number(adjustQty || 0))
    if (!qtyNum) { alert('Informe a quantidade.'); return }

    const delta = adjustType === 'AJUSTE_NEGATIVO' ? -qtyNum : qtyNum
    setAdjusting(true)
    try {
      const { error: rpcErr } = await supabase.rpc('stock_adjust', {
        p_company_id: companyId, p_store_id: adjustStoreId,
        p_product_id: adjustProd.product_id, p_qty: delta,
        p_type: adjustType, p_reason: adjustReason || null,
        p_variant_id: adjustProd.has_variants ? adjustVariantId : null,
      })
      if (rpcErr) throw rpcErr
    } catch {
      try {
        if (adjustProd.has_variants && adjustVariantId) {
          const { data: cur } = await supabase.from('variant_stock').select('qty')
            .eq('store_id', adjustStoreId).eq('variant_id', adjustVariantId).maybeSingle()
          const next = Math.max(0, Number((cur as any)?.qty || 0) + delta)
          await supabase.from('variant_stock').upsert(
            { store_id: adjustStoreId, variant_id: adjustVariantId, qty: next }, { onConflict: 'store_id,variant_id' })
        } else {
          const { data: cur } = await supabase.from('product_stock').select('qty')
            .eq('store_id', adjustStoreId).eq('product_id', adjustProd.product_id).maybeSingle()
          const next = Math.max(0, Number((cur as any)?.qty || 0) + delta)
          await supabase.from('product_stock').upsert(
            { store_id: adjustStoreId, product_id: adjustProd.product_id, qty: next }, { onConflict: 'store_id,product_id' })
        }
      } catch (e: any) {
        alert(e?.message || 'Não foi possível ajustar o estoque.')
        setAdjusting(false)
        return
      }
    }

    logActivity(
      `Ajuste de estoque • ${adjustType.replace('_', ' ').toLowerCase()} • ${qtyNum}${adjustProd?.produto ? ` • ${adjustProd.produto}` : ''}`,
      'info',
      { store_id: adjustStoreId, product_id: adjustProd.product_id, qty: qtyNum, type: adjustType }
    )
    setAdjusting(false)
    setAdjustProd(null)
    setAdjustQty('1')
    setAdjustReason('')
    setAdjustStoreId('')
    setAdjustVariantId('')
    search(0)
  }

  function exportEstoque() {
    if (!rows.length) return
    const data = rows.map(r => {
      const meta = productMeta.get(r.product_id)
      return {
        Empresa: companyMap.get(r.company_id) || r.company_id,
        Loja: r.loja, SKU: r.sku, Produto: r.produto,
        Categoria: meta?.categoria || '', Marca: meta?.marca || '',
        'Com Grade': r.has_variants ? 'Sim' : 'Não', Saldo: r.saldo,
        'Último movimento': r.last_move_at ? new Date(r.last_move_at).toLocaleDateString('pt-BR') : '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque')
    XLSX.writeFile(wb, `estoque_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const activeFilters: Array<{ label: string; clear: () => void }> = []
  if (filterCategoria) activeFilters.push({ label: `Categoria: ${filterCategoria}`, clear: () => setFilterCategoria('') })
  if (filterMarca) activeFilters.push({ label: `Marca: ${filterMarca}`, clear: () => setFilterMarca('') })
  if (filterStock !== 'all') {
    const labels: Record<StockFilter, string> = {
      all: '', zero: 'Sem estoque', critical: `Crítico (≤${criticalThreshold})`,
      'in-stock': 'Em estoque', custom: `Saldo ${filterStockMin || '?'}–${filterStockMax || '?'}`,
    }
    activeFilters.push({ label: labels[filterStock], clear: () => setFilterStock('all') })
  }
  if (filterStoreId) {
    const s = stores.find(x => x.id === filterStoreId)
    activeFilters.push({ label: `Loja: ${s?.nome || filterStoreId}`, clear: () => setFilterStoreId('') })
  }

  // All unique store names across expanded variants (for table headers)
  const expandedStoreNames = useMemo(
    () => Array.from(new Set(expandedVariants.flatMap(v => v.stocks.map(s => s.loja)))).sort(),
    [expandedVariants]
  )

  return (
    <div className="pb-24 md:pb-8 max-w-5xl mx-auto p-4 sm:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-[#1E1B4B]">Estoque</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Crítico abaixo de</span>
            <input
              type="number" min={1} max={99} value={criticalThreshold}
              onChange={e => setCriticalThreshold(Math.max(1, Number(e.target.value)))}
              className="w-12 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF]"
            />
            <span>un.</span>
          </div>
          {rows.length > 0 && (
            <button
              onClick={exportEstoque}
              className="flex items-center gap-1.5 text-xs border border-slate-200 rounded-xl px-3 py-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4"/>
              </svg>
              Exportar .xlsx
            </button>
          )}
        </div>
      </div>

      {scope !== 'global' && !companyId && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">
          Selecione uma <b>empresa</b> em <b>Config</b> para consultar estoques.
        </div>
      )}

      {/* Quick actions for admin roles */}
      {canAdjust && (
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setShowReposicao(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] text-white text-sm font-medium cursor-pointer transition-colors"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M4 12l4-4m-4 4l4 4M20 12l-4-4m4 4l-4 4"/>
            </svg>
            <span className="hidden sm:inline">Reposição</span>
            <span className="sm:hidden">Repor</span>
          </button>
          <button
            onClick={() => setShowRomaneio(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer transition-colors"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span className="hidden sm:inline">Romaneio</span>
            <span className="sm:hidden">Rom.</span>
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer transition-colors"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/>
            </svg>
            <span className="hidden sm:inline">Importar</span>
            <span className="sm:hidden">Import.</span>
          </button>
          <button
            onClick={() => setShowNewProduct(true)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer transition-colors"
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 4v16m8-8H4"/>
            </svg>
            <span className="hidden sm:inline">Cadastrar</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      )}

      {/* Scope selector (OWNER only) */}
      {isOwner && (
        <Card title="Visão">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${scope === 'company' ? 'bg-[#1E40AF] text-white border-[#1E40AF]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                onClick={() => setScope('company')}
              >Por empresa</button>
              <button
                className={`rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${scope === 'global' ? 'bg-[#1E40AF] text-white border-[#1E40AF]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                onClick={() => setScope('global')}
              >Global</button>
            </div>
            {scope === 'company' && (
              <select
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
                value={company?.id || ''}
                onChange={e => { const c = companies.find(x => x.id === e.target.value); if (c) setCompany(c as any) }}
              >
                <option value="" disabled>Selecione...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            )}
            {scope === 'global' && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
                  value={globalCompanyId}
                  onChange={e => { setGlobalCompanyId(e.target.value); setGlobalStoreId('') }}
                >
                  <option value="">Todas as empresas</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
                  value={globalStoreId} onChange={e => setGlobalStoreId(e.target.value)}
                >
                  <option value="">Todas as lojas</option>
                  {globalStores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nome}{companyMap.get(s.company_id) ? ` • ${companyMap.get(s.company_id)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Filter bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(0)}
              className="w-full pl-9 pr-3 border border-slate-200 rounded-xl py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] bg-white"
              placeholder="SKU, nome ou EAN…"
            />
          </div>
          <button
            onClick={() => search(0)}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] disabled:opacity-50 text-white text-sm font-medium cursor-pointer transition-colors"
          >
            {loading ? '…' : 'Buscar'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select
            value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
          >
            <option value="">Categoria</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filterMarca} onChange={e => setFilterMarca(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
          >
            <option value="">Marca</option>
            {marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select
            value={filterStock} onChange={e => setFilterStock(e.target.value as StockFilter)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
          >
            <option value="all">Todos os saldos</option>
            <option value="in-stock">Em estoque</option>
            <option value="critical">Críticos (≤{criticalThreshold})</option>
            <option value="zero">Sem estoque</option>
            <option value="custom">Personalizado</option>
          </select>

          <select
            value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
          >
            <option value="name-asc">Nome A→Z</option>
            <option value="name-desc">Nome Z→A</option>
            <option value="stock-asc">Menor saldo</option>
            <option value="stock-desc">Maior saldo</option>
            <option value="last-move">Último movimento</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {scope === 'company' && stores.length > 1 && (
            <select
              value={filterStoreId} onChange={e => setFilterStoreId(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white"
            >
              <option value="">Todas as lojas</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          )}

          {filterStock === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Saldo entre</span>
              <input
                type="number" min={0} value={filterStockMin} onChange={e => setFilterStockMin(e.target.value)}
                className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-[#1E40AF]"
                placeholder="Mín"
              />
              <span className="text-xs text-slate-500">e</span>
              <input
                type="number" min={0} value={filterStockMax} onChange={e => setFilterStockMax(e.target.value)}
                className="w-20 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-[#1E40AF]"
                placeholder="Máx"
              />
            </div>
          )}
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilters.map((f, i) => (
              <button
                key={i} onClick={f.clear}
                className="flex items-center gap-1 bg-[#EFF6FF] text-[#1E40AF] text-xs px-2.5 py-1 rounded-full hover:bg-[#DBEAFE] transition-colors cursor-pointer"
              >
                {f.label}
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            ))}
            <button
              onClick={() => { setFilterCategoria(''); setFilterMarca(''); setFilterStock('all'); setFilterStoreId('') }}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">{error}</div>
      )}

      {/* KPI Cards */}
      {(rows.length > 0 || loading) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="SKUs" value={kpis.totalSKUs} />
          <KpiCard label="Unidades" value={kpis.totalUnits} />
          <KpiCard
            label="Sem estoque" value={kpis.zeroStock} highlight={kpis.zeroStock > 0 ? 'danger' : 'ok'}
            onClick={() => setFilterStock(filterStock === 'zero' ? 'all' : 'zero')}
            active={filterStock === 'zero'}
          />
          <KpiCard
            label={`Críticos (≤${criticalThreshold})`} value={kpis.critical} highlight={kpis.critical > 0 ? 'warn' : 'ok'}
            onClick={() => setFilterStock(filterStock === 'critical' ? 'all' : 'critical')}
            active={filterStock === 'critical'}
          />
        </div>
      )}

      {/* Global summary */}
      {scope === 'global' && stockByCompany.length > 0 && (
        <Card title="Resumo por empresa (saldo total)">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-zinc-500 text-xs">
              <th className="py-1">Empresa</th><th className="text-right py-1">Saldo</th>
            </tr></thead>
            <tbody>
              {stockByCompany.map(r => (
                <tr key={r.company_id} className="border-t">
                  <td className="py-1.5">{r.nome}</td>
                  <td className="text-right font-medium py-1.5">{r.total.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Results */}
      {filteredGrouped.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-medium text-[#1E1B4B]">
              {filteredGrouped.length} produto{filteredGrouped.length !== 1 ? 's' : ''}
              {hasMore && <span className="text-slate-400"> (parcial)</span>}
            </div>
            {loading && <span className="text-xs text-slate-400">Carregando…</span>}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-left px-3 py-3 font-medium">Categoria</th>
                  <th className="text-left px-3 py-3 font-medium">Lojas</th>
                  <th className="text-right px-3 py-3 font-medium">Total</th>
                  <th className="text-right px-3 py-3 font-medium">Últ. mov.</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGrouped.map(g => {
                  const total = g.stores.reduce((a, s) => a + s.saldo, 0)
                  const meta = productMeta.get(g.product_id)
                  const isExpanded = expandedId === g.product_id
                  const canTransferFrom = g.stores.filter(s => s.saldo > 0 && s.store_id !== myStoreId)

                  return (
                    <Fragment key={g.product_id}>
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isExpanded ? 'bg-slate-50/60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm text-[#1E1B4B] leading-snug">{g.produto}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-400">{g.sku}</span>
                            {g.has_variants && (
                              <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">Grade</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-500">{meta?.categoria || '—'}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {g.stores.sort((a, b) => a.loja.localeCompare(b.loja)).map(s => (
                              <span
                                key={s.store_id}
                                className={`text-xs px-2 py-0.5 rounded-full ${s.saldo === 0 ? 'bg-rose-50 text-rose-600' : s.saldo <= criticalThreshold ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700'}`}
                              >
                                {s.loja}: {s.saldo}
                                {scope === 'global' && companyMap.get(s.company_id) && (
                                  <span className="opacity-60"> · {companyMap.get(s.company_id)}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`text-sm font-bold ${total === 0 ? 'text-rose-500' : total <= criticalThreshold ? 'text-amber-500' : 'text-emerald-600'}`}>
                            {total}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                          {relativeDate(g.last_move_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            {g.has_variants && (
                              <button
                                onClick={() => toggleExpand(g)}
                                title="Ver grade"
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isExpanded ? 'text-[#1E40AF] bg-[#EFF6FF]' : 'text-slate-400 hover:text-[#1E40AF] hover:bg-[#EFF6FF]'}`}
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'}/>
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => openHistory(g)}
                              title="Histórico"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#1E40AF] hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                            >
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                            </button>
                            {canAdjust && (
                              <button
                                onClick={() => { setAdjustProd(g); setAdjustStoreId(myStoreId || ''); setAdjustQty('1'); setAdjustType('ENTRADA'); setAdjustReason('') }}
                                title="Entrada/Ajuste"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 4v16m8-8H4"/>
                                </svg>
                              </button>
                            )}
                            {canTransfer && canTransferFrom.length > 0 && (
                              <button
                                onClick={() => setTransferProd(g)}
                                title="Solicitar transferência"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
                              >
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12m0 0l-4 4m4-4l-4-4"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Inline variant expansion */}
                      {isExpanded && g.has_variants && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 px-8 py-3 border-b border-slate-100">
                            {expandedLoading ? (
                              <p className="text-xs text-slate-400">Carregando variantes…</p>
                            ) : expandedVariants.length === 0 ? (
                              <p className="text-xs text-slate-400">Nenhuma variante cadastrada.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="text-xs w-full">
                                  <thead>
                                    <tr className="text-slate-500">
                                      <th className="text-left py-1 pr-4 font-medium">Tamanho</th>
                                      <th className="text-left py-1 pr-4 font-medium">Cor</th>
                                      <th className="text-left py-1 pr-4 font-medium">SKU</th>
                                      {expandedStoreNames.map(loja => (
                                        <th key={loja} className="text-right py-1 pr-3 font-medium">{loja}</th>
                                      ))}
                                      <th className="text-right py-1 font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {expandedVariants.map(v => {
                                      const vTotal = v.stocks.reduce((a, s) => a + s.qty, 0)
                                      return (
                                        <tr key={v.id}>
                                          <td className="py-1.5 pr-4">{v.tamanho || '—'}</td>
                                          <td className="py-1.5 pr-4">{v.cor || '—'}</td>
                                          <td className="py-1.5 pr-4 text-slate-400">{v.sku || '—'}</td>
                                          {expandedStoreNames.map(loja => {
                                            const s = v.stocks.find(x => x.loja === loja)
                                            const qty = s?.qty ?? 0
                                            return (
                                              <td key={loja} className="py-1.5 pr-3 text-right">
                                                <StockBadge qty={qty} threshold={criticalThreshold} />
                                              </td>
                                            )
                                          })}
                                          <td className={`py-1.5 text-right font-semibold ${vTotal === 0 ? 'text-rose-500' : vTotal <= criticalThreshold ? 'text-amber-500' : 'text-emerald-600'}`}>
                                            {vTotal}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-slate-100">
            {filteredGrouped.map(g => {
              const total = g.stores.reduce((a, s) => a + s.saldo, 0)
              const meta = productMeta.get(g.product_id)
              const isExpanded = expandedId === g.product_id
              const canTransferFrom = g.stores.filter(s => s.saldo > 0 && s.store_id !== myStoreId)

              return (
                <div key={g.product_id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1E1B4B] leading-snug">{g.produto}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">{g.sku}</span>
                        {meta?.categoria && <span className="text-xs text-slate-400">· {meta.categoria}</span>}
                        {g.has_variants && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">Grade</span>}
                      </div>
                    </div>
                    <span className={`text-2xl font-bold leading-none mt-0.5 ${total === 0 ? 'text-rose-500' : total <= criticalThreshold ? 'text-amber-500' : 'text-emerald-600'}`}>
                      {total}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {g.stores.sort((a, b) => a.loja.localeCompare(b.loja)).map(s => (
                      <span
                        key={s.store_id}
                        className={`text-xs px-2 py-0.5 rounded-full ${s.saldo === 0 ? 'bg-rose-50 text-rose-600' : s.saldo <= criticalThreshold ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        {s.loja}: {s.saldo}
                      </span>
                    ))}
                  </div>

                  <div className="text-xs text-slate-400">Últ. mov.: {relativeDate(g.last_move_at)}</div>

                  {g.has_variants && isExpanded && (
                    <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1">
                      {expandedLoading ? (
                        <p className="text-xs text-slate-400">Carregando…</p>
                      ) : expandedVariants.map(v => {
                        const vTotal = v.stocks.reduce((a, s) => a + s.qty, 0)
                        return (
                          <div key={v.id} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">{v.tamanho} / {v.cor}</span>
                            <span className={`font-medium ${vTotal === 0 ? 'text-rose-500' : vTotal <= criticalThreshold ? 'text-amber-500' : 'text-emerald-600'}`}>{vTotal}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {g.has_variants && (
                      <button
                        onClick={() => toggleExpand(g)}
                        className="text-xs border border-slate-200 px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        {isExpanded ? 'Ocultar grade' : 'Ver grade'}
                      </button>
                    )}
                    <button
                      onClick={() => openHistory(g)}
                      className="text-xs border border-slate-200 px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      Histórico
                    </button>
                    {canAdjust && (
                      <button
                        onClick={() => { setAdjustProd(g); setAdjustStoreId(myStoreId || ''); setAdjustQty('1'); setAdjustType('ENTRADA'); setAdjustReason('') }}
                        className="text-xs border border-slate-200 px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        Ajustar
                      </button>
                    )}
                    {canTransfer && canTransferFrom.length > 0 && (
                      <button
                        onClick={() => setTransferProd(g)}
                        className="text-xs border border-slate-200 px-2.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        Transferir
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                onClick={() => search(offset)}
                disabled={loading}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {loading ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && (!!companyId || scope === 'global') && (
        <div className="rounded-2xl border border-slate-200 bg-white py-14 text-center space-y-1">
          <div className="text-slate-400 text-sm">Nenhum produto encontrado.</div>
          <div className="text-slate-400 text-xs">Ajuste os filtros ou o termo de busca.</div>
        </div>
      )}

      {/* History Drawer */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-[2px]" onClick={() => setHistoryProduct(null)} />
          <div className="w-full sm:w-[400px] bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#1E1B4B]">Histórico de movimentos</div>
                <div className="text-xs text-slate-400 truncate">{historyProduct.produto}</div>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 flex-shrink-0">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 p-4">
              {historyLoading ? (
                <div className="text-sm text-slate-400 py-12 text-center">Carregando…</div>
              ) : historyRows.length === 0 ? (
                <div className="text-sm text-slate-400 py-12 text-center">Nenhum movimento registrado.</div>
              ) : (
                <div className="space-y-2">
                  {historyRows.map(m => {
                    const isPositive = ['ENTRADA', 'AJUSTE_POSITIVO', 'TRANSFER_IN'].includes(m.type)
                    return (
                      <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${isPositive ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[#1E1B4B]">
                              {MOVE_LABELS[m.type] || m.type}
                            </span>
                            <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {isPositive ? '+' : ''}{m.qty}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {[m.loja, m.user_nome].filter(Boolean).join(' · ')}
                          </div>
                          {m.reason && (
                            <div className="text-xs text-slate-500 mt-0.5 italic">{m.reason}</div>
                          )}
                          <div className="text-xs text-slate-400 mt-0.5">
                            {new Date(m.created_at).toLocaleString('pt-BR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustProd && canAdjust && companyId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Entrada/Ajuste de estoque</div>
              <button onClick={() => setAdjustProd(null)} className="text-zinc-500 text-sm cursor-pointer">fechar</button>
            </div>
            <div className="text-sm">
              <div className="font-semibold">{adjustProd.produto}</div>
              <div className="text-xs text-zinc-500">{adjustProd.sku}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Loja</div>
              <select
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
                value={adjustStoreId} onChange={e => setAdjustStoreId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            {adjustProd.has_variants && (
              <div>
                <div className="text-xs text-zinc-500 mb-1">Variante (tamanho / cor)</div>
                {adjustVariants.length === 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">Nenhuma variante cadastrada.</div>
                ) : (
                  <select
                    className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
                    value={adjustVariantId} onChange={e => setAdjustVariantId(e.target.value)}
                  >
                    {adjustVariants.map(v => (
                      <option key={v.id} value={v.id}>{v.tamanho} / {v.cor}{v.sku ? ` · ${v.sku}` : ''}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Tipo</div>
                <select
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
                  value={adjustType} onChange={e => setAdjustType(e.target.value as any)}
                >
                  <option value="ENTRADA">Entrada</option>
                  <option value="AJUSTE_POSITIVO">Ajuste +</option>
                  <option value="AJUSTE_NEGATIVO">Ajuste −</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Quantidade</div>
                <input
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
                  value={adjustQty} onChange={e => setAdjustQty(e.target.value)} type="number" min="1"
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Motivo (opcional)</div>
              <input
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] bg-white w-full"
                value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                placeholder="Ex.: quebra, inventário, recebimento"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAdjustProd(null)}>Cancelar</Button>
              <Button onClick={submitAdjust} disabled={adjusting}>{adjusting ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Reposição Modal */}
      {showReposicao && companyId && (
        <ReposicaoModal
          companyId={companyId}
          storeId={myStoreId}
          onClose={() => setShowReposicao(false)}
          onDone={() => search(0)}
        />
      )}

      {/* Romaneio Modal */}
      {showRomaneio && companyId && (
        <RomaneioModal
          companyId={companyId}
          storeId={myStoreId}
          storeName={store?.nome || 'Loja'}
          onClose={() => setShowRomaneio(false)}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportBatchModal
          onClose={() => { setShowImport(false); search(0) }}
          storeId={myStoreId}
        />
      )}

      {/* New Product Modal */}
      {showNewProduct && companyId && (
        <NewProductModal
          companyId={companyId}
          onClose={() => { setShowNewProduct(false); search(0) }}
        />
      )}

      {/* Transfer Modal */}
      {transferProd && canTransfer && companyId && (
        <RequestTransferModal
          product={transferProd}
          companyId={companyId}
          toStoreId={myStoreId}
          stores={stores}
          onClose={() => setTransferProd(null)}
          onSuccess={() => { setTransferProd(null); alert('Transferência solicitada com sucesso.') }}
        />
      )}
    </div>
  )
}

function RequestTransferModal({
  product, companyId, toStoreId, stores, onClose, onSuccess,
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
  }, [product.product_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const qNum = Math.max(1, Number(qty || 0))
    if (!fromStoreId) { alert('Escolha a loja de origem.'); return }
    setLoading(true)
    try {
      const { data: created, error: e1 } = await supabase.rpc('request_transfer', {
        p_company_id: companyId, p_from_store: fromStoreId, p_to_store: toStoreId, p_notes: notes || null,
      })
      if (e1) throw e1
      const transferId = Array.isArray(created) ? created[0] : created
      const { error: e2 } = await supabase.rpc('add_transfer_item', {
        p_transfer_id: transferId, p_product_id: product.product_id, p_qty: qNum,
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center overflow-y-auto">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
          <div className="text-lg font-semibold">Solicitar transferência</div>
          <button onClick={onClose} className="text-zinc-500 text-sm cursor-pointer">fechar</button>
        </div>

        <Card title="Produto">
          <div className="font-semibold text-sm">{product.produto}</div>
          <div className="text-xs text-zinc-500">{product.sku}</div>
        </Card>

        <Card title="Origem e quantidade">
          <div className="space-y-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Loja de origem</div>
              <select
                value={fromStoreId} onChange={e => setFromStoreId(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
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
                type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white w-full"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Observações</div>
              <input
                value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: Reposição vitrine"
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] bg-white w-full"
              />
            </div>
          </div>
        </Card>

        <div className="sticky bottom-0 bg-white pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={loading || canFrom.length === 0}>
              {loading ? 'Enviando…' : 'Solicitar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
