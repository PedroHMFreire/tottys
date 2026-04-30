// src/components/print/ThermalReceipt.tsx
import React from 'react'
import { formatBRL } from '@/lib/currency'

export interface ReceiptItem {
  nome: string
  qtde: number
  preco_unit: number
}

export interface ReceiptPayment {
  meio: string
  valor: number
  bandeira?: string | null
}

export interface FiscalInfo {
  numero?: number | null
  serie?: string | null
  chave?: string | null
  protocolo?: string | null
  qr_code_url?: string | null
}

export interface ThermalReceiptProps {
  saleId: string
  createdAt: string
  total: number
  subtotal?: number
  desconto?: number
  items: ReceiptItem[]
  payments: ReceiptPayment[]
  companyNome?: string
  companyCnpj?: string
  storeNome?: string
  storeCnpj?: string
  customerNome?: string | null
  customerDoc?: string | null
  modo: 'fiscal' | 'modelo'
  fiscal?: FiscalInfo | null
  paperWidth?: 58 | 80
}

function formatDoc(cnpj?: string | null) {
  if (!cnpj) return ''
  const d = cnpj.replace(/\D/g, '')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return cnpj
}

function formatChave(chave?: string | null) {
  if (!chave) return ''
  const digits = chave.replace(/\D/g, '')
  return digits.replace(/(\d{4})/g, '$1 ').trim()
}

function padEnd(str: string, len: number) {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length)
}
function padStart(str: string, len: number) {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str
}

const MEIO_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO: 'Cartão',
}

const LINE_LEN = { 80: 40, 58: 30 } as const

export default function ThermalReceipt({
  saleId,
  createdAt,
  total,
  subtotal,
  desconto = 0,
  items,
  payments,
  companyNome,
  companyCnpj,
  storeNome,
  storeCnpj,
  customerNome,
  customerDoc,
  modo,
  fiscal,
  paperWidth = 80,
}: ThermalReceiptProps) {
  const W = LINE_LEN[paperWidth]
  const wMM = paperWidth === 58 ? '52mm' : '72mm'
  const hr = '─'.repeat(W)

  function line(left: string, right: string) {
    const gap = W - left.length - right.length
    return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right
  }

  const dateStr = new Date(createdAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const totalDinheiro = payments.filter(p => p.meio === 'DINHEIRO').reduce((a, p) => a + p.valor, 0)
  const troco = totalDinheiro > total ? totalDinheiro - total : 0

  return (
    <div
      id="__thermal_receipt__"
      style={{
        width: wMM,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '11px',
        lineHeight: '1.45',
        color: '#000',
        background: '#fff',
        padding: '4px 2px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      {/* Cabeçalho empresa */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '2px' }}>
        {companyNome || 'ESTABELECIMENTO'}
      </div>
      {companyCnpj && (
        <div style={{ textAlign: 'center' }}>CNPJ: {formatDoc(companyCnpj)}</div>
      )}
      {storeNome && storeNome !== companyNome && (
        <div style={{ textAlign: 'center' }}>Loja: {storeNome}</div>
      )}
      {storeCnpj && storeCnpj !== companyCnpj && (
        <div style={{ textAlign: 'center' }}>CNPJ Loja: {formatDoc(storeCnpj)}</div>
      )}

      <div style={{ textAlign: 'center', margin: '4px 0' }}>{hr}</div>

      {/* Tipo de documento */}
      {modo === 'fiscal' ? (
        <div style={{ textAlign: 'center', fontWeight: 'bold' }}>
          NOTA FISCAL DE CONSUMIDOR{'\n'}ELETRÔNICA - NFC-e
          {fiscal?.numero && (
            <div style={{ fontWeight: 'normal', marginTop: '2px' }}>
              Nº {String(fiscal.numero).padStart(6, '0')}{fiscal.serie ? ` SÉRIE ${fiscal.serie}` : ''}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', fontWeight: 'bold' }}>
          CUPOM MODELO{'\n'}
          <span style={{ fontWeight: 'normal', fontSize: '10px' }}>SEM VALOR FISCAL</span>
        </div>
      )}

      <div style={{ textAlign: 'center', margin: '4px 0' }}>{hr}</div>

      {/* Data e ID */}
      <div>{line('Data:', dateStr)}</div>
      <div>Cupom: #{saleId.slice(0, 8).toUpperCase()}</div>
      {customerNome && (
        <div>
          <div>{line('Cliente:', customerNome.slice(0, W - 9))}</div>
          {customerDoc && <div>{line('CPF/CNPJ:', formatDoc(customerDoc))}</div>}
        </div>
      )}

      <div style={{ margin: '4px 0' }}>{hr}</div>

      {/* Itens */}
      <div style={{ fontWeight: 'bold' }}>ITENS</div>
      <div style={{ margin: '2px 0' }}>{hr}</div>
      {items.map((it, i) => {
        const totalItem = it.qtde * it.preco_unit
        const totalStr = formatBRL(totalItem)
        const maxNome = W - totalStr.length - 1
        return (
          <div key={i} style={{ marginBottom: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ flex: 1, overflow: 'hidden' }}>
                {it.nome.slice(0, W - totalStr.length - 1)}
              </span>
              <span style={{ flexShrink: 0 }}>{totalStr}</span>
            </div>
            <div style={{ paddingLeft: '2px', color: '#333' }}>
              {it.qtde}× {formatBRL(it.preco_unit)}
            </div>
          </div>
        )
      })}

      <div style={{ margin: '4px 0' }}>{hr}</div>

      {/* Totais */}
      {subtotal != null && subtotal !== total && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal</span><span>{formatBRL(subtotal)}</span>
        </div>
      )}
      {desconto > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Desconto</span><span>-{formatBRL(desconto)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', margin: '3px 0' }}>
        <span>TOTAL</span><span>{formatBRL(total)}</span>
      </div>

      <div style={{ margin: '4px 0' }}>{hr}</div>

      {/* Pagamentos */}
      <div style={{ fontWeight: 'bold' }}>PAGAMENTO</div>
      {payments.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{MEIO_LABEL[p.meio] || p.meio}{p.bandeira ? ` ${p.bandeira}` : ''}</span>
          <span>{formatBRL(p.valor)}</span>
        </div>
      ))}
      {troco > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Troco</span><span>{formatBRL(troco)}</span>
        </div>
      )}

      {/* Dados fiscais */}
      {modo === 'fiscal' && fiscal && (
        <>
          <div style={{ margin: '4px 0' }}>{hr}</div>
          {fiscal.protocolo ? (
            <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '2px' }}>
              NFC-e AUTORIZADA
            </div>
          ) : (
            <div style={{ fontWeight: 'bold', textAlign: 'center', color: '#555', marginBottom: '2px' }}>
              AGUARDANDO AUTORIZAÇÃO
            </div>
          )}
          {fiscal.protocolo && (
            <div>Protocolo: {fiscal.protocolo}</div>
          )}
          {fiscal.chave && (
            <>
              <div style={{ marginTop: '2px' }}>Chave de Acesso:</div>
              <div style={{ fontSize: '10px', letterSpacing: '0.5px', wordBreak: 'break-all' }}>
                {formatChave(fiscal.chave)}
              </div>
            </>
          )}
          {fiscal.qr_code_url && (
            <div style={{ marginTop: '4px', fontSize: '10px', wordBreak: 'break-all' }}>
              Consulte em:{'\n'}{fiscal.qr_code_url}
            </div>
          )}
        </>
      )}

      <div style={{ margin: '4px 0' }}>{hr}</div>

      {/* Rodapé */}
      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        Obrigado pela preferência!{'\n'}
        {modo === 'modelo' && (
          <span style={{ fontSize: '10px' }}>Este documento não tem valor fiscal.</span>
        )}
      </div>
      <div style={{ marginTop: '8px' }} />
    </div>
  )
}
