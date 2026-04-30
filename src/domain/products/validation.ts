export type ProductInput = {
  sku: string
  nome: string
  preco: string
  custo?: string
  ncm: string
  barcode?: string
  cfop?: string
  cest?: string
}

export type ProductValidation =
  | { ok: true; preco: number; custo: number | null }
  | { ok: false; error: string }

export function parsePtBrNumber(n: string): number | null {
  if (!n) return null
  const s = n.replace(/\./g, '').replace(',', '.')
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

export function validateProductInput(input: ProductInput): ProductValidation {
  const sku = input.sku.trim()
  if (!sku) return { ok: false, error: 'Informe o SKU.' }
  if (sku.length > 50) return { ok: false, error: 'SKU muito longo (máx. 50 caracteres).' }

  if (!input.nome.trim()) return { ok: false, error: 'Informe o nome.' }

  const precoNum = parsePtBrNumber(input.preco)
  if (precoNum === null || precoNum <= 0) {
    return { ok: false, error: 'Informe um preço de venda válido (> 0).' }
  }

  const ncm = input.ncm.trim().replace(/\D/g, '')
  if (!ncm) return { ok: false, error: 'Informe o NCM.' }
  if (ncm.length !== 8) return { ok: false, error: 'NCM deve ter exatamente 8 dígitos.' }

  if (input.barcode) {
    const bc = input.barcode.trim().replace(/\D/g, '')
    if (bc && ![8, 12, 13, 14].includes(bc.length)) {
      return { ok: false, error: 'Código de barras deve ter 8, 12 ou 13 dígitos (EAN).' }
    }
  }

  if (input.cfop) {
    const cfop = input.cfop.trim().replace(/\D/g, '')
    if (cfop && cfop.length !== 4) {
      return { ok: false, error: 'CFOP deve ter 4 dígitos.' }
    }
  }

  if (input.cest) {
    const cest = input.cest.trim().replace(/\D/g, '')
    if (cest && cest.length !== 7) {
      return { ok: false, error: 'CEST deve ter 7 dígitos.' }
    }
  }

  return { ok: true, preco: precoNum, custo: parsePtBrNumber(input.custo || '') }
}
