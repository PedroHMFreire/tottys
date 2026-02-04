import { describe, expect, it } from 'vitest'
import { validateProductInput, parsePtBrNumber } from '@/domain/products/validation'

describe('product validation', () => {
  it('parses pt-BR numbers', () => {
    expect(parsePtBrNumber('1.234,56')).toBe(1234.56)
    expect(parsePtBrNumber('10,00')).toBe(10)
  })

  it('validates required fields', () => {
    const base = { sku: '', nome: 'Teste', preco: '10,00', ncm: '1234' }
    expect(validateProductInput(base).ok).toBe(false)
  })

  it('accepts valid input', () => {
    const out = validateProductInput({ sku: 'SKU1', nome: 'Produto', preco: '10,00', custo: '5,00', ncm: '1234' })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.preco).toBe(10)
      expect(out.custo).toBe(5)
    }
  })
})
