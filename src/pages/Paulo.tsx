// /adm/paulo — Paulo, Gerente Geral de Vendas com IA
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { Send, Loader2, RefreshCw, BrainCircuit } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const QUICK_ACTIONS = [
  'Como está o dia?',
  'Ranking da equipe',
  'O que devo priorizar agora?',
  'Relatório do mês',
  'Alerta de metas',
  'Clientes em risco',
]

function formatMessage(text: string) {
  // Quebras de linha viram <br>, mantém emojis e formatação simples
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {line}
      {i < text.split('\n').length - 1 && <br />}
    </span>
  ))
}

function Avatar({ role, userName }: { role: 'user' | 'assistant'; userName?: string }) {
  if (role === 'assistant') {
    return (
      <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center shrink-0 text-white font-bold text-sm">
        P
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 text-slate-600 font-bold text-sm">
      {(userName?.charAt(0) || 'U').toUpperCase()}
    </div>
  )
}

export default function Paulo() {
  const { company, store } = useApp()
  const [messages, setMessages]         = useState<Message[]>([])
  const [conversationId, setConvId]     = useState<string | null>(null)
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [userName, setUserName]         = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  // Carrega nome do usuário
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('nome').eq('id', user.id).maybeSingle()
        .then(({ data }) => setUserName(data?.nome || user.email || 'Você'))
    })
  }, [])

  // Carrega ou cria conversa
  useEffect(() => {
    if (!company?.id) { setInitializing(false); return }
    loadOrCreateConversation()
  }, [company?.id])

  async function loadOrCreateConversation() {
    setInitializing(true)
    // Busca conversa mais recente desta empresa
    const { data: conv } = await supabase
      .from('paulo_conversations')
      .select('id')
      .eq('company_id', company!.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (conv?.id) {
      setConvId(conv.id)
      const { data: msgs } = await supabase
        .from('paulo_messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
      setMessages((msgs ?? []) as Message[])
    }
    setInitializing(false)
  }

  // Scroll automático ao fim
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading || !company?.id || !store?.id) return

    setInput('')
    setLoading(true)

    // Adiciona mensagem do usuário otimisticamente
    const tempId = crypto.randomUUID()
    setMessages(prev => [...prev, {
      id: tempId, role: 'user', content: msg,
      created_at: new Date().toISOString(),
    }])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await supabase.functions.invoke('fn-paulo', {
        body: {
          conversation_id: conversationId,
          message:         msg,
          store_id:        store.id,
          company_id:      company.id,
          company_nome:    company.nome || 'sua loja',
        },
      })

      if (res.error) throw new Error(res.error.message)

      const { conversation_id, message: reply } = res.data as {
        conversation_id: string; message: string
      }

      if (!conversationId) setConvId(conversation_id)

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant', content: reply,
        created_at: new Date().toISOString(),
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: 'Não consegui processar sua mensagem agora. Tente novamente.',
        created_at: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function newConversation() {
    const { data: conv } = await supabase
      .from('paulo_conversations')
      .insert({ company_id: company!.id, store_id: store?.id ?? null })
      .select('id')
      .single()
    if (conv?.id) {
      setConvId(conv.id)
      setMessages([])
    }
  }

  if (!company?.id) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center text-slate-400 text-sm">
        Selecione uma empresa para conversar com o Paulo.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">

      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-white font-bold text-base shadow-sm">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 text-base leading-none">Paulo</h1>
              <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                Gerente IA
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {store?.nome ?? 'Gerente Geral de Vendas'}
            </p>
          </div>
        </div>
        <button
          onClick={newConversation}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          title="Nova conversa"
        >
          <RefreshCw size={13} />
          <span className="hidden sm:block">Nova conversa</span>
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">

        {initializing ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Carregando Paulo...</span>
          </div>
        ) : messages.length === 0 ? (
          /* Estado vazio — boas-vindas */
          <div className="flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-full bg-navy/10 border-2 border-navy/20 flex items-center justify-center mb-4">
              <BrainCircuit size={28} className="text-navy" />
            </div>
            <h2 className="font-bold text-slate-800 text-lg">Olá, sou o Paulo</h2>
            <p className="text-slate-500 text-sm mt-1 leading-relaxed">
              Seu gerente geral de vendas. Tenho acesso aos dados reais da sua loja e estou aqui para ajudar com análises, alertas e recomendações.
            </p>
            <p className="text-slate-400 text-xs mt-4">Escolha uma ação abaixo ou me faça uma pergunta.</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <Avatar role={msg.role} userName={userName} />
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'assistant'
                    ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                    : 'bg-primary text-white rounded-tr-sm'
                }`}
              >
                {formatMessage(msg.content)}
              </div>
            </div>
          ))
        )}

        {/* Indicador de digitação */}
        {loading && (
          <div className="flex gap-3">
            <Avatar role="assistant" />
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick actions + Input */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 space-y-3">

        {/* Quick action chips */}
        {messages.length === 0 && !initializing && (
          <div className="flex gap-2 flex-wrap">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action}
                onClick={() => send(action)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-primary hover:text-primary hover:bg-navy-ghost transition-colors cursor-pointer disabled:opacity-40"
              >
                {action}
              </button>
            ))}
          </div>
        )}

        {/* Campo de texto */}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Pergunte algo ao Paulo... (Enter para enviar)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary transition-colors min-h-[42px] max-h-[120px] overflow-y-auto"
            style={{ fieldSizing: 'content' } as any}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading || !store?.id}
            className="h-[42px] w-[42px] flex items-center justify-center rounded-xl bg-primary text-white hover:bg-azure-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} />
            }
          </button>
        </div>

        {!store?.id && (
          <p className="text-xs text-amber-600 text-center">
            Selecione uma loja na barra lateral para ativar o Paulo.
          </p>
        )}
      </div>
    </div>
  )
}
