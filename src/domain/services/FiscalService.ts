
import type { Sale, Store } from '@/domain/types'

export interface EmitResult {
  status: 'AUTORIZADA' | 'REJEITADA' | 'PENDENTE'
  chave?: string
  protocolo?: string
  xml_url?: string
  danfe_url?: string
  motivo_rejeicao?: string
}

export interface FiscalService {
  emitirNFCe: (venda: Sale, loja: Store) => Promise<EmitResult>
  cancelarNFCe: (chave: string, justificativa: string) => Promise<{ status: 'CANCELADA' | 'ERRO', protocolo?: string, erro?: string }>
  consultarStatus: (chave: string) => Promise<{ status: string, motivo?: string }>
}
