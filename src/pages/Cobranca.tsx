import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { formatBRL } from '@/lib/currency'
import Button from '@/ui/Button'

type ClienteInativo = {
  customer_id: string
  nome: string
  contato: string | null
  cashback_saldo: number
  cashback_tier: string
  ultima_compra: string | null
}

type ParcelaCobranca = {
  id: string
  num_parcela: number
  valor: number
  vencimento: string
  status: 'PENDENTE' | 'ATRASADA'
  customer_id: string
  customers: { nome: string; contato: string | null } | null
}

type CompanyConfig = {
  pix_chave: string | null
  msg_lembrete: string | null
  msg_cobranca: string | null
}

const DEFAULT_LEMBRETE =
  'Olá {{nome}}! Passando para lembrar que sua parcela {{parcela}}ª de *{{valor}}* vence em *{{data}}*. Qualquer dúvida estamos à disposição! 😊'
const DEFAULT_COBRANCA =
  'Olá {{nome}}, tudo bem? Sua parcela {{parcela}}ª de *{{valor}}* venceu em {{data}} e ainda está em aberto. Para regularizar, entre em contato ou pague via Pix: *{{pix}}*. Obrigado!'

function formatPhone(contato: string | null): string | null {
  if (!contato) return null
  const digits = contato.replace(/\D/g, '')
  if (digits.length < 8) return null
  return digits.startsWith('55') ? digits : `55${digits}`
}

function buildMessage(template: string, data: {
  nome: string; parcela: number; valor: number; data: string; pix: string
}): string {
  return template
    .replace(/{{nome}}/g, data.nome)
    .replace(/{{parcela}}/g, String(data.parcela))
    .replace(/{{valor}}/g, formatBRL(data.valor))
    .replace(/{{data}}/g, new Date(data.data + 'T00:00:00').toLocaleDateString('pt-BR'))
    .replace(/{{pix}}/g, data.pix || 'consulte-nos')
}

function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

const TIER_LABEL: Record<string, string> = {
  BRONZE: 'Bronze', PRATA: 'Prata', OURO: 'Ouro', VIP: 'VIP',
}
const DEFAULT_REATIVACAO =
  'Olá {{nome}}! Você tem *R$ {{saldo}}* de cashback esperando por você. Aproveite e venha nos visitar! 🎉'

export default function Cobranca() {
  const { company } = useApp()
  const [tab, setTab] = useState<'lembrete' | 'cobranca' | 'reativacao'>('lembrete')
  const [parcelas, setParcelas] = useState<ParcelaCobranca[]>([])
  const [inativos, setInativos] = useState<ClienteInativo[]>([])
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<CompanyConfig>({ pix_chave: null, msg_lembrete: null, msg_cobranca: null })
  const [msgReativacao, setMsgReativacao] = useState<string>(DEFAULT_REATIVACAO)
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState<CompanyConfig>({ pix_chave: '', msg_lembrete: DEFAULT_LEMBRETE, msg_cobranca: DEFAULT_COBRANCA })
  const [savingConfig, setSavingConfig] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (company?.id) {
      loadConfig()
      if (tab === 'reativacao') loadInativos()
      else load()
    }
  }, [company?.id, tab])

  async function loadConfig() {
    if (!company?.id) return
    const { data } = await supabase
      .from('companies')
      .select('pix_chave, msg_lembrete, msg_cobranca')
      .eq('id', company.id)
      .single()
    if (data) {
      setConfig(data as CompanyConfig)
      setConfigForm({
        pix_chave: data.pix_chave || '',
        msg_lembrete: data.msg_lembrete || DEFAULT_LEMBRETE,
        msg_cobranca: data.msg_cobranca || DEFAULT_COBRANCA,
      })
    }
    // Mensagem de reativação da config de cashback
    const { data: cbCfg } = await supabase
      .from('cashback_config')
      .select('msg_reativacao')
      .eq('company_id', company.id)
      .maybeSingle()
    if (cbCfg?.msg_reativacao) setMsgReativacao(cbCfg.msg_reativacao)
  }

  async function loadInativos() {
    if (!company?.id) return
    setLoading(true)
    try {
      const { data } = await supabase.rpc('fn_clientes_inativos_cashback', {
        p_company_id: company.id,
        p_dias: 30,
      })
      setInativos((data || []) as ClienteInativo[])
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    if (!company?.id) return
    setSavingConfig(true)
    await supabase.from('companies').update({
      pix_chave: configForm.pix_chave || null,
      msg_lembrete: configForm.msg_lembrete,
      msg_cobranca: configForm.msg_cobranca,
    }).eq('id', company.id)
    await loadConfig()
    setSavingConfig(false)
    setShowConfig(false)
  }

  async function load() {
    if (!company?.id) return
    setLoading(true)
    try {
      await supabase.rpc('atualizar_parcelas_atrasadas', { p_company_id: company.id })

      const today = new Date().toISOString().slice(0, 10)
      const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

      let q = supabase
        .from('crediario_parcelas')
        .select('id, num_parcela, valor, vencimento, status, customer_id, customers(nome, contato)')
        .eq('company_id', company.id)
        .order('vencimento')
        .limit(80)

      if (tab === 'lembrete') {
        q = q.eq('status', 'PENDENTE').gte('vencimento', today).lte('vencimento', in3days)
      } else {
        q = q.eq('status', 'ATRASADA')
      }

      const { data } = await q
      setParcelas((data || []) as unknown as ParcelaCobranca[])
    } finally {
      setLoading(false)
    }
  }

  function handleWhatsApp(p: ParcelaCobranca) {
    const customer = p.customers
    if (!customer) return
    const phone = formatPhone(customer.contato)
    const template = tab === 'lembrete'
      ? (config.msg_lembrete || DEFAULT_LEMBRETE)
      : (config.msg_cobranca || DEFAULT_COBRANCA)
    const message = buildMessage(template, {
      nome: customer.nome,
      parcela: p.num_parcela,
      valor: p.valor,
      data: p.vencimento,
      pix: config.pix_chave || '',
    })
    if (phone) {
      window.open(whatsappUrl(phone, message), '_blank')
    } else {
      handleCopy(p.id, message)
    }
  }

  async function handleCopy(id: string, text?: string) {
    const p = parcelas.find(x => x.id === id)
    if (!p) return
    const customer = p.customers
    if (!customer) return
    const template = tab === 'lembrete'
      ? (config.msg_lembrete || DEFAULT_LEMBRETE)
      : (config.msg_cobranca || DEFAULT_COBRANCA)
    const message = text || buildMessage(template, {
      nome: customer.nome,
      parcela: p.num_parcela,
      valor: p.valor,
      data: p.vencimento,
      pix: config.pix_chave || '',
    })
    await navigator.clipboard.writeText(message)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const semContato = parcelas.filter(p => !formatPhone(p.customers?.contato ?? null))
  const comContato = parcelas.filter(p => !!formatPhone(p.customers?.contato ?? null))

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="sticky top-0 bg-white border-b px-4 py-3 z-10 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[#1E1B4B]">Cobrança WhatsApp</h1>
          <button onClick={() => setShowConfig(true)} className="text-xs text-zinc-500 border rounded-xl px-3 py-1 hover:bg-zinc-50">
            Configurar
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setTab('lembrete')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-colors ${tab === 'lembrete' ? 'bg-[#1E40AF] text-white border-[#1E40AF]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            Lembrete
          </button>
          <button
            onClick={() => setTab('cobranca')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium border ${tab === 'cobranca' ? 'bg-red-600 text-white border-red-600' : 'border-zinc-200 text-zinc-600'}`}
          >
            Cobrança
          </button>
          <button
            onClick={() => setTab('reativacao')}
            className={`flex-1 py-2 rounded-xl text-xs font-medium border ${tab === 'reativacao' ? 'bg-purple-600 text-white border-purple-600' : 'border-zinc-200 text-zinc-600'}`}
          >
            Reativação
          </button>
        </div>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {!company?.id && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3">Selecione uma empresa.</div>
        )}

        {!config.pix_chave && tab === 'cobranca' && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs p-3 flex items-center justify-between">
            <span>Configure a chave Pix para incluir nas mensagens.</span>
            <button onClick={() => setShowConfig(true)} className="underline text-xs ml-2 shrink-0">Configurar</button>
          </div>
        )}

        {loading && <div className="text-sm text-slate-400 py-4 text-center">Carregando…</div>}

        {!loading && parcelas.length === 0 && company?.id && tab !== 'reativacao' && (
          <div className={`rounded-2xl border p-4 text-center ${tab === 'lembrete' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-50 text-zinc-500'}`}>
            <div className="font-medium">
              {tab === 'lembrete' ? 'Nenhuma parcela vencendo nos próximos 3 dias.' : 'Nenhuma parcela atrasada.'}
            </div>
          </div>
        )}

        {/* Com contato (WhatsApp) */}
        {comContato.length > 0 && tab !== 'reativacao' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {comContato.map(p => (
              <div key={p.id} className={`rounded-2xl border bg-white p-3 ${p.status === 'ATRASADA' ? 'border-red-200' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.customers?.nome}</div>
                    <div className="text-xs text-zinc-500">
                      Parcela {p.num_parcela}ª · {new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      {p.status === 'ATRASADA' && <span className="ml-2 text-red-500 font-medium">ATRASADA</span>}
                    </div>
                    <div className="text-xs text-zinc-400">{p.customers?.contato}</div>
                  </div>
                  <div className="font-semibold shrink-0">{formatBRL(p.valor)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleWhatsApp(p)}
                    className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium"
                  >
                    WhatsApp
                  </button>
                  <button
                    onClick={() => handleCopy(p.id)}
                    className="px-3 py-2 rounded-xl border text-sm text-zinc-600 hover:bg-zinc-50"
                  >
                    {copied === p.id ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reativação (clientes inativos com cashback) */}
        {tab === 'reativacao' && !loading && inativos.length === 0 && company?.id && (
          <div className="rounded-2xl border p-4 text-center bg-purple-50 text-purple-700">
            <div className="font-medium">Nenhum cliente inativo com cashback nos últimos 30 dias.</div>
          </div>
        )}
        {tab === 'reativacao' && inativos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {inativos.map(c => {
              const phone = formatPhone(c.contato)
              const msg = (msgReativacao || DEFAULT_REATIVACAO)
                .replace(/{{nome}}/g, c.nome)
                .replace(/{{saldo}}/g, formatBRL(c.cashback_saldo))
                .replace(/{{empresa}}/g, company?.nome || 'nossa loja')
              const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : null
              return (
                <div key={c.customer_id} className="rounded-2xl border bg-white p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.nome}</div>
                      <div className="text-xs text-zinc-500">
                        {TIER_LABEL[c.cashback_tier]} · saldo {formatBRL(c.cashback_saldo)}
                      </div>
                      {c.ultima_compra && (
                        <div className="text-xs text-zinc-400">
                          Última compra: {new Date(c.ultima_compra + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </div>
                      )}
                      {!c.ultima_compra && (
                        <div className="text-xs text-red-400">Nunca comprou</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 shrink-0">{c.contato}</div>
                  </div>
                  <div className="flex gap-2">
                    {wa ? (
                      <button
                        onClick={() => window.open(wa, '_blank')}
                        className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium"
                      >
                        WhatsApp
                      </button>
                    ) : (
                      <div className="flex-1 py-2 rounded-xl bg-zinc-100 text-zinc-400 text-sm text-center">Sem telefone</div>
                    )}
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(msg)
                        setCopied(c.customer_id)
                        setTimeout(() => setCopied(null), 2000)
                      }}
                      className="px-3 py-2 rounded-xl border text-sm text-zinc-600 hover:bg-zinc-50"
                    >
                      {copied === c.customer_id ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Sem contato */}
        {semContato.length > 0 && tab !== 'reativacao' && (
          <div className="rounded-2xl border border-dashed p-3 space-y-2">
            <div className="text-xs text-zinc-500 font-medium">Sem número de WhatsApp cadastrado ({semContato.length})</div>
            {semContato.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                <div>
                  <div className="font-medium">{p.customers?.nome}</div>
                  <div className="text-xs text-zinc-400">Parcela {p.num_parcela}ª · {new Date(p.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatBRL(p.valor)}</div>
                  <button
                    onClick={() => handleCopy(p.id)}
                    className="text-xs text-zinc-500 hover:underline"
                  >
                    {copied === p.id ? 'Copiado!' : 'Copiar msg'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de configuração */}
      {showConfig && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Configurar Cobrança</div>
              <button onClick={() => setShowConfig(false)} className="text-zinc-500 text-sm">fechar</button>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Chave Pix da empresa</div>
              <input
                value={configForm.pix_chave || ''}
                onChange={e => setConfigForm(p => ({ ...p, pix_chave: e.target.value }))}
                placeholder="CPF, CNPJ, e-mail ou chave aleatória"
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] placeholder-slate-400 focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full"
              />
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Mensagem de lembrete (antes do vencimento)</div>
              <div className="text-xs text-zinc-400 mb-1">Variáveis: {'{{nome}}'} {'{{parcela}}'} {'{{valor}}'} {'{{data}}'}</div>
              <textarea
                value={configForm.msg_lembrete || ''}
                onChange={e => setConfigForm(p => ({ ...p, msg_lembrete: e.target.value }))}
                rows={4}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full resize-none"
              />
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-1">Mensagem de cobrança (parcela atrasada)</div>
              <div className="text-xs text-zinc-400 mb-1">Variáveis: {'{{nome}}'} {'{{parcela}}'} {'{{valor}}'} {'{{data}}'} {'{{pix}}'}</div>
              <textarea
                value={configForm.msg_cobranca || ''}
                onChange={e => setConfigForm(p => ({ ...p, msg_cobranca: e.target.value }))}
                rows={4}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-[#1E1B4B] focus:outline-none focus:border-[#1E40AF] transition-colors bg-white w-full resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setShowConfig(false)}>Cancelar</Button>
              <Button onClick={saveConfig} disabled={savingConfig}>{savingConfig ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
