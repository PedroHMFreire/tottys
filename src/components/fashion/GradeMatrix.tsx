import type { ProductVariant } from '@/domain/types'

type Props = {
  variants: ProductVariant[]
  onCellClick?: (variant: ProductVariant) => void
  readOnly?: boolean
  highlightVariantId?: string
}

export default function GradeMatrix({ variants, onCellClick, readOnly = false, highlightVariantId }: Props) {
  if (!variants.length) return (
    <div className="text-sm text-slate-400">Nenhuma variante cadastrada.</div>
  )

  const sizes = [...new Set(variants.map(v => v.tamanho))]
  const colors = [...new Set(variants.map(v => v.cor))]
  const map = new Map<string, ProductVariant>()
  variants.forEach(v => map.set(`${v.tamanho}|${v.cor}`, v))

  function cellClass(qty: number | undefined, isHighlighted: boolean) {
    const base = 'px-2 py-1.5 text-center text-xs rounded-lg cursor-pointer transition-colors'
    if (isHighlighted) return `${base} ring-2 ring-azure bg-primary text-white font-bold`
    if (qty == null) return `${base} bg-zinc-100 text-zinc-300 cursor-not-allowed`
    if (qty === 0) return `${base} bg-red-50 text-red-400 border border-red-200`
    if (qty <= 2) return `${base} bg-amber-50 text-amber-700 border border-amber-200`
    return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-slate-400 px-1 py-1 font-medium">Cor / Tam.</th>
            {sizes.map(s => (
              <th key={s} className="text-center text-slate-600 font-semibold px-2">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colors.map(cor => (
            <tr key={cor}>
              <td className="text-slate-600 font-medium px-1 py-1 whitespace-nowrap">{cor}</td>
              {sizes.map(tam => {
                const variant = map.get(`${tam}|${cor}`)
                const qty = variant?.qty
                const isHighlighted = !!variant && variant.id === highlightVariantId
                return (
                  <td
                    key={tam}
                    onClick={() => {
                      if (!readOnly && variant && qty != null && qty > 0 && onCellClick) {
                        onCellClick(variant)
                      }
                    }}
                    title={variant ? `${tam} / ${cor} — ${qty ?? '—'} em estoque` : 'Sem variante'}
                  >
                    <div className={cellClass(qty, isHighlighted)}>
                      {variant ? (qty ?? '—') : '·'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <div className="flex gap-3 mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded bg-emerald-100 border border-emerald-200" /> Com estoque</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded bg-amber-100 border border-amber-200" /> Últimas peças</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded bg-red-100 border border-red-200" /> Sem estoque</span>
        </div>
      )}
    </div>
  )
}
