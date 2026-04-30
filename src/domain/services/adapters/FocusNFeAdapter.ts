// src/domain/services/adapters/FocusNFeAdapter.ts
import type {
  FiscalService, FiscalConfig, FiscalSaleItem, FiscalPayment,
  EmitResult, StatusResult,
} from '../FiscalService'

// Mapeamento forma de pagamento → código NFC-e (NT 2013.003)
const MEIO_CODIGO: Record<string, string> = {
  DINHEIRO: '01',
  CARTAO:   '03', // crédito por padrão; débito = '04'
  PIX:      '17',
  CHEQUE:   '02',
  CREDITO:  '05',
}

function baseUrl(ambiente: 'homologacao' | 'producao') {
  return ambiente === 'producao'
    ? 'https://api.focusnfe.com.br/v2'
    : 'https://homologacao.focusnfe.com.br/v2'
}

function basicAuth(api_key: string) {
  return 'Basic ' + btoa(api_key + ':')
}

// Monta o payload NFC-e para o Focus NFe
function buildNFCePayload(
  sale: { id: string; total: number },
  store: { id: string; nome?: string; uf?: string },
  company: { id: string; nome?: string; cnpj?: string } | null | undefined,
  config: FiscalConfig,
  items: FiscalSaleItem[],
  payments: FiscalPayment[]
) {
  const totalStr = sale.total.toFixed(2)

  return {
    natureza_operacao: 'VENDA AO CONSUMIDOR',
    data_emissao: new Date().toISOString(),
    cnpj_emitente: config.cnpj_emitente,
    // Itens
    items: items.map(it => ({
      numero_item:               it.numero_item,
      codigo_produto:            it.sku || `ITEM-${it.numero_item}`,
      descricao:                 it.nome,
      cfop:                      it.cfop   || '5102',
      unidade_comercial:         it.unidade || 'UN',
      quantidade_comercial:      it.qtde.toFixed(4),
      valor_unitario_comercial:  it.preco_unit.toFixed(10),
      valor_bruto:               (it.qtde * it.preco_unit).toFixed(2),
      codigo_ncm:                it.ncm    || '00000000',
      icms_origem:               '0',
      icms_situacao_tributaria:  '400', // simples nacional sem ST
      pis_situacao_tributaria:   '07',  // operação isenta
      cofins_situacao_tributaria:'07',
    })),
    // Pagamentos
    formas_pagamento: payments.map(p => ({
      forma_pagamento: MEIO_CODIGO[p.meio] || '01',
      valor_pagamento: p.valor.toFixed(2),
      ...(p.bandeira ? { bandeira_operadora: p.bandeira } : {}),
    })),
    // QR Code
    ...(config.csc_id && config.csc_token ? {
      informacoes_adicionais_fisco: `CSC:${config.csc_id}`,
    } : {}),
  }
}

export const FocusNFeAdapter: FiscalService = {

  async emitirNFCe(sale, store, company, config, items, payments): Promise<EmitResult> {
    // Sem provedor configurado → modo demo
    if (config.provider === 'nenhum' || !config.api_key) {
      await new Promise(r => setTimeout(r, 600))
      return {
        status: 'AUTORIZADA',
        chave: '35' + new Date().toISOString().replace(/\D/g, '').slice(0, 12) +
          (config.cnpj_emitente || '00000000000000') +
          '65' + (config.serie || '001').padStart(3, '0') +
          String(Math.floor(Math.random() * 999999999)).padStart(9, '0') + '1',
        protocolo: String(Date.now()),
        numero: Math.floor(Math.random() * 999) + 1,
        serie: config.serie || '001',
        xml_url: '',
        danfe_url: '',
        qr_code_url: '',
      }
    }

    try {
      const ref = `TOTTYS-${sale.id.slice(0, 8).toUpperCase()}`
      const payload = buildNFCePayload(sale, store, company, config, items, payments)
      const url = `${baseUrl(config.ambiente)}/nfce?ref=${ref}`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': basicAuth(config.api_key),
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (res.status === 200 || res.status === 201) {
        if (json.status === 'autorizado') {
          return {
            status: 'AUTORIZADA',
            chave: json.chave_nfe,
            protocolo: json.numero_protocolo,
            numero: json.numero,
            serie: json.serie,
            xml_url: json.caminho_xml_nota_fiscal,
            danfe_url: json.caminho_danfe,
            qr_code_url: json.qrcode_url || '',
          }
        }
        if (json.status === 'rejeitado') {
          return {
            status: 'REJEITADA',
            motivo_rejeicao: json.mensagem_sefaz || json.erros?.map((e: any) => e.mensagem).join('; '),
          }
        }
      }

      if (res.status === 422) {
        const erros = json.erros?.map((e: any) => e.mensagem).join('; ') || json.mensagem
        return { status: 'REJEITADA', motivo_rejeicao: erros }
      }

      return { status: 'ERRO', motivo_rejeicao: `HTTP ${res.status}: ${json.mensagem || 'Erro desconhecido'}` }

    } catch (e: any) {
      return { status: 'ERRO', motivo_rejeicao: e?.message || 'Falha de conexão com o provedor fiscal.' }
    }
  },

  async cancelarNFCe(chave, justificativa, config) {
    if (config.provider === 'nenhum' || !config.api_key) {
      await new Promise(r => setTimeout(r, 300))
      return { status: 'CANCELADA', protocolo: String(Date.now()) }
    }

    try {
      const ref = chave.slice(0, 8)
      const res = await fetch(`${baseUrl(config.ambiente)}/nfce/${ref}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': basicAuth(config.api_key),
        },
        body: JSON.stringify({ justificativa }),
      })
      const json = await res.json()
      if (json.status === 'cancelado') {
        return { status: 'CANCELADA', protocolo: json.numero_protocolo }
      }
      return { status: 'ERRO', erro: json.mensagem || 'Erro ao cancelar' }
    } catch (e: any) {
      return { status: 'ERRO', erro: e?.message }
    }
  },

  async consultarStatus(ref, config): Promise<StatusResult> {
    // Sem provedor → simula SEFAZ online para teste de configuração
    if (config.provider === 'nenhum' || !config.api_key) {
      await new Promise(r => setTimeout(r, 400))
      return { status: 'SEFAZ_ONLINE', motivo: 'Modo demonstração ativo.' }
    }

    try {
      // Consulta status do ambiente Focus NFe (endpoint de saúde)
      const res = await fetch(`${baseUrl(config.ambiente)}/nfce/${ref}`, {
        headers: { 'Authorization': basicAuth(config.api_key) },
      })
      if (res.status === 200 || res.status === 404) {
        // 404 = ref não existe, mas conexão OK
        return { status: 'SEFAZ_ONLINE' }
      }
      if (res.status === 401) {
        return { status: 'INVALIDO', motivo: 'Chave de API inválida.' }
      }
      return { status: 'SEFAZ_OFFLINE', motivo: `HTTP ${res.status}` }
    } catch (e: any) {
      return { status: 'ERRO', motivo: e?.message || 'Sem conexão com o provedor.' }
    }
  },
}
