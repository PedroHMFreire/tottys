import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'

function parseCSV(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = raw.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const first = lines[0]
  const delim = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ','
  function parseLine(line: string): string[] {
    const res: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (c === delim && !inQ) { res.push(cur.trim()); cur = '' }
      else cur += c
    }
    res.push(cur.trim())
    return res
  }
  const headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, '').toLowerCase().trim())
  const rows = lines.slice(1)
    .map(line => {
      const vals = parseLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^["']|["']$/g, '').trim() })
      return row
    })
    .filter(r => Object.values(r).some(v => v.trim()))
  return { headers, rows }
}

const FIELD_CANDIDATES: Record<string, string[]> = {
  nome:     ['nome', 'cliente', 'name', 'customer', 'razao', 'razao_social'],
  contato:  ['telefone', 'contato', 'fone', 'cel', 'celular', 'whatsapp', 'phone', 'tel', 'zap'],
  cpf_cnpj: ['cpf', 'cnpj', 'cpf_cnpj', 'documento', 'doc', 'cpf/cnpj'],
  limite:   ['limite', 'limite_credito', 'credito', 'credit', 'limit'],
  nascimento: ['nascimento', 'data_nascimento', 'aniversario', 'birthday', 'dtnascimento'],
}

function detectColumns(headers: string[]) {
  const mapping: Record<string, string> = {}
  for (const [field, candidates] of Object.entries(FIELD_CANDIDATES)) {
    for (const candidate of candidates) {
      const found = headers.find(h => h === candidate || h.includes(candidate) || candidate.includes(h))
      if (found) { mapping[field] = found; break }
    }
  }
  return mapping
}

function downloadTemplate() {
  const csv = [
    'nome;telefone;cpf;limite_credito',
    'Maria Silva;(11) 99999-1234;123.456.789-00;500',
    'João Santos;(21) 98888-5678;;0',
    'Ana Oliveira;62 97777-4321;987.654.321-00;1000',
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'modelo_clientes.csv'; a.click()
  URL.revokeObjectURL(url)
}

type ColMap = { nome: string; contato: string; cpf_cnpj: string; limite: string; nascimento: string }
type Step = 'upload' | 'mapping' | 'importing' | 'done'

type Props = {
  companyId: string
  onDone: (count: number) => void
  onSkip: () => void
}

export default function CustomerCSVImport({ companyId, onDone, onSkip }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [colMap, setColMap] = useState<ColMap>({ nome: '', contato: '', cpf_cnpj: '', limite: '', nascimento: '' })
  const [progress, setProgress] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [imported, setImported] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  function handleFile(file: File) {
    setParseError(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) { setParseError('Arquivo inválido ou vazio.'); return }
      setHeaders(h)
      setRows(r)
      const detected = detectColumns(h)
      setColMap({
        nome:       detected.nome       || '',
        contato:    detected.contato    || '',
        cpf_cnpj:   detected.cpf_cnpj   || '',
        limite:     detected.limite     || '',
        nascimento: detected.nascimento || '',
      })
      setStep('mapping')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function doImport() {
    if (!colMap.nome) return
    setStep('importing'); setErrors([]); setProgress(0)
    const errs: string[] = []
    let count = 0
    const BATCH = 30
    const validRows = rows.filter(r => r[colMap.nome]?.trim())

    for (let i = 0; i < validRows.length; i += BATCH) {
      const batch = validRows.slice(i, i + BATCH)
      const withDoc: any[] = []
      const withoutDoc: any[] = []

      batch.forEach((r, idx) => {
        const nome = r[colMap.nome]?.trim()
        if (!nome) { errs.push(`Linha ${i + idx + 2}: nome vazio`); return }

        const rawDoc = colMap.cpf_cnpj ? r[colMap.cpf_cnpj]?.trim()?.replace(/\D/g, '') || '' : ''
        const cpf_cnpj = rawDoc || null

        const rawLimite = colMap.limite ? (r[colMap.limite] || '0').replace(',', '.') : '0'
        const limiteNum = parseFloat(rawLimite)
        const limite_credito = isNaN(limiteNum) || limiteNum < 0 ? 0 : limiteNum

        const customer = {
          company_id: companyId,
          nome,
          contato: colMap.contato ? r[colMap.contato]?.trim() || null : null,
          cpf_cnpj,
          data_nascimento: colMap.nascimento ? r[colMap.nascimento]?.trim() || null : null,
          limite_credito,
          score_interno: 'BOM' as const,
        }

        if (cpf_cnpj) withDoc.push(customer)
        else withoutDoc.push(customer)
      })

      if (withDoc.length > 0) {
        const { data, error } = await supabase
          .from('customers')
          .upsert(withDoc, { onConflict: 'company_id,cpf_cnpj' })
          .select('id')
        if (error) errs.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
        else count += (data || []).length
      }

      if (withoutDoc.length > 0) {
        const { data, error } = await supabase
          .from('customers')
          .insert(withoutDoc)
          .select('id')
        if (error) errs.push(`Lote ${Math.floor(i / BATCH) + 1} (sem doc): ${error.message}`)
        else count += (data || []).length
      }

      setProgress(Math.round(Math.min(((i + BATCH) / validRows.length) * 100, 100)))
    }

    setErrors(errs); setImported(count); setStep('done')
  }

  if (step === 'upload') return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="text-2xl">👥</div>
        <div className="font-semibold text-lg">Importe sua base de clientes</div>
        <div className="text-sm text-zinc-500">Nome, telefone e CPF. Tudo opcional exceto o nome.</div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-black bg-zinc-50' : 'border-zinc-300 hover:border-zinc-400'}`}
      >
        <div className="text-3xl mb-2">📄</div>
        <div className="text-sm font-medium">Arraste o arquivo ou clique para selecionar</div>
        <div className="text-xs text-zinc-400 mt-1">CSV ou TXT</div>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>

      {parseError && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{parseError}</div>}

      <div className="flex items-center justify-between">
        <button onClick={downloadTemplate} className="text-xs text-zinc-500 underline">Baixar modelo CSV</button>
        <button onClick={onSkip} className="text-xs text-zinc-400 underline">Pular esta etapa</button>
      </div>
    </div>
  )

  if (step === 'mapping') {
    const preview = rows.slice(0, 4)
    return (
      <div className="space-y-4">
        <div>
          <div className="font-semibold">Confirme o mapeamento</div>
          <div className="text-xs text-zinc-500">{rows.length} clientes encontrados</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            { key: 'nome',       label: 'Nome *',         required: true  },
            { key: 'contato',    label: 'Telefone/WhatsApp', required: false },
            { key: 'cpf_cnpj',   label: 'CPF / CNPJ',    required: false },
            { key: 'limite',     label: 'Limite de crédito', required: false },
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
                {(['nome', 'contato', 'cpf_cnpj'] as const).filter(k => colMap[k]).map(k => (
                  <th key={k} className="px-2 py-1.5 text-left text-zinc-500 font-medium">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-t">
                  {(['nome', 'contato', 'cpf_cnpj'] as const).filter(k => colMap[k]).map(k => (
                    <td key={k} className="px-2 py-1.5 truncate max-w-[130px]">{r[colMap[k]] || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setStep('upload')}>Voltar</Button>
          <Button onClick={doImport} disabled={!colMap.nome}>
            Importar {rows.length} cliente{rows.length !== 1 ? 's' : ''}
          </Button>
        </div>
        <div className="text-center">
          <button onClick={onSkip} className="text-xs text-zinc-400 underline">Pular esta etapa</button>
        </div>
      </div>
    )
  }

  if (step === 'importing') return (
    <div className="space-y-4 text-center py-4">
      <div className="font-semibold text-navy">Importando clientes…</div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-sm text-slate-400">{progress}% concluído</div>
    </div>
  )

  return (
    <div className="space-y-4 text-center py-2">
      <div className="text-emerald-500 font-semibold text-base">{imported} cliente{imported !== 1 ? 's' : ''} importado{imported !== 1 ? 's' : ''}!</div>
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
