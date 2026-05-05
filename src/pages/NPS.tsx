// src/pages/NPS.tsx — Página pública de avaliação (sem autenticação)
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { CheckCircle, Loader2, AlertCircle, Star } from 'lucide-react'

type SurveyTemplate = 'NPS' | 'CSAT' | 'DIAGNOSTICO' | 'MOTIVO'
type PageState = 'loading' | 'form' | 'already_answered' | 'error' | 'success'

// ── NPS helpers ───────────────────────────────────────────────
const NPS_SCORES = [0,1,2,3,4,5,6,7,8,9,10]
function npsColor(n: number) {
  if (n <= 6) return 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-200'
  if (n <= 8) return 'bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-200'
  return 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border-emerald-200'
}
function npsSelected(n: number) {
  if (n <= 6) return 'bg-rose-500 text-white border-rose-500'
  if (n <= 8) return 'bg-amber-500 text-white border-amber-500'
  return 'bg-emerald-500 text-white border-emerald-500'
}

// ── CSAT helpers ──────────────────────────────────────────────
const CSAT_OPTIONS = [
  { value: 1, emoji: '😞', label: 'Muito ruim' },
  { value: 2, emoji: '😐', label: 'Ruim' },
  { value: 3, emoji: '🙂', label: 'Ok' },
  { value: 4, emoji: '😊', label: 'Bom' },
  { value: 5, emoji: '🤩', label: 'Excelente' },
]

// ── DIAGNÓSTICO helpers ───────────────────────────────────────
const DIAG_DIMENSIONS = [
  { key: 'atendimento',  label: 'Atendimento',        emoji: '👋' },
  { key: 'produto',      label: 'Qualidade do produto',emoji: '👗' },
  { key: 'preco',        label: 'Preço × Qualidade',  emoji: '💰' },
]

// ── MOTIVO helpers ────────────────────────────────────────────
const MOTIVO_ORIGEM = ['Indicação de amigo','Instagram','Google','Passando na rua','Já era cliente','Outros']
const MOTIVO_COMPRA = ['Preço','Variedade','Atendimento','Promoção','Qualidade','Precisava']

// ── StarRating ────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 cursor-pointer transition-transform hover:scale-110"
        >
          <Star
            size={28}
            className={`transition-colors ${n <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-100'}`}
          />
        </button>
      ))}
    </div>
  )
}

// ── Chip ──────────────────────────────────────────────────────
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors cursor-pointer ${
        selected
          ? 'bg-primary text-white border-primary'
          : 'border-slate-200 text-slate-600 hover:border-azure hover:text-azure'
      }`}
    >
      {label}
    </button>
  )
}

export default function NPS() {
  const [params] = useSearchParams()
  const ref = params.get('ref') ?? ''

  const [state, setState]           = useState<PageState>('loading')
  const [template, setTemplate]     = useState<SurveyTemplate>('NPS')
  const [companyNome, setCompanyNome] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [entryId, setEntryId]       = useState<string | null>(null)

  // NPS state
  const [nota, setNota]             = useState<number | null>(null)
  const [comentario, setComentario] = useState('')

  // CSAT state
  const [csatNota, setCsatNota]     = useState<number | null>(null)
  const [csatComentario, setCsatComentario] = useState('')

  // DIAGNOSTICO state
  const [diagScores, setDiagScores] = useState<Record<string, number>>({})
  const [diagComentario, setDiagComentario] = useState('')

  // MOTIVO state
  const [motivoOrigem, setMotivoOrigem] = useState('')
  const [motivoCompra, setMotivoCompra] = useState<string[]>([])
  const [motivoPrimeira, setMotivoPrimeira] = useState<boolean | null>(null)

  useEffect(() => {
    if (!ref) { setState('error'); return }
    loadEntry()
  }, [ref])

  async function loadEntry() {
    setState('loading')
    const { data, error } = await supabase
      .from('nps_responses')
      .select('id, nota, dados, survey_template, company_nome')
      .eq('id', ref)
      .maybeSingle()

    if (error || !data) {
      const { data: bySale } = await supabase
        .from('nps_responses')
        .select('id, nota, dados, survey_template, company_nome')
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
    setCompanyNome(data.company_nome ?? 'Loja')
    setTemplate((data.survey_template as SurveyTemplate) ?? 'NPS')
    if (data.nota !== null || data.dados !== null) {
      setState('already_answered')
    } else {
      setState('form')
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    let payload: any = { respondido_at: new Date().toISOString() }

    if (template === 'NPS') {
      if (nota === null) { setSubmitting(false); return }
      payload.nota = nota
      payload.comentario = comentario.trim() || null
      payload.tipo_pesquisa = 'NPS'

    } else if (template === 'CSAT') {
      if (csatNota === null) { setSubmitting(false); return }
      payload.nota = csatNota * 2  // normalize 1-5 → 2-10
      payload.comentario = csatComentario.trim() || null
      payload.tipo_pesquisa = 'CSAT'
      payload.dados = { csat: csatNota }

    } else if (template === 'DIAGNOSTICO') {
      const keys = DIAG_DIMENSIONS.map(d => d.key)
      if (keys.some(k => !diagScores[k])) { setSubmitting(false); return }
      const avg = Math.round(keys.reduce((s, k) => s + diagScores[k], 0) / keys.length)
      payload.nota = avg * 2  // normalize 1-5 → 2-10
      payload.comentario = diagComentario.trim() || null
      payload.tipo_pesquisa = 'DIAGNOSTICO'
      payload.dados = diagScores

    } else if (template === 'MOTIVO') {
      if (!motivoOrigem || motivoCompra.length === 0 || motivoPrimeira === null) {
        setSubmitting(false); return
      }
      payload.nota = null
      payload.tipo_pesquisa = 'MOTIVO'
      payload.dados = {
        como_conheceu: motivoOrigem,
        motivacao: motivoCompra,
        primeira_vez: motivoPrimeira,
      }
    }

    const { error } = await supabase
      .from('nps_responses')
      .update(payload)
      .eq('id', entryId ?? ref)

    setSubmitting(false)
    if (error) { setState('error'); return }
    setState('success')
  }

  const canSubmit = (() => {
    if (template === 'NPS')        return nota !== null
    if (template === 'CSAT')       return csatNota !== null
    if (template === 'DIAGNOSTICO') return DIAG_DIMENSIONS.every(d => diagScores[d.key])
    if (template === 'MOTIVO')     return !!motivoOrigem && motivoCompra.length > 0 && motivoPrimeira !== null
    return false
  })()

  const successMsg = (() => {
    if (template === 'MOTIVO') return 'Essas informações são muito valiosas para nós!'
    const n = template === 'NPS' ? nota : (template === 'CSAT' ? csatNota : null)
    if (n === null) return 'Obrigado por nos ajudar a melhorar.'
    if (template === 'NPS')  return n >= 9 ? 'Fico feliz que tenha gostado! Até a próxima!' : n >= 7 ? 'Obrigado! Vamos continuar melhorando.' : 'Obrigado por nos ajudar a melhorar.'
    return n >= 4 ? 'Fico feliz que tenha gostado! Até a próxima!' : n >= 3 ? 'Obrigado! Vamos continuar melhorando.' : 'Obrigado por nos ajudar a melhorar.'
  })()

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
              <p className="text-sm text-slate-500">{successMsg}</p>
            </div>
          )}

          {state === 'form' && (
            <div className="space-y-5">

              {/* ── NPS ── */}
              {template === 'NPS' && (
                <>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">
                      De 0 a 10, o quanto você recomendaria {companyNome} para um amigo?
                    </p>
                    <p className="text-xs text-slate-400">0 = muito improvável · 10 = com certeza!</p>
                  </div>
                  <div className="grid grid-cols-11 gap-1">
                    {NPS_SCORES.map(n => (
                      <button
                        key={n}
                        onClick={() => setNota(n)}
                        className={`aspect-square rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${nota === n ? npsSelected(n) : npsColor(n)}`}
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
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comentário (opcional)</label>
                      <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3}
                        placeholder="Conte-nos o que achou..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors resize-none" />
                    </div>
                  )}
                </>
              )}

              {/* ── CSAT ── */}
              {template === 'CSAT' && (
                <>
                  <p className="text-sm font-semibold text-slate-800">
                    Como foi sua experiência de compra hoje?
                  </p>
                  <div className="flex justify-between">
                    {CSAT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setCsatNota(opt.value)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all cursor-pointer ${
                          csatNota === opt.value
                            ? 'border-primary bg-navy-ghost scale-110'
                            : 'border-transparent hover:border-slate-200'
                        }`}
                      >
                        <span className="text-3xl">{opt.emoji}</span>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  {csatNota !== null && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quer contar mais? (opcional)</label>
                      <textarea value={csatComentario} onChange={e => setCsatComentario(e.target.value)} rows={3}
                        placeholder="O que podemos melhorar ou o que você adorou?"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors resize-none" />
                    </div>
                  )}
                </>
              )}

              {/* ── DIAGNÓSTICO ── */}
              {template === 'DIAGNOSTICO' && (
                <>
                  <p className="text-sm font-semibold text-slate-800">
                    Avalie cada aspecto da sua visita:
                  </p>
                  <div className="space-y-4">
                    {DIAG_DIMENSIONS.map(dim => (
                      <div key={dim.key} className="space-y-1.5">
                        <div className="text-sm text-slate-700">
                          <span className="mr-1.5">{dim.emoji}</span>{dim.label}
                        </div>
                        <StarRating
                          value={diagScores[dim.key] ?? 0}
                          onChange={v => setDiagScores(s => ({ ...s, [dim.key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                  {DIAG_DIMENSIONS.every(d => diagScores[d.key]) && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Algum comentário? (opcional)</label>
                      <textarea value={diagComentario} onChange={e => setDiagComentario(e.target.value)} rows={3}
                        placeholder="Nos conte mais sobre sua experiência..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure transition-colors resize-none" />
                    </div>
                  )}
                </>
              )}

              {/* ── MOTIVO ── */}
              {template === 'MOTIVO' && (
                <>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-slate-800">Como você nos conheceu?</p>
                    <div className="flex flex-wrap gap-2">
                      {MOTIVO_ORIGEM.map(op => (
                        <Chip key={op} label={op} selected={motivoOrigem === op} onClick={() => setMotivoOrigem(op)} />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-slate-800">O que te motivou a comprar hoje? <span className="font-normal text-slate-400">(pode marcar mais de um)</span></p>
                    <div className="flex flex-wrap gap-2">
                      {MOTIVO_COMPRA.map(op => (
                        <Chip
                          key={op}
                          label={op}
                          selected={motivoCompra.includes(op)}
                          onClick={() => setMotivoCompra(prev =>
                            prev.includes(op) ? prev.filter(x => x !== op) : [...prev, op]
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-800">É a sua primeira compra aqui?</p>
                    <div className="flex gap-3">
                      {([true, false] as const).map(val => (
                        <button
                          key={String(val)}
                          onClick={() => setMotivoPrimeira(val)}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${
                            motivoPrimeira === val
                              ? 'border-primary bg-navy-ghost text-azure'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {val ? 'Sim, primeira vez!' : 'Não, já sou cliente'}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-azure-dark disabled:opacity-40 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                {submitting ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
