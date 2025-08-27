
export type UUID = string

export type Role = 'ADMIN' | 'GERENTE' | 'CAIXA'

export interface Company {
  id: UUID
  nome: string
  cnpj?: string
  regime_tributario?: string
}

export interface Store {
  id: UUID
  company_id: UUID
  nome: string
  uf: string
  serie?: string
  ambiente_fiscal?: 'homologacao' | 'producao'
}

export interface User {
  id: UUID
  company_id: UUID
  nome: string
  email: string
  role: Role
}

export interface Product {
  id: UUID
  company_id: UUID
  sku?: string
  ean?: string
  nome: string
  ncm?: string
  cest?: string
  unidade?: string
  preco: number
  ativo: boolean
  tributos_json?: any
}

export interface Customer {
  id: UUID
  company_id: UUID
  nome: string
  cpf_cnpj?: string
  contato?: string
}

export interface CashRegister {
  id: UUID
  store_id: UUID
  user_id: UUID
  abertura_at: string
  valor_inicial: number
  fechamento_at?: string
  valor_final?: number
  status: 'ABERTO' | 'FECHADO'
}

export interface Sale {
  id: UUID
  store_id: UUID
  user_id: UUID
  customer_id?: UUID | null
  total: number
  desconto: number
  status: 'PAGA' | 'PENDENTE' | 'CANCELADA'
  created_at: string
}

export interface SaleItem {
  id: UUID
  sale_id: UUID
  product_id: UUID
  qtde: number
  preco_unit: number
  desconto: number
}

export interface Payment {
  id: UUID
  sale_id: UUID
  meio: 'PIX' | 'DINHEIRO' | 'CARTAO'
  valor: number
  nsu?: string
  bandeira?: string
}

export interface FiscalDoc {
  id: UUID
  sale_id: UUID
  tipo: 'NFCe'
  chave?: string
  protocolo?: string
  xml_url?: string
  danfe_url?: string
  status: 'AUTORIZADA' | 'REJEITADA' | 'PENDENTE' | 'CANCELADA'
  motivo_rejeicao?: string
}
