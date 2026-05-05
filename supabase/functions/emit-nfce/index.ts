// Edge Function: emit-nfce
// Emite NFC-e via Focus NFe usando o token software house (FISCAL_API_TOKEN).
// O token nunca é exposto ao browser — fica apenas neste servidor.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const MEIO_CODIGO: Record<string, string> = {
  DINHEIRO: '01',
  CARTAO:   '03',
  PIX:      '17',
  CHEQUE:   '02',
  CREDITO:  '05',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const fiscalToken  = Deno.env.get('FISCAL_API_TOKEN') ?? ''

    const authHeader = req.headers.get('authorization') ?? ''
    const supa  = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const admin = createClient(supabaseUrl, serviceKey)

    const { data: { user } } = await supa.auth.getUser()
    if (!user) return json({ error: 'não autenticado' }, 401)

    const body = await req.json()
    const { store_id, sale_id, total, items, payments } = body
    if (!store_id || !sale_id) return json({ error: 'store_id e sale_id são obrigatórios' }, 400)

    // Carrega config fiscal da loja
    const { data: store } = await admin
      .from('stores')
      .select('id, nome, uf, cnpj_emitente, csc_id, csc_token, serie, proxima_nfce, ambiente_fiscal, fiscal_provider, company_id')
      .eq('id', store_id)
      .single()

    if (!store) return json({ error: 'loja não encontrada' }, 404)

    const { data: company } = await admin
      .from('companies')
      .select('id, nome, cnpj')
      .eq('id', store.company_id)
      .single()

    const provider  = store.fiscal_provider  || 'nenhum'
    const ambiente  = store.ambiente_fiscal  || 'homologacao'
    const cnpj      = store.cnpj_emitente    || company?.cnpj || ''
    const serie     = store.serie            || '001'
    const proxNum   = store.proxima_nfce     || 1

    // Modo demo: token não configurado ou provider desativado
    if (provider === 'nenhum' || !fiscalToken) {
      await new Promise(r => setTimeout(r, 600))
      const chave = '35' +
        new Date().toISOString().replace(/\D/g, '').slice(0, 12) +
        (cnpj || '00000000000000') + '65' +
        serie.padStart(3, '0') +
        String(Math.floor(Math.random() * 999999999)).padStart(9, '0') + '1'

      await admin.from('stores').update({ proxima_nfce: proxNum + 1 }).eq('id', store_id)

      return json({
        status:       'AUTORIZADA',
        chave,
        protocolo:    String(Date.now()),
        numero:       proxNum,
        serie,
        xml_url:      '',
        danfe_url:    '',
        qr_code_url:  '',
      })
    }

    // Monta payload Focus NFe
    const ref = `TOTTYS-${sale_id.slice(0, 8).toUpperCase()}`
    const baseUrl = ambiente === 'producao'
      ? 'https://api.focusnfe.com.br/v2'
      : 'https://homologacao.focusnfe.com.br/v2'

    const payload = {
      natureza_operacao: 'VENDA AO CONSUMIDOR',
      data_emissao:      new Date().toISOString(),
      cnpj_emitente:     cnpj,
      items: (items as any[]).map((it, i) => ({
        numero_item:                i + 1,
        codigo_produto:             it.sku || `ITEM-${i + 1}`,
        descricao:                  it.nome,
        cfop:                       it.cfop || '5102',
        unidade_comercial:          it.unidade || 'UN',
        quantidade_comercial:       Number(it.qtde).toFixed(4),
        valor_unitario_comercial:   Number(it.preco_unit).toFixed(10),
        valor_bruto:                (it.qtde * it.preco_unit).toFixed(2),
        codigo_ncm:                 it.ncm || '00000000',
        icms_origem:                '0',
        icms_situacao_tributaria:   '400',
        pis_situacao_tributaria:    '07',
        cofins_situacao_tributaria: '07',
      })),
      formas_pagamento: (payments as any[]).map(p => ({
        forma_pagamento: MEIO_CODIGO[p.meio] || '01',
        valor_pagamento: Number(p.valor).toFixed(2),
      })),
    }

    const basicAuth = 'Basic ' + btoa(fiscalToken + ':')

    const res = await fetch(`${baseUrl}/nfce?ref=${ref}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': basicAuth },
      body:    JSON.stringify(payload),
    })

    const rj = await res.json()

    if ((res.status === 200 || res.status === 201) && rj.status === 'autorizado') {
      await admin.from('stores').update({ proxima_nfce: proxNum + 1 }).eq('id', store_id)
      return json({
        status:       'AUTORIZADA',
        chave:        rj.chave_nfe,
        protocolo:    rj.numero_protocolo,
        numero:       rj.numero,
        serie:        rj.serie,
        xml_url:      rj.caminho_xml_nota_fiscal,
        danfe_url:    rj.caminho_danfe,
        qr_code_url:  rj.qrcode_url || '',
      })
    }

    if (rj.status === 'rejeitado' || res.status === 422) {
      const motivo = rj.erros?.map((e: any) => e.mensagem).join('; ')
        || rj.mensagem_sefaz
        || rj.mensagem
        || 'Nota rejeitada pelo SEFAZ'
      return json({ status: 'REJEITADA', motivo_rejeicao: motivo })
    }

    return json({
      status:          'ERRO',
      motivo_rejeicao: `HTTP ${res.status}: ${rj.mensagem || 'Erro desconhecido'}`,
    })

  } catch (err: any) {
    console.error('emit-nfce error:', err)
    return json({ status: 'ERRO', motivo_rejeicao: err.message ?? 'erro interno' }, 500)
  }
})
