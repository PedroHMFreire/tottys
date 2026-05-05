
export type UUID = string

export type Role =
  | 'OWNER'       // plataforma Tottys
  | 'ADMIN'       // administrador da empresa (acesso total)
  | 'GERENTE'     // gerente (acesso configurável pelo ADMIN)
  | 'COLABORADOR' // colaborador / vendedor (acesso mínimo)
  | 'ANON'

// Labels exibidos na UI para cada role
export const ROLE_LABELS: Record<Role, string> = {
  OWNER:       'Super Admin',
  ADMIN:       'Administrador',
  GERENTE:     'Gerente',
  COLABORADOR: 'Colaborador',
  ANON:        'Anônimo',
}

// Sub-tipos descritivos de COLABORADOR (coluna cargo)
export type Cargo = 'VENDEDOR' | 'ASSISTENTE' | 'TEMPORARIO'
export const CARGO_LABELS: Record<Cargo, string> = {
  VENDEDOR:   'Vendedor',
  ASSISTENTE: 'Assistente de vendas',
  TEMPORARIO: 'Colaborador temporário',
}

export interface Company {
  id: UUID
  nome: string
  cnpj?: string
  regime_tributario?: string
  survey_template?: string
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
  has_variants?: boolean
  collection_id?: UUID | null
  variants?: ProductVariant[]
}

export type ScoreInterno = 'BOM' | 'REGULAR' | 'RUIM' | 'BLOQUEADO'
export type CrediarioStatus = 'ATIVA' | 'QUITADA' | 'CANCELADA'
export type ParcelaStatus = 'PENDENTE' | 'PAGA' | 'ATRASADA'

export type CashbackTier = 'BRONZE' | 'PRATA' | 'OURO' | 'VIP'

export interface Customer {
  id: UUID
  company_id: UUID
  nome: string
  cpf_cnpj?: string
  contato?: string
  limite_credito?: number
  score_interno?: ScoreInterno
  data_nascimento?: string
  endereco?: string
  observacoes?: string
  cashback_saldo?: number
  cashback_total_gasto?: number
  cashback_tier?: CashbackTier
  created_at?: string
}

export interface CrediarioVenda {
  id: UUID
  company_id: UUID
  store_id?: UUID
  customer_id: UUID
  user_id?: UUID
  valor_total: number
  entrada: number
  num_parcelas: number
  valor_parcela: number
  status: CrediarioStatus
  observacoes?: string
  created_at: string
  customer?: Pick<Customer, 'id' | 'nome' | 'cpf_cnpj' | 'score_interno'>
}

export interface CrediarioParcela {
  id: UUID
  crediario_id: UUID
  company_id: UUID
  customer_id: UUID
  num_parcela: number
  valor: number
  vencimento: string
  status: ParcelaStatus
  pago_em?: string
  valor_pago?: number
  created_at: string
}

export interface CrediarioResumo {
  customer_id: UUID
  nome: string
  total_em_aberto: number
  parcelas_atrasadas: number
  proxima_parcela_venc?: string
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

export interface Collection {
  id: UUID
  company_id: UUID
  nome: string
  temporada?: string
  ano?: number
  status: 'ATIVA' | 'ENCERRADA' | 'RASCUNHO'
  created_at?: string
}

export interface ProductVariant {
  id: UUID
  product_id: UUID
  tamanho: string
  cor: string
  sku?: string
  ean?: string
  price_override?: number | null
  qty?: number
  store_id?: UUID
}

export interface SizesConfig {
  id: UUID
  company_id: UUID
  nome: string
  sizes: string[]
  is_default: boolean
}
