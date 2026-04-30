import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatBRL } from '@/lib/currency'
import type { ProductVariant } from '@/domain/types'
import GradeMatrix from './GradeMatrix'
import Button from '@/ui/Button'

type LocalProduct = {
  id: string
  nome: string
  sku: string
  preco: number
}

type Props = {
  product: LocalProduct
  storeId: string
  onSelect: (variant: ProductVariant, price: number) => void
  onClose: () => void
}

export default function VariantSelector({ product, storeId, onSelect, onClose }: Props) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ProductVariant | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('v_grade_stock')
          .select('*')
          .eq('product_id', product.id)
          .eq('store_id', storeId)
        if (mounted) setVariants((data || []) as ProductVariant[])
      } catch {
        if (mounted) setVariants([])
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [product.id, storeId])

  function handleCellClick(variant: ProductVariant) {
    setSelected(variant)
  }

  function confirm() {
    if (!selected) return
    const price = selected.price_override ?? product.preco
    onSelect(selected, price)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">{product.nome}</div>
            <div className="text-xs text-slate-400">{product.sku} · {formatBRL(product.preco)}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 text-sm">fechar</button>
        </div>

        <div className="text-xs text-slate-400">Selecione o tamanho e cor desejados:</div>

        {loading ? (
          <div className="text-sm text-slate-400">Carregando…</div>
        ) : variants.length === 0 ? (
          <div className="text-sm text-amber-700 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            Nenhuma variante com estoque encontrada nesta loja.
          </div>
        ) : (
          <GradeMatrix
            variants={variants}
            onCellClick={handleCellClick}
            highlightVariantId={selected?.id}
          />
        )}

        {selected && (
          <div className="rounded-2xl border bg-zinc-50 p-3 text-sm">
            <div className="font-semibold">{selected.tamanho} / {selected.cor}</div>
            <div className="text-slate-400">
              {selected.qty} em estoque ·{' '}
              {formatBRL(selected.price_override ?? product.preco)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={!selected || (selected.qty ?? 0) === 0}>
            Adicionar ao Carrinho
          </Button>
        </div>
      </div>
    </div>
  )
}
