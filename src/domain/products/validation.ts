export type ProductInput = {
  sku: string
  nome: string
  preco: string
  custo?: string
  ncm: string
}

export type ProductValidation =
  | { ok: true; preco: number; custo: number | null }
  | { ok: false; error: string }

export function parsePtBrNumber(n: string) {
  if (!n) return null
  const s = n.replace(/\./g, '').replace(',', '.')
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

export function validateProductInput(input: ProductInput): ProductValidation {
  if (!input.sku.trim()) return { ok: false, error: 'Informe o SKU.' }
  if (!input.nome.trim()) return { ok: false, error: 'Informe o nome.' }
  const precoNum = parsePtBrNumber(input.preco)
  if (!precoNum || precoNum <= 0) {
    return { ok: false, error: 'Informe um preço de venda válido (> 0).' }
  }
  if (!input.ncm.trim()) return { ok: false, error: 'Informe o NCM.' }
  return { ok: true, preco: precoNum, custo: parsePtBrNumber(input.custo || '') }
}
