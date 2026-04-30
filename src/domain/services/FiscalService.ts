// src/domain/services/FiscalService.ts

export interface FiscalConfig {
  provider: 'focus_nfe' | 'enotas' | 'sat' | 'nenhum'
  api_key: string
  ambiente: 'homologacao' | 'producao'
  cnpj_emitente: string
  csc_id?: string
  csc_token?: string
  serie?: string
  proxima_nfce?: number
}

export interface FiscalSaleItem {
  numero_item: number
  nome: string
  qtde: number
  preco_unit: number
  ncm?: string | null
  cfop?: string | null
  unidade?: string | null
  sku?: string | null
}

export interface FiscalPayment {
  meio: string  // 'DINHEIRO' | 'PIX' | 'CARTAO'
  valor: number
  bandeira?: string | null
}

export interface EmitResult {
  status: 'AUTORIZADA' | 'REJEITADA' | 'PENDENTE' | 'ERRO'
  chave?: string
  protocolo?: string
  numero?: number
  serie?: string
  xml_url?: string
  danfe_url?: string
  qr_code_url?: string
  motivo_rejeicao?: string
}

export interface StatusResult {
  status: 'SEFAZ_ONLINE' | 'SEFAZ_OFFLINE' | 'INVALIDO' | 'AUTORIZADA' | 'REJEITADA' | 'ERRO'
  motivo?: string
}

export interface FiscalService {
  emitirNFCe: (
    sale: { id: string; total: number },
    store: { id: string; nome?: string; uf?: string; ambiente_fiscal?: string },
    company: { id: string; nome?: string; cnpj?: string } | null | undefined,
    config: FiscalConfig,
    items: FiscalSaleItem[],
    payments: FiscalPayment[]
  ) => Promise<EmitResult>

  cancelarNFCe: (
    chave: string,
    justificativa: string,
    config: FiscalConfig
  ) => Promise<{ status: 'CANCELADA' | 'ERRO'; protocolo?: string; erro?: string }>

  consultarStatus: (
    ref: string,
    config: FiscalConfig
  ) => Promise<StatusResult>
}
