import React, { useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import { parseImportFile } from '@/lib/importParser'
import { downloadOnboardingTemplate } from '@/lib/importTemplate'

function parsePrice(v: string): number {
  if (!v) return 0
  let s = v.replace(/[R$\s]/g, '')
  if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parseQty(v: string): number {
  if (!v) return 0
  const n = parseInt(v.replace(/\D.*/, ''), 10)
  return isNaN(n) ? 0 : n
}

const FIELD_CANDIDATES: Record<string, string[]> = {
  nome:    ['nome', 'produto', 'descricao', 'description', 'item', 'name', 'artigo', 'mercadoria'],
  preco:   ['preco', 'valor', 'price', 'venda', 'preco_venda', 'valor_venda', 'preco venda', 'vlr'],
  sku:     ['sku', 'codigo', 'code', 'ref', 'referencia', 'cod', 'codigo_produto'],
  estoque: ['estoque', 'qty', 'quantidade', 'stock', 'saldo', 'qtd', 'qtde', 'quant'],
  ean:     ['ean', 'barcode', 'codigo_barras', 'gtin', 'codbarras', 'cod_barras'],
}

function detectColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
    for (const candidate of candidates) {
      const found = headers.find(h => h === candidate || h.includes(candidate) || candidate.includes(h))
      if (found) { mapping[field] = found; break }
    }
  }
  return mapping
}

type ColMap = { nome: string; preco: string; sku: string; estoque: string; ean: string }
type Step = 'upload' | 'mapping' | 'importing' | 'done'

type Props = {
  companyId: string
  storeId?: string | null
  onDone: (count: number) => void
  onSkip: () => void
}

export default function ProductCSVImport({ companyId, storeId, onDone, onSkip }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [colMap, setColMap] = useState<ColMap>({ nome: '', preco: '', sku: '', estoque: '', ean: '' })
  const [progress, setProgress] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [imported, setImported] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setParseError(null)
    try {
      const parsed = await parseImportFile(file)
      if (!parsed.length || !parsed[0].length) { setParseError('Arquivo inválido ou vazio.'); return }
      // Normaliza cabeçalhos para lowercase (autodetect é case-sensitive)
      const h = parsed[0].map(col => col.toLowerCase().trim())
      const r = parsed.slice(1)
        .map(arr => {
          const row: Record<string, string> = {}
          h.forEach((col, i) => { row[col] = (arr[i] ?? '').trim() })
          return row
        })
        .filter(row => Object.values(row).some(v => v.trim()))
      setHeaders(h)
      setRows(r)
      const detected = detectColumns(h)
      setColMap({
        nome:    detected.nome    || '',
        preco:   detected.preco   || '',
        sku:     detected.sku     || '',
        estoque: detected.estoque || '',
        ean:     detected.ean     || '',
      })
      setStep('mapping')
    } catch (e: any) {
      setParseError(e?.message || 'Erro ao ler o arquivo.')
    }
  }

  async function doImport() {
    if (!colMap.nome || !colMap.preco) return
    setStep('importing')
    setErrors([])
    setProgress(0)

    const errs: string[] = []
    let count = 0
    const BATCH = 500

    const validRows = rows.filter(r => r[colMap.nome]?.trim())
    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH)
      const products = batch.map((r, idx) => {
        const nome = r[colMap.nome]?.trim() || ''
        const preco = parsePrice(r[colMap.preco] || '')
        const sku = colMap.sku ? r[colMap.sku]?.trim() || null : null
        const estoque = colMap.estoque ? parseQty(r[colMap.estoque] || '') : 0
        const ean = colMap.ean ? r[colMap.ean]?.trim() || null : null
        if (!nome) { errs.push(`Linha ${i + idx + 2}: nome vazio`); return null }
        if (preco <= 0) { errs.push(`Linha ${i + idx + 2}: preço inválido (${r[colMap.preco]})`); return null }
        return { company_id: companyId, nome, preco, sku, ean, estoque, ativo: true }
      }).filter(Boolean) as any[]

      if (products.length > 0) {
        const { data, error } = await supabase
          .from('products')
          .insert(products)
          .select('id, estoque')
        if (error) {
          errs.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
        } else {
          count += (data || []).length
          if (storeId && data) {
            const stockRows = (data as any[])
              .filter(p => p.estoque > 0)
              .map(p => ({ store_id: storeId, product_id: p.id, qty: p.estoque }))
            if (stockRows.length > 0) {
              for (let j = 0; j < stockRows.length; j += 500) {
                await supabase
                  .from('product_stock')
                  .upsert(stockRows.slice(j, j + 500), { onConflict: 'store_id,product_id' })
              }
            }
          }
        }
      }
      setProgress(Math.round(Math.min(((i + BATCH) / validRows.length) * 100, 100)))
    }

    setErrors(errs)
    setImported(count)
    setStep('done')
  }

  // -- UPLOAD --
  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <div className="font-semibold text-base text-[#1E1B4B]">Importe seus produtos</div>
          <div className="text-sm text-zinc-500">
            Planilha Excel ou CSV. Detectamos as colunas automaticamente.
          </div>
        </div>

        <button
          onClick={downloadOnboardingTemplate}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#1E40AF] text-[#1E40AF] text-sm font-medium hover:bg-[#EFF6FF] transition-colors cursor-pointer"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4"/></svg>
          Baixar planilha modelo (.xlsx)
        </button>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-[#1E40AF] bg-[#EFF6FF]' : 'border-zinc-300 hover:border-zinc-400'}`}
        >
          <div className="text-3xl mb-2">📄</div>
          <div className="text-sm font-medium">Arraste o arquivo aqui ou clique para selecionar</div>
          <div className="text-xs text-zinc-400 mt-1">Excel (.xlsx, .xls) ou CSV · separador vírgula ou ponto-e-vírgula</div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        {parseError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{parseError}</div>
        )}

        <div className="text-center">
          <button onClick={onSkip} className="text-xs text-zinc-400 underline">Pular esta etapa</button>
        </div>
      </div>
    )
  }

  // -- MAPPING --
  if (step === 'mapping') {
    const preview = rows.slice(0, 4)
    const canImport = !!colMap.nome && !!colMap.preco
    const isLarge = rows.length > 5000
    const estimatedMin = Math.ceil(Math.ceil(rows.length / 500) * 2 / 60)

    return (
      <div className="space-y-4">
        <div>
          <div className="font-semibold">Confirme o mapeamento de colunas</div>
          <div className="text-xs text-zinc-500">{rows.length.toLocaleString('pt-BR')} linhas encontradas · {headers.length} colunas</div>
        </div>

        {isLarge && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 space-y-1">
            <div className="font-medium">Volume alto detectado</div>
            <div>Com {rows.length.toLocaleString('pt-BR')} produtos, a importação levará aproximadamente <strong>{estimatedMin} minuto{estimatedMin !== 1 ? 's' : ''}</strong>.</div>
            <div className="text-xs">Não feche nem recarregue esta aba durante o processo.</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'nome',    label: 'Nome do produto *', required: true },
            { key: 'preco',   label: 'Preco de venda *',  required: true },
            { key: 'sku',     label: 'Codigo / SKU',      required: false },
            { key: 'estoque', label: 'Estoque inicial',   required: false },
            { key: 'ean',     label: 'Codigo de barras',  required: false },
          ] as const).map(({ key, label, required }) => (
            <div key={key}>
              <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
              <select
                value={colMap[key]}
                onChange={e => setColMap(p => ({ ...p, [key]: e.target.value }))}
                className={`w-full rounded-xl border px-2 py-1.5 text-sm ${required && !colMap[key] ? 'border-red-300 bg-red-50' : ''}`}
              >
                <option value="">— ignorar —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border text-xs">
          <table className="w-full">
            <thead className="bg-zinc-50">
              <tr>
                {(['nome', 'preco', 'sku', 'estoque'] as const).filter(k => colMap[k]).map(k => (
                  <th key={k} className="px-2 py-1.5 text-left text-zinc-500 font-medium">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-t">
                  {(['nome', 'preco', 'sku', 'estoque'] as const).filter(k => colMap[k]).map(k => (
                    <td key={k} className="px-2 py-1.5 truncate max-w-[120px]">
                      {k === 'preco'
                        ? parsePrice(r[colMap[k]] || '') > 0
                          ? `R$ ${parsePrice(r[colMap[k]] || '').toFixed(2)}`
                          : <span className="text-red-400">{r[colMap[k]] || '—'}</span>
                        : r[colMap[k]] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setStep('upload')}>Voltar</Button>
          <Button onClick={doImport} disabled={!canImport}>
            Importar {rows.length} produto{rows.length !== 1 ? 's' : ''}
          </Button>
        </div>
        <div className="text-center">
          <button onClick={onSkip} className="text-xs text-zinc-400 underline">Pular esta etapa</button>
        </div>
      </div>
    )
  }

  // -- IMPORTING --
  if (step === 'importing') {
    const processados = Math.round((progress / 100) * rows.length)
    return (
      <div className="space-y-4 text-center py-4">
        <div className="font-semibold text-[#1E1B4B]">Importando produtos…</div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className="bg-[#1E40AF] h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-sm text-zinc-500">
          {processados.toLocaleString('pt-BR')} de {rows.length.toLocaleString('pt-BR')} produtos · {progress}%
        </div>
        <div className="text-xs text-zinc-400">Não feche esta aba.</div>
      </div>
    )
  }

  // -- DONE --
  return (
    <div className="space-y-4 text-center py-2">
      <div className="text-4xl">✅</div>
      <div className="font-semibold text-lg">{imported} produto{imported !== 1 ? 's' : ''} importado{imported !== 1 ? 's' : ''}!</div>
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800 max-h-32 overflow-auto">
          <div className="font-medium mb-1">Avisos ({errors.length}):</div>
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
      <Button onClick={() => onDone(imported)}>Continuar →</Button>
    </div>
  )
}
