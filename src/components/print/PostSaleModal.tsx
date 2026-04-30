// src/components/print/PostSaleModal.tsx
import React, { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { usePrinterConfig } from '@/hooks/usePrinterConfig'
import { useThermalPrint } from '@/hooks/useThermalPrint'
import ThermalReceipt, { type FiscalInfo, type ReceiptItem, type ReceiptPayment } from './ThermalReceipt'
import { FocusNFeAdapter } from '@/domain/services/adapters/FocusNFeAdapter'
import { formatBRL } from '@/lib/currency'
import { Printer, FileText, X, Loader2, CheckCircle, AlertCircle, Mail, Send, MessageCircle } from 'lucide-react'

export interface PostSaleData {
  saleId: string
  createdAt: string
  total: number
  subtotal: number
  desconto: number
  items: ReceiptItem[]
  payments: ReceiptPayment[]
  customerNome?: string | null
  customerDoc?: string | null
  customerId?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
}

type Step = 'choice' | 'emitting' | 'preview' | 'email' | 'whatsapp'

interface Props {
  data: PostSaleData
  onClose: () => void
}

export default function PostSaleModal({ data, onClose }: Props) {
  const { company, store } = useApp()
  const { config } = usePrinterConfig()
  const { print } = useThermalPrint()

  const [step, setStep] = useState<Step>(
    config.modo_padrao === 'fiscal' ? 'emitting'
    : config.modo_padrao === 'modelo' ? 'preview'
    : 'choice'
  )
  const [printMode, setPrintMode] = useState<'fiscal' | 'modelo'>(
    config.modo_padrao === 'fiscal' ? 'fiscal' : 'modelo'
  )
  const [fiscal, setFiscal] = useState<FiscalInfo | null>(null)
  const [fiscalError, setFiscalError] = useState<string | null>(null)
  const [emitting, setEmitting] = useState(config.modo_padrao === 'fiscal')

  // Email state
  const [emailAddr, setEmailAddr] = useState(data.customerEmail ?? '')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // WhatsApp state
  const [whatsPhone, setWhatsPhone] = useState(data.customerPhone ?? '')
  const [whatsError, setWhatsError] = useState<string | null>(null)

  function openWhatsApp() {
    const raw = whatsPhone.replace(/\D/g, '')
    if (!raw || raw.length < 10) { setWhatsError('Informe um número válido (com DDD).'); return }
    const number = raw.startsWith('55') ? raw : `55${raw}`
    const companyNome = company?.nome ?? store?.nome ?? 'Loja'
    const saleId = data.saleId.slice(0, 8).toUpperCase()
    const createdAt = new Date(data.createdAt).toLocaleString('pt-BR')
    const itemsText = data.items.map(it =>
      `  • ${it.nome} ${it.qtde}x — ${formatBRL(it.qtde * it.preco_unit)}`
    ).join('\n')
    const paymentsText = data.payments.map(p => `  ${p.meio}: ${formatBRL(p.valor)}`).join('\n')
    const discount = data.desconto > 0 ? `\nDesconto: -${formatBRL(data.desconto)}` : ''
    const msg = [
      `*${companyNome}*`,
      `Comprovante de compra #${saleId}`,
      `${createdAt}`,
      ``,
      `*Itens:*`,
      itemsText,
      ``,
      `*Pagamento:*`,
      paymentsText,
      discount,
      ``,
      `*Total: ${formatBRL(data.total)}*`,
      ``,
      `Obrigado pela preferência! 🛍️`,
    ].filter(l => l !== undefined).join('\n')
    const url = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  // Auto-emit if modo_padrao is 'fiscal'
  React.useEffect(() => {
    if (config.modo_padrao === 'fiscal') {
      emitFiscal()
    }
  }, [])

  async function emitFiscal() {
    setStep('emitting')
    setPrintMode('fiscal')
    setEmitting(true)
    setFiscalError(null)
    try {
      const result = await FocusNFeAdapter.emitirNFCe(
        { id: data.saleId, total: data.total } as any,
        store as any,
        company as any,
        {
          provider: (store as any)?.fiscal_provider || 'nenhum',
          api_key: (store as any)?.fiscal_api_key || '',
          ambiente: store?.ambiente_fiscal || 'homologacao',
          cnpj_emitente: (store as any)?.cnpj_emitente || company?.cnpj || '',
          csc_id: (store as any)?.csc_id || '',
          csc_token: (store as any)?.csc_token || '',
          serie: store?.serie || '001',
        },
        data.items.map((it, i) => ({
          numero_item: i + 1,
          nome: it.nome,
          qtde: it.qtde,
          preco_unit: it.preco_unit,
        })),
        data.payments.map(p => ({ meio: p.meio, valor: p.valor }))
      )

      if (result.status === 'AUTORIZADA') {
        const fiscalInfo: FiscalInfo = {
          chave: result.chave,
          protocolo: result.protocolo,
          qr_code_url: result.qr_code_url,
          numero: result.numero,
          serie: result.serie,
        }
        setFiscal(fiscalInfo)
        await supabase.from('fiscal_docs').upsert({
          sale_id: data.saleId,
          tipo: 'NFCe',
          chave: result.chave,
          protocolo: result.protocolo,
          xml_url: result.xml_url,
          danfe_url: result.danfe_url,
          qr_code_url: result.qr_code_url,
          numero: result.numero,
          serie: result.serie,
          status: 'AUTORIZADA',
          emitido_at: new Date().toISOString(),
        }, { onConflict: 'sale_id' })
        setStep('preview')
      } else {
        setFiscalError(result.motivo_rejeicao || 'NFC-e rejeitada pelo SEFAZ.')
      }
    } catch (e: any) {
      setFiscalError(e?.message || 'Erro ao comunicar com o servidor fiscal.')
    } finally {
      setEmitting(false)
    }
  }

  function chooseModelo() {
    setPrintMode('modelo')
    setStep('preview')
  }

  function handlePrint() {
    print(config.paper_width)
  }

  async function handleSendEmail() {
    const email = emailAddr.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Informe um e-mail válido.')
      return
    }
    setSendingEmail(true)
    setEmailError(null)
    try {
      // If customer has no email saved, save it now
      if (data.customerId && !data.customerEmail) {
        await supabase.from('customers').update({ email }).eq('id', data.customerId)
      }

      // Generate NPS ref — reuse sale_id as stable ref
      const npsRef = data.saleId
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const npsUrl = `${window.location.origin}/nps?ref=${npsRef}`

      const { error, data: fnData } = await supabase.functions.invoke('smooth-processor', {
        body: {
          type: 'receipt',
          to: email,
          data: {
            company_id: company?.id,
            company_nome: company?.nome ?? store?.nome ?? 'Loja',
            sale_id: data.saleId,
            customer_id: data.customerId,
            customer_nome: data.customerNome ?? 'Cliente',
            total: data.total,
            subtotal: data.subtotal,
            desconto: data.desconto,
            items: data.items,
            payments: data.payments,
            created_at: data.createdAt,
            nps_ref: npsRef,
            nps_url: npsUrl,
          },
        },
      })

      if (error) {
        let detail = error.message
        try {
          const ctx = await (error as any)?.context?.json()
          if (ctx?.error) detail = ctx.error
        } catch { /* ignora */ }
        throw new Error(detail)
      }

      // Save NPS entry in advance so the public page can display the sale context
      await supabase.from('nps_responses').upsert({
        id: npsRef,
        company_id: company?.id,
        sale_id: data.saleId,
        customer_id: data.customerId ?? null,
      }, { onConflict: 'id' })

      setEmailSent(true)
    } catch (e: any) {
      setEmailError(e?.message || 'Falha ao enviar email.')
    } finally {
      setSendingEmail(false)
    }
  }

  const receiptProps = {
    saleId: data.saleId,
    createdAt: data.createdAt,
    total: data.total,
    subtotal: data.subtotal,
    desconto: data.desconto,
    items: data.items,
    payments: data.payments,
    companyNome: company?.nome,
    companyCnpj: company?.cnpj,
    storeNome: store?.nome,
    storeCnpj: (store as any)?.cnpj_emitente,
    customerNome: data.customerNome,
    customerDoc: data.customerDoc,
    modo: printMode,
    fiscal,
    paperWidth: config.paper_width,
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-slate-800">Venda finalizada</span>
            <span className="text-sm font-bold text-[#1E40AF]">{formatBRL(data.total)}</span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* STEP: escolha */}
          {step === 'choice' && (
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-500 text-center">O que deseja fazer?</p>

              <button
                onClick={emitFiscal}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-[#1E40AF] hover:bg-[#EFF6FF] transition-colors cursor-pointer text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-[#1E40AF] flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Emitir NFC-e e imprimir</div>
                  <div className="text-xs text-slate-500">Nota Fiscal eletrônica via SEFAZ</div>
                </div>
              </button>

              <button
                onClick={chooseModelo}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Printer size={18} className="text-slate-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Imprimir cupom modelo</div>
                  <div className="text-xs text-slate-500">Recibo sem valor fiscal</div>
                </div>
              </button>

              <button
                onClick={() => setStep('whatsapp')}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={18} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Enviar pelo WhatsApp</div>
                  <div className="text-xs text-slate-500">Abre o WhatsApp com o comprovante</div>
                </div>
              </button>

              <button
                onClick={() => setStep('email')}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                  <Mail size={18} className="text-sky-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Enviar comprovante por e-mail</div>
                  <div className="text-xs text-slate-500">Com link para avaliar a compra</div>
                </div>
              </button>

              <button
                onClick={onClose}
                className="w-full py-2.5 text-sm text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                Fechar sem imprimir
              </button>
            </div>
          )}

          {/* STEP: emitindo NFC-e */}
          {step === 'emitting' && (
            <div className="p-6 flex flex-col items-center gap-4">
              {emitting ? (
                <>
                  <Loader2 size={32} className="text-[#1E40AF] animate-spin" />
                  <div className="text-sm font-medium text-slate-700">Comunicando com SEFAZ…</div>
                  <div className="text-xs text-slate-400">Aguarde a autorização da NFC-e</div>
                </>
              ) : fiscalError ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                    <AlertCircle size={24} className="text-rose-600" />
                  </div>
                  <div className="text-sm font-semibold text-slate-800 text-center">Falha na emissão</div>
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 w-full text-center">
                    {fiscalError}
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <button
                      onClick={emitFiscal}
                      className="h-11 rounded-xl border border-[#1E40AF] text-[#1E40AF] text-sm font-medium hover:bg-[#EFF6FF] cursor-pointer transition-colors"
                    >
                      Tentar novamente
                    </button>
                    <button
                      onClick={chooseModelo}
                      className="h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 cursor-pointer transition-colors"
                    >
                      Cupom modelo
                    </button>
                  </div>
                  <button onClick={onClose} className="text-xs text-slate-400 underline cursor-pointer">
                    Fechar sem imprimir
                  </button>
                </>
              ) : null}
            </div>
          )}

          {/* STEP: preview + imprimir */}
          {step === 'preview' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-center gap-2">
                {printMode === 'fiscal' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                    <CheckCircle size={12} />
                    NFC-e Autorizada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                    <Printer size={12} />
                    Cupom Modelo
                  </span>
                )}
              </div>

              <div className="flex justify-center">
                <div
                  className="border border-slate-200 rounded-lg overflow-hidden shadow-sm"
                  style={{ maxWidth: receiptProps.paperWidth === 58 ? '200px' : '280px' }}
                >
                  <ThermalReceipt {...receiptProps} />
                </div>
              </div>
            </div>
          )}

          {/* STEP: email */}
          {step === 'email' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                  <Mail size={16} className="text-sky-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Enviar comprovante</div>
                  <div className="text-xs text-slate-400">O cliente receberá o cupom e um link de avaliação</div>
                </div>
              </div>

              {emailSent ? (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center space-y-1">
                  <CheckCircle size={24} className="text-emerald-600 mx-auto" />
                  <div className="text-sm font-semibold text-emerald-800">E-mail enviado!</div>
                  <div className="text-xs text-emerald-600">{emailAddr}</div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      E-mail do cliente
                    </label>
                    <input
                      type="email"
                      value={emailAddr}
                      onChange={e => { setEmailAddr(e.target.value); setEmailError(null) }}
                      placeholder="cliente@email.com"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E40AF] transition-colors"
                      autoFocus
                    />
                    {emailError && (
                      <div className="text-xs text-rose-600">{emailError}</div>
                    )}
                    {!data.customerEmail && data.customerId && (
                      <div className="text-xs text-slate-400">O e-mail será salvo no cadastro do cliente.</div>
                    )}
                  </div>

                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || !emailAddr.trim()}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
                  >
                    {sendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {sendingEmail ? 'Enviando…' : 'Enviar por e-mail'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* STEP: whatsapp */}
          {step === 'whatsapp' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={18} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Enviar pelo WhatsApp</div>
                  <div className="text-xs text-slate-500">O WhatsApp abrirá com o comprovante pronto</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Celular do cliente (com DDD)
                </label>
                <input
                  type="tel"
                  value={whatsPhone}
                  onChange={e => { setWhatsPhone(e.target.value); setWhatsError(null) }}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                  autoFocus
                />
                {whatsError && <div className="text-xs text-rose-600">{whatsError}</div>}
              </div>

              <button
                onClick={openWhatsApp}
                disabled={!whatsPhone.trim()}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                <MessageCircle size={15} />
                Abrir WhatsApp
              </button>
            </div>
          )}

        </div>

        {/* Botões fixos no rodapé */}
        {step === 'preview' && (
          <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
            <button
              onClick={() => setStep('choice')}
              className="h-11 flex-1 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={() => setStep('email')}
              className="h-11 px-3 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
              title="Enviar por e-mail"
            >
              <Mail size={16} />
            </button>
            <button
              onClick={handlePrint}
              className="h-11 flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#1E40AF] text-white text-sm font-semibold hover:bg-[#1E3A8A] cursor-pointer transition-colors"
            >
              <Printer size={15} />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="h-11 px-4 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        )}

        {step === 'email' && (
          <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
            <button
              onClick={() => setStep(emailSent ? 'preview' : 'choice')}
              className="h-11 flex-1 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              {emailSent ? 'Voltar ao cupom' : 'Voltar'}
            </button>
            {emailSent && (
              <button
                onClick={onClose}
                className="h-11 flex-1 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 cursor-pointer transition-colors"
              >
                Fechar
              </button>
            )}
          </div>
        )}

        {step === 'whatsapp' && (
          <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
            <button
              onClick={() => setStep('choice')}
              className="h-11 flex-1 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={onClose}
              className="h-11 flex-1 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
