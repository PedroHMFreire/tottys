// src/components/settings/FiscalSettingsModal.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { X, FileText, Loader2, Check, Info } from 'lucide-react'

type Provider = 'nenhum' | 'focus_nfe'
type Ambiente = 'homologacao' | 'producao'

interface FiscalConfig {
  fiscal_provider: Provider
  cnpj_emitente: string
  csc_id: string
  csc_token: string
  serie: string
  proxima_nfce: number
  ambiente_fiscal: Ambiente
}

const PROVIDER_LABELS: Record<Provider, string> = {
  nenhum:    'Nenhum (desativado)',
  focus_nfe: 'Focus NFe (ativo)',
}

export default function FiscalSettingsModal({ onClose }: { onClose: () => void }) {
  const { store } = useApp()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<FiscalConfig>({
    fiscal_provider: 'nenhum',
    cnpj_emitente: '',
    csc_id: '',
    csc_token: '',
    serie: '001',
    proxima_nfce: 1,
    ambiente_fiscal: 'homologacao',
  })

  useEffect(() => {
    if (!store?.id) return
    setLoading(true)
    supabase
      .from('stores')
      .select('fiscal_provider,cnpj_emitente,csc_id,csc_token,serie,proxima_nfce,ambiente_fiscal')
      .eq('id', store.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setForm({
            fiscal_provider: (data.fiscal_provider as Provider) || 'nenhum',
            cnpj_emitente:   data.cnpj_emitente   || '',
            csc_id:          data.csc_id           || '',
            csc_token:       data.csc_token        || '',
            serie:           data.serie            || '001',
            proxima_nfce:    data.proxima_nfce     || 1,
            ambiente_fiscal: (data.ambiente_fiscal as Ambiente) || 'homologacao',
          })
        }
        setLoading(false)
      })
  }, [store?.id])

  function set<K extends keyof FiscalConfig>(k: K, v: FiscalConfig[K]) {
    setForm(f => ({ ...f, [k]: v }))
    setSaved(false)
  }

  async function handleSave() {
    if (!store?.id) return
    setSaving(true)
    await supabase.from('stores').update(form).eq('id', store.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={17} className="text-azure" />
            <span className="text-sm font-semibold text-slate-800">Provedor Fiscal</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="text-slate-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Nota software house */}
              <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3">
                <Info size={14} className="text-azure shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">
                  A conexão com o SEFAZ é gerenciada pelo sistema Tottys. Configure abaixo apenas os dados fiscais da sua empresa.
                </p>
              </div>

              {/* Provedor */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Emissão de NFC-e</label>
                <select
                  value={form.fiscal_provider}
                  onChange={e => set('fiscal_provider', e.target.value as Provider)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure bg-white"
                >
                  {(Object.keys(PROVIDER_LABELS) as Provider[]).map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              {form.fiscal_provider !== 'nenhum' && (
                <>
                  {/* Ambiente */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ambiente</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['homologacao', 'producao'] as const).map(a => (
                        <button
                          key={a}
                          onClick={() => set('ambiente_fiscal', a)}
                          className={`py-2.5 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.ambiente_fiscal === a ? 'border-azure bg-navy-ghost text-azure' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        >
                          {a === 'homologacao' ? 'Homologação' : 'Produção'}
                        </button>
                      ))}
                    </div>
                    {form.ambiente_fiscal === 'producao' && (
                      <div className="text-xs text-amber-600 bg-amber-50 rounded-xl p-2">
                        Produção emite documentos fiscais reais com validade legal.
                      </div>
                    )}
                  </div>

                  {/* CNPJ emitente */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CNPJ do emitente</label>
                    <input
                      type="text"
                      value={form.cnpj_emitente}
                      onChange={e => set('cnpj_emitente', e.target.value.replace(/\D/g, '').slice(0, 14))}
                      placeholder="00000000000000"
                      maxLength={14}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure font-mono"
                    />
                    <div className="text-xs text-slate-400">Apenas dígitos. CNPJ registrado na SEFAZ.</div>
                  </div>

                  {/* CSC */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CSC (Código de Segurança do Contribuinte)</div>
                    <div className="text-xs text-slate-400 -mt-2">Gerado no portal da SEFAZ do seu estado. Necessário para o QR Code da NFC-e.</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-500">ID do CSC</label>
                        <input
                          type="text"
                          value={form.csc_id}
                          onChange={e => set('csc_id', e.target.value)}
                          placeholder="000001"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-slate-500">Token CSC</label>
                        <input
                          type="password"
                          value={form.csc_token}
                          onChange={e => set('csc_token', e.target.value)}
                          placeholder="Token do CSC"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Série + Próximo número */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Série NFC-e</label>
                      <input
                        type="text"
                        value={form.serie}
                        onChange={e => set('serie', e.target.value.slice(0, 3))}
                        placeholder="001"
                        maxLength={3}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure font-mono text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Próximo Nº</label>
                      <input
                        type="number"
                        min={1}
                        value={form.proxima_nfce}
                        onChange={e => set('proxima_nfce', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure font-mono text-center"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="h-11 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-11 flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-azure-dark disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
            {saved ? 'Salvo!' : 'Salvar configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
