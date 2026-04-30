import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export type LabelItem = {
  key: string
  productName: string
  variantLabel?: string
  sku: string
  price: number
  qty: number
}

export function LabelCard({ item, companyName }: { item: LabelItem; companyName: string }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const val = (item.sku || '0000000').replace(/[^\x00-\x7F]/g, '').replace(/\s/g, '') || '0000000'
    try {
      JsBarcode(svgRef.current, val, {
        format: 'CODE128',
        height: 28,
        fontSize: 7,
        margin: 1,
        displayValue: true,
        background: 'transparent',
        lineColor: '#000000',
        textMargin: 1,
        width: 1.2,
      })
      // Captura dimensões reais geradas pelo JsBarcode e define viewBox
      // para que o SVG escale proporcionalmente ao preencher o container
      const svg = svgRef.current
      const w = parseFloat(svg.getAttribute('width') || '200')
      const h = parseFloat(svg.getAttribute('height') || '50')
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      svg.setAttribute('width', '100%')
      svg.setAttribute('height', '100%')
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    } catch {
      // sku inválido para barcode
    }
  }, [item.sku])

  const price = item.price?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'R$ —'
  const hasVariant = !!item.variantLabel

  return (
    <div style={{
      width: '38.1mm',
      height: '21.2mm',
      padding: '0.7mm 1.2mm 0.5mm 1.2mm',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Arial, Helvetica, sans-serif',
      overflow: 'hidden',
    }}>

      {/* Empresa */}
      <div style={{
        fontSize: '4.5pt',
        color: '#666',
        lineHeight: '1.6mm',
        height: '1.6mm',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        flexShrink: 0,
      }}>
        {companyName}
      </div>

      {/* Produto */}
      <div style={{
        fontSize: '6pt',
        fontWeight: 700,
        color: '#000',
        lineHeight: '2.2mm',
        height: '2.2mm',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        flexShrink: 0,
        marginTop: '0.3mm',
      }}>
        {item.productName}
      </div>

      {/* Variante */}
      {hasVariant && (
        <div style={{
          fontSize: '5pt',
          color: '#333',
          lineHeight: '1.8mm',
          height: '1.8mm',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          flexShrink: 0,
          marginTop: '0.2mm',
        }}>
          {item.variantLabel}
        </div>
      )}

      {/* Barcode — ocupa o espaço restante */}
      <div style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        marginTop: '0.3mm',
        marginBottom: '0.2mm',
        display: 'flex',
        alignItems: 'stretch',
      }}>
        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      {/* Preço */}
      <div style={{
        fontSize: '7.5pt',
        fontWeight: 700,
        color: '#000',
        textAlign: 'right',
        lineHeight: '2.5mm',
        height: '2.5mm',
        flexShrink: 0,
      }}>
        {price}
      </div>
    </div>
  )
}
