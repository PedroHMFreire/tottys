import { useEffect, useState } from 'react'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import { supabase } from '@/lib/supabaseClient'
import { validateProductInput } from '@/domain/products/validation'
import GradeEditor from '@/components/fashion/GradeEditor'
import type { Collection } from '@/domain/types'

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
  has_variants?: boolean;
  collection_id?: string | null;
}

type Props = {
  companyId: string;
  storeId?: string | null;
  onClose: () => void;
  onSaved?: (productName: string, variantCount: number) => void;
  product?: ProductData;
}

type VariantDraft = { tamanho: string; cor: string; sku?: string; qty: number }

export default function NewProductModal({ companyId, storeId, onClose, onSaved, product }: Props) {
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

  // Campos de moda
  const [hasVariants, setHasVariants] = useState(product?.has_variants || false)
  const [collectionId, setCollectionId] = useState<string>(product?.collection_id || '')
  const [collections, setCollections] = useState<Collection[]>([])
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([])
  const [estoqueInicial, setEstoqueInicial] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCollections() {
      const { data } = await supabase
        .from('collections')
        .select('id, nome, temporada, ano, status')
        .eq('company_id', companyId)
        .eq('status', 'ATIVA')
        .order('nome')
      setCollections((data || []) as Collection[])
    }
    loadCollections()
  }, [companyId])

  async function save() {
    setError(null)

    if (!companyId) {
      setError('Selecione uma empresa antes de cadastrar produtos.')
      return
    }

    const validation = validateProductInput({ sku, nome, preco, custo, ncm, barcode, cfop, cest })
    if (validation.ok === false) {
      setError(validation.error)
      return
    }

    if (hasVariants && variantDrafts.length === 0) {
      setError('Adicione pelo menos uma variante na grade antes de salvar.')
      return
    }

    setLoading(true)
    try {
      // 1. Upsert produto
      const { data: savedProduct, error: prodErr } = await supabase
        .from('products')
        .upsert({
          company_id: companyId,
          sku: sku.trim(),
          nome: nome.trim(),
          barcode: barcode.trim() || null,
          preco: validation.preco,
          custo: validation.custo,
          ncm: ncm.trim(),
          cfop: cfop.trim() || null,
          cest: cest.trim() || null,
          unidade: (unidade.trim() || 'UN').toUpperCase(),
          origem: origem.trim() || null,
          grupo_trib: grupo.trim() || null,
          marca: marca.trim() || null,
          categoria: categoria.trim() || null,
          has_variants: hasVariants,
          collection_id: collectionId || null,
          ativo: true,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'company_id,sku' })
        .select()
        .single()

      if (prodErr || !savedProduct) throw new Error(prodErr?.message || 'Falha ao salvar produto')

      if (hasVariants && variantDrafts.length > 0) {
        // 2a. Produto com grade — salva variantes
        const variantsPayload = variantDrafts.map(d => ({
          product_id: savedProduct.id,
          tamanho: d.tamanho,
          cor: d.cor,
          sku: d.sku || null,
        }))
        const { data: savedVariants, error: varErr } = await supabase
          .from('product_variants')
          .upsert(variantsPayload, { onConflict: 'product_id,tamanho,cor' })
          .select()
        if (varErr) throw new Error(varErr.message)

        // Estoque inicial por variante em variant_stock
        if (storeId && savedVariants) {
          const stockRows = variantDrafts
            .map((d, i) => ({ variantId: savedVariants[i]?.id, qty: d.qty }))
            .filter(r => r.variantId && r.qty > 0)
          if (stockRows.length > 0) {
            await supabase.from('variant_stock').upsert(
              stockRows.map(r => ({
                store_id: storeId,
                variant_id: r.variantId,
                qty: r.qty,
              })),
              { onConflict: 'store_id,variant_id' }
            )
          }
        }
      } else if (!hasVariants && storeId) {
        // 2b. Produto simples — estoque inicial em product_stock
        const qty = parseFloat(estoqueInicial) || 0
        if (qty > 0) {
          await supabase.from('product_stock').upsert(
            { store_id: storeId, product_id: savedProduct.id, qty },
            { onConflict: 'store_id,product_id' }
          )
        }
      }

      if (onSaved) onSaved(nome.trim(), hasVariants ? variantDrafts.length : 0)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar produto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg lg:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header sticky */}
        <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
          <div className="text-lg font-semibold">{product ? 'Editar produto' : 'Cadastrar novo produto'}</div>
          <button onClick={onClose} className="text-slate-400">fechar</button>
        </div>

        <Card title="Dados principais">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-1">SKU *</div>
              <input
                value={sku}
                onChange={e=>setSku(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: VEST-FLORAL-001"
              />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-1">Nome *</div>
              <input
                value={nome}
                onChange={e=>setNome(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: Vestido Floral Ref. 001"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Código de barras</div>
              <input
                value={barcode}
                onChange={e=>setBarcode(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="EAN/GTIN"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Unidade</div>
              <input
                value={unidade}
                onChange={e=>setUnidade(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="UN"
              />
            </div>
          </div>
        </Card>

        <Card title="Preços">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-slate-400 mb-1">Preço de venda *</div>
              <input
                value={preco}
                onChange={e=>setPreco(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: 119,90"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Preço de custo</div>
              <input
                value={custo}
                onChange={e=>setCusto(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: 49,90"
              />
            </div>
          </div>
        </Card>

        <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
        <Card title="Moda">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                id="has_variants"
                type="checkbox"
                checked={hasVariants}
                onChange={e => setHasVariants(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="has_variants" className="text-sm font-medium cursor-pointer">
                Este produto tem grade (tamanho × cor)
              </label>
            </div>

            <div>
              <div className="text-xs text-slate-400 mb-1">Coleção / Temporada</div>
              <select
                value={collectionId}
                onChange={e => setCollectionId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="">Sem coleção</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nome}{c.temporada ? ` · ${c.temporada}` : ''}{c.ano ? ` ${c.ano}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {hasVariants ? (
              <div className="rounded-2xl border p-3 bg-zinc-50 space-y-2">
                <div className="text-xs font-semibold text-slate-600">Grade de Tamanhos × Cores</div>
                <GradeEditor
                  productSku={sku || 'PROD'}
                  onChange={setVariantDrafts}
                />
              </div>
            ) : (
              <div>
                <div className="text-xs text-slate-400 mb-1">Estoque inicial</div>
                {storeId ? (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={estoqueInicial}
                    onChange={e => setEstoqueInicial(e.target.value)}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                  />
                ) : (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs px-3 py-2">
                    Selecione uma loja na tela inicial para definir o estoque ao cadastrar.
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card title="Atributos">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-slate-400 mb-1">Marca</div>
              <input
                value={marca}
                onChange={e=>setMarca(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: SANTÉ"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Categoria</div>
              <input
                value={categoria}
                onChange={e=>setCategoria(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: Vestidos"
              />
            </div>
          </div>
        </Card>
        </div>

        <Card title="Fiscais">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-slate-400 mb-1">NCM *</div>
              <input
                value={ncm}
                onChange={e=>setNcm(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: 6109.10.00"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">CFOP</div>
              <input
                value={cfop}
                onChange={e=>setCfop(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: 5102"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">CEST</div>
              <input
                value={cest}
                onChange={e=>setCest(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Opcional"
              />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Origem</div>
              <input
                value={origem}
                onChange={e=>setOrigem(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: 0"
              />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-slate-400 mb-1">Grupo Tributário</div>
              <input
                value={grupo}
                onChange={e=>setGrupo(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-navy placeholder-slate-400 focus:outline-none focus:border-azure transition-colors bg-white"
                placeholder="Ex.: Simples/CSOSN"
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
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
