// src/components/settings/PrinterSettingsModal.tsx
import React, { useState } from 'react'
import { useApp } from '@/state/store'
import { usePrinterConfig, type PrinterConfig } from '@/hooks/usePrinterConfig'
import { useThermalPrint } from '@/hooks/useThermalPrint'
import ThermalReceipt from '@/components/print/ThermalReceipt'
import { X, Printer, Loader2, Check } from 'lucide-react'

const MODELS = [
  { value: 'generic',    label: 'Genérica (qualquer)' },
  { value: 'epson_tm',   label: 'Epson TM-T20 / T88' },
  { value: 'bematech',   label: 'Bematech MP-4200 / MP-100' },
  { value: 'daruma',     label: 'Daruma DR-700 / DR-800' },
  { value: 'elgin',      label: 'Elgin i9 / i7' },
]

const CONNECTIONS = [
  { value: 'usb',     label: 'USB (via driver do sistema)' },
  { value: 'network', label: 'Rede / Wi-Fi (IP + Porta)' },
  { value: 'serial',  label: 'Serial / COM' },
]

const MODOS = [
  { value: 'perguntar', label: 'Perguntar após cada venda' },
  { value: 'fiscal',    label: 'Emitir NFC-e automaticamente' },
  { value: 'modelo',    label: 'Cupom modelo automaticamente' },
]

export default function PrinterSettingsModal({ onClose }: { onClose: () => void }) {
  const { company, store } = useApp()
  const { config, loading, save } = usePrinterConfig()
  const { print } = useThermalPrint()

  const [form, setForm] = useState<PrinterConfig>({ ...config })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showTestReceipt, setShowTestReceipt] = useState(false)

  React.useEffect(() => { setForm({ ...config }) }, [config.store_id])

  function set<K extends keyof PrinterConfig>(k: K, v: PrinterConfig[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    await save(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleTestPrint() {
    setShowTestReceipt(true)
    setTimeout(() => {
      print(form.paper_width as 58 | 80)
      setTimeout(() => setShowTestReceipt(false), 500)
    }, 100)
  }

  return (
    <>
      {/* Receipt fantasma para teste de impressão */}
      {showTestReceipt && (
        <div style={{ position: 'fixed', top: -9999, left: -9999 }}>
          <ThermalReceipt
            saleId="TEST0001"
            createdAt={new Date().toISOString()}
            total={199.90}
            subtotal={219.80}
            desconto={19.90}
            items={[
              { nome: 'Calça Jeans Slim Azul', qtde: 1, preco_unit: 149.90 },
              { nome: 'Blusa Listrada P', qtde: 2, preco_unit: 34.95 },
            ]}
            payments={[
              { meio: 'DINHEIRO', valor: 200.00 },
            ]}
            companyNome={company?.nome || 'EMPRESA MODELO'}
            companyCnpj={company?.cnpj}
            storeNome={store?.nome}
            modo="modelo"
            paperWidth={form.paper_width as 58 | 80}
          />
        </div>
      )}

      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full sm:max-w-md lg:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Printer size={17} className="text-azure" />
              <span className="text-sm font-semibold text-slate-800">Impressora Térmica</span>
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
                {/* Modelo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Modelo</label>
                  <select
                    value={form.model}
                    onChange={e => set('model', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure bg-white"
                  >
                    {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                {/* Largura do papel */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Largura do papel</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([58, 80] as const).map(w => (
                      <button
                        key={w}
                        onClick={() => set('paper_width', w)}
                        className={`py-3 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.paper_width === w ? 'border-azure bg-navy-ghost text-azure' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {w} mm
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400">58mm: compacta · 80mm: padrão varejo</div>
                </div>

                {/* Conexão */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo de conexão</label>
                  <select
                    value={form.connection}
                    onChange={e => set('connection', e.target.value as PrinterConfig['connection'])}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure bg-white"
                  >
                    {CONNECTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                {/* IP + Porta (apenas se rede) */}
                {form.connection === 'network' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Endereço IP</label>
                      <input
                        type="text"
                        value={form.ip_address || ''}
                        onChange={e => set('ip_address', e.target.value || null)}
                        placeholder="192.168.1.100"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Porta</label>
                      <input
                        type="number"
                        value={form.port || 9100}
                        onChange={e => set('port', Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure"
                      />
                    </div>
                  </div>
                )}

                {/* Modo padrão */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comportamento após venda</label>
                  <select
                    value={form.modo_padrao}
                    onChange={e => set('modo_padrao', e.target.value as PrinterConfig['modo_padrao'])}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-azure bg-white"
                  >
                    {MODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                {/* Cópias */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cópias por venda</label>
                  <div className="flex items-center gap-3">
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => set('copies', n)}
                        className={`w-12 h-10 rounded-xl border-2 text-sm font-medium transition-colors cursor-pointer ${form.copies === n ? 'border-azure bg-navy-ghost text-azure' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Impressão automática */}
                <div className="flex items-center justify-between py-2 border-t border-slate-100">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Impressão automática</div>
                    <div className="text-xs text-slate-400">Não exibir prévia — imprimir direto</div>
                  </div>
                  <button
                    onClick={() => set('auto_print', !form.auto_print)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${form.auto_print ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.auto_print ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Rodapé */}
          <div className="px-4 pb-4 pt-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
            <button
              onClick={handleTestPrint}
              className="h-11 px-4 flex items-center gap-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <Printer size={14} />
              Testar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-11 flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-azure-dark disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
              {saved ? 'Salvo!' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
