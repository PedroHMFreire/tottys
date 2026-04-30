// Documento HTML imprimível — Romaneio de Estoque
// Renderizado invisível via ref, chamado com window.print()

import { forwardRef } from 'react'

export type RomaneioMode = 'conferencia' | 'entrada'

export type RomaneioLine = {
  seq: number
  sku: string
  produto: string
  variante: string   // '—' para produtos simples, 'M / Azul' para grade
  unidade: string
  qty: number | null // null = coluna em branco (modo entrada)
}

export interface RomaneioMeta {
  empresaNome: string
  lojaNome: string
  emitidoPor: string
  modo: RomaneioMode
  filtroDescricao: string   // 'Todos os produtos', 'Categoria: Camisas', etc.
  totalProdutos: number
  totalUnidades: number
  docNumero: string         // ex: '20260430-143210'
}

interface Props {
  meta: RomaneioMeta
  lines: RomaneioLine[]
}

const RomaneioDocument = forwardRef<HTMLDivElement, Props>(({ meta, lines }, ref) => {
  const now = new Date().toLocaleString('pt-BR')
  const modoLabel = meta.modo === 'conferencia' ? 'Conferência de Estoque' : 'Entrada de Mercadoria'

  return (
    <div ref={ref} className="romaneio-root">
      <style>{`
        @media print {
          body > *:not(.romaneio-print-target) { display: none !important; }
          .romaneio-print-target { display: block !important; }
          @page { size: A4 portrait; margin: 1.5cm 1.5cm 2cm 1.5cm; }
        }
        .romaneio-root {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          font-size: 12px;
          color: #1E1B4B;
          line-height: 1.4;
        }
        .rom-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          border-bottom: 2px solid #1E40AF;
          padding-bottom: 10px;
          margin-bottom: 10px;
        }
        .rom-empresa { font-size: 18px; font-weight: 700; color: #1E40AF; }
        .rom-tipo    { font-size: 13px; color: #475569; margin-top: 2px; }
        .rom-doc     { text-align: right; }
        .rom-doc-num { font-size: 13px; font-weight: 600; color: #1E1B4B; }
        .rom-doc-sub { font-size: 10px; color: #64748B; margin-top: 2px; }
        .rom-meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px 16px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          padding: 8px 12px;
          margin-bottom: 10px;
          font-size: 11px;
        }
        .rom-meta-label { color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .rom-meta-value { color: #1E1B4B; font-weight: 500; margin-top: 1px; }
        .rom-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .rom-table thead tr {
          background: #1E40AF;
          color: #fff;
        }
        .rom-table thead th {
          padding: 6px 8px;
          text-align: left;
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .rom-table thead th.right { text-align: right; }
        .rom-table thead th.center { text-align: center; }
        .rom-table tbody tr { border-bottom: 1px solid #E2E8F0; }
        .rom-table tbody tr:nth-child(even) { background: #F8FAFC; }
        .rom-table tbody td {
          padding: 5px 8px;
          color: #334155;
          vertical-align: middle;
        }
        .rom-table tbody td.center { text-align: center; }
        .rom-table tbody td.right  { text-align: right; font-weight: 600; color: #1E40AF; }
        .rom-table tbody td.blank  {
          text-align: center;
          border-bottom: 1px solid #94A3B8;
          min-width: 60px;
          color: transparent;
        }
        .rom-table .col-seq     { width: 32px; text-align: center; color: #94A3B8; }
        .rom-table .col-sku     { width: 100px; font-family: monospace; font-size: 10px; color: #64748B; }
        .rom-table .col-produto { }
        .rom-table .col-var     { width: 110px; }
        .rom-table .col-un      { width: 40px; text-align: center; }
        .rom-table .col-qty     { width: 70px; text-align: right; }
        .rom-table .col-blank   { width: 80px; }
        .rom-zero { color: #EF4444; }
        .rom-footer {
          margin-top: 14px;
          border-top: 1px solid #E2E8F0;
          padding-top: 10px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 11px;
          color: #64748B;
        }
        .rom-totais { }
        .rom-totais strong { color: #1E1B4B; }
        .rom-assinatura {
          text-align: right;
        }
        .rom-assinatura-line {
          display: inline-block;
          border-bottom: 1px solid #1E1B4B;
          width: 200px;
          margin-bottom: 4px;
        }
        .rom-assinatura-label { font-size: 10px; color: #94A3B8; }
        .rom-page-note {
          text-align: center;
          font-size: 9px;
          color: #94A3B8;
          margin-top: 10px;
        }
      `}</style>

      {/* Cabeçalho */}
      <div className="rom-header">
        <div>
          <div className="rom-empresa">{meta.empresaNome}</div>
          <div className="rom-tipo">ROMANEIO DE ESTOQUE — {modoLabel.toUpperCase()}</div>
        </div>
        <div className="rom-doc">
          <div className="rom-doc-num">Nº {meta.docNumero}</div>
          <div className="rom-doc-sub">Emitido em {now}</div>
        </div>
      </div>

      {/* Metadados */}
      <div className="rom-meta">
        <div>
          <div className="rom-meta-label">Loja</div>
          <div className="rom-meta-value">{meta.lojaNome}</div>
        </div>
        <div>
          <div className="rom-meta-label">Emitido por</div>
          <div className="rom-meta-value">{meta.emitidoPor}</div>
        </div>
        <div>
          <div className="rom-meta-label">Tipo</div>
          <div className="rom-meta-value">{modoLabel}</div>
        </div>
        <div>
          <div className="rom-meta-label">Filtro</div>
          <div className="rom-meta-value">{meta.filtroDescricao}</div>
        </div>
        <div>
          <div className="rom-meta-label">Produtos</div>
          <div className="rom-meta-value">{meta.totalProdutos}</div>
        </div>
        <div>
          <div className="rom-meta-label">Total de unidades</div>
          <div className="rom-meta-value">{meta.totalUnidades}</div>
        </div>
      </div>

      {/* Tabela */}
      <table className="rom-table">
        <thead>
          <tr>
            <th className="col-seq center">#</th>
            <th className="col-sku">SKU</th>
            <th className="col-produto">Produto</th>
            <th className="col-var">Variante</th>
            <th className="col-un center">Un.</th>
            {meta.modo === 'conferencia' ? (
              <>
                <th className="col-qty right">Qtde</th>
                <th className="col-blank center">Contado</th>
              </>
            ) : (
              <th className="col-blank center">Qtde recebida</th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.seq}>
              <td className="col-seq center" style={{ color: '#94A3B8', fontSize: 10 }}>{line.seq}</td>
              <td className="col-sku">{line.sku}</td>
              <td className="col-produto">{line.produto}</td>
              <td className="col-var" style={{ color: line.variante === '—' ? '#CBD5E1' : '#334155' }}>{line.variante}</td>
              <td className="col-un center" style={{ color: '#64748B' }}>UN</td>
              {meta.modo === 'conferencia' ? (
                <>
                  <td className={`col-qty right${line.qty === 0 ? ' rom-zero' : ''}`}>{line.qty ?? 0}</td>
                  <td className="col-blank blank">_</td>
                </>
              ) : (
                <td className="col-blank blank">_</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Rodapé */}
      <div className="rom-footer">
        <div className="rom-totais">
          <div>Total de linhas: <strong>{lines.length}</strong></div>
          {meta.modo === 'conferencia' && (
            <div>Total de unidades: <strong>{meta.totalUnidades}</strong></div>
          )}
        </div>
        <div className="rom-assinatura">
          <div className="rom-assinatura-line" />
          <div className="rom-assinatura-label">Responsável / Data</div>
        </div>
      </div>

      <div className="rom-page-note">
        Documento gerado automaticamente — {meta.empresaNome} · {now}
      </div>
    </div>
  )
})

RomaneioDocument.displayName = 'RomaneioDocument'
export default RomaneioDocument
