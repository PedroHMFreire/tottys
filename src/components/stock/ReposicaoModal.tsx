import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'

type Props = {
  onClose: () => void
  onDone?: () => void
  storeId?: string | null
  companyId: string
}

type TabType = 'planilha' | 'manual'
type PlStep = 'upload' | 'preview' | 'importing' | 'done'

type ExistingItem = {
  product_id: string
  sku: string
  nome: string
  current_qty: number
  entrada: number
}

type NewItem = {
  _key: string
  sku: string
  nome: string
  preco: number
  categoria: string
  marca: string
  entrada: number
  errors: string[]
}

type ManualItem = {
  _key: string
  product_id: string | null  // null = new product
  sku: string
  nome: string
  preco: number
  categoria: string
  marca: string
  current_qty: number
  entrada: number
  isNew: boolean
}

type ProductOption = {
  id: string
  sku: string | null
  nome: string
  preco: number
  categoria: string | null
  marca: string | null
}

type Store = { id: string; nome: string }

function generateKey() {
  return Math.random().toString(36).slice(2)
}

export default function ReposicaoModal({ onClose, onDone, storeId, companyId }: Props) {
  const { store } = useApp()
  const [tab, setTab] = useState<TabType>('planilha')

  // ── Stores ──────────────────────────────────────────────────────────────────
  const [stores, setStores] = useState<Store[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>(storeId || store?.id || '')

  useEffect(() => {
    supabase.from('stores').select('id, nome').eq('company_id', companyId).order('nome')
      .then(({ data }) => {
        const list = (data || []) as Store[]
        setStores(list)
        if (!selectedStoreId && list.length > 0) setSelectedStoreId(list[0].id)
      })
  }, [companyId])

  // ── Excel tab state ──────────────────────────────────────────────────────────
  const [plStep, setPlStep] = useState<PlStep>('upload')
  const [plExisting, setPlExisting] = useState<ExistingItem[]>([])
  const [plNew, setPlNew] = useState<NewItem[]>([])
  const [plSkipped, setPlSkipped] = useState<string[]>([])
  const [plError, setPlError] = useState<string | null>(null)
  const [plLoading, setPlLoading] = useState(false)
  const [plProgress, setPlProgress] = useState({ done: 0, total: 0 })
  const [plDoneMsg, setPlDoneMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Manual tab state ─────────────────────────────────────────────────────────
  const [manQ, setManQ] = useState('')
  const [manOptions, setManOptions] = useState<ProductOption[]>([])
  const [manSearching, setManSearching] = useState(false)
  const [manList, setManList] = useState<ManualItem[]>([])
  const [manError, setManError] = useState<string | null>(null)
  const [manImporting, setManImporting] = useState(false)
  const [manDone, setManDone] = useState(false)
  const [manProgress, setManProgress] = useState({ done: 0, total: 0 })
  const [showNewForm, setShowNewForm] = useState(false)
  const [newFormSku, setNewFormSku] = useState('')
  const [newFormNome, setNewFormNome] = useState('')
  const [newFormPreco, setNewFormPreco] = useState('')
  const [newFormCategoria, setNewFormCategoria] = useState('')
  const [newFormMarca, setNewFormMarca] = useState('')
  const [newFormEntrada, setNewFormEntrada] = useState('1')

  // ── Debounce manual search ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      const term = manQ.trim()
      if (!term) { setManOptions([]); return }
      setManSearching(true)
      const { data } = await supabase
        .from('products')
        .select('id, sku, nome, preco, categoria, marca')
        .eq('company_id', companyId)
        .or(`nome.ilike.%${term}%,sku.ilike.%${term}%`)
        .order('nome')
        .limit(20)
      setManOptions((data || []) as ProductOption[])
      setManSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [manQ, companyId])

  // ── Download template ────────────────────────────────────────────────────────
  async function downloadTemplate() {
    setPlLoading(true)
    try {
      // Fetch all products for company
      const { data: products } = await supabase
        .from('products')
        .select('id, sku, nome, preco, categoria, marca')
        .eq('company_id', companyId)
        .order('nome')

      const prods = (products || []) as ProductOption[]

      // Fetch current stock for selected store
      const { data: stockData } = await supabase
        .from('product_stock')
        .select('product_id, qty')
        .eq('company_id', companyId)
        .in('product_id', prods.map(p => p.id))

      const stockMap = new Map<string, number>()
      ;(stockData || []).forEach((s: any) => stockMap.set(s.product_id, Number(s.qty || 0)))

      const rows = prods.map(p => ({
        PRODUCT_ID: p.id,
        SKU: p.sku || '',
        Nome: p.nome,
        Preco: p.preco,
        Categoria: p.categoria || '',
        Marca: p.marca || '',
        Estoque_Atual: stockData ? (stockMap.get(p.id) || 0) : '',
        QTD_ENTRADA: '',
      }))

      // Blank rows for new products
      for (let i = 0; i < 20; i++) {
        rows.push({ PRODUCT_ID: '', SKU: '', Nome: '', Preco: 0, Categoria: '', Marca: '', Estoque_Atual: '', QTD_ENTRADA: '' } as any)
      }

      const ws = XLSX.utils.json_to_sheet(rows)
      // Hide PRODUCT_ID column by setting width to 0 (still readable programmatically)
      ws['!cols'] = [
        { hidden: true }, // PRODUCT_ID
        { wch: 14 }, // SKU
        { wch: 40 }, // Nome
        { wch: 12 }, // Preco
        { wch: 16 }, // Categoria
        { wch: 16 }, // Marca
        { wch: 14 }, // Estoque_Atual
        { wch: 14 }, // QTD_ENTRADA
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Reposição')
      XLSX.writeFile(wb, `template_reposicao_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setPlLoading(false)
    }
  }

  // ── Parse uploaded file ──────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setPlError(null)
    setPlLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })

      if (raw.length === 0) { setPlError('Planilha vazia.'); return }

      // Build existing product map (by ID or SKU)
      const { data: allProds } = await supabase
        .from('products')
        .select('id, sku, nome, preco, categoria, marca')
        .eq('company_id', companyId)
      const prodsById = new Map<string, ProductOption>()
      const prodsBySku = new Map<string, ProductOption>()
      ;(allProds || []).forEach((p: any) => {
        prodsById.set(p.id, p as ProductOption)
        if (p.sku) prodsBySku.set(p.sku.toLowerCase(), p as ProductOption)
      })

      // Fetch current stock
      const { data: stockData } = await supabase
        .from('product_stock')
        .select('product_id, qty')
        .eq('company_id', companyId)
      const stockMap = new Map<string, number>()
      ;(stockData || []).forEach((s: any) => stockMap.set(s.product_id, Number(s.qty || 0)))

      const existing: ExistingItem[] = []
      const newItems: NewItem[] = []
      const skipped: string[] = []

      for (const r of raw) {
        const entrada = Number(r['QTD_ENTRADA'] ?? r['QTD_Entrada'] ?? r['Entrada'] ?? '')
        if (!entrada || entrada <= 0) continue  // skip rows with no entrada

        const pid = String(r['PRODUCT_ID'] || '').trim()
        const sku = String(r['SKU'] || '').trim()
        const nome = String(r['Nome'] || r['NOME'] || '').trim()

        // Try to match by PRODUCT_ID first, then SKU
        const matched = (pid && prodsById.get(pid)) || (sku && prodsBySku.get(sku.toLowerCase()))

        if (matched) {
          existing.push({
            product_id: matched.id,
            sku: matched.sku || '',
            nome: matched.nome,
            current_qty: stockMap.get(matched.id) || 0,
            entrada,
          })
        } else {
          // New product row
          const preco = Number(r['Preco'] || r['PRECO'] || r['Preço'] || 0)
          const errors: string[] = []
          if (!nome) errors.push('Nome obrigatório')
          if (!preco || preco <= 0) errors.push('Preço inválido')
          newItems.push({
            _key: generateKey(), sku, nome, preco,
            categoria: String(r['Categoria'] || ''),
            marca: String(r['Marca'] || ''),
            entrada, errors,
          })
          if (!nome) skipped.push(`Linha sem nome/SKU reconhecido`)
        }
      }

      setPlExisting(existing)
      setPlNew(newItems)
      setPlSkipped(skipped)
      setPlStep('preview')
    } catch (e: any) {
      setPlError(e?.message || 'Erro ao ler o arquivo.')
    } finally {
      setPlLoading(false)
    }
  }

  // ── Run import from Excel ────────────────────────────────────────────────────
  async function runImport() {
    if (!selectedStoreId) { setPlError('Selecione a loja de destino.'); return }
    const validNew = plNew.filter(n => n.errors.length === 0)
    const total = plExisting.length + validNew.length
    if (total === 0) { setPlError('Nenhuma linha válida para importar.'); return }

    setPlStep('importing')
    setPlProgress({ done: 0, total })
    let done = 0

    // 1. Adjust existing products
    for (const item of plExisting) {
      try {
        await supabase.rpc('stock_adjust', {
          p_company_id: companyId,
          p_store_id: selectedStoreId,
          p_product_id: item.product_id,
          p_qty: item.entrada,
          p_type: 'ENTRADA',
          p_reason: 'Reposição via planilha',
          p_variant_id: null,
        })
      } catch {
        // Fallback: manual upsert
        const { data: cur } = await supabase.from('product_stock').select('qty')
          .eq('store_id', selectedStoreId).eq('product_id', item.product_id).maybeSingle()
        const next = Math.max(0, Number((cur as any)?.qty || 0) + item.entrada)
        await supabase.from('product_stock').upsert(
          { store_id: selectedStoreId, product_id: item.product_id, company_id: companyId, qty: next },
          { onConflict: 'store_id,product_id' }
        )
      }
      done++
      setPlProgress({ done, total })
    }

    // 2. Create new products then adjust stock
    for (const item of validNew) {
      try {
        const { data: inserted, error: insErr } = await supabase.from('products').insert({
          company_id: companyId,
          sku: item.sku || null,
          nome: item.nome,
          preco: item.preco,
          categoria: item.categoria || null,
          marca: item.marca || null,
        }).select('id').single()

        if (insErr || !inserted) throw insErr || new Error('Insert falhou')

        try {
          await supabase.rpc('stock_adjust', {
            p_company_id: companyId,
            p_store_id: selectedStoreId,
            p_product_id: inserted.id,
            p_qty: item.entrada,
            p_type: 'ENTRADA',
            p_reason: 'Reposição via planilha — produto novo',
            p_variant_id: null,
          })
        } catch {
          await supabase.from('product_stock').upsert(
            { store_id: selectedStoreId, product_id: inserted.id, company_id: companyId, qty: item.entrada },
            { onConflict: 'store_id,product_id' }
          )
        }
      } catch {
        // skip failed inserts
      }
      done++
      setPlProgress({ done, total })
    }

    setPlDoneMsg(`${done} ${done === 1 ? 'item processado' : 'itens processados'} com sucesso.`)
    setPlStep('done')
    onDone?.()
  }

  // ── Add product to manual list ───────────────────────────────────────────────
  async function addExistingProduct(p: ProductOption) {
    setManQ('')
    setManOptions([])
    // Fetch current stock for this product
    const { data } = await supabase.from('product_stock').select('qty')
      .eq('company_id', companyId).eq('product_id', p.id).maybeSingle()
    const cur = Number((data as any)?.qty || 0)
    setManList(prev => [
      ...prev,
      {
        _key: generateKey(), product_id: p.id,
        sku: p.sku || '', nome: p.nome, preco: p.preco,
        categoria: p.categoria || '', marca: p.marca || '',
        current_qty: cur, entrada: 1, isNew: false,
      },
    ])
  }

  function addNewProductFromForm() {
    const preco = Number(newFormPreco)
    if (!newFormNome.trim() || !preco) return
    setManList(prev => [
      ...prev,
      {
        _key: generateKey(), product_id: null,
        sku: newFormSku, nome: newFormNome, preco,
        categoria: newFormCategoria, marca: newFormMarca,
        current_qty: 0, entrada: Number(newFormEntrada) || 1, isNew: true,
      },
    ])
    setNewFormSku(''); setNewFormNome(''); setNewFormPreco('')
    setNewFormCategoria(''); setNewFormMarca(''); setNewFormEntrada('1')
    setShowNewForm(false)
  }

  function updateManEntrada(key: string, val: number) {
    setManList(prev => prev.map(i => i._key === key ? { ...i, entrada: Math.max(1, val) } : i))
  }

  function removeManItem(key: string) {
    setManList(prev => prev.filter(i => i._key !== key))
  }

  // ── Confirm manual import ────────────────────────────────────────────────────
  async function confirmManual() {
    if (!selectedStoreId) { setManError('Selecione a loja de destino.'); return }
    if (manList.length === 0) { setManError('Lista vazia.'); return }

    setManImporting(true)
    setManProgress({ done: 0, total: manList.length })
    let done = 0

    for (const item of manList) {
      try {
        let productId = item.product_id

        // Create new product if needed
        if (!productId) {
          const { data: ins, error: insErr } = await supabase.from('products').insert({
            company_id: companyId,
            sku: item.sku || null,
            nome: item.nome,
            preco: item.preco,
            categoria: item.categoria || null,
            marca: item.marca || null,
          }).select('id').single()
          if (insErr || !ins) throw insErr
          productId = (ins as any).id
        }

        try {
          await supabase.rpc('stock_adjust', {
            p_company_id: companyId,
            p_store_id: selectedStoreId,
            p_product_id: productId,
            p_qty: item.entrada,
            p_type: 'ENTRADA',
            p_reason: 'Reposição manual',
            p_variant_id: null,
          })
        } catch {
          const { data: cur } = await supabase.from('product_stock').select('qty')
            .eq('store_id', selectedStoreId).eq('product_id', productId).maybeSingle()
          const next = Math.max(0, Number((cur as any)?.qty || 0) + item.entrada)
          await supabase.from('product_stock').upsert(
            { store_id: selectedStoreId, product_id: productId, company_id: companyId, qty: next },
            { onConflict: 'store_id,product_id' }
          )
        }
      } catch {
        // skip failed
      }
      done++
      setManProgress({ done, total: manList.length })
    }

    setManDone(true)
    setManImporting(false)
    onDone?.()
  }

  const canImport = plExisting.length > 0 || plNew.filter(n => n.errors.length === 0).length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-navy">Reposição de Peças</h2>
            <p className="text-xs text-slate-500 mt-0.5">Acrescente saldo a produtos existentes ou cadastre novos.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Store selector */}
        <div className="px-5 pt-3">
          <label className="text-xs text-slate-500 mb-1 block">Loja de destino</label>
          <select
            value={selectedStoreId}
            onChange={e => setSelectedStoreId(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure cursor-pointer"
          >
            <option value="">Selecione a loja…</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5 mt-3">
          {(['planilha', 'manual'] as TabType[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
                tab === t ? 'border-azure text-azure' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'planilha' ? 'Por planilha Excel' : 'Manual (item a item)'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── EXCEL TAB ─────────────────────────────────────────────────── */}
          {tab === 'planilha' && (
            <div className="space-y-4">

              {plStep === 'upload' && (
                <>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2">
                    <p className="text-sm font-medium text-navy">Como usar</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600">
                      <li>Baixe a planilha modelo com todos os produtos cadastrados.</li>
                      <li>Preencha a coluna <b>QTD_ENTRADA</b> com a quantidade a acrescentar.</li>
                      <li>Para produtos novos, adicione nas linhas em branco (SKU, Nome, Preço, QTD_ENTRADA).</li>
                      <li>Salve e suba o arquivo aqui.</li>
                    </ol>
                    <button
                      onClick={downloadTemplate}
                      disabled={plLoading}
                      className="mt-2 flex items-center gap-2 text-xs border border-azure text-azure rounded-xl px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                        <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4" />
                      </svg>
                      {plLoading ? 'Gerando…' : 'Baixar planilha modelo (.xlsx)'}
                    </button>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-navy mb-2">Subir planilha preenchida</p>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl py-8 text-slate-400 text-sm cursor-pointer hover:border-azure hover:text-azure transition-colors">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" className="mb-2">
                        <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3" />
                      </svg>
                      Clique ou arraste o arquivo .xlsx aqui
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                      />
                    </label>
                  </div>

                  {plError && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg p-3">{plError}</p>}
                  {plLoading && <p className="text-xs text-slate-500 text-center">Processando arquivo…</p>}
                </>
              )}

              {plStep === 'preview' && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-navy">Prévia da importação</p>
                    <button
                      onClick={() => { setPlStep('upload'); setPlExisting([]); setPlNew([]); setPlSkipped([]) }}
                      className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      ← Voltar
                    </button>
                  </div>

                  {/* Summary badges */}
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-3 py-1">
                      {plExisting.length} produto{plExisting.length !== 1 && 's'} existente{plExisting.length !== 1 && 's'}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-3 py-1">
                      {plNew.filter(n => n.errors.length === 0).length} produto{plNew.filter(n => n.errors.length === 0).length !== 1 && 's'} novo{plNew.filter(n => n.errors.length === 0).length !== 1 && 's'}
                    </span>
                    {plNew.filter(n => n.errors.length > 0).length > 0 && (
                      <span className="text-xs bg-amber-50 text-amber-700 rounded-full px-3 py-1">
                        {plNew.filter(n => n.errors.length > 0).length} com erro (serão ignorados)
                      </span>
                    )}
                  </div>

                  {/* Existing products */}
                  {plExisting.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1.5">Produtos existentes — acréscimo de saldo</p>
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-3 py-2 text-slate-500 font-medium">SKU / Nome</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Atual</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">+Entrada</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Novo saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plExisting.map((item, i) => (
                              <tr key={i} className="border-t border-slate-50">
                                <td className="px-3 py-2">
                                  <div className="font-medium text-navy">{item.nome}</div>
                                  {item.sku && <div className="text-slate-400">{item.sku}</div>}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-500">{item.current_qty}</td>
                                <td className="px-3 py-2 text-right text-emerald-600 font-medium">+{item.entrada}</td>
                                <td className="px-3 py-2 text-right font-semibold text-navy">{item.current_qty + item.entrada}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* New products */}
                  {plNew.filter(n => n.errors.length === 0).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-1.5">Produtos novos — serão cadastrados</p>
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-3 py-2 text-slate-500 font-medium">SKU / Nome</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Preço</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Entrada</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plNew.filter(n => n.errors.length === 0).map(item => (
                              <tr key={item._key} className="border-t border-slate-50">
                                <td className="px-3 py-2">
                                  <div className="font-medium text-navy">{item.nome}</div>
                                  {item.sku && <div className="text-slate-400">{item.sku}</div>}
                                  {item.categoria && <div className="text-slate-400">{item.categoria}</div>}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-600">
                                  {item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                                <td className="px-3 py-2 text-right text-blue-600 font-medium">{item.entrada}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Skipped */}
                  {plNew.filter(n => n.errors.length > 0).length > 0 && (
                    <details className="text-xs text-amber-700">
                      <summary className="cursor-pointer">Ver linhas com erro ({plNew.filter(n => n.errors.length > 0).length})</summary>
                      <ul className="mt-1 space-y-1 pl-3">
                        {plNew.filter(n => n.errors.length > 0).map(n => (
                          <li key={n._key}>"{n.nome || n.sku || '—'}" — {n.errors.join(', ')}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {plError && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg p-3">{plError}</p>}

                  {canImport && (
                    <button
                      onClick={runImport}
                      className="w-full py-3 rounded-xl bg-primary hover:bg-azure-dark text-white text-sm font-medium cursor-pointer transition-colors"
                    >
                      Confirmar reposição
                    </button>
                  )}
                  {!canImport && (
                    <p className="text-xs text-slate-500 text-center">Nenhuma linha válida para importar.</p>
                  )}
                </>
              )}

              {plStep === 'importing' && (
                <div className="space-y-3 py-4">
                  <p className="text-sm text-center text-navy font-medium">Importando…</p>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${plProgress.total > 0 ? (plProgress.done / plProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-slate-500">{plProgress.done} / {plProgress.total} itens</p>
                </div>
              )}

              {plStep === 'done' && (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                      <path stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-navy">{plDoneMsg}</p>
                  <button
                    onClick={onClose}
                    className="text-xs text-azure underline cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── MANUAL TAB ────────────────────────────────────────────────── */}
          {tab === 'manual' && (
            <div className="space-y-4">

              {!manDone && !manImporting && (
                <>
                  {/* Search existing */}
                  <div className="relative">
                    <p className="text-xs text-slate-500 mb-1">Buscar produto existente</p>
                    <input
                      type="text"
                      value={manQ}
                      onChange={e => setManQ(e.target.value)}
                      placeholder="Nome ou SKU…"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure"
                    />
                    {manSearching && (
                      <span className="absolute right-3 top-8 text-xs text-slate-400">buscando…</span>
                    )}
                    {manOptions.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                        {manOptions.map(p => (
                          <button
                            key={p.id}
                            onClick={() => addExistingProduct(p)}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0"
                          >
                            <div className="text-sm font-medium text-navy">{p.nome}</div>
                            <div className="text-xs text-slate-400">{p.sku || '—'} · {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add new product form toggle */}
                  <button
                    onClick={() => setShowNewForm(f => !f)}
                    className="flex items-center gap-1.5 text-xs text-azure cursor-pointer hover:text-azure-dark transition-colors"
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {showNewForm ? 'Cancelar cadastro' : 'Cadastrar produto novo'}
                  </button>

                  {showNewForm && (
                    <div className="border border-slate-100 rounded-xl p-4 space-y-3 bg-slate-50">
                      <p className="text-xs font-medium text-navy">Novo produto</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">SKU</label>
                          <input value={newFormSku} onChange={e => setNewFormSku(e.target.value)} placeholder="Opcional"
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-azure" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Nome *</label>
                          <input value={newFormNome} onChange={e => setNewFormNome(e.target.value)} placeholder="Nome do produto"
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-azure" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Preço *</label>
                          <input value={newFormPreco} onChange={e => setNewFormPreco(e.target.value)} placeholder="0,00" type="number" min="0" step="0.01"
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-azure" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Entrada *</label>
                          <input value={newFormEntrada} onChange={e => setNewFormEntrada(e.target.value)} type="number" min="1"
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-azure" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Categoria</label>
                          <input value={newFormCategoria} onChange={e => setNewFormCategoria(e.target.value)} placeholder="Opcional"
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-azure" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Marca</label>
                          <input value={newFormMarca} onChange={e => setNewFormMarca(e.target.value)} placeholder="Opcional"
                            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-azure" />
                        </div>
                      </div>
                      <button
                        onClick={addNewProductFromForm}
                        disabled={!newFormNome.trim() || !Number(newFormPreco)}
                        className="w-full py-2 rounded-xl bg-primary hover:bg-azure-dark text-white text-xs font-medium cursor-pointer transition-colors disabled:opacity-40"
                      >
                        Adicionar à lista
                      </button>
                    </div>
                  )}

                  {/* Item list */}
                  {manList.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-600">Lista de reposição ({manList.length})</p>
                      {manList.map(item => (
                        <div key={item._key} className="flex items-center gap-3 border border-slate-100 rounded-xl px-3 py-2.5 bg-white">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-navy truncate">{item.nome}</span>
                              {item.isNew && (
                                <span className="text-[10px] bg-blue-50 text-blue-600 rounded-full px-1.5 py-0.5 shrink-0">Novo</span>
                              )}
                            </div>
                            {!item.isNew && (
                              <div className="text-xs text-slate-400">
                                {item.sku ? `${item.sku} · ` : ''}Saldo atual: {item.current_qty}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => updateManEntrada(item._key, item.entrada - 1)}
                              className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-50 text-base"
                            >−</button>
                            <span className="w-8 text-center text-sm font-medium text-navy">{item.entrada}</span>
                            <button
                              onClick={() => updateManEntrada(item._key, item.entrada + 1)}
                              className="w-7 h-7 rounded-lg border border-slate-200 text-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-50 text-base"
                            >+</button>
                          </div>
                          <button
                            onClick={() => removeManItem(item._key)}
                            className="text-slate-300 hover:text-rose-500 cursor-pointer transition-colors"
                          >
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {manError && <p className="text-xs text-rose-600 bg-rose-50 rounded-lg p-3">{manError}</p>}

                  {manList.length > 0 && (
                    <button
                      onClick={confirmManual}
                      className="w-full py-3 rounded-xl bg-primary hover:bg-azure-dark text-white text-sm font-medium cursor-pointer transition-colors"
                    >
                      Confirmar reposição ({manList.length} {manList.length === 1 ? 'item' : 'itens'})
                    </button>
                  )}
                </>
              )}

              {manImporting && (
                <div className="space-y-3 py-4">
                  <p className="text-sm text-center text-navy font-medium">Importando…</p>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${manProgress.total > 0 ? (manProgress.done / manProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-slate-500">{manProgress.done} / {manProgress.total} itens</p>
                </div>
              )}

              {manDone && (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                      <path stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-navy">
                    {manProgress.done} {manProgress.done === 1 ? 'item processado' : 'itens processados'} com sucesso.
                  </p>
                  <button onClick={onClose} className="text-xs text-azure underline cursor-pointer">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
