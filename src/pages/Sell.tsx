// src/pages/Sell.tsx
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import TabBar from '@/ui/TabBar'
import Toast, { type ToastItem } from '@/ui/Toast'
import { usePaymentRules } from '@/hooks/usePayment'
import { savePayment } from '@/domain/services/PaymentService'
import { createSaleWithItems } from '@/domain/services/SaleService'
import { formatBRL } from '@/lib/currency'
import { logActivity } from '@/lib/activity'
import { isUUID } from '@/lib/utils'
import { useRole } from '@/hooks/useRole'
import CustomerPDV, { type SelectedCustomer } from '@/components/pdv/CustomerPDV'
import type { ProductVariant } from '@/domain/types'
import type { DescontoAplicado } from '@/components/pdv/DescontoModal'
import { Search, ScanLine, Trash2, X, Loader2, ShoppingBag, ChevronDown, AlertCircle } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

// Lazy-load heavy modals — não carregam até serem abertos (#8)
const PayModal           = lazy(() => import('@/components/PayModal'))
const VariantSelector    = lazy(() => import('@/components/fashion/VariantSelector'))
const CrediarioSellModal = lazy(() => import('@/components/crediario/CrediarioSellModal'))
const TrocaModal         = lazy(() => import('@/components/trocas/TrocaModal'))
const DescontoModal      = lazy(() => import('@/components/pdv/DescontoModal'))
const ResgateModal       = lazy(() => import('@/components/pdv/ResgateModal'))
const PostSaleModal      = lazy(() => import('@/components/print/PostSaleModal'))

import type { PostSaleData } from '@/components/print/PostSaleModal'

// Hoisted RegExp — evita recriar a cada render (#7)
const EAN_RE = /^[0-9]{8,14}$/

type Product = { id: string; sku: string; nome: string; barcode?: string | null; preco: number; has_variants?: boolean }

type CartItem = {
  product_id: string | null
  variant_id?: string | null
  tamanho?: string
  cor?: string
  sku: string
  nome: string
  preco: number
  qtde: number
  maxQty: number
  origin: 'CATALOGO' | 'MOCK'
}

declare global {
  interface Window { BarcodeDetector?: any }
}

/* ===================== Utils ===================== */
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function highlightTerm(text: string, term: string) {
  if (!term) return text
  const safe = escapeRegExp(term)
  const re = new RegExp(`(${safe})`, 'ig')
  const parts = text.split(re)
  return parts.map((part, i) =>
    i % 2 === 1 ? <span key={i} className="bg-blue-100 text-blue-700 rounded px-0.5">{part}</span> : part
  )
}

function medal(pos: number) {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  if (pos === 3) return '🥉'
  return `${pos}º`
}
function sellCountdown(fim: string) {
  const diff = new Date(fim).getTime() - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3_600_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

async function getStoreStock(productId: string, storeId?: string | null): Promise<number> {
  try {
    if (storeId) {
      const q1 = await supabase.from('product_stock').select('qty').eq('store_id', storeId).eq('product_id', productId).maybeSingle()
      if (!q1.error && q1.data && typeof q1.data.qty === 'number') return q1.data.qty as number

      const q2 = await supabase.from('product_stock').select('estoque').eq('store_id', storeId).eq('product_id', productId).maybeSingle()
      if (!q2.error && q2.data && typeof q2.data.estoque === 'number') return q2.data.estoque as number
    }
  } catch {}
  try {
    const { data } = await supabase.from('products').select('estoque').eq('id', productId).maybeSingle()
    if (data && typeof data.estoque === 'number') return data.estoque as number
  } catch {}
  return Infinity
}

/* ===================== Página ===================== */
export default function Sell() {
  const navigate = useNavigate()
  const { store, company, setStore, user } = useApp()
  const { role } = useRole()
  const isAdmin = role === 'OWNER' || role === 'ADMIN' || role === 'GERENTE'
  const [toasts, setToasts] = useState<ToastItem[]>([])
  function pushToast(kind: ToastItem['kind'], message: string) {
    setToasts(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, kind, message }])
  }

  /* -------- userId atual -------- */
  const [currentUserId, setCurrentUserId] = useState<string | undefined>()
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  /* -------- Stock cache -------- */
  const stockCache = useRef<Map<string, number>>(new Map())
  async function getCachedStock(productId: string, storeId: string): Promise<number> {
    const key = `${productId}:${storeId}`
    if (stockCache.current.has(key)) return stockCache.current.get(key)!
    const stock = await getStoreStock(productId, storeId)
    stockCache.current.set(key, stock)
    return stock
  }

  /* -------- Dropdown de lojas -------- */
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [storeList, setStoreList] = useState<Array<{ id: string; nome: string; company_id: string; uf: string }>>([])

  useEffect(() => {
    if (!showDropdown) return
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showDropdown])

  useEffect(() => {
    if (!showDropdown) return
    let active = true
    ;(async () => {
      if (!company?.id) { if (active) setStoreList([]); return }
      let query = supabase.from('stores').select('id, nome, company_id, uf').eq('company_id', company.id).order('nome', { ascending: true })
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: us } = await supabase.from('user_stores').select('store_id').eq('user_id', user.id)
          const ids = (us || []).map((r: any) => r.store_id)
          if (ids.length > 0) query = query.in('id', ids)
        }
      } catch {}
      const { data, error } = await query
      if (!error && data && active) setStoreList(data)
    })()
    return () => { active = false }
  }, [showDropdown, company?.id])

  /* -------- Status do caixa -------- */
  const [caixaAberto, setCaixaAberto] = useState(false)
  const demoKey = useMemo(() => `pdv_demo_cash_${store?.id || 'sem_loja'}`, [store?.id])
  useEffect(() => {
    let mounted = true
    async function checkCash() {
      if (!store) { if (mounted) setCaixaAberto(false); return }
      let opened = false
      if (isUUID(store.id)) {
        try {
          const { data, error } = await supabase.rpc('get_open_cash', { p_store_id: store.id })
          const row = error ? null : (Array.isArray(data) ? data[0] : data)
          opened = !!row && row.status === 'ABERTO'
        } catch { opened = false }
      } else {
        const saved = localStorage.getItem(demoKey)
        const row = saved ? JSON.parse(saved) : null
        opened = !!row && row.status === 'ABERTO'
      }
      if (mounted) setCaixaAberto(opened)
    }
    checkCash()
    return () => { mounted = false }
  }, [store?.id, demoKey])

  /* -------- Vendedor -------- */
  type VendedorOpt = { id: string; nome: string; apelido: string | null; user_id: string | null }
  const [vendedores, setVendedores]           = useState<VendedorOpt[]>([])
  const [selectedVendedor, setSelectedVendedor] = useState<VendedorOpt | null>(null)

  useEffect(() => {
    if (!company?.id) { setVendedores([]); return }
    let q = supabase
      .from('vendedores')
      .select('id, nome, apelido, user_id')
      .eq('company_id', company.id)
      .eq('ativo', true)
      .order('nome')
    if (store?.id) q = q.or(`store_id.eq.${store.id},store_id.is.null`)
    q.then(({ data }) => setVendedores((data ?? []) as VendedorOpt[]))
  }, [company?.id, store?.id])

  /* -------- Cliente / Cashback -------- */
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null)
  const [cashbackSaldoGrupo, setCashbackSaldoGrupo] = useState(0)
  const [showResgate, setShowResgate] = useState(false)
  const [resgateAplicado, setResgateAplicado] = useState(0)
  const [resgateMinimo, setResgateMinimo] = useState(5)

  useEffect(() => {
    if (!company?.id) return
    supabase.from('cashback_config').select('resgate_minimo').eq('company_id', company.id).maybeSingle()
      .then(({ data }) => { if (data?.resgate_minimo) setResgateMinimo(data.resgate_minimo) })
  }, [company?.id])

  // Busca saldo específico do grupo/loja ao selecionar cliente ou trocar loja
  useEffect(() => {
    if (!selectedCustomer?.id || !store?.id) { setCashbackSaldoGrupo(0); return }
    supabase.rpc('fn_get_cashback_saldo', {
      p_customer_id: selectedCustomer.id,
      p_store_id: store.id,
    }).then(({ data }) => {
      setCashbackSaldoGrupo(Number((data as any)?.saldo ?? 0))
    })
  }, [selectedCustomer?.id, store?.id])

  /* -------- Carrinho -------- */
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartFlash, setCartFlash] = useState(false)
  const [desconto, setDesconto] = useState<DescontoAplicado | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const total = useMemo(() => cart.reduce((acc, i) => acc + i.preco * i.qtde, 0), [cart])
  const descontoValor = useMemo(() => {
    if (!desconto) return 0
    if (desconto.tipo === 'PERCENTUAL') return Math.round(total * desconto.valor / 100 * 100) / 100
    return Math.min(desconto.valor, total)
  }, [total, desconto])
  const totalFinal = useMemo(() => Math.max(0, total - descontoValor - resgateAplicado), [total, descontoValor, resgateAplicado])

  function flashCart() {
    setCartFlash(true)
    setTimeout(() => setCartFlash(false), 400)
  }

  useEffect(() => { if (cart.length === 0) setConfirmClear(false) }, [cart.length])
  useEffect(() => { setCart([]); stockCache.current.clear(); setSelectedVendedor(null); setCashbackSaldoGrupo(0) }, [store?.id])

  /* -------- Histórico & KPIs -------- */
  const [salesHistory, setSalesHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)
  const [vendasHoje, setVendasHoje] = useState(0)
  const [ticketMedio, setTicketMedio] = useState(0)
  const [itensVendidos, setItensVendidos] = useState(0)

  // ── Painel motivacional PDV ──
  const [myRankSell, setMyRankSell] = useState<{ posicao: number; faturamento: number } | null>(null)
  const [metaSell, setMetaSell]     = useState<{ pct: number; tipo: string; bonus_valor: number } | null>(null)
  const [corrSell, setCorrSell]     = useState<{ nome: string; pct: number; fim: string } | null>(null)
  const [, setSellTick] = useState(0)

  useEffect(() => {
    async function load() {
      if (!store?.id) { setSalesHistory([]); setVendasHoje(0); setTicketMedio(0); setItensVendidos(0); return }
      setLoadingHistory(true)
      try {
        const { data: sales } = await supabase.from('sales').select('id, created_at, total, status, desconto, customer_id, customers(nome, email, telefone)').eq('store_id', store.id).order('created_at', { ascending: false }).limit(10)
        setSalesHistory(sales || [])

        const start = new Date(); start.setHours(0, 0, 0, 0)
        const end = new Date(); end.setHours(23, 59, 59, 999)
        const { data: daySales } = await supabase.from('sales').select('id,total').eq('store_id', store.id).eq('status', 'PAGA').gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
        const ids = (daySales || []).map(s => s.id)
        const totalDia = (daySales || []).reduce((acc, s: any) => acc + Number(s.total || 0), 0)
        const cupons = (daySales || []).length
        setVendasHoje(totalDia)
        setTicketMedio(cupons > 0 ? totalDia / cupons : 0)
        if (ids.length) {
          const { data: items } = await supabase.from('sale_items').select('qtde').in('sale_id', ids)
          setItensVendidos((items || []).reduce((acc, it: any) => acc + Number(it.qtde || 0), 0))
        } else {
          setItensVendidos(0)
        }
      } finally {
        setLoadingHistory(false)
      }
    }
    load()
  }, [store?.id])

  // Tick para atualizar countdown da corridinha
  useEffect(() => {
    if (isAdmin) return
    const id = setInterval(() => setSellTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [isAdmin])

  // Carrega dados do painel motivacional
  useEffect(() => {
    if (isAdmin || !store?.id || !user?.id || !isUUID(store.id)) return
    const hoje = new Date().toISOString().slice(0, 10)
    Promise.all([
      supabase.rpc('get_ranking_vendedores', { p_store_id: store.id }),
      supabase.rpc('get_metas_progresso', { p_user_id: user.id, p_store_id: store.id, p_data: hoje }),
      supabase.rpc('get_corridinhas_progresso', { p_user_id: user.id, p_store_id: store.id }),
    ]).then(([rankRes, metaRes, corrRes]) => {
      type RankRow = { user_id: string; posicao: number; faturamento: number }
      type MetaRow = { pct: number; tipo: string; bonus_valor: number }
      type CorrRow = { nome: string; pct: number; fim: string; concluido: boolean }

      const rank = (rankRes.data ?? []) as RankRow[]
      const mine = rank.find(r => r.user_id === user.id)
      setMyRankSell(mine ? { posicao: mine.posicao, faturamento: mine.faturamento } : null)

      const mList = (metaRes.data ?? []) as MetaRow[]
      setMetaSell([...mList].sort((a, b) => a.pct - b.pct)[0] ?? null)

      const cList = (corrRes.data ?? []) as CorrRow[]
      setCorrSell(
        cList
          .filter(c => !c.concluido)
          .sort((a, b) => new Date(a.fim).getTime() - new Date(b.fim).getTime())[0] ?? null
      )
    })
  }, [store?.id, user?.id, isAdmin])

  async function openSaleReceipt(sale: any) {
    setLoadingReceiptId(sale.id)
    try {
      const [paymentsRes, itemsRes] = await Promise.all([
        supabase.from('payments').select('meio, valor, bandeira, nsu').eq('sale_id', sale.id),
        supabase.from('sale_items').select('nome, qtde, preco_unit').eq('sale_id', sale.id),
      ])
      const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers
      const postSale: PostSaleData = {
        saleId: sale.id,
        createdAt: sale.created_at,
        total: Number(sale.total || 0),
        subtotal: Number(sale.total || 0) + Number(sale.desconto || 0),
        desconto: Number(sale.desconto || 0),
        items: (itemsRes.data || []).map((it: any) => ({ nome: it.nome, qtde: it.qtde, preco_unit: it.preco_unit })),
        payments: (paymentsRes.data || []).map((p: any) => ({ meio: p.meio, valor: p.valor, bandeira: p.bandeira ?? null })),
        customerNome: customer?.nome ?? null,
        customerDoc: null,
        customerId: sale.customer_id ?? null,
        customerEmail: customer?.email ?? null,
        customerPhone: customer?.telefone ?? null,
      }
      setPostSaleData(postSale)
    } catch {
      // silently ignore; user can retry
    } finally {
      setLoadingReceiptId(null)
    }
  }

  /* -------- Pós-venda / impressão -------- */
  const [postSaleData, setPostSaleData] = useState<PostSaleData | null>(null)

  /* -------- Pagamento -------- */
  const [showPay, setShowPay] = useState(false)
  const [showCrediario, setShowCrediario] = useState(false)
  const [showTroca, setShowTroca] = useState(false)
  const [showDesconto, setShowDesconto] = useState(false)
  const [payKey, setPayKey] = useState(0)
  const [finalizing, setFinalizing] = useState(false)
  const [pendingPays, setPendingPays] = useState<Array<{
    meio: 'DINHEIRO' | 'PIX' | 'CARTAO'
    brand?: string | null
    mode?: 'DEBITO' | 'CREDITO' | 'CREDITO_PARC' | 'CREDITO_VISTA'
    installments?: number | null
    installment_value?: number | null
    mdr_pct?: number | null
    fee_fixed?: number | null
    fee_total?: number | null
    interest_pct_monthly?: number | null
    interest_total?: number | null
    gross?: number | null
    net?: number | null
  }>>([])
  const { rules, loading: loadingRules, error: rulesError } = usePaymentRules(undefined, store?.company_id ?? undefined)

  /* -------- Busca -------- */
  const [q, setQ] = useState('')
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [results, setResults] = useState<Product[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const debounceRef = useRef<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      if (!q.trim()) { setSuggestions([]); setActiveSuggestion(-1); return }
      const term = q.trim()
      const looksLikeEAN = EAN_RE.test(term)
      const base = supabase.from('products').select('id, sku, nome, barcode, preco, has_variants')
      const filtered = looksLikeEAN ? base.eq('barcode', term) : base.or(`sku.ilike.%${term}%,nome.ilike.%${term}%`)
      filtered.order('nome', { ascending: true }).limit(10).then(({ data }) => {
        setSuggestions((data || []) as Product[])
        setActiveSuggestion(-1)
      })
    }, 300)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [q])

  async function search(overrideTerm?: string) {
    setSearchError(null)
    const term = (overrideTerm !== undefined ? overrideTerm : q).trim()
    if (!term) { setResults([]); return }
    setLoadingSearch(true)
    try {
      const looksLikeEAN = EAN_RE.test(term)
      const base = supabase.from('products').select('id, sku, nome, barcode, preco, has_variants')
      const filtered = looksLikeEAN ? base.eq('barcode', term) : base.or(`sku.ilike.%${term}%,nome.ilike.%${term}%`)
      const { data, error } = await filtered.order('nome', { ascending: true }).limit(50)
      if (error) throw error
      setResults((data || []) as Product[])
      if (!data || data.length === 0) setSearchError('Nenhum produto encontrado.')
    } catch (e: any) {
      setSearchError(e?.message || 'Falha na busca.')
    } finally {
      setLoadingSearch(false)
    }
  }

  /* -------- Scanner -------- */
  const [showScanner, setShowScanner] = useState(false)

  /* -------- Variante -------- */
  const [variantSelectorProduct, setVariantSelectorProduct] = useState<Product | null>(null)

  function addVariantToCart(product: Product, variant: ProductVariant, price: number) {
    const maxQty = variant.qty ?? Infinity
    const idx = cart.findIndex(i => i.variant_id === variant.id)
    if (idx >= 0) {
      const nextQty = cart[idx].qtde + 1
      if (nextQty > maxQty) { pushToast('error', 'Estoque insuficiente nesta loja.'); return }
      if (nextQty > 99) { pushToast('error', 'Quantidade máxima por item atingida.'); return }
      setCart(prev => prev.map((it, i) => i === idx ? { ...it, qtde: nextQty } : it))
      flashCart()
      return
    }
    setCart(prev => [...prev, {
      product_id: product.id,
      variant_id: variant.id,
      tamanho: variant.tamanho,
      cor: variant.cor,
      sku: variant.sku || product.sku,
      nome: `${product.nome} · ${variant.tamanho} / ${variant.cor}`,
      preco: price,
      qtde: 1,
      maxQty,
      origin: 'CATALOGO',
    }])
    flashCart()
  }

  async function addFromCatalog(p: Product) {
    if (p.has_variants && store?.id) { setVariantSelectorProduct(p); return }

    const maxQty = store?.id ? await getCachedStock(p.id, store.id) : Infinity
    const idx = cart.findIndex(i => i.product_id === p.id && !i.variant_id)
    if (idx >= 0) {
      const nextQty = cart[idx].qtde + 1
      if (nextQty > maxQty) { pushToast('error', 'Estoque insuficiente nesta loja.'); return }
      if (nextQty > 99) { pushToast('error', 'Quantidade máxima por item atingida.'); return }
      setCart(prev => prev.map((it, i) => i === idx ? { ...it, qtde: nextQty, maxQty } : it))
      flashCart()
      return
    }
    if (maxQty < 1) { pushToast('error', 'Produto sem estoque disponível nesta loja.'); return }
    setCart(prev => [...prev, {
      product_id: p.id,
      sku: p.sku,
      nome: p.nome,
      preco: Number(p.preco || 0),
      qtde: 1,
      maxQty,
      origin: 'CATALOGO',
    }])
    flashCart()
  }

  function addMockProduct() {
    setCart(prev => {
      const i = prev.findIndex(it => it.sku === 'TT-PRE' && it.origin === 'MOCK')
      if (i >= 0) {
        if (prev[i].qtde + 1 > 99) return prev
        const copy = [...prev]; copy[i] = { ...copy[i], qtde: copy[i].qtde + 1 }; return copy
      }
      return [...prev, { product_id: null, sku: 'TT-PRE', nome: 'Produto de teste', preco: 119.9, qtde: 1, maxQty: Infinity, origin: 'MOCK' }]
    })
    flashCart()
  }

  function inc(idx: number) {
    const item = cart[idx]
    const nextQty = item.qtde + 1
    if (nextQty > 99) { pushToast('error', 'Quantidade máxima atingida.'); return }
    if (nextQty > item.maxQty) { pushToast('error', 'Estoque insuficiente.'); return }
    setCart(prev => prev.map((it, i) => i === idx ? { ...it, qtde: nextQty } : it))
  }
  const dec = (idx: number) => setCart(prev => prev.map((it, i) => i === idx ? { ...it, qtde: Math.max(1, it.qtde - 1) } : it))
  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx))
  function doClearCart() {
    setCart([]); setDesconto(null); setResgateAplicado(0); setSelectedCustomer(null); setConfirmClear(false)
  }

  /* -------- FINALIZAR -------- */
  async function finalizePayment(pays: typeof pendingPays) {
    if (finalizing) return
    setFinalizing(true)
    try {
      if (!store?.id) { pushToast('error', 'Selecione a LOJA para validar estoque e finalizar.'); return }
      if (!caixaAberto) { pushToast('error', 'Abra o caixa antes de vender.'); return }
      if (cart.length === 0) { pushToast('error', 'Carrinho vazio.'); return }
      for (const item of cart) {
        if (item.qtde < 1) { pushToast('error', `Quantidade inválida: ${item.nome}.`); return }
        if (item.origin === 'CATALOGO' && item.product_id) {
          const estoque = await getCachedStock(item.product_id, store.id)
          if (item.qtde > estoque) { pushToast('error', `Estoque insuficiente: ${item.nome}.`); return }
        }
        if (item.qtde > 99) { pushToast('error', `Máximo 99 por item: ${item.nome}.`); return }
      }

      // Se vendedor selecionado tem login próprio, atribui a venda a ele; caso contrário userId fica null
      const effectiveUserId = selectedVendedor
        ? (selectedVendedor.user_id ?? undefined)
        : currentUserId
      const { saleId, persisted } = await createSaleWithItems({
        storeId: store.id,
        userId: effectiveUserId,
        vendedorId: selectedVendedor?.id ?? null,
        customerId: selectedCustomer?.id ?? null,
        total: totalFinal,
        desconto: descontoValor + resgateAplicado,
        status: 'PAGA',
        items: cart.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          qtde: i.qtde,
          preco_unit: i.preco,
          desconto: 0,
        })),
      })

      if (persisted) {
        for (const pay of pays) {
          await savePayment({
            sale_id: saleId,
            meio: pay.meio,
            brand: pay.brand,
            mode: pay.mode === 'CREDITO' ? 'CREDITO_VISTA' : pay.mode,
            installments: pay.installments,
            installment_value: pay.installment_value,
            mdr_pct: pay.mdr_pct,
            fee_fixed: pay.fee_fixed,
            fee_total: pay.fee_total,
            interest_pct_monthly: pay.interest_pct_monthly,
            interest_total: pay.interest_total,
            gross: pay.gross ?? totalFinal,
            net: pay.net ?? totalFinal,
            acquirer: pay.meio === 'CARTAO' ? 'STONE' : null,
          })
        }
        const { error: eStock } = await supabase.rpc('post_sale_stock', { p_sale_id: saleId })
        if (eStock) throw eStock

        for (const item of cart) {
          if (item.product_id) stockCache.current.delete(`${item.product_id}:${store.id}`)
        }

        if (selectedCustomer?.id && company?.id) {
          try {
            if (resgateAplicado > 0) {
              await supabase.rpc('fn_resgatar_cashback', {
                p_company_id: company.id,
                p_customer_id: selectedCustomer.id,
                p_valor_resgate: resgateAplicado,
                p_sale_id: saleId,
                p_store_id: store.id,
              })
            }
            const { data: cbData } = await supabase.rpc('fn_creditar_cashback', {
              p_company_id: company.id,
              p_customer_id: selectedCustomer.id,
              p_sale_id: saleId,
              p_valor_venda: totalFinal,
              p_store_id: store.id,
            })
            const cb = cbData as any
            if (cb?.ok && cb?.credito > 0) {
              pushToast('success', cb.subiu_tier
                ? `Cashback de ${formatBRL(cb.credito)} creditado! Parabéns, agora é ${cb.tier_novo}!`
                : `Cashback de ${formatBRL(cb.credito)} creditado para ${selectedCustomer.nome}.`)

              // Enfileira notificação WhatsApp se o cliente tem telefone cadastrado
              if (selectedCustomer.contato) {
                try {
                  const novoSaldo = selectedCustomer.cashback_saldo + cb.credito
                  const waMsg = cb.subiu_tier
                    ? `Olá, ${selectedCustomer.nome}! 🎉 Você ganhou *${formatBRL(cb.credito)}* de cashback e subiu para o nível *${cb.tier_novo}*! 💰 Saldo: *${formatBRL(novoSaldo)}*. Use na próxima visita!`
                    : `Olá, ${selectedCustomer.nome}! 🛍️ Você ganhou *${formatBRL(cb.credito)}* de cashback nesta compra. 💰 Saldo atual: *${formatBRL(novoSaldo)}*. Use na próxima visita!`
                  await supabase.from('wa_message_queue').insert({
                    company_id: company.id,
                    customer_phone: selectedCustomer.contato,
                    customer_name: selectedCustomer.nome,
                    message: waMsg,
                  })
                  // Fire and forget: dispara envio imediato se WA estiver conectado
                  supabase.functions.invoke('fn-wa-process-queue', {
                    body: { company_id: company.id },
                  }).catch(() => {})
                } catch (err) {
                  console.error('[wa-queue] falha ao enfileirar mensagem de cashback:', err)
                }
              }
            }
          } catch (err) {
            console.error('[cashback] falha ao creditar/resgatar:', err)
          }
        }

        pushToast('success', 'Venda registrada e estoque baixado.')
        logActivity(`Venda registrada • ${formatBRL(totalFinal)} • ${cart.length} itens${store?.nome ? ` • ${store.nome}` : ''}`, 'success')
      } else {
        pushToast('info', 'Venda registrada localmente (teste). Estoque não baixado.')
        logActivity(`Venda registrada (demo) • ${formatBRL(totalFinal)} • ${cart.length} itens${store?.nome ? ` • ${store.nome}` : ''}`, 'info')
      }

      // Captura dados antes de limpar o carrinho para o modal pós-venda
      const postSale: PostSaleData = {
        saleId: saleId,
        createdAt: new Date().toISOString(),
        total: totalFinal,
        subtotal: total,
        desconto: descontoValor + resgateAplicado,
        items: cart.map(i => ({ nome: i.nome, qtde: i.qtde, preco_unit: i.preco })),
        payments: pays.map(p => ({ meio: p.meio, valor: p.gross ?? totalFinal, bandeira: p.brand ?? null })),
        customerNome: selectedCustomer?.nome ?? null,
        customerDoc: null,
        customerId: selectedCustomer?.id ?? null,
        customerEmail: selectedCustomer?.email ?? null,
      }

      doClearCart()
      setPendingPays([])
      setPostSaleData(postSale)
    } catch (e: any) {
      pushToast('error', e?.message || 'Falha ao finalizar a venda.')
    } finally {
      setFinalizing(false)
    }
  }

  /* -------- Insights -------- */
  const insights = useMemo(() => {
    const hints: string[] = []
    if (cart.length >= 5) hints.push('Carrinho com muitos itens: confirme as quantidades.')
    if (total > 1000) hints.push('Venda alta: confirme o pagamento e a forma escolhida.')
    if (cart.some(i => i.origin === 'CATALOGO' && i.preco <= 0)) hints.push('Há itens com preço zerado. Revise antes de finalizar.')
    if (cart.length === 1 && cart[0].qtde === 1 && total < 10) hints.push('Venda de baixo valor: ofereça um item complementar.')
    return hints
  }, [cart, total])

  /* ============================================================ */
  /* UI                                                            */
  /* ============================================================ */
  return (
    <div className="pb-24 md:pb-0 bg-surface-2 min-h-screen">
      <Toast toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />

      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="px-4 py-3 max-w-5xl mx-auto flex items-center justify-between">
          <div>
            {isAdmin && (
              <Link to="/adm" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-azure transition-colors mb-0.5 cursor-pointer">
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6"/></svg>
                Retaguarda
              </Link>
            )}
            <h1 className="flex items-center gap-2 text-sm font-semibold text-slate-800 tracking-tight">
              <span className="w-0.5 h-4 bg-primary rounded-full inline-block flex-shrink-0" />
              Tottys PDV
            </h1>
          </div>

          {/* Store selector + theme toggle */}
          <div className="flex items-center gap-2">
          <ThemeToggle size="sm" />
          <div ref={dropdownRef} className="relative">
            <button
              aria-label="Selecionar loja"
              aria-expanded={showDropdown}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure shadow-sm"
              onClick={() => setShowDropdown(v => !v)}
            >
              <span className="max-w-[130px] truncate">{store?.nome?.trim() || 'Selecionar loja'}</span>
              <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-slate-100 rounded-xl shadow-lg py-1">
                {storeList.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-slate-400">Carregando…</div>
                ) : (
                  storeList.map(loja => (
                    <button
                      key={loja.id}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 cursor-pointer transition-colors ${store?.id === loja.id ? 'font-semibold text-azure' : 'text-slate-700'}`}
                      onClick={() => {
                        setShowDropdown(false)
                        setStore(loja)
                        localStorage.setItem('app_selected_store', JSON.stringify(loja))
                      }}
                    >
                      {loja.nome}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ── Barra motivacional — apenas para vendedores ── */}
        {!isAdmin && (myRankSell || metaSell || corrSell) && (
          <div className="bg-slate-950 border-t border-slate-800 px-4 py-2">
            <div className="max-w-5xl mx-auto flex items-center gap-4 overflow-x-auto">

              {/* Ranking */}
              {myRankSell && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-sm leading-none">{medal(myRankSell.posicao)}</span>
                  <span className="text-xs font-semibold text-white">lugar</span>
                </div>
              )}

              {myRankSell && (metaSell || corrSell) && (
                <div className="w-px h-3 bg-slate-700 shrink-0" />
              )}

              {/* Meta */}
              {metaSell && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Meta</span>
                  <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${metaSell.pct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                      style={{ width: `${Math.min(100, metaSell.pct)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold ${metaSell.pct >= 100 ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {metaSell.pct}%
                  </span>
                  {metaSell.bonus_valor > 0 && metaSell.pct < 100 && (
                    <span className="text-[10px] text-amber-400 font-semibold">+{formatBRL(metaSell.bonus_valor)}</span>
                  )}
                </div>
              )}

              {metaSell && corrSell && <div className="w-px h-3 bg-slate-700 shrink-0" />}

              {/* Corridinha */}
              {corrSell && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-violet-400">⚡</span>
                  <span className="text-xs text-slate-300 truncate max-w-[90px]">{corrSell.nome}</span>
                  <span className="text-xs font-bold text-violet-300">
                    {sellCountdown(corrSell.fim) ?? '⏰ encerra!'}
                  </span>
                </div>
              )}

            </div>
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 pt-4 flex flex-col gap-3 md:grid md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px] md:gap-5 md:items-start">

        {/* ===== SEÇÃO A: Busca + Cliente ===== */}
        <div className="order-1 lg:col-start-1 lg:row-start-1 space-y-3">
          {!company?.id && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 p-3 text-sm">
              Selecione uma empresa para continuar no PDV.
              <button onClick={() => navigate('/company')} className="mt-2 block text-xs font-medium underline cursor-pointer">Selecionar Empresa</button>
            </div>
          )}

          {/* Banner caixa */}
          <div className={`p-3 rounded-2xl border ${caixaAberto ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between">
              <div className={`text-sm ${caixaAberto ? 'text-emerald-700' : 'text-amber-700'}`}>
                <div className="font-semibold">Caixa {caixaAberto ? 'ABERTO' : 'FECHADO'}</div>
                <div className="text-xs opacity-70">{caixaAberto ? 'Pode iniciar vendas.' : 'Abra o caixa para começar a vender.'}</div>
              </div>
              <Link
                to="/cash"
                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-400"
              >
                {caixaAberto ? 'Fechar Caixa' : 'Abrir Caixa'}
              </Link>
            </div>
          </div>

          {rulesError && (
            <div className="rounded-2xl border border-amber-200 p-3 bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />{rulesError}
            </div>
          )}

          {/* Busca */}
          <div className="rounded-2xl border border-slate-100 bg-white p-3 space-y-2 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Adicionar produto</div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={q}
                autoFocus
                onChange={e => { setQ(e.target.value); setActiveSuggestion(-1) }}
                onKeyDown={e => {
                  if (suggestions.length > 0) {
                    if (e.key === 'ArrowDown') { setActiveSuggestion(a => Math.min(a + 1, suggestions.length - 1)); e.preventDefault() }
                    else if (e.key === 'ArrowUp') { setActiveSuggestion(a => Math.max(a - 1, 0)); e.preventDefault() }
                    else if (e.key === 'Enter') {
                      if (activeSuggestion >= 0 && activeSuggestion < suggestions.length) {
                        addFromCatalog(suggestions[activeSuggestion]); setQ(''); setSuggestions([]); e.preventDefault()
                      } else { search() }
                    }
                  } else if (e.key === 'Enter') { search() }
                }}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-surface-2"
                placeholder="SKU, nome ou EAN…"
                autoComplete="off"
              />
              {suggestions.length > 0 && q.trim() && (
                <div className="absolute left-0 top-full z-20 w-full bg-white border border-slate-100 rounded-xl shadow-lg mt-1 max-h-48 overflow-auto">
                  {suggestions.map((s, idx) => (
                    <div
                      key={s.id}
                      className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-2 transition-colors ${activeSuggestion === idx ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                      onMouseDown={() => { addFromCatalog(s); setQ(''); setSuggestions([]) }}
                    >
                      <span className="font-medium truncate text-sm text-slate-800">{highlightTerm(s.nome, q)}</span>
                      <span className="text-xs text-slate-500 flex-shrink-0">{highlightTerm(s.sku, q)}</span>
                      <span className="text-sm font-semibold text-azure flex-shrink-0">{formatBRL(s.preco || 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => search()}
                disabled={loadingSearch}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-azure-dark disabled:opacity-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
              >
                {loadingSearch ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Buscar
              </button>
              <button
                onClick={() => setShowScanner(true)}
                aria-label="Escanear código de barras"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
              >
                <ScanLine size={14} />
                Escanear
              </button>
            </div>
            {searchError && (
              <div className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle size={12} />{searchError}
              </div>
            )}
            {results.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="max-h-56 overflow-auto divide-y divide-slate-100">
                  {results.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => addFromCatalog(p)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate text-slate-800">{p.nome}</div>
                        <div className="text-xs text-slate-500 truncate">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold text-azure">{formatBRL(p.preco || 0)}</span>
                        <button
                          onClick={e => { e.stopPropagation(); addFromCatalog(p) }}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-primary text-white text-xs font-medium hover:bg-azure-dark transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cliente */}
          {company?.id && (
            <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cliente (opcional — cashback)</div>
              <CustomerPDV
                companyId={company.id}
                value={selectedCustomer}
                onChange={c => { setSelectedCustomer(c); setResgateAplicado(0) }}
              />
            </div>
          )}

          {/* Vendedor */}
          {vendedores.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vendedor</div>
              <select
                value={selectedVendedor?.id ?? ''}
                onChange={e => setSelectedVendedor(vendedores.find(v => v.id === e.target.value) ?? null)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white focus:outline-none focus:border-azure cursor-pointer transition-colors"
              >
                <option value="">Sem vendedor específico</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.apelido || v.nome}</option>
                ))}
              </select>
              {selectedVendedor && (
                <button
                  onClick={() => setSelectedVendedor(null)}
                  className="mt-1.5 text-xs text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                >
                  Limpar seleção
                </button>
              )}
            </div>
          )}
        </div>

        {/* ===== SEÇÃO B: Carrinho + Total + Botões ===== */}
        <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-[57px] lg:self-start space-y-3">

          {/* Insights */}
          {insights.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1">
              {insights.map((hint, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />{hint}
                </div>
              ))}
            </div>
          )}

          {/* Cart */}
          <div className={`rounded-2xl border bg-white p-3 shadow-sm transition-all duration-200 ${cartFlash ? 'border-azure shadow-[0_0_0_3px_rgba(30,64,175,0.10)]' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Carrinho {cart.length > 0 && <span className="text-slate-700">({cart.length})</span>}
              </div>
              {cart.length > 0 && !confirmClear && (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500 transition-colors cursor-pointer min-h-[44px] px-1"
                >
                  <Trash2 size={12} />Limpar
                </button>
              )}
              {confirmClear && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Limpar?</span>
                  <button onClick={doClearCart} className="min-h-[44px] px-2 text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer">Sim</button>
                  <button onClick={() => setConfirmClear(false)} className="min-h-[44px] px-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">Não</button>
                </div>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center px-4">
                <ShoppingBag size={32} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm font-medium text-slate-500">Carrinho vazio</p>
                <p className="text-xs text-slate-300 mt-1">Busque um produto pelo nome,<br />SKU ou escaneie o código</p>
              </div>
            ) : (
              <div className="relative">
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 leading-tight">{item.nome}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {item.sku}{item.tamanho && item.cor ? ` · ${item.tamanho}/${item.cor}` : ''}{item.origin === 'MOCK' ? ' · teste' : ''}
                        </div>
                        <div className="text-xs font-semibold text-azure mt-0.5">{formatBRL(item.preco * item.qtde)}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => removeItem(idx)}
                          aria-label={`Remover ${item.nome}`}
                          className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        >
                          <X size={14} />
                        </button>
                        <button
                          onClick={() => dec(idx)}
                          aria-label="Diminuir quantidade"
                          className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                        >−</button>
                        <span className="w-7 text-center text-sm font-semibold text-slate-800 tabular-nums">{item.qtde}</span>
                        <button
                          onClick={() => inc(idx)}
                          aria-label="Aumentar quantidade"
                          className="w-11 h-11 flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
                {cart.length >= 4 && (
                  <div className="absolute bottom-0 left-0 right-1 h-8 bg-gradient-to-t from-white dark:from-slate-900 to-transparent pointer-events-none rounded-b-xl" />
                )}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 space-y-1.5 shadow-sm">
            {(descontoValor > 0 || resgateAplicado > 0) && (
              <>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>Subtotal</span><span>{formatBRL(total)}</span>
                </div>
                {descontoValor > 0 && (
                  <div className="flex items-center justify-between text-sm text-emerald-600">
                    <span>{desconto?.nome || 'Desconto'}{desconto?.tipo === 'PERCENTUAL' ? ` (${desconto.valor}%)` : ''}</span>
                    <span>− {formatBRL(descontoValor)}</span>
                  </div>
                )}
                {resgateAplicado > 0 && (
                  <div className="flex items-center justify-between text-sm text-purple-600">
                    <span>Cashback resgatado</span>
                    <span>− {formatBRL(resgateAplicado)}</span>
                  </div>
                )}
                <div className="border-t border-slate-100 pt-1.5" />
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Total</span>
              <span className="text-4xl font-bold text-slate-900 tabular-nums tracking-tight font-mono">{formatBRL(totalFinal)}</span>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="space-y-2">
            <button
              onClick={() => {
                if (!caixaAberto) { pushToast('error', 'Abra o caixa antes de vender.'); return }
                setPendingPays([])
                setPayKey(k => k + 1)
                setShowPay(true)
              }}
              disabled={cart.length === 0 || loadingRules || !store?.id || finalizing}
              className="w-full h-14 bg-primary hover:bg-azure-dark active:bg-[#1E3282] disabled:opacity-40 disabled:cursor-not-allowed text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer select-none shadow-lg shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-azure"
            >
              {finalizing
                ? <><Loader2 size={17} className="animate-spin" /><span>Finalizando…</span></>
                : <span>{cart.length > 0 ? `Pagar ${formatBRL(totalFinal)}` : 'Pagar'}</span>
              }
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (!caixaAberto) { pushToast('error', 'Abra o caixa antes de vender.'); return }
                  setShowCrediario(true)
                }}
                disabled={cart.length === 0 || !store?.id || !company?.id}
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
              >
                Crediário
              </button>
              <button
                onClick={() => setShowDesconto(true)}
                disabled={cart.length === 0 || !company?.id}
                className={`h-11 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure ${desconto ? 'border-azure bg-navy-ghost text-azure' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {desconto ? (desconto.tipo === 'PERCENTUAL' ? `${desconto.valor}%` : formatBRL(desconto.valor)) : 'Desconto'}
              </button>
            </div>

            {selectedCustomer && cashbackSaldoGrupo > 0 && (
              <button
                onClick={() => setShowResgate(true)}
                disabled={cart.length === 0}
                className={`w-full h-11 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${resgateAplicado > 0 ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-purple-200 bg-white text-purple-600 hover:bg-purple-50'}`}
              >
                {resgateAplicado > 0 ? `Cashback: − ${formatBRL(resgateAplicado)}` : `Usar cashback (${formatBRL(cashbackSaldoGrupo)})`}
              </button>
            )}

            <button
              onClick={() => setShowTroca(true)}
              disabled={!store?.id || !company?.id}
              className="w-full h-11 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Troca / Devolução
            </button>

            {isAdmin && (
              <button
                onClick={addMockProduct}
                className="w-full h-9 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 hover:text-slate-500 hover:border-blue-200 transition-colors cursor-pointer"
              >
                + produto de teste
              </button>
            )}
          </div>
        </div>

        {/* ===== SEÇÃO C: KPIs + Histórico + Links ===== */}
        <div className="order-3 lg:col-start-1 lg:row-start-2 space-y-3">

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Vendas hoje', value: formatBRL(vendasHoje) },
              { label: 'Ticket médio', value: formatBRL(ticketMedio) },
              { label: 'Itens', value: String(itensVendidos) },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-center shadow-sm">
                <div className="text-xs text-slate-500">{kpi.label}</div>
                {loadingHistory ? (
                  <div className="h-6 bg-slate-100 rounded-lg animate-pulse mt-1 mx-2" />
                ) : (
                  <div className="text-base font-semibold text-azure tabular-nums mt-0.5 font-mono">{kpi.value}</div>
                )}
              </div>
            ))}
          </div>

          {/* Vendas recentes */}
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Últimas vendas</div>
            {loadingHistory ? (
              <div className="space-y-2">
                {[1,2,3].map(i => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !store?.id ? (
              <div className="text-sm text-slate-500">Selecione uma loja para ver o histórico.</div>
            ) : salesHistory.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhuma venda recente.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {salesHistory.map(sale => (
                  <div key={sale.id} className="flex items-center justify-between py-2 gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">Venda #{String(sale.id).slice(0, 8)}…</div>
                      <div className="text-xs text-slate-500">{new Date(sale.created_at).toLocaleString('pt-BR')} · {sale.status}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-semibold text-azure">{formatBRL(sale.total || 0)}</span>
                      <button
                        onClick={() => openSaleReceipt(sale)}
                        disabled={loadingReceiptId === sale.id}
                        className="min-h-[44px] px-3 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {loadingReceiptId === sale.id ? <Loader2 size={12} className="animate-spin" /> : null}
                        Ver
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ações rápidas */}
          <div className="grid grid-cols-2 gap-2 pb-2">
            <Link to="/reports" className="flex items-center justify-center h-11 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm">Relatórios</Link>
            <Link to="/products" className="flex items-center justify-center h-11 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm">Estoque / Produtos</Link>
          </div>
        </div>

      </div>

      <TabBar />

      {/* ===== MODAIS (lazy-loaded) ===== */}
      <Suspense fallback={null}>

        {/* Modal pós-venda — impressão */}
        {postSaleData && (
          <PostSaleModal
            data={postSaleData}
            onClose={() => setPostSaleData(null)}
          />
        )}


        {showPay && (
          <PayModal
            key={payKey}
            total={Math.max(0, totalFinal - pendingPays.reduce((a, p) => a + Number(p.gross ?? p.net ?? 0), 0))}
            rules={rules}
            onClose={() => setShowPay(false)}
            onConfirm={async (pay) => {
              const next = [...pendingPays, pay]
              setPendingPays(next)
              const remaining = totalFinal - next.reduce((a, p) => a + Number(p.gross ?? p.net ?? 0), 0)
              if (remaining > 0.009) { setPayKey(k => k + 1); return }
              setShowPay(false)
              await finalizePayment(next)
            }}
          />
        )}

        {showCrediario && company?.id && store?.id && (
          <CrediarioSellModal
            cart={cart.map(i => ({ product_id: i.product_id, variant_id: i.variant_id ?? null, sku: i.sku, nome: i.nome, preco: i.preco, qtde: i.qtde }))}
            total={totalFinal}
            companyId={company.id}
            storeId={store.id}
            onSuccess={() => { doClearCart(); pushToast('success', 'Crediário registrado!') }}
            onClose={() => setShowCrediario(false)}
          />
        )}

        {showResgate && selectedCustomer && (
          <ResgateModal
            customer={{ ...selectedCustomer, cashback_saldo: cashbackSaldoGrupo }}
            cartTotal={total - descontoValor}
            resgateMinimo={resgateMinimo}
            onApply={v => setResgateAplicado(v)}
            onClose={() => setShowResgate(false)}
          />
        )}

        {showDesconto && company?.id && (
          <DescontoModal
            companyId={company.id}
            cartTotal={total}
            role={role ?? 'COLABORADOR'}
            current={desconto}
            onApply={d => setDesconto(d)}
            onRemove={() => setDesconto(null)}
            onClose={() => setShowDesconto(false)}
          />
        )}

        {showTroca && company?.id && store?.id && (
          <TrocaModal
            companyId={company.id}
            storeId={store.id}
            onSuccess={msg => pushToast('success', msg)}
            onClose={() => setShowTroca(false)}
          />
        )}

        {showScanner && (
          <ScannerModal
            onClose={() => setShowScanner(false)}
            onCode={(code) => { setShowScanner(false); setQ(code); search(code) }}
          />
        )}

        {variantSelectorProduct && store?.id && (
          <VariantSelector
            product={variantSelectorProduct}
            storeId={store.id}
            onSelect={(variant, price) => addVariantToCart(variantSelectorProduct, variant, price)}
            onClose={() => setVariantSelectorProduct(null)}
          />
        )}

      </Suspense>
    </div>
  )
}

/** Scanner modal usando BarcodeDetector nativo */
function ScannerModal({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [supported, setSupported] = useState<boolean>(false)
  const [starting, setStarting] = useState<boolean>(true)

  useEffect(() => { setSupported(!!window.BarcodeDetector) }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    let detector: any = null
    let mounted = true

    async function start() {
      try {
        if (!window.BarcodeDetector) { setStarting(false); return }
        detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (!mounted) return
        if (videoRef.current) {
          ;(videoRef.current as any).srcObject = stream
          await videoRef.current.play()
        }
        setStarting(false)
        tick()
      } catch {
        setStarting(false)
      }
    }

    async function tick() {
      if (!mounted || !videoRef.current || !detector) return
      try {
        const codes = await detector.detect(videoRef.current)
        if (codes && codes.length > 0) {
          const raw = codes[0].rawValue || ''
          if (raw) { stop(); onCode(String(raw)); return }
        }
      } catch {}
      rafRef.current = requestAnimationFrame(tick)
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (stream) stream.getTracks().forEach(t => t.stop())
    }

    start()
    return () => { mounted = false; stop() }
  }, [onCode])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-white border border-slate-100 rounded-t-2xl sm:rounded-2xl shadow-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold text-slate-800">Escanear código</div>
          <button
            onClick={onClose}
            aria-label="Fechar scanner"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        {!supported && (
          <div className="rounded-2xl border border-amber-200 p-3 bg-amber-50 text-amber-700 text-sm">
            Seu navegador não suporta o leitor nativo. Use a busca manual.
          </div>
        )}
        <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video">
          <video ref={videoRef} className="w-full h-full object-cover" />
        </div>
        <div className="text-xs text-slate-500">
          Aponte a câmera para o EAN. {starting ? 'Iniciando câmera...' : 'Lendo...'}
        </div>
        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
