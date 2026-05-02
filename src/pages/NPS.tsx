// src/pages/NPS.tsx — Página pública de avaliação NPS (sem autenticação)
import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'

type PageState = 'loading' | 'form' | 'already_answered' | 'error' | 'success'

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

function scoreColor(n: number): string {
  if (n <= 6) return 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-200'
  if (n <= 8) return 'bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-200'
  return 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border-emerald-200'
}

function selectedColor(n: number): string {
  if (n <= 6) return 'bg-rose-500 text-white border-rose-500'
  if (n <= 8) return 'bg-amber-500 text-white border-amber-500'
  return 'bg-emerald-500 text-white border-emerald-500'
}

export default function NPS() {
  const [params] = useSearchParams()
  const ref = params.get('ref') ?? ''

  const [state, setState] = useState<PageState>('loading')
  const [companyNome, setCompanyNome] = useState('')
  const [nota, setNota] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [saleId, setSaleId] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)

  useEffect(() => {
    if (!ref) { setState('error'); return }
    loadEntry()
  }, [ref])

  async function loadEntry() {
    setState('loading')
    // nps_responses uses sale_id as id (upserted when email is sent)
    const { data, error } = await supabase
      .from('nps_responses')
      .select('id, company_id, sale_id, customer_id, nota, respondido_at, companies(nome)')
      .eq('id', ref)
      .maybeSingle()

    if (error || !data) {
      // Try fallback: look up by sale_id
      const { data: bySale } = await supabase
        .from('nps_responses')
        .select('id, company_id, sale_id, customer_id, nota, respondido_at, companies(nome)')
        .eq('sale_id', ref)
        .maybeSingle()

      if (!bySale) { setState('error'); return }
      populate(bySale)
      return
    }
    populate(data)
  }

  function populate(data: any) {
    setEntryId(data.id)
    setCompanyId(data.company_id)
    setSaleId(data.sale_id)
    setCustomerId(data.customer_id)
    setCompanyNome(data.companies?.nome ?? 'Loja')
    if (data.nota !== null && data.nota !== undefined) {
      setState('already_answered')
    } else {
      setState('form')
    }
  }

  async function handleSubmit() {
    if (nota === null) return
    setSubmitting(true)
    const { error } = await supabase
      .from('nps_responses')
      .update({
        nota,
        comentario: comentario.trim() || null,
        respondido_at: new Date().toISOString(),
      })
      .eq('id', entryId ?? ref)

    setSubmitting(false)
    if (error) { setState('error'); return }
    setState('success')
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="bg-primary px-6 py-5">
          <p className="text-white font-bold text-lg">{companyNome || 'Tottys'}</p>
          <p className="text-blue-200 text-sm mt-0.5">Pesquisa de satisfação</p>
        </div>

        <div className="p-6">

          {state === 'loading' && (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          )}

          {state === 'error' && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle size={32} className="text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Link inválido ou expirado.</p>
              <p className="text-xs text-slate-400">Verifique o link no e-mail recebido.</p>
            </div>
          )}

          {state === 'already_answered' && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle size={32} className="text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Você já respondeu esta pesquisa.</p>
              <p className="text-xs text-slate-400">Obrigado pelo seu feedback!</p>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle size={40} className="text-emerald-500 mx-auto" />
              <p className="text-base font-semibold text-slate-800">Obrigado pelo feedback!</p>
              <p className="text-sm text-slate-500">
                {nota !== null && nota >= 9
                  ? 'Fico feliz que tenha gostado! Até a próxima!'
                  : nota !== null && nota >= 7
                  ? 'Obrigado! Vamos continuar melhorando.'
                  : 'Obrigado por nos ajudar a melhorar.'}
              </p>
            </div>
          )}

          {state === 'form' && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  De 0 a 10, o quanto você recomendaria {companyNome} para um amigo?
                </p>
                <p className="text-xs text-slate-400">0 = muito improvável · 10 = com certeza!</p>
              </div>

              {/* Score grid */}
              <div className="grid grid-cols-11 gap-1">
                {SCORES.map(n => (
                  <button
                    key={n}
                    onClick={() => setNota(n)}
                    className={`aspect-square rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                      nota === n ? selectedColor(n) : scoreColor(n)
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-slate-400 -mt-2">
                <span>Improvável</span>
                <span>Muito provável</span>
              </div>

              {nota !== null && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Quer deixar um comentário? (opcional)
                  </label>
                  <textarea
                    value={comentario}
                    onChange={e => setComentario(e.target.value)}
                    rows={3}
                    placeholder="Conte-nos o que achou..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors resize-none"
                  />
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={nota === null || submitting}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-azure-dark disabled:opacity-40 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                {submitting ? 'Enviando…' : 'Enviar avaliação'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
