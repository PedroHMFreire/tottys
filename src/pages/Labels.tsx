import { useState, useEffect } from 'react'
import JsBarcode from 'jsbarcode'
import jsPDF from 'jspdf'
import {
  Tag, Download, Search, X, Minus, Plus, PackageSearch,
  SlidersHorizontal, ChevronLeft, Save, CheckCircle2, FileCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import type { LabelItem } from '@/components/labels/LabelCard'

// ─── Types ────────────────────────────────────────────────────────────────────
type ProductRow = {
  id: string
  nome: string
  sku: string
  preco: number
  has_variants: boolean
  product_variants?: Array<{ id: string; tamanho: string | null; cor: string | null }>
}

export type LabelConfig = {
  marginL:  number  // mm — margem lateral (esq e dir)
  marginT:  number  // mm — margem superior (e inferior)
  colGap:   number  // mm — gap entre colunas
  rowGap:   number  // mm — gap entre linhas
  stickerW: number  // mm — largura da etiqueta (área adesiva)
  stickerH: number  // mm — altura da etiqueta (área adesiva)
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const COLS            = 5
const ROWS            = 13
const LABELS_PER_PAGE = COLS * ROWS   // 65
const CONFIG_KEY      = 'tottys_label_config_v1'

// Preset calculado com medidas físicas do Pimaco A4251 confirmadas
// H: 7 + 5×32 + 4×9 + 7  = 210mm ✓
// V: 11 + 13×14.7 + 12×7 + 11 = 297.1mm ✓
const DEFAULT_CONFIG: LabelConfig = {
  marginL:  7.0,
  marginT:  11.0,
  colGap:   9.0,
  rowGap:   7.0,
  stickerW: 32.0,
  stickerH: 14.7,
}

function loadConfig(): LabelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────
function cellX(col: number, cfg: LabelConfig) {
  return cfg.marginL + col * (cfg.stickerW + cfg.colGap)
}
function cellY(row: number, cfg: LabelConfig) {
  return cfg.marginT + row * (cfg.stickerH + cfg.rowGap)
}

// ─── Barcode canvas → PNG data URL ───────────────────────────────────────────
function makeBarcodeDataURL(sku: string): string {
  const canvas = document.createElement('canvas')
  const val = (sku || '0000000').replace(/[^\x00-\x7F]/g, '').replace(/\s/g, '') || '0000000'
  try {
    JsBarcode(canvas, val, {
      format: 'CODE128',
      width: 3,
      height: 60,
      fontSize: 12,
      margin: 4,
      displayValue: true,
      lineColor: '#000000',
      textMargin: 3,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

// Trunca texto para caber em maxW mm (fonte já ativa no doc)
function clip(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t.length > 0 ? t + '…' : ''
}

// ─── PDF — desenhar uma etiqueta ──────────────────────────────────────────────
const PAD = { l: 0.8, r: 0.8, t: 0.5, b: 0.4 }

function drawLabel(
  doc: jsPDF,
  item: LabelItem,
  company: string,
  lx: number,
  ly: number,
  cfg: LabelConfig,
) {
  const iW = cfg.stickerW - PAD.l - PAD.r
  const hasVariant = !!item.variantLabel
  let cy = ly + PAD.t

  // Empresa
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(3.5)
  doc.setTextColor(120, 120, 120)
  doc.text(clip(doc, company.toUpperCase(), iW), lx + PAD.l, cy + 0.9)
  cy += 1.2

  // Produto
  cy += 0.2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(4.5)
  doc.setTextColor(0, 0, 0)
  doc.text(clip(doc, item.productName, iW), lx + PAD.l, cy + 1.2)
  cy += 1.6

  // Variante
  if (hasVariant) {
    cy += 0.2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(3.5)
    doc.setTextColor(60, 60, 60)
    doc.text(clip(doc, item.variantLabel!, iW), lx + PAD.l, cy + 0.9)
    cy += 1.2
  }

  // Barcode — ocupa o espaço restante menos o preço
  cy += 0.2
  const priceBaseline = ly + cfg.stickerH - PAD.b
  const bcH = priceBaseline - 2.2 - cy - 0.2
  if (bcH > 1) {
    const url = makeBarcodeDataURL(item.sku)
    if (url) doc.addImage(url, 'PNG', lx + PAD.l, cy, iW, bcH)
  }

  // Preço (direita, anchorado ao rodapé)
  const price = (item.price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(0, 0, 0)
  doc.text(price, lx + cfg.stickerW - PAD.r, priceBaseline, { align: 'right' })
}

// ─── PDF — gerar etiquetas ────────────────────────────────────────────────────
function generateLabelPDF(labels: LabelItem[], companyName: string, cfg: LabelConfig) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  labels.forEach((item, idx) => {
    const page  = Math.floor(idx / LABELS_PER_PAGE)
    const local = idx % LABELS_PER_PAGE
    if (local === 0 && page > 0) doc.addPage()
    const col = local % COLS
    const row = Math.floor(local / COLS)
    drawLabel(doc, item, companyName, cellX(col, cfg), cellY(row, cfg), cfg)
  })
  doc.save('etiquetas.pdf')
}

// ─── PDF — folha de calibração (só bordas) ────────────────────────────────────
function generateCalibrationPDF(cfg: LabelConfig) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setDrawColor(30, 100, 255)
  doc.setLineWidth(0.15)
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = cellX(col, cfg)
      const y = cellY(row, cfg)
      doc.rect(x, y, cfg.stickerW, cfg.stickerH)
      doc.setFontSize(4)
      doc.setTextColor(160, 160, 160)
      doc.text(
        String(row * COLS + col + 1),
        x + cfg.stickerW / 2,
        y + cfg.stickerH / 2 + 1,
        { align: 'center' },
      )
    }
  }
  doc.save('calibracao.pdf')
}

// ─── A4Preview ────────────────────────────────────────────────────────────────
// Escala: A4 representado em 360px de largura
const PREVIEW_PX = 360
const MM = PREVIEW_PX / 210   // px por mm

function A4Preview({ config, sample }: { config: LabelConfig; sample: LabelItem[] }) {
  const totalW = config.marginL * 2 + COLS * config.stickerW + (COLS - 1) * config.colGap
  const totalH = config.marginT * 2 + ROWS * config.stickerH + (ROWS - 1) * config.rowGap
  const wOk = Math.abs(totalW - 210) < 0.5
  const hOk = Math.abs(totalH - 297) < 2

  return (
    <div className="flex flex-col gap-2">
      {/* Folha A4 */}
      <div
        style={{
          width:    PREVIEW_PX,
          height:   Math.round(297 * MM),
          position: 'relative',
          background: 'white',
          border: '1px solid #94a3b8',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {Array.from({ length: ROWS }, (_, row) =>
          Array.from({ length: COLS }, (_, col) => {
            const idx  = row * COLS + col
            const item = sample.length > 0 ? sample[idx % sample.length] : null
            const x    = cellX(col, config) * MM
            const y    = cellY(row, config) * MM
            const w    = config.stickerW * MM
            const h    = config.stickerH * MM

            return (
              <div
                key={idx}
                style={{
                  position:   'absolute',
                  left:        x,
                  top:         y,
                  width:       w,
                  height:      h,
                  boxSizing:  'border-box',
                  border:     '0.8px dashed #3b82f6',
                  overflow:   'hidden',
                  display:    'flex',
                  flexDirection: 'column',
                  padding:    '1.5px 2px',
                  gap:        '1px',
                }}
              >
                {/* Empresa — barra cinza fina */}
                <div style={{ height: '10%', background: '#94a3b8', borderRadius: 1, flexShrink: 0 }} />
                {/* Produto — barra escura */}
                <div style={{ height: '14%', background: '#1e293b', borderRadius: 1, flexShrink: 0 }} />
                {/* Barcode — padrão listrado */}
                <div style={{
                  flex: 1,
                  background: 'repeating-linear-gradient(90deg,#0f172a 0,#0f172a 0.7px,transparent 0.7px,transparent 1.2px,#0f172a 1.2px,#0f172a 1.9px,transparent 1.9px,transparent 2.8px,#0f172a 2.8px,#0f172a 3.5px,transparent 3.5px,transparent 4.5px)',
                }} />
                {/* Preço — barra escura à direita */}
                {item && (
                  <div style={{ height: '13%', background: '#1e293b', borderRadius: 1, alignSelf: 'flex-end', width: '55%', flexShrink: 0 }} />
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Indicadores de validação */}
      <div className="flex gap-2">
        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${
          wOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {wOk ? <CheckCircle2 size={11} /> : '✗'}
          H: {totalW.toFixed(1)}mm {!wOk && `(≠ 210mm)`}
        </div>
        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${
          hOk ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
        }`}>
          {hOk ? <CheckCircle2 size={11} /> : '⚠'}
          V: {totalH.toFixed(1)}mm {!hOk && `(≠ 297mm)`}
        </div>
      </div>
    </div>
  )
}

// ─── ConfigField — slider + input numérico ────────────────────────────────────
function ConfigField({
  label, value, min, max, step, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-xs font-mono font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
          {value.toFixed(1)} mm
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer accent-indigo-600"
      />
      <input
        type="number"
        min={min} max={max} step={step} value={value}
        onChange={e => {
          const n = parseFloat(e.target.value)
          if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-indigo-400 bg-white"
      />
    </div>
  )
}

// ─── CalibrationView ──────────────────────────────────────────────────────────
function CalibrationView({
  config,
  sample,
  saved,
  generating,
  onConfigChange,
  onSave,
  onReset,
  onBack,
  onGeneratePDF,
  onCalibrationPDF,
}: {
  config: LabelConfig
  sample: LabelItem[]
  saved: boolean
  generating: boolean
  onConfigChange: (cfg: LabelConfig) => void
  onSave: () => void
  onReset: () => void
  onBack: () => void
  onGeneratePDF: () => void
  onCalibrationPDF: () => void
}) {
  const set = (key: keyof LabelConfig) => (v: number) =>
    onConfigChange({ ...config, [key]: v })

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0 bg-white">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
          Voltar
        </button>
        <div className="w-px h-4 bg-slate-200" />
        <SlidersHorizontal size={15} className="text-indigo-600" />
        <span className="text-sm font-semibold text-slate-800">Calibração de Etiqueta</span>
        {!saved && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
            Não salvo
          </span>
        )}
        {saved && (
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <CheckCircle2 size={10} />
            Salvo
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex gap-8 flex-wrap">

          {/* ─ Preview ─ */}
          <div className="flex flex-col gap-3 shrink-0">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Preview A4 — ajuste até o conteúdo encaixar nas células
            </p>
            <A4Preview config={config} sample={sample} />
          </div>

          {/* ─ Painel de parâmetros ─ */}
          <div className="flex flex-col gap-4 min-w-[240px] flex-1 max-w-[300px]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Parâmetros (mm)
            </p>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-4">
              <p className="text-xs font-semibold text-slate-500">Margens do papel</p>
              <ConfigField label="Margem superior" value={config.marginT} min={0} max={30} step={0.1} onChange={set('marginT')} />
              <ConfigField label="Margem lateral"  value={config.marginL} min={0} max={30} step={0.1} onChange={set('marginL')} />
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-4">
              <p className="text-xs font-semibold text-slate-500">Espaçamento entre etiquetas</p>
              <ConfigField label="Gap entre linhas"   value={config.rowGap} min={0} max={25} step={0.1} onChange={set('rowGap')} />
              <ConfigField label="Gap entre colunas"  value={config.colGap} min={0} max={25} step={0.1} onChange={set('colGap')} />
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-4">
              <p className="text-xs font-semibold text-slate-500">Dimensões da etiqueta adesiva</p>
              <ConfigField label="Altura"   value={config.stickerH} min={5}  max={40} step={0.1} onChange={set('stickerH')} />
              <ConfigField label="Largura"  value={config.stickerW} min={10} max={80} step={0.1} onChange={set('stickerW')} />
            </div>

            {/* Ações */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={onReset}
                className="text-xs text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-xl py-2 px-3 transition-colors cursor-pointer text-center"
              >
                Resetar para Pimaco A4251
              </button>
              <button
                onClick={onCalibrationPDF}
                className="flex items-center justify-center gap-2 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-400 rounded-xl py-2 px-3 transition-colors cursor-pointer"
              >
                <FileCheck size={12} />
                Baixar folha de teste (só bordas)
              </button>
              <button
                onClick={onSave}
                className="flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 px-4 transition-colors cursor-pointer"
              >
                <Save size={13} />
                Salvar calibração
              </button>
              <button
                onClick={onGeneratePDF}
                disabled={generating}
                className="flex items-center justify-center gap-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl py-2.5 px-4 transition-colors cursor-pointer"
              >
                <Download size={13} />
                {generating ? 'Gerando PDF…' : 'Baixar PDF com estas medidas'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Labels() {
  const { company, store } = useApp()

  // Produtos e quantidades
  const [items,     setItems]     = useState<LabelItem[]>([])
  const [qtys,      setQtys]      = useState<Record<string, number>>({})
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [generating,setGenerating]= useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // Calibração
  const [mode,       setMode]       = useState<'list' | 'calibrate'>('list')
  const [config,     setConfig]     = useState<LabelConfig>(loadConfig)
  const [configSaved,setConfigSaved]= useState(true)

  useEffect(() => {
    if (!company?.id) return
    load()
  }, [company?.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, nome, sku, preco, has_variants, product_variants(id, tamanho, cor)')
      .eq('company_id', company!.id)
      .order('nome')

    if (!data) { setLoading(false); return }

    const list: LabelItem[] = []
    for (const p of data as ProductRow[]) {
      if (p.has_variants && p.product_variants?.length) {
        for (const v of p.product_variants) {
          const parts = [v.tamanho, v.cor].filter(Boolean)
          list.push({ key: v.id, productName: p.nome, variantLabel: parts.join(' · ') || undefined, sku: p.sku, price: p.preco ?? 0, qty: 0 })
        }
      } else {
        list.push({ key: p.id, productName: p.nome, sku: p.sku, price: p.preco ?? 0, qty: 0 })
      }
    }
    setItems(list)
    setLoading(false)
  }

  function setQty(key: string, qty: number) {
    setQtys(prev => ({ ...prev, [key]: Math.max(0, qty) }))
  }

  async function importFromStock() {
    if (!store?.id) return
    setImporting(true); setImportMsg(null)
    const [{ data: simpleStock }, { data: variantStock }] = await Promise.all([
      supabase.from('product_stock').select('product_id, qty').eq('store_id', store.id).gt('qty', 0),
      supabase.from('variant_stock').select('variant_id, qty').eq('store_id', store.id).gt('qty', 0),
    ])
    const updates: Record<string, number> = {}
    simpleStock?.forEach(r => { updates[r.product_id] = Math.max(1, Math.round(Number(r.qty))) })
    variantStock?.forEach(r => { updates[r.variant_id] = Math.max(1, Math.round(Number(r.qty))) })
    const total = Object.values(updates).reduce((s, n) => s + n, 0)
    if (total === 0) {
      setImportMsg(`Nenhum saldo encontrado para "${store.nome}".`)
      setImporting(false); return
    }
    setQtys(updates)
    setImportMsg(`${Object.keys(updates).length} itens · ${total} etiquetas carregadas de "${store.nome}"`)
    setImporting(false)
  }

  function handleGeneratePDF() {
    if (expandedLabels.length === 0 || generating) return
    setGenerating(true)
    setTimeout(() => {
      try { generateLabelPDF(expandedLabels, companyName, config) }
      finally { setGenerating(false) }
    }, 50)
  }

  function handleSaveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    setConfigSaved(true)
  }

  function handleConfigChange(cfg: LabelConfig) {
    setConfig(cfg)
    setConfigSaved(false)
  }

  // Dados derivados
  const filtered = items.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.variantLabel?.toLowerCase().includes(q) ?? false)
  })

  const selected      = items.filter(i => (qtys[i.key] ?? 0) > 0)
  const totalLabels   = selected.reduce((s, i) => s + (qtys[i.key] ?? 0), 0)
  const totalSheets   = Math.ceil(totalLabels / LABELS_PER_PAGE)
  const expandedLabels: LabelItem[] = selected.flatMap(i => Array(qtys[i.key] ?? 0).fill(i))
  const companyName   = company?.nome ?? ''

  // ── Modo calibração ──────────────────────────────────────────────────────────
  if (mode === 'calibrate') {
    return (
      <CalibrationView
        config={config}
        sample={items.slice(0, LABELS_PER_PAGE)}
        saved={configSaved}
        generating={generating}
        onConfigChange={handleConfigChange}
        onSave={handleSaveConfig}
        onReset={() => { handleConfigChange({ ...DEFAULT_CONFIG }) }}
        onBack={() => setMode('list')}
        onGeneratePDF={handleGeneratePDF}
        onCalibrationPDF={() => generateCalibrationPDF(config)}
      />
    )
  }

  // ── Modo lista ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto pb-28">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Tag size={16} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Etiquetas</h1>
            <p className="text-xs text-slate-400">Pimaco A4251 · 65 por folha</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('calibrate')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 text-sm font-medium rounded-xl transition-colors cursor-pointer bg-white"
          >
            <SlidersHorizontal size={14} />
            Calibrar
          </button>
          <button
            onClick={importFromStock}
            disabled={!store?.id || importing}
            title={!store?.id ? 'Selecione uma loja' : `Importar saldo de "${store?.nome}"`}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 text-sm font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-white"
          >
            <PackageSearch size={14} />
            {importing ? 'Importando…' : 'Importar estoque'}
          </button>
          {totalLabels > 0 && (
            <button
              onClick={handleGeneratePDF}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Download size={14} />
              {generating ? 'Gerando…' : 'Baixar PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Feedback importação */}
      {importMsg && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm mb-4 ${
          importMsg.startsWith('Nenhum')
            ? 'bg-amber-50 border border-amber-100 text-amber-700'
            : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
        }`}>
          <span className="flex-1">{importMsg}</span>
          <button onClick={() => setImportMsg(null)} className="shrink-0 opacity-50 hover:opacity-100 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {/* Busca */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar produto ou SKU…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Ações em massa */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs text-slate-500">
          <button
            onClick={() => {
              const u: Record<string, number> = {}
              filtered.forEach(i => { u[i.key] = qtys[i.key] || 1 })
              setQtys(prev => ({ ...prev, ...u }))
            }}
            className="hover:text-indigo-600 transition-colors cursor-pointer"
          >
            Selecionar todos
          </button>
          <span className="text-slate-300">·</span>
          <button onClick={() => setQtys({})} className="hover:text-rose-500 transition-colors cursor-pointer">
            Limpar seleção
          </button>
        </div>
      )}

      {/* Lista de produtos */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(item => {
            const qty        = qtys[item.key] ?? 0
            const isSelected = qty > 0
            return (
              <div
                key={item.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  isSelected ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                <button
                  onClick={() => setQty(item.key, qty > 0 ? 0 : 1)}
                  className={`w-4 h-4 rounded border-2 shrink-0 transition-colors cursor-pointer flex items-center justify-center ${
                    isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && (
                    <svg width="8" height="6" fill="none" viewBox="0 0 8 6">
                      <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{item.productName}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {item.variantLabel ? `${item.variantLabel} · SKU ${item.sku}` : `SKU ${item.sku}`}
                  </div>
                </div>

                <div className="text-sm font-semibold text-slate-600 shrink-0 mr-2 hidden sm:block">
                  {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setQty(item.key, qty - 1)}
                    disabled={qty === 0}
                    className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <Minus size={10} />
                  </button>
                  <input
                    type="number"
                    min={0} max={999}
                    value={qty === 0 ? '' : qty}
                    placeholder="0"
                    onChange={e => setQty(item.key, parseInt(e.target.value) || 0)}
                    className="w-10 text-center text-sm font-medium border border-slate-200 rounded-lg py-0.5 focus:outline-none focus:border-indigo-400 bg-white"
                  />
                  <button
                    onClick={() => setQty(item.key, qty + 1)}
                    className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer transition-colors"
                  >
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Barra flutuante */}
      {totalLabels > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-4 z-50">
          <div className="text-sm">
            <span className="font-semibold">{totalLabels}</span>
            <span className="text-slate-400"> etiqueta{totalLabels !== 1 ? 's' : ''} · </span>
            <span className="font-semibold">{totalSheets}</span>
            <span className="text-slate-400"> folha{totalSheets !== 1 ? 's' : ''}</span>
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <button
            onClick={handleGeneratePDF}
            disabled={generating}
            className="flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Download size={14} />
            {generating ? 'Gerando…' : 'Baixar PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
