
import type { FiscalService, EmitResult } from './FiscalService'
import type { Sale, Store } from '@/domain/types'

// FocusNFe-like adapter (stub). Plug your provider's REST here.
const API_KEY = import.meta.env.VITE_FISCAL_API_KEY
const ENV = (import.meta.env.VITE_FISCAL_ENV || 'homologacao') as 'homologacao'|'producao'

export const FocusNFeAdapter: FiscalService = {
  async emitirNFCe(venda: Sale, loja: Store): Promise<EmitResult> {
    // TODO: call provider API — here we mock success for MVP tests
    await new Promise(r => setTimeout(r, 400))
    return {
      status: 'AUTORIZADA',
      chave: 'NFe' + Date.now(),
      protocolo: 'PROTO' + Date.now(),
      xml_url: 'https://exemplo/xml',
      danfe_url: 'https://exemplo/danfe.pdf',
    }
  },
  async cancelarNFCe(chave: string, justificativa: string) {
    await new Promise(r => setTimeout(r, 300))
    return { status: 'CANCELADA', protocolo: 'CANC' + Date.now() }
  },
  async consultarStatus(chave: string) {
    await new Promise(r => setTimeout(r, 200))
    return { status: 'AUTORIZADA' }
  },
}
