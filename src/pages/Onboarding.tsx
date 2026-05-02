import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import ProductCSVImport from '@/components/onboarding/ProductCSVImport'
import CustomerCSVImport from '@/components/onboarding/CustomerCSVImport'
import CrediarioImport from '@/components/onboarding/CrediarioImport'
import { maskCNPJ, validateCNPJ, UF_LIST, REGIME_LIST } from '@/lib/validators'

const ALL_AREAS = [
  'PDV','RELATORIOS_DIA','RELATORIOS','PRODUTOS','PRODUTOS_EDIT',
  'ESTOQUE_VIEW','ESTOQUE_ADMIN','FISCAL','CONFIG','USERS','ADM_ROOT',
] as const

type WizardStep = 'empresa' | 'produtos' | 'clientes' | 'crediario' | 'pronto'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'empresa',   label: 'Empresa'  },
  { key: 'produtos',  label: 'Produtos' },
  { key: 'clientes',  label: 'Clientes' },
  { key: 'crediario', label: 'Crediário'},
]

function StepBar({ current }: { current: WizardStep }) {
  const idx = STEPS.findIndex(s => s.key === current)
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1 flex-1">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${i <= idx ? 'bg-primary text-white' : 'bg-zinc-200 text-slate-400'}`}>
            {i < idx ? '✓' : i + 1}
          </div>
          <div className={`text-xs hidden sm:block ${i <= idx ? 'text-navy font-medium' : 'text-slate-400'}`}>
            {s.label}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 ${i < idx ? 'bg-primary' : 'bg-zinc-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<WizardStep>('empresa')

  // Company/store form
  const [companyName, setCompanyName] = useState('')
  const [companyCnpj, setCompanyCnpj] = useState('')
  const [companyRegime, setCompanyRegime] = useState('')
  const [storeName, setStoreName] = useState('Loja Principal')
  const [storeUf, setStoreUf] = useState('')
  const [storeCity, setStoreCity] = useState('')
  const [caixaInicial, setCaixaInicial] = useState('')

  // Created IDs (passed to import steps)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  // Summary counters
  const [prodCount, setProdCount] = useState(0)
  const [custCount, setCustCount] = useState(0)
  const [credCount, setCredCount] = useState(0)

  const suggestedCompany = useMemo(() => {
    if (!userName) return ''
    return `Loja de ${userName.split(' ')[0]}`
  }, [userName])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        if (!mounted) return
        setUserId(user.id)
        setUserName((user.user_metadata as any)?.nome ?? user.email ?? null)

        const { data: prof } = await supabase
          .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
        // Se já tem empresa, pula criação e vai direto para importação
        if (prof?.company_id) {
          setCompanyId(prof.company_id)
          // Busca store da empresa
          const { data: st } = await supabase
            .from('stores').select('id').eq('company_id', prof.company_id).limit(1).maybeSingle()
          if (st?.id) setStoreId(st.id)
          setStep('produtos')
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Erro ao iniciar.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    if (!companyName && suggestedCompany) setCompanyName(suggestedCompany)
  }, [suggestedCompany])

  async function createCompany() {
    if (!companyName.trim()) { setError('Informe o nome da empresa.'); return }
    if (!storeUf.trim()) { setError('Informe o estado (UF) da loja.'); return }
    if (!userId) { setError('Sessão inválida. Faça login novamente.'); return }
    const cnpjDigits = companyCnpj.replace(/\D/g, '')
    if (cnpjDigits && !validateCNPJ(cnpjDigits)) { setError('CNPJ inválido. Verifique os dígitos.'); return }

    setSaving(true); setError(null)
    try {
      let cId: string | null = null
      let sId: string | null = null

      const rpc = await supabase.rpc('create_company_with_store', {
        p_nome: companyName.trim(),
        p_cnpj: companyCnpj.trim() || null,
        p_regime: companyRegime.trim() || null,
        p_create_store: true,
        p_store_nome: storeName.trim() || 'Loja Principal',
        p_store_uf: storeUf.trim().toUpperCase(),
        p_ambiente: 'homologacao',
      })

      if (!rpc.error && rpc.data) {
        cId = rpc.data as string
      } else {
        const { data, error } = await supabase
          .from('companies')
          .insert({ nome: companyName.trim(), cnpj: companyCnpj.trim() || null, regime_tributario: companyRegime.trim() || null })
          .select('id').single()
        if (error) throw error
        cId = data?.id ?? null
        if (cId) {
          const { data: st, error: stErr } = await supabase
            .from('stores')
            .insert({ company_id: cId, nome: storeName.trim() || 'Loja Principal', uf: storeUf.trim().toUpperCase(), ambiente_fiscal: 'homologacao' })
            .select('id').single()
          if (stErr) throw stErr
          sId = st?.id ?? null
        }
      }

      if (!cId) throw new Error('Falha ao criar empresa.')

      // Busca store_id se não veio do RPC
      if (!sId) {
        const { data: st } = await supabase.from('stores').select('id').eq('company_id', cId).limit(1).maybeSingle()
        sId = st?.id ?? null
      }

      await supabase.from('profiles').update({ company_id: cId }).eq('id', userId)
      await Promise.allSettled(
        ALL_AREAS.map(area => supabase.rpc('grant_user_area', { p_user_id: userId, p_area_code: area }))
      )

      // Saldo inicial de caixa
      const caixaNum = parseFloat(caixaInicial.replace(',', '.'))
      if (sId && caixaInicial && !isNaN(caixaNum) && caixaNum > 0) {
        await supabase.from('cash_registers').insert({
          store_id: sId,
          user_id: userId,
          valor_inicial: caixaNum,
          status: 'ABERTO',
          abertura_at: new Date().toISOString(),
        })
      }

      setCompanyId(cId)
      setStoreId(sId)
      setStep('produtos')
    } catch (e: any) {
      setError(e?.message || 'Não foi possível criar a empresa.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-400">Preparando seu acesso…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 dark:from-slate-900 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo / título */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Importar dados</h1>
          <p className="text-sm text-slate-400 mt-1">Suba seus produtos, clientes e crediário de uma vez.</p>
        </div>

        {/* Step bar (exceto pronto) */}
        {step !== 'pronto' && <StepBar current={step} />}

        <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm">

          {/* ══════ STEP 1: EMPRESA ══════ */}
          {step === 'empresa' && (
            <>
              <div>
                <div className="font-semibold text-lg mb-0.5">Sua empresa e loja</div>
                <div className="text-sm text-slate-400">Leva menos de 2 minutos.</div>
              </div>

              {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

              <div className="space-y-3">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Nome da empresa *</div>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Ex.: Tottys Moda Feminina"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">CNPJ</div>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      value={companyCnpj}
                      onChange={e => setCompanyCnpj(maskCNPJ(e.target.value))}
                      placeholder="00.000.000/0000-00"
                      maxLength={18}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Regime tributário</div>
                    <select
                      className="w-full rounded-xl border px-3 py-2 bg-white"
                      value={companyRegime}
                      onChange={e => setCompanyRegime(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {REGIME_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <hr className="border-zinc-100" />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Nome da loja</div>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      value={storeName}
                      onChange={e => setStoreName(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Estado (UF) *</div>
                    <select
                      className="w-full rounded-xl border px-3 py-2 bg-white"
                      value={storeUf}
                      onChange={e => setStoreUf(e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1">Saldo atual do caixa (opcional)</div>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full rounded-xl border px-3 py-2"
                    value={caixaInicial}
                    onChange={e => setCaixaInicial(e.target.value)}
                    placeholder="0,00 — abre o caixa automaticamente"
                  />
                  <div className="text-xs text-slate-400 mt-0.5">
                    Se informado, o caixa já abre com esse saldo.
                  </div>
                </div>
              </div>

              <Button onClick={createCompany} disabled={saving} className="w-full">
                {saving ? 'Criando...' : 'Criar empresa e continuar →'}
              </Button>
            </>
          )}

          {/* ══════ STEP 2: PRODUTOS ══════ */}
          {step === 'produtos' && companyId && (
            <ProductCSVImport
              companyId={companyId}
              storeId={storeId}
              onDone={n => { setProdCount(n); setStep('clientes') }}
              onSkip={() => setStep('clientes')}
            />
          )}

          {/* ══════ STEP 3: CLIENTES ══════ */}
          {step === 'clientes' && companyId && (
            <CustomerCSVImport
              companyId={companyId}
              onDone={n => { setCustCount(n); setStep('crediario') }}
              onSkip={() => setStep('crediario')}
            />
          )}

          {/* ══════ STEP 4: CREDIÁRIO ══════ */}
          {step === 'crediario' && companyId && (
            <CrediarioImport
              companyId={companyId}
              storeId={storeId}
              onDone={n => { setCredCount(n); setStep('pronto') }}
              onSkip={() => setStep('pronto')}
            />
          )}

          {/* ══════ STEP PRONTO ══════ */}
          {step === 'pronto' && (
            <div className="text-center space-y-4 py-2">
              <div className="text-5xl">🎉</div>
              <div>
                <div className="font-bold text-xl">Tudo pronto!</div>
                <div className="text-sm text-slate-400 mt-1">Sua loja está configurada e pronta para vender.</div>
              </div>

              {/* Resumo */}
              <div className="rounded-xl border bg-zinc-50 p-4 text-sm text-left space-y-1.5">
                <div className="font-medium text-navy mb-2">Resumo da importação</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Produtos importados</span>
                  <span className={`font-medium ${prodCount > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                    {prodCount > 0 ? `${prodCount} produto${prodCount !== 1 ? 's' : ''}` : 'Nenhum (pode adicionar depois)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Clientes importados</span>
                  <span className={`font-medium ${custCount > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                    {custCount > 0 ? `${custCount} cliente${custCount !== 1 ? 's' : ''}` : 'Nenhum (pode adicionar depois)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Crediários migrados</span>
                  <span className={`font-medium ${credCount > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                    {credCount > 0 ? `${credCount} crediário${credCount !== 1 ? 's' : ''}` : 'Nenhum'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => navigate('/adm')}>
                  Ir para a retaguarda
                </Button>
                <Button onClick={() => navigate('/loja/sell')}>
                  Abrir o PDV →
                </Button>
              </div>

              <div className="text-xs text-slate-400">
                Você pode importar mais dados a qualquer momento nas configurações.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
