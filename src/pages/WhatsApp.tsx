import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import {
  Smartphone, Plus, Loader2, X, Send, RefreshCw,
  CheckCircle2, XCircle, Clock, MessageCircle, Store,
} from 'lucide-react'

type WaInstance = {
  id: string
  label: string
  instance_name: string
  status: 'disconnected' | 'connecting' | 'connected'
  phone: string | null
  store_id: string | null
  qr_code: string | null
}

type WaConversation = {
  id: string
  instance_id: string
  contact_name: string | null
  contact_phone: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  customer_id: string | null
}

type WaMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  status: string
  created_at: string
}

type StoreOpt = { id: string; nome: string }

function StatusBadge({ status }: { status: WaInstance['status'] }) {
  if (status === 'connected') return (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
      <CheckCircle2 size={12} /> Conectado
    </span>
  )
  if (status === 'connecting') return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-500">
      <Clock size={12} /> Aguardando scan
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
      <XCircle size={12} /> Desconectado
    </span>
  )
}

export default function WhatsApp() {
  const { company } = useApp()
  const [tab, setTab] = useState<'connections' | 'inbox'>('connections')

  // ── Instâncias ──
  const [instances, setInstances] = useState<WaInstance[]>([])
  const [loadingInst, setLoadingInst] = useState(false)
  const [showNewInst, setShowNewInst] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newStoreId, setNewStoreId] = useState<string>('')
  const [savingInst, setSavingInst] = useState(false)
  const [storeList, setStoreList] = useState<StoreOpt[]>([])

  // ── QR Modal ──
  const [qrInstance, setQrInstance] = useState<WaInstance | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const qrIntervalRef = useRef<number | null>(null)

  // ── Inbox ──
  const [selectedInstance, setSelectedInstance] = useState<WaInstance | null>(null)
  const [conversations, setConversations] = useState<WaConversation[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [selectedConv, setSelectedConv] = useState<WaConversation | null>(null)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sendText, setSendText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Load ──
  useEffect(() => {
    if (company?.id) { loadInstances(); loadStores() }
  }, [company?.id])

  async function loadInstances() {
    if (!company?.id) return
    setLoadingInst(true)
    const { data } = await supabase
      .from('wa_instances')
      .select('id, label, instance_name, status, phone, store_id, qr_code')
      .eq('company_id', company.id)
      .order('created_at')
    setInstances((data ?? []) as WaInstance[])
    setLoadingInst(false)
  }

  async function loadStores() {
    if (!company?.id) return
    const { data } = await supabase.from('stores').select('id, nome').eq('company_id', company.id).order('nome')
    setStoreList((data ?? []) as StoreOpt[])
  }

  // Realtime para status das instâncias (QR + conexão)
  useEffect(() => {
    if (!company?.id) return
    const channel = supabase
      .channel('wa_instances_changes')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'wa_instances',
        filter: `company_id=eq.${company.id}`,
      }, payload => {
        const updated = payload.new as WaInstance
        setInstances(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))

        // Se estava mostrando QR desta instância, atualiza
        if (qrInstance?.id === updated.id) {
          if (updated.status === 'connected') {
            closeQrModal()
          } else if (updated.qr_code) {
            setQrCode(updated.qr_code)
          }
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [company?.id, qrInstance?.id])

  // ── Nova instância ──
  function instanceName(label: string) {
    return `tottys-${company!.id.slice(0, 8)}-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20)}-${Date.now().toString(36)}`
  }

  async function createInstance() {
    if (!company?.id || !newLabel.trim()) return
    setSavingInst(true)
    try {
      const { data, error } = await supabase.from('wa_instances').insert({
        company_id: company.id,
        store_id: newStoreId || null,
        instance_name: instanceName(newLabel.trim()),
        label: newLabel.trim(),
        status: 'disconnected',
      }).select('id, label, instance_name, status, phone, store_id, qr_code').single()

      if (error) throw error
      setInstances(prev => [...prev, data as WaInstance])
      setNewLabel('')
      setNewStoreId('')
      setShowNewInst(false)
    } finally {
      setSavingInst(false)
    }
  }

  // ── QR ──
  async function openQr(inst: WaInstance) {
    setQrInstance(inst)
    setQrCode(null)
    setLoadingQr(true)
    await fetchQr(inst)
    setLoadingQr(false)

    // Refresca QR a cada 25s (expiração WhatsApp)
    qrIntervalRef.current = window.setInterval(() => fetchQr(inst), 25_000)
  }

  async function fetchQr(inst: WaInstance) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await supabase.functions.invoke('fn-wa-qr', {
        body: { instance_id: inst.id },
      })
      if (res.data?.qr) setQrCode(res.data.qr)
      if (res.data?.status === 'connected') closeQrModal()
    } catch { /* silently ignore */ }
  }

  function closeQrModal() {
    setQrInstance(null)
    setQrCode(null)
    if (qrIntervalRef.current) {
      clearInterval(qrIntervalRef.current)
      qrIntervalRef.current = null
    }
    loadInstances()
  }

  async function disconnectInstance(inst: WaInstance) {
    if (!confirm(`Desconectar "${inst.label}"?`)) return
    await supabase.from('wa_instances').update({ status: 'disconnected', phone: null, qr_code: null }).eq('id', inst.id)
    loadInstances()
  }

  async function deleteInstance(inst: WaInstance) {
    if (!confirm(`Excluir "${inst.label}"? Esta ação não pode ser desfeita.`)) return
    await supabase.from('wa_instances').delete().eq('id', inst.id)
    setInstances(prev => prev.filter(i => i.id !== inst.id))
  }

  // ── Inbox ──
  async function loadConversations(inst: WaInstance) {
    setSelectedInstance(inst)
    setSelectedConv(null)
    setMessages([])
    setLoadingConvs(true)
    const { data } = await supabase
      .from('wa_conversations')
      .select('id, instance_id, contact_name, contact_phone, last_message, last_message_at, unread_count, customer_id')
      .eq('instance_id', inst.id)
      .order('last_message_at', { ascending: false })
      .limit(50)
    setConversations((data ?? []) as WaConversation[])
    setLoadingConvs(false)
  }

  async function openConversation(conv: WaConversation) {
    setSelectedConv(conv)
    setLoadingMsgs(true)
    // Zera unread
    if (conv.unread_count > 0) {
      await supabase.from('wa_conversations').update({ unread_count: 0 }).eq('id', conv.id)
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    }
    const { data } = await supabase
      .from('wa_messages')
      .select('id, direction, content, status, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages((data ?? []) as WaMessage[])
    setLoadingMsgs(false)
  }

  // Scroll automático ao fim das mensagens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime para novas mensagens
  useEffect(() => {
    if (!selectedConv?.id) return
    const channel = supabase
      .channel(`wa_messages_${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'wa_messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as WaMessage])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedConv?.id])

  // Realtime para atualizar lista de conversas (última mensagem)
  useEffect(() => {
    if (!selectedInstance?.id) return
    const channel = supabase
      .channel(`wa_convs_${selectedInstance.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'wa_conversations',
        filter: `instance_id=eq.${selectedInstance.id}`,
      }, payload => {
        const updated = payload.new as WaConversation
        setConversations(prev => {
          const exists = prev.find(c => c.id === updated.id)
          if (exists) return prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
          return [updated, ...prev]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedInstance?.id])

  async function sendMessage() {
    if (!selectedConv || !sendText.trim() || sending) return
    setSending(true)
    const text = sendText.trim()
    setSendText('')

    // Mensagem otimista
    const tempMsg: WaMessage = {
      id: crypto.randomUUID(),
      direction: 'outbound',
      content: text,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await supabase.functions.invoke('fn-wa-send', {
        body: { conversation_id: selectedConv.id, text },
      })
      if (res.error || !res.data?.ok) throw new Error(res.data?.error ?? 'Falha ao enviar')
      // Remove mensagem otimista (realtime ou reload vai trazer a real)
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === tempMsg.id ? { ...m, status: 'failed' } : m
      ))
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function formatTime(iso: string | null) {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    return isToday
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }

  const connectedInstances = instances.filter(i => i.status === 'connected')

  if (!company?.id) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center text-slate-400 text-sm">
        Selecione uma empresa para acessar o WhatsApp.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">

      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
            <Smartphone size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-base leading-none">WhatsApp</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {connectedInstances.length} número{connectedInstances.length !== 1 ? 's' : ''} conectado{connectedInstances.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {(['connections', 'inbox'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'connections' ? 'Conexões' : 'Inbox'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Conexões ── */}
      {tab === 'connections' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-xl mx-auto space-y-3">

            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-500">
                Conecte números de WhatsApp via QR Code. Cada número = uma instância.
              </p>
              <button
                onClick={() => setShowNewInst(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-azure hover:text-azure-dark transition-colors cursor-pointer shrink-0"
              >
                <Plus size={13} /> Nova conexão
              </button>
            </div>

            {/* Form nova instância */}
            {showNewInst && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="text-sm font-semibold">Nova conexão WhatsApp</div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Nome / identificação</div>
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Ex: Loja Matriz, Atendimento..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure"
                    autoFocus
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Loja (opcional — deixe vazio para empresa toda)</div>
                  <select
                    value={newStoreId}
                    onChange={e => setNewStoreId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-azure cursor-pointer"
                  >
                    <option value="">Empresa toda</option>
                    {storeList.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowNewInst(false)} className="flex-1 border rounded-xl py-2 text-sm text-slate-500 hover:bg-white cursor-pointer">Cancelar</button>
                  <button
                    onClick={createInstance}
                    disabled={!newLabel.trim() || savingInst}
                    className="flex-1 bg-primary text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-40 cursor-pointer hover:bg-azure-dark"
                  >
                    {savingInst ? 'Criando…' : 'Criar'}
                  </button>
                </div>
              </div>
            )}

            {/* Lista de instâncias */}
            {loadingInst ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 size={20} className="animate-spin mr-2" /> Carregando…
              </div>
            ) : instances.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
                <Smartphone size={32} className="mx-auto mb-3 opacity-30" />
                <div className="font-medium text-navy mb-1">Nenhuma conexão ainda</div>
                <div className="text-sm">Crie uma nova conexão e escaneie o QR Code com seu WhatsApp.</div>
              </div>
            ) : (
              instances.map(inst => (
                <div key={inst.id} className="rounded-2xl border bg-white p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${inst.status === 'connected' ? 'bg-emerald-100' : inst.status === 'connecting' ? 'bg-amber-100' : 'bg-slate-100'}`}>
                    <Smartphone size={16} className={inst.status === 'connected' ? 'text-emerald-600' : inst.status === 'connecting' ? 'text-amber-500' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-800 truncate">{inst.label}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <StatusBadge status={inst.status} />
                      {inst.phone && <span className="text-xs text-slate-400">{inst.phone}</span>}
                      {inst.store_id && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-400">
                          <Store size={10} />{storeList.find(s => s.id === inst.store_id)?.nome}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {inst.status !== 'connected' && (
                      <button
                        onClick={() => openQr(inst)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-primary text-white font-semibold hover:bg-azure-dark transition-colors cursor-pointer"
                      >
                        {inst.status === 'connecting' ? 'Ver QR' : 'Conectar'}
                      </button>
                    )}
                    {inst.status === 'connected' && (
                      <button
                        onClick={() => { setTab('inbox'); loadConversations(inst) }}
                        className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Inbox
                      </button>
                    )}
                    {inst.status === 'connected' && (
                      <button onClick={() => disconnectInstance(inst)} className="text-xs text-slate-400 hover:text-amber-600 transition-colors cursor-pointer px-1">Desconectar</button>
                    )}
                    <button onClick={() => deleteInstance(inst)} className="text-slate-300 hover:text-rose-500 transition-colors cursor-pointer p-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Inbox ── */}
      {tab === 'inbox' && (
        <div className="flex-1 flex min-h-0">

          {/* Sidebar: instâncias + conversas */}
          <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col">

            {/* Seletor de instância */}
            <div className="border-b border-slate-100 p-3">
              <select
                value={selectedInstance?.id ?? ''}
                onChange={e => {
                  const inst = instances.find(i => i.id === e.target.value)
                  if (inst) loadConversations(inst)
                }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-azure cursor-pointer"
              >
                <option value="">Selecionar número…</option>
                {instances.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.label}{i.status === 'connected' ? '' : ' (desconectado)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Lista de conversas */}
            <div className="flex-1 overflow-y-auto">
              {!selectedInstance ? (
                <div className="p-4 text-center text-xs text-slate-400 mt-4">
                  Selecione um número para ver as conversas.
                </div>
              ) : loadingConvs ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 size={18} className="animate-spin mr-2" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 mt-4">
                  <MessageCircle size={24} className="mx-auto mb-2 opacity-30" />
                  Nenhuma conversa ainda.
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${selectedConv?.id === conv.id ? 'bg-navy-ghost' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-800 truncate">
                          {conv.contact_name || conv.contact_phone || 'Desconhecido'}
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {conv.last_message ?? '—'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] text-slate-400">{formatTime(conv.last_message_at)}</div>
                        {conv.unread_count > 0 && (
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-bold mt-1">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Área de chat */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedConv ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <MessageCircle size={40} className="mx-auto mb-3 opacity-20" />
                  <div className="text-sm">Selecione uma conversa</div>
                </div>
              </div>
            ) : (
              <>
                {/* Header do chat */}
                <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                    {(selectedConv.contact_name ?? selectedConv.contact_phone ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-800 truncate">
                      {selectedConv.contact_name || selectedConv.contact_phone || 'Desconhecido'}
                    </div>
                    {selectedConv.contact_phone && selectedConv.contact_name && (
                      <div className="text-xs text-slate-400">{selectedConv.contact_phone}</div>
                    )}
                  </div>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 bg-slate-50">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-10 text-slate-400">
                      <Loader2 size={18} className="animate-spin mr-2" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-xs text-slate-400 py-8">Sem mensagens nesta conversa.</div>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.direction === 'outbound'
                            ? `bg-emerald-500 text-white rounded-tr-sm ${msg.status === 'failed' ? 'opacity-60' : ''}`
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                        }`}>
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                          <div className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-emerald-100' : 'text-slate-400'}`}>
                            {formatTime(msg.created_at)}
                            {msg.status === 'failed' && ' · falhou'}
                            {msg.status === 'pending' && ' · enviando…'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Input de envio */}
                <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 flex items-end gap-2">
                  {selectedInstance?.status !== 'connected' && (
                    <div className="flex-1 text-xs text-amber-600 text-center py-2">
                      Instância desconectada. Reconecte na aba Conexões.
                    </div>
                  )}
                  {selectedInstance?.status === 'connected' && (
                    <>
                      <textarea
                        ref={inputRef}
                        value={sendText}
                        onChange={e => setSendText(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Escreva uma mensagem… (Enter para enviar)"
                        rows={1}
                        disabled={sending}
                        className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-400 transition-colors min-h-[42px] max-h-[120px] overflow-y-auto"
                        style={{ fieldSizing: 'content' } as any}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!sendText.trim() || sending}
                        className="h-[42px] w-[42px] flex items-center justify-center rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                      >
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal QR Code ── */}
      {qrInstance && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Conectar {qrInstance.label}</h2>
              <button onClick={closeQrModal} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1">
                <X size={18} />
              </button>
            </div>

            {loadingQr ? (
              <div className="flex items-center justify-center h-52 text-slate-400">
                <Loader2 size={24} className="animate-spin mr-2" /> Gerando QR…
              </div>
            ) : qrCode ? (
              <>
                <img
                  src={qrCode}
                  alt="QR Code WhatsApp"
                  className="mx-auto rounded-xl border border-slate-100 w-52 h-52 object-contain"
                />
                <div className="text-xs text-slate-500 leading-relaxed">
                  Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo → Escaneie este QR.
                </div>
                <div className="text-xs text-amber-500">QR atualiza automaticamente a cada 25 segundos.</div>
                <button
                  onClick={() => fetchQr(qrInstance)}
                  className="flex items-center gap-1.5 mx-auto text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <RefreshCw size={12} /> Atualizar QR manualmente
                </button>
              </>
            ) : (
              <div className="text-sm text-rose-500 py-8">
                Não foi possível gerar o QR. Verifique a configuração da Evolution API.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
