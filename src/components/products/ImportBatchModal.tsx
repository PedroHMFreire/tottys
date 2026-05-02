// src/components/products/ImportBatchModal.tsx
import React, { useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { parseImportFile } from '@/lib/importParser'
import { downloadProductTemplate } from '@/lib/importTemplate'

type Props = {
  onClose: () => void
  storeId?: string | null
  onImported?: (stats: ImportStats) => void
}
type ImportStats = { total: number; created: number; updated: number; stockUpserts: number; errors: string[] }
type RowObj = Record<string, string | undefined>

// System fields with labels and whether they're required
const FIELDS = [
  { key: 'sku',       label: 'SKU / Código',        required: false },
  { key: 'nome',      label: 'Nome / Descrição',     required: true  },
  { key: 'preco',     label: 'Preço de venda',       required: true  },
  { key: 'custo',     label: 'Preço de custo',       required: false },
  { key: 'barcode',   label: 'EAN / Código de barras', required: false },
  { key: 'ncm',       label: 'NCM',                  required: false },
  { key: 'cfop',      label: 'CFOP',                 required: false },
  { key: 'cest',      label: 'CEST',                 required: false },
  { key: 'unidade',   label: 'Unidade',              required: false },
  { key: 'origem',    label: 'Origem',               required: false },
  { key: 'grupo_trib',label: 'Grupo Tributário',     required: false },
  { key: 'marca',     label: 'Marca',                required: false },
  { key: 'categoria', label: 'Categoria',            required: false },
  { key: 'estoque',   label: 'Estoque inicial',      required: false },
] as const
type FieldKey = typeof FIELDS[number]['key']
type ColMap = Record<FieldKey, string>

// Fuzzy detection: maps each system field to possible CSV column name substrings
const FIELD_HINTS: Record<FieldKey, string[]> = {
  sku:        ['sku', 'codigonfe', 'codigo', 'cod', 'ref', 'referencia', 'codprod'],
  nome:       ['nome', 'descricao', 'produto', 'desc', 'name', 'produt'],
  preco:      ['precofix', 'valorpreco', 'preco', 'valor', 'price', 'venda'],
  custo:      ['custo', 'cost', 'precocusto', 'precofab', 'fabrica'],
  barcode:    ['ean', 'barcode', 'barras', 'gtin', 'codigo barras', 'codbarras'],
  ncm:        ['ncm'],
  cfop:       ['cfop'],
  cest:       ['cest'],
  unidade:    ['unidade', 'unid', 'unit', 'un'],
  origem:     ['origem', 'origin', 'origemmercad'],
  grupo_trib: ['grupotrib', 'grupo', 'trib', 'csosn', 'cst'],
  marca:      ['marca', 'brand', 'fabricante'],
  categoria:  ['categoria', 'category', 'cat', 'setor'],
  estoque:    ['estoque', 'saldo', 'qty', 'quantidade', 'stock', 'quant'],
}

function autoDetect(headers: string[]): ColMap {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_()\-]/g, '')
  const map = {} as ColMap
  for (const field of FIELDS) {
    const hints = FIELD_HINTS[field.key]
    const found = headers.find(h => hints.some(hint => norm(h).includes(hint)))
    map[field.key] = found || ''
  }
  return map
}

function parseNumberBR(v?: string): number | undefined {
  if (!v) return undefined
  // Strip currency symbols and whitespace
  let s = v.replace(/[R$\s]/g, '').trim()
  if (!s) return undefined

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    // Ambos presentes: o último é o separador decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // BR: "1.399,90" → remove pontos, troca vírgula por ponto
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // US: "1,399.90" → remove vírgulas
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Só vírgula: separador decimal BR "139,90" → "139.90"
    s = s.replace(',', '.')
  } else if (hasDot) {
    const parts = s.split('.')
    const lastPart = parts[parts.length - 1]
    if (parts.length > 2) {
      // Múltiplos pontos: "1.399.90" → trata último como decimal
      s = parts.slice(0, -1).join('') + '.' + lastPart
    } else if (lastPart.length === 3) {
      // "1.399" → ponto é separador de milhar, não decimal
      s = parts.join('')
    }
    // Senão: "139.90", "139.9" → ponto é decimal, mantém como está
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function slugify(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)
}

type Step = 'upload' | 'map' | 'importing' | 'done'

export default function ImportBatchModal({ onClose, storeId, onImported }: Props) {
  const { company, store } = useApp()
  const effectiveStoreId = storeId ?? store?.id ?? null

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<RowObj[]>([])
  const [colMap, setColMap] = useState<ColMap>({} as ColMap)
  const [alsoStock, setAlsoStock] = useState(!!effectiveStoreId)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportStats | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  async function handleFile(f: File) {
    setFileError(null)
    setFileName(f.name)
    try {
      const parsed = await parseImportFile(f)
      if (!parsed.length) { setFileError('Arquivo vazio ou inválido.'); return }
      const hdrs = parsed[0].map(h => h.trim())
      const data = parsed.slice(1).map(arr => {
        const o: RowObj = {}
        hdrs.forEach((h, i) => { o[h] = arr[i]?.trim() })
        return o
      })
      setHeaders(hdrs)
      setRows(data)
      setColMap(autoDetect(hdrs))
      setStep('map')
    } catch (e: any) {
      setFileError(e?.message || 'Erro ao ler o arquivo.')
    }
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows])

  const requiredMapped = FIELDS
    .filter(f => f.required)
    .every(f => colMap[f.key])

  async function runImport() {
    if (!requiredMapped) return
    setStep('importing')
    setProgress(0)

    const total = rows.length
    let created = 0, updated = 0, stockUpserts = 0
    const errs: string[] = []

    // Pre-fetch existing SKUs + barcodes
    const get = (r: RowObj, k: FieldKey) => (colMap[k] ? r[colMap[k]] || '' : '').trim()
    const skus = Array.from(new Set(rows.map(r => get(r, 'sku')).filter(Boolean)))
    const barcodes = Array.from(new Set(rows.map(r => get(r, 'barcode')).filter(Boolean)))

    const bySku = new Map<string, string>()
    const byBarcode = new Map<string, string>()

    const companyId = company?.id
    if (!companyId) {
      setResult({ total: 0, created: 0, updated: 0, stockUpserts: 0, errors: ['Nenhuma empresa selecionada.'] })
      setStep('done')
      return
    }

    if (skus.length > 0) {
      const { data } = await supabase.from('products').select('id, sku').eq('company_id', companyId).in('sku', skus)
      ;(data || []).forEach((p: any) => bySku.set(p.sku, p.id))
    }
    if (barcodes.length > 0) {
      const { data } = await supabase.from('products').select('id, barcode').eq('company_id', companyId).in('barcode', barcodes)
      ;(data || []).forEach((p: any) => { if (p.barcode) byBarcode.set(p.barcode, p.id) })
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      try {
        const nome = get(r, 'nome')
        if (!nome) continue

        let sku = get(r, 'sku')
        if (!sku) sku = slugify(nome) + '-' + (i + 1)

        const barcode = get(r, 'barcode') || null
        const preco = parseNumberBR(get(r, 'preco')) ?? 0
        const custo = parseNumberBR(get(r, 'custo')) ?? null
        const estoqueQty = parseNumberBR(get(r, 'estoque')) ?? 0

        const base: any = {
          company_id: companyId,
          sku,
          nome,
          preco,
          custo,
          barcode: barcode || null,
          ncm: get(r, 'ncm') || null,
          cfop: get(r, 'cfop') || null,
          cest: get(r, 'cest') || null,
          unidade: get(r, 'unidade') || null,
          origem: get(r, 'origem') || null,
          grupo_trib: get(r, 'grupo_trib') || null,
          marca: get(r, 'marca') || null,
          categoria: get(r, 'categoria') || null,
          ativo: true,
        }

        const existId = bySku.get(sku) || (barcode ? byBarcode.get(barcode) : undefined)
        let productId: string

        if (existId) {
          await supabase.from('products').update(base).eq('id', existId)
          productId = existId
          updated++
        } else {
          const { data, error } = await supabase.from('products').insert(base).select('id').single()
          if (error) throw error
          productId = data.id
          bySku.set(sku, productId)
          if (barcode) byBarcode.set(barcode, productId)
          created++
        }

        if (alsoStock && effectiveStoreId && estoqueQty >= 0) {
          await supabase.from('product_stock').upsert(
            { store_id: effectiveStoreId, product_id: productId, qty: estoqueQty },
            { onConflict: 'store_id,product_id' }
          )
          stockUpserts++
        }
      } catch (e: any) {
        errs.push(`Linha ${i + 2}: ${e?.message || 'erro'}`)
      }
      setProgress(Math.round(((i + 1) / total) * 100))
    }

    const stats: ImportStats = { total, created, updated, stockUpserts, errors: errs }
    setResult(stats)
    if (onImported) onImported(stats)
    setStep('done')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
          <div className="text-base font-semibold text-navy">Importar produtos em lote</div>
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">Fechar</button>
        </div>

        {/* STEP: upload */}
        {step === 'upload' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 p-3 text-sm text-slate-600 space-y-1">
              <div className="font-medium text-navy">Como funciona</div>
              <div className="text-xs text-slate-500">
                1. Selecione uma planilha <b>Excel (.xlsx)</b> ou <b>CSV</b>.<br />
                2. Mapeie as colunas do seu arquivo para os campos do sistema.<br />
                3. Revise a prévia e importe.<br />
                Apenas <b>Nome</b> e <b>Preço</b> são obrigatórios. O SKU é gerado automaticamente se ausente.
              </div>
            </div>

            <button
              onClick={downloadProductTemplate}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-azure text-azure text-sm font-medium hover:bg-navy-ghost transition-colors cursor-pointer"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4"/></svg>
              Baixar planilha modelo (.xlsx)
            </button>

            <div className="flex items-center gap-2">
              <input
                id="alsoStock"
                type="checkbox"
                disabled={!effectiveStoreId}
                checked={alsoStock}
                onChange={() => setAlsoStock(v => !v)}
              />
              <label htmlFor="alsoStock" className="text-sm cursor-pointer">
                Registrar estoque na loja atual
                {!effectiveStoreId && <span className="text-slate-400"> (selecione uma loja primeiro)</span>}
              </label>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-24 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-azure hover:text-azure text-sm transition-colors cursor-pointer flex flex-col items-center justify-center gap-1"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/></svg>
              <span>Clique para selecionar o arquivo</span>
              <span className="text-xs text-slate-400">Excel (.xlsx, .xls) ou CSV</span>
            </button>
            {fileError && <div className="text-xs text-red-600">{fileError}</div>}
          </div>
        )}

        {/* STEP: map columns */}
        {step === 'map' && (
          <div className="space-y-3">
            <div className="text-sm text-slate-500">
              Arquivo: <span className="font-medium text-navy">{fileName}</span> — {rows.length} linhas
            </div>
            <div className="text-xs text-slate-400 mb-1">
              Mapeie as colunas do CSV para os campos do sistema. Colunas marcadas com <span className="text-red-500">*</span> são obrigatórias.
            </div>
            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-2">
                  <div className="w-36 text-xs text-slate-600 flex-shrink-0">
                    {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </div>
                  <select
                    className="flex-1 border border-slate-200 rounded-xl px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-azure"
                    value={colMap[f.key] || ''}
                    onChange={e => setColMap(p => ({ ...p, [f.key]: e.target.value }))}
                  >
                    <option value="">— ignorar —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            {preview.length > 0 && colMap.nome && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Prévia (5 linhas)</div>
                <div className="overflow-auto rounded-xl border">
                  <table className="text-xs w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        {FIELDS.filter(f => colMap[f.key]).map(f => (
                          <th key={f.key} className="text-left px-2 py-1.5 text-slate-500 font-medium whitespace-nowrap">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.map((r, i) => (
                        <tr key={i}>
                          {FIELDS.filter(f => colMap[f.key]).map(f => (
                            <td key={f.key} className="px-2 py-1.5 truncate max-w-[120px]">
                              {colMap[f.key] ? (r[colMap[f.key]] || '') : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!requiredMapped && (
              <div className="text-xs text-amber-700 bg-amber-50 rounded-xl p-2">
                Mapeie os campos obrigatórios (Nome e Preço) para continuar.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setStep('upload')} className="h-11 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors">Voltar</button>
              <button
                disabled={!requiredMapped}
                onClick={runImport}
                className="h-11 rounded-xl bg-primary hover:bg-azure-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                Importar {rows.length} produtos
              </button>
            </div>
          </div>
        )}

        {/* STEP: importing */}
        {step === 'importing' && (
          <div className="space-y-4 py-4 text-center">
            <div className="text-sm font-medium text-navy">Importando produtos…</div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 bg-primary rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-slate-400">{progress}% concluído</div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && result && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-1">
              <div className="text-sm font-semibold text-emerald-800">Importação concluída</div>
              <div className="text-sm text-emerald-700">
                {result.created} criados · {result.updated} atualizados
                {result.stockUpserts > 0 && ` · ${result.stockUpserts} estoques registrados`}
                {' '}de {result.total} linhas
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-medium text-amber-800 mb-1">{result.errors.length} erro(s):</div>
                <div className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-auto">
                  {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              </div>
            )}
            <button onClick={onClose} className="w-full h-11 rounded-xl bg-navy text-white text-sm font-medium hover:bg-primary cursor-pointer transition-colors">
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
