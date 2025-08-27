
export const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)

export const parseNumber = (s: string) => {
  const n = Number(String(s).replace(/[^0-9,-]/g, '').replace('.', '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
