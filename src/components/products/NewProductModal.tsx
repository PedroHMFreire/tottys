import { useState } from 'react'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { supabase } from '@/lib/supabaseClient'

type ProductData = {
  sku?: string;
  nome?: string;
  barcode?: string;
  preco?: number;
  custo?: number;
  ncm?: string;
  cfop?: string;
  cest?: string;
  unidade?: string;
  origem?: string;
  grupo?: string;
  marca?: string;
  categoria?: string;
}

type Props = {
  companyId: string;
  onClose: () => void;
  product?: ProductData;
}

function parsePtBr(n: string) {
  if (!n) return null
  const s = n.replace(/\./g, '').replace(',', '.')
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

export default function NewProductModal({ companyId, onClose, product }: Props) {
  const [sku, setSku] = useState(product?.sku || '')
  const [nome, setNome] = useState(product?.nome || '')
  const [barcode, setBarcode] = useState(product?.barcode || '')
  const [preco, setPreco] = useState(product?.preco ? String(product.preco) : '')
  const [custo, setCusto] = useState(product?.custo ? String(product.custo) : '')
  const [ncm, setNcm] = useState(product?.ncm || '')
  const [cfop, setCfop] = useState(product?.cfop || '')
  const [cest, setCest] = useState(product?.cest || '')
  const [unidade, setUnidade] = useState(product?.unidade || 'UN')
  const [origem, setOrigem] = useState(product?.origem || '')
  const [grupo, setGrupo] = useState(product?.grupo || '')
  const [marca, setMarca] = useState(product?.marca || '')
  const [categoria, setCategoria] = useState(product?.categoria || '')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)

    if (!sku.trim()) { setError('Informe o SKU.'); return }
    if (!nome.trim()) { setError('Informe o nome.'); return }
    const precoNum = parsePtBr(preco)
    if (!precoNum || precoNum <= 0) { setError('Informe um preço de venda válido (> 0).'); return }
    if (!ncm.trim()) { setError('Informe o NCM.'); return }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('products')
        .upsert({
          company_id: companyId,
          sku: sku.trim(),
          nome: nome.trim(),
          barcode: barcode.trim() || null,
          preco: precoNum,
          custo: parsePtBr(custo),
          ncm: ncm.trim(),
          cfop: cfop.trim() || null,
          cest: cest.trim() || null,
          unidade: (unidade.trim() || 'UN').toUpperCase(),
          origem: origem.trim() || null,
          grupo_trib: grupo.trim() || null,
          marca: marca.trim() || null,
          categoria: categoria.trim() || null,
          active: true,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'company_id,sku' })

      if (error) throw new Error(error.message)

      alert('Produto cadastrado com sucesso.')
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar produto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header sticky */}
        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
          <div className="text-lg font-semibold">{product ? 'Editar produto' : 'Cadastrar novo produto'}</div>
          <button onClick={onClose} className="text-zinc-500">fechar</button>
        </div>

        <Card title="Dados principais">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <div className="text-xs text-zinc-500 mb-1">SKU *</div>
              <input
                value={sku}
                onChange={e=>setSku(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: CAM-TECH-PRE-P"
              />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-zinc-500 mb-1">Nome *</div>
              <input
                value={nome}
                onChange={e=>setNome(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: Camiseta Tech Preta P"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Código de barras</div>
              <input
                value={barcode}
                onChange={e=>setBarcode(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="EAN/GTIN"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Unidade</div>
              <input
                value={unidade}
                onChange={e=>setUnidade(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="UN"
              />
            </div>
          </div>
        </Card>

        <Card title="Preços">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Preço de venda *</div>
              <input
                value={preco}
                onChange={e=>setPreco(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: 119,90"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Preço de custo</div>
              <input
                value={custo}
                onChange={e=>setCusto(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: 49,90"
              />
            </div>
          </div>
        </Card>

        <Card title="Fiscais">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">NCM *</div>
              <input
                value={ncm}
                onChange={e=>setNcm(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: 6109.10.00"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">CFOP</div>
              <input
                value={cfop}
                onChange={e=>setCfop(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: 5102"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">CEST</div>
              <input
                value={cest}
                onChange={e=>setCest(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Opcional"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Origem</div>
              <input
                value={origem}
                onChange={e=>setOrigem(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: 0"
              />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-zinc-500 mb-1">Grupo Tributário</div>
              <input
                value={grupo}
                onChange={e=>setGrupo(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: Simples/CSOSN"
              />
            </div>
          </div>
        </Card>

        <Card title="Atributos">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Marca</div>
              <input
                value={marca}
                onChange={e=>setMarca(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: SANTÉ"
              />
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-1">Categoria</div>
              <input
                value={categoria}
                onChange={e=>setCategoria(e.target.value)}
                className="w-full rounded-2xl border px-3 py-2"
                placeholder="Ex.: Camisetas"
              />
            </div>
          </div>
        </Card>

        {!!error && (
          <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm">
            {error}
          </div>
        )}

        {/* Footer sticky */}
        <div className="sticky bottom-0 bg-white pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button className="bg-zinc-800" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
