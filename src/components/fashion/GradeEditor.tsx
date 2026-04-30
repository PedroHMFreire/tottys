import { useState } from 'react'
import Button from '@/ui/Button'
import type { ProductVariant } from '@/domain/types'

const SIZE_PRESETS = [
  { label: 'Letra (PP–XGG)', sizes: ['PP', 'P', 'M', 'G', 'GG', 'XGG'] },
  { label: 'Número adulto (34–46)', sizes: ['34', '36', '38', '40', '42', '44', '46'] },
  { label: 'Infantil (2–16)', sizes: ['2', '4', '6', '8', '10', '12', '14', '16'] },
  { label: 'Único', sizes: ['U'] },
]

type VariantDraft = {
  tamanho: string
  cor: string
  sku?: string
  qty: number
}

type Props = {
  productSku: string
  existingVariants?: ProductVariant[]
  onChange: (drafts: VariantDraft[]) => void
}

export default function GradeEditor({ productSku, existingVariants = [], onChange }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customSizes, setCustomSizes] = useState('')
  const [coresInput, setCoresInput] = useState('')
  const [drafts, setDrafts] = useState<VariantDraft[]>(() =>
    existingVariants.map(v => ({
      tamanho: v.tamanho,
      cor: v.cor,
      sku: v.sku || '',
      qty: v.qty ?? 0,
    }))
  )

  function parseSizes(): string[] {
    if (selectedPreset !== null) return SIZE_PRESETS[selectedPreset].sizes
    return [...new Set(customSizes.split(',').map(s => s.trim()).filter(Boolean))]
  }

  function parseCores(): string[] {
    return [...new Set(coresInput.split(',').map(s => s.trim()).filter(Boolean))]
  }

  function generateGrade() {
    const sizes = parseSizes()
    const cores = parseCores()
    if (!sizes.length || !cores.length) return

    const generated: VariantDraft[] = []
    for (const cor of cores) {
      for (const tamanho of sizes) {
        const existing = drafts.find(d => d.tamanho === tamanho && d.cor === cor)
        generated.push(existing || {
          tamanho,
          cor,
          sku: `${productSku}-${tamanho}-${cor}`.toUpperCase().replace(/\s+/g, '-'),
          qty: 0,
        })
      }
    }
    setDrafts(generated)
    onChange(generated)
  }

  function updateQty(tam: string, cor: string, qty: number) {
    const next = drafts.map(d =>
      d.tamanho === tam && d.cor === cor ? { ...d, qty: Math.max(0, qty) } : d
    )
    setDrafts(next)
    onChange(next)
  }

  const sizes = [...new Set(drafts.map(d => d.tamanho))]
  const cores = [...new Set(drafts.map(d => d.cor))]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-slate-400 mb-1">Preset de tamanhos</div>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
            value={selectedPreset ?? ''}
            onChange={e => {
              const v = e.target.value
              setSelectedPreset(v === '' ? null : Number(v))
              setCustomSizes('')
            }}
          >
            <option value="">Personalizado</option>
            {SIZE_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1">
            {selectedPreset !== null ? 'Tamanhos selecionados' : 'Tamanhos (vírgula)'}
          </div>
          <input
            value={selectedPreset !== null ? SIZE_PRESETS[selectedPreset].sizes.join(', ') : customSizes}
            onChange={e => { setSelectedPreset(null); setCustomSizes(e.target.value) }}
            readOnly={selectedPreset !== null}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white disabled:bg-zinc-50"
            placeholder="P, M, G, GG"
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-400 mb-1">Cores (separadas por vírgula)</div>
        <input
          value={coresInput}
          onChange={e => setCoresInput(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white"
          placeholder="Ex.: Preto, Branco, Azul Marinho"
        />
      </div>

      <Button onClick={generateGrade} disabled={!parseSizes().length || !parseCores().length}>
        Gerar Grade
      </Button>

      {drafts.length > 0 && (
        <div className="overflow-x-auto">
          <div className="text-xs text-slate-400 mb-1">Estoque inicial por variante</div>
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-slate-400 px-1">Cor / Tam.</th>
                {sizes.map(s => <th key={s} className="text-center text-slate-600 font-semibold px-2">{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {cores.map(cor => (
                <tr key={cor}>
                  <td className="text-slate-600 font-medium px-1 whitespace-nowrap">{cor}</td>
                  {sizes.map(tam => {
                    const draft = drafts.find(d => d.tamanho === tam && d.cor === cor)
                    return (
                      <td key={tam} className="px-1">
                        {draft ? (
                          <input
                            type="number"
                            min={0}
                            value={draft.qty}
                            onChange={e => updateQty(tam, cor, Number(e.target.value))}
                            className="w-14 rounded-lg border px-2 py-1 text-center text-xs"
                          />
                        ) : (
                          <span className="text-zinc-300">·</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-slate-400 mt-1">{drafts.length} variantes · {drafts.reduce((a, d) => a + d.qty, 0)} peças</div>
        </div>
      )}
    </div>
  )
}
