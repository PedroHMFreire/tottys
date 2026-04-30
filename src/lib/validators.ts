// Validadores e utilitários compartilhados entre todos os formulários de cadastro

/* ---- CPF ---- */
export function validateCPF(raw: string): boolean {
  const s = raw.replace(/\D/g, '')
  if (s.length !== 11) return false
  if (/^(\d)\1{10}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i)
  let r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== Number(s[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(s[i]) * (11 - i)
  r = (sum * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === Number(s[10])
}

/* ---- CNPJ ---- */
export function validateCNPJ(raw: string): boolean {
  const s = raw.replace(/\D/g, '')
  if (s.length !== 14) return false
  if (/^(\d)\1{13}$/.test(s)) return false
  const calc = (str: string, weights: number[]) =>
    weights.reduce((acc, w, i) => acc + Number(str[i]) * w, 0)
  const mod = (n: number) => { const r = n % 11; return r < 2 ? 0 : 11 - r }
  const d1 = mod(calc(s, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  const d2 = mod(calc(s, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
  return d1 === Number(s[12]) && d2 === Number(s[13])
}

/* ---- Máscaras ---- */
export function maskCPF(v: string): string {
  const s = v.replace(/\D/g, '').slice(0, 11)
  if (s.length <= 3) return s
  if (s.length <= 6) return `${s.slice(0, 3)}.${s.slice(3)}`
  if (s.length <= 9) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6)}`
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`
}

export function maskCNPJ(v: string): string {
  const s = v.replace(/\D/g, '').slice(0, 14)
  if (s.length <= 2) return s
  if (s.length <= 5) return `${s.slice(0, 2)}.${s.slice(2)}`
  if (s.length <= 8) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5)}`
  if (s.length <= 12) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8)}`
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
}

export function maskPhone(v: string): string {
  const s = v.replace(/\D/g, '').slice(0, 11)
  if (s.length <= 2) return s.length ? `(${s}` : ''
  if (s.length <= 6) return `(${s.slice(0, 2)}) ${s.slice(2)}`
  if (s.length <= 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`
  return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`
}

/* ---- Validação de email ---- */
export function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/* ---- UF (27 estados) ---- */
export const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const
export type UF = typeof UF_LIST[number]

/* ---- Regime tributário ---- */
export const REGIME_LIST = [
  'MEI',
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
] as const
export type Regime = typeof REGIME_LIST[number]
