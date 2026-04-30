// Modal de geração de Romaneio de Estoque
import { useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import type { User } from '@/domain/types'
import { Loader2, FileText, X, Download } from 'lucide-react'
import type { RomaneioLine, RomaneioMeta, RomaneioMode } from './RomaneioDocument'

interface Props {
  companyId: string
  storeId: string | null
  storeName: string
  onClose: () => void
}

type ScopeFilter = 'all' | 'in-stock' | 'zero'
type CategoryOption = { value: string; label: string }

export default function RomaneioModal({ companyId, storeId, storeName, onClose }: Props) {
  const { company, user } = useApp()
  const typedUser = user as User | undefined

  // Filtros
  const [modo, setModo] = useState<RomaneioMode>('conferencia')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [categoria, setCategoria] = useState<string>('')
  const [busca, setBusca] = useState<string>('')
  const [incluirZerados, setIncluirZerados] = useState(true)
  const [incluirVariantesZeradas, setIncluirVariantesZeradas] = useState(true)

  // Dados
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [lines, setLines] = useState<RomaneioLine[]>([])
  const [meta, setMeta] = useState<RomaneioMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carrega categorias disponíveis
  useEffect(() => {
    if (!companyId) return
    supabase
      .from('products')
      .select('categoria')
      .eq('company_id', companyId)
      .not('categoria', 'is', null)
      .order('categoria', { ascending: true })
      .then(({ data }) => {
        const unique = [...new Set((data || []).map((r: any) => r.categoria).filter(Boolean))]
        setCategories(unique.map(c => ({ value: c as string, label: c as string })))
      })
  }, [companyId])

  async function generate() {
    setLoading(true)
    setError(null)
    setGenerated(false)
    try {
      const resultLines: RomaneioLine[] = []
      let seq = 1

      // ── Produtos simples ─────────────────────────────────────────
      {
        let q = supabase
          .from('product_stock')
          .select('product_id, qty, products!inner(sku, nome, categoria, has_variants, company_id)')
          .eq('products.company_id', companyId)
          .eq('products.has_variants', false)

        if (storeId) q = q.eq('store_id', storeId)

        const { data, error: err } = await q
        if (err) throw err

        let rows = (data || []) as any[]

        // Filtro de categoria
        if (categoria) rows = rows.filter(r => r.products?.categoria === categoria)

        // Filtro de busca
        if (busca.trim()) {
          const term = busca.trim().toLowerCase()
          rows = rows.filter(r =>
            r.products?.nome?.toLowerCase().includes(term) ||
            r.products?.sku?.toLowerCase().includes(term)
          )
        }

        // Filtro de saldo
        if (scopeFilter === 'in-stock') rows = rows.filter(r => Number(r.qty) > 0)
        if (scopeFilter === 'zero') rows = rows.filter(r => Number(r.qty) === 0)
        if (!incluirZerados) rows = rows.filter(r => Number(r.qty) > 0)

        // Ordena por nome
        rows.sort((a, b) => (a.products?.nome || '').localeCompare(b.products?.nome || '', 'pt-BR'))

        for (const r of rows) {
          resultLines.push({
            seq: seq++,
            sku: r.products?.sku || '—',
            produto: r.products?.nome || '—',
            variante: '—',
            unidade: 'UN',
            qty: Number(r.qty || 0),
          })
        }
      }

      // ── Produtos com grade ────────────────────────────────────────
      {
        let q = supabase
          .from('variant_stock')
          .select('variant_id, qty, product_variants!inner(sku, tamanho, cor, product_id, products!inner(sku, nome, categoria, company_id))')
          .eq('product_variants.products.company_id', companyId)

        if (storeId) q = q.eq('store_id', storeId)

        const { data, error: err } = await q
        if (err) throw err

        let rows = (data || []) as any[]

        // Filtro de categoria
        if (categoria) {
          rows = rows.filter(r => r.product_variants?.products?.categoria === categoria)
        }

        // Filtro de busca
        if (busca.trim()) {
          const term = busca.trim().toLowerCase()
          rows = rows.filter(r =>
            r.product_variants?.products?.nome?.toLowerCase().includes(term) ||
            r.product_variants?.products?.sku?.toLowerCase().includes(term) ||
            r.product_variants?.sku?.toLowerCase().includes(term)
          )
        }

        // Filtro de saldo
        if (scopeFilter === 'in-stock') rows = rows.filter(r => Number(r.qty) > 0)
        if (scopeFilter === 'zero') rows = rows.filter(r => Number(r.qty) === 0)
        if (!incluirVariantesZeradas) rows = rows.filter(r => Number(r.qty) > 0)

        // Ordena por produto → tamanho → cor
        rows.sort((a, b) => {
          const na = a.product_variants?.products?.nome || ''
          const nb = b.product_variants?.products?.nome || ''
          if (na !== nb) return na.localeCompare(nb, 'pt-BR')
          const ta = a.product_variants?.tamanho || ''
          const tb = b.product_variants?.tamanho || ''
          if (ta !== tb) return ta.localeCompare(tb, 'pt-BR')
          return (a.product_variants?.cor || '').localeCompare(b.product_variants?.cor || '', 'pt-BR')
        })

        for (const r of rows) {
          const pv = r.product_variants
          const p  = pv?.products
          const tamanho = pv?.tamanho || ''
          const cor = pv?.cor || ''
          const varLabel = [tamanho, cor].filter(Boolean).join(' / ') || '—'
          const skuDisplay = pv?.sku || p?.sku || '—'

          resultLines.push({
            seq: seq++,
            sku: skuDisplay,
            produto: p?.nome || '—',
            variante: varLabel,
            unidade: 'UN',
            qty: Number(r.qty || 0),
          })
        }
      }

      if (resultLines.length === 0) {
        setError('Nenhum produto encontrado com os filtros aplicados.')
        return
      }

      const totalUnidades = resultLines.reduce((a, l) => a + (l.qty || 0), 0)
      // Conta produtos únicos (por product_id não disponível aqui; usa nome)
      const produtosUnicos = new Set(resultLines.map(l => l.produto)).size

      const now = new Date()
      const docNumero = now.toISOString().slice(0, 19).replace(/[-T:]/g, '').replace(/(\d{8})(\d{6})/, '$1-$2')

      let filtroDesc = 'Todos os produtos'
      if (categoria) filtroDesc = `Categoria: ${categoria}`
      if (busca.trim()) filtroDesc = `Busca: "${busca.trim()}"`
      if (scopeFilter === 'in-stock') filtroDesc += ' · Somente com saldo'
      if (scopeFilter === 'zero') filtroDesc += ' · Somente zerados'

      const newMeta: RomaneioMeta = {
        empresaNome: company?.nome || 'Empresa',
        lojaNome: storeName || 'Loja',
        emitidoPor: typedUser?.nome || typedUser?.email || 'Usuário',
        modo,
        filtroDescricao: filtroDesc,
        totalProdutos: produtosUnicos,
        totalUnidades,
        docNumero,
      }

      setLines(resultLines)
      setMeta(newMeta)
      setGenerated(true)
    } catch (e: any) {
      setError(e?.message || 'Falha ao gerar romaneio.')
    } finally {
      setLoading(false)
    }
  }

  function generatePDF() {
    if (!meta) return

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 15
    const contentW = pageW - margin * 2
    const now = new Date().toLocaleString('pt-BR')
    const modoLabel = meta.modo === 'conferencia' ? 'Conferência de Estoque' : 'Entrada de Mercadoria'
    const isConferencia = meta.modo === 'conferencia'

    let y = margin

    // ── Cabeçalho azul ──────────────────────────────────
    doc.setFillColor(30, 64, 175)
    doc.rect(margin, y, contentW, 17, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(meta.empresaNome, margin + 4, y + 7)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`ROMANEIO DE ESTOQUE — ${modoLabel.toUpperCase()}`, margin + 4, y + 13)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`Nº ${meta.docNumero}`, pageW - margin - 3, y + 7, { align: 'right' })

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(`Emitido em ${now}`, pageW - margin - 3, y + 13, { align: 'right' })

    y += 21

    // ── Bloco de metadados ───────────────────────────────
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.rect(margin, y, contentW, 22, 'FD')

    const metaItems = [
      { label: 'Loja',            value: meta.lojaNome },
      { label: 'Emitido por',     value: meta.emitidoPor },
      { label: 'Tipo',            value: modoLabel },
      { label: 'Filtro',          value: meta.filtroDescricao },
      { label: 'Produtos',        value: String(meta.totalProdutos) },
      { label: 'Total unidades',  value: String(meta.totalUnidades) },
    ]
    const colW = contentW / 3
    metaItems.forEach((item, idx) => {
      const col = idx % 3
      const row = Math.floor(idx / 3)
      const x = margin + col * colW + 4
      const iy = y + row * 10 + 5

      doc.setTextColor(100, 116, 139)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text(item.label.toUpperCase(), x, iy)

      doc.setTextColor(30, 27, 75)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(item.value, x, iy + 4.5)
    })

    y += 26

    // ── Tabela ───────────────────────────────────────────
    const columns = [
      { header: '#',       dataKey: 'seq'      },
      { header: 'SKU',     dataKey: 'sku'      },
      { header: 'Produto', dataKey: 'produto'  },
      { header: 'Variante',dataKey: 'variante' },
      { header: 'Un.',     dataKey: 'unidade'  },
      ...(isConferencia
        ? [{ header: 'Qtde', dataKey: 'qty' }, { header: 'Contado', dataKey: 'blank' }]
        : [{ header: 'Qtde recebida', dataKey: 'blank' }]
      ),
    ]

    const tableData = lines.map(l => ({
      seq:     String(l.seq),
      sku:     l.sku,
      produto: l.produto,
      variante: l.variante,
      unidade: 'UN',
      qty:     isConferencia ? String(l.qty ?? 0) : undefined,
      blank:   '',
    }))

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      columns,
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [30, 64, 175],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        seq:      { cellWidth: 10, halign: 'center', textColor: [148, 163, 184], fontSize: 7 },
        sku:      { cellWidth: 28, textColor: [100, 116, 139], fontSize: 7.5 },
        produto:  { },
        variante: { cellWidth: 28 },
        unidade:  { cellWidth: 12, halign: 'center', textColor: [100, 116, 139] },
        qty:      { cellWidth: 18, halign: 'right', fontStyle: 'bold', textColor: [30, 64, 175] },
        blank:    { cellWidth: 24, halign: 'center' },
      },
      didDrawCell: (data) => {
        if (data.column.dataKey === 'blank' && data.section === 'body') {
          const { x: cx, y: cy, width, height } = data.cell
          doc.setDrawColor(148, 163, 184)
          doc.setLineWidth(0.4)
          doc.line(cx + 4, cy + height - 2, cx + width - 4, cy + height - 2)
          doc.setLineWidth(0.2)
        }
      },
    })

    const finalY: number = (doc as any).lastAutoTable?.finalY ?? y + 10

    // ── Rodapé ───────────────────────────────────────────
    const fy = finalY + 8
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, fy, pageW - margin, fy)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text('Total de linhas: ', margin, fy + 6)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 27, 75)
    doc.text(String(lines.length), margin + 22, fy + 6)

    if (isConferencia) {
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text('Total de unidades: ', margin, fy + 12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 27, 75)
      doc.text(String(meta.totalUnidades), margin + 28, fy + 12)
    }

    const sigX = pageW - margin - 58
    doc.setDrawColor(30, 27, 75)
    doc.setLineWidth(0.5)
    doc.line(sigX, fy + 14, pageW - margin, fy + 14)
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Responsável / Data', sigX + 29, fy + 18, { align: 'center' })

    doc.setTextColor(148, 163, 184)
    doc.setFontSize(7)
    doc.text(
      `Documento gerado automaticamente — ${meta.empresaNome} · ${now}`,
      pageW / 2, fy + 24,
      { align: 'center' }
    )

    doc.save(`romaneio-${meta.docNumero}.pdf`)
  }

  const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'in-stock', label: 'Com saldo' },
    { value: 'zero', label: 'Zerados' },
  ]

  return (
    <>
      {/* Modal de configuração */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
        <div className="w-full sm:max-w-md bg-white border border-slate-100 rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center">
                <FileText size={15} className="text-[#1E40AF]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">Gerar Romaneio</div>
                <div className="text-xs text-slate-400">{storeName}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-4 space-y-4">

            {/* Modo */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo de romaneio</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'conferencia', label: 'Conferência', sub: 'Mostra qtde do sistema' },
                  { value: 'entrada',     label: 'Entrada',     sub: 'Coluna em branco para preenchimento' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setModo(opt.value)}
                    className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      modo === opt.value
                        ? 'border-[#1E40AF] bg-[#EFF6FF]'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${modo === opt.value ? 'text-[#1E40AF]' : 'text-slate-700'}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Escopo de saldo */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Produtos a incluir</div>
              <div className="flex gap-1.5 flex-wrap">
                {scopeOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setScopeFilter(opt.value)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      scopeFilter === opt.value
                        ? 'bg-[#1E40AF] text-white border-[#1E40AF]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoria */}
            {categories.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Categoria</div>
                <select
                  value={categoria}
                  onChange={e => setCategoria(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] bg-white cursor-pointer"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}

            {/* Busca livre */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Busca por produto</div>
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome ou SKU (opcional)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] bg-white"
              />
            </div>

            {/* Opções avançadas */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Opções</div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirZerados}
                  onChange={e => setIncluirZerados(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">Incluir produtos simples zerados</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirVariantesZeradas}
                  onChange={e => setIncluirVariantesZeradas(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">Incluir variantes de grade zeradas</span>
              </label>
            </div>

            {/* Erro */}
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs px-3 py-2.5">
                {error}
              </div>
            )}

            {/* Preview gerado */}
            {generated && meta && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-3 space-y-1">
                <div className="text-sm font-semibold text-emerald-800">Romaneio gerado</div>
                <div className="text-xs text-emerald-700">
                  {lines.length} linhas · {meta.totalUnidades} unidades · {meta.totalProdutos} produtos
                </div>
                <div className="text-xs text-emerald-600">Nº {meta.docNumero}</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
            {!generated ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onClose}
                  className="h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={generate}
                  disabled={loading || !storeId}
                  className="h-11 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] text-white text-sm font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 size={15} className="animate-spin" />Gerando…</>
                  ) : (
                    <><FileText size={15} />Gerar Romaneio</>
                  )}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { setGenerated(false); setLines([]); setMeta(null) }}
                  className="h-11 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Refazer
                </button>
                <button
                  onClick={onClose}
                  className="h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={generatePDF}
                  className="h-11 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] text-white text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={15} />
                  Baixar PDF
                </button>
              </div>
            )}
            {!storeId && (
              <p className="text-xs text-amber-600 text-center mt-2">Selecione uma loja para gerar o romaneio.</p>
            )}
          </div>
        </div>
      </div>

    </>
  )
}
