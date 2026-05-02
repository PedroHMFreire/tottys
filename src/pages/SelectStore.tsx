
import { useEffect, useState } from 'react'
import Button from '@/ui/Button'
import { useApp } from '@/state/store'
import { supabase } from '@/lib/supabaseClient'
import { Link, useNavigate } from 'react-router-dom'
import { logActivity } from '@/lib/activity'

export default function SelectStore() {
  const setStore = useApp(s => s.setStore)
  const company = useApp(s => s.company)
  const navigate = useNavigate()
  const [stores, setStores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        if (!company?.id) {
          setStores([])
          return
        }
        let query = supabase
          .from('stores')
          .select('id, company_id, nome, uf, ambiente_fiscal')
          .eq('company_id', company.id)
          .order('nome', { ascending: true })
        try {
          // Se a tabela de vínculos existir, filtra por lojas permitidas
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: us } = await supabase
              .from('user_stores')
              .select('store_id')
              .eq('user_id', user.id)
            const ids = (us || []).map((r: any) => r.store_id)
            if (ids.length > 0) query = query.in('id', ids)
          }
        } catch {
          // ignora se user_stores não existir
        }
        const { data, error } = await query
        if (error) throw error
        if (mounted) setStores((data || []) as any[])
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Falha ao carregar lojas.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [company?.id])

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-navy mb-4">Selecione a Loja</h2>
      {!company?.id && (
        <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm mb-3">
          Selecione uma empresa primeiro.
          <div className="mt-2">
            <Link to="/company"><Button>Selecionar Empresa</Button></Link>
          </div>
        </div>
      )}
      {error && <div className="rounded-2xl border p-3 bg-amber-50 text-amber-900 text-sm mb-3">{error}</div>}
      {loading ? (
        <div className="text-sm text-slate-400">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {stores.map(st => (
            <Button
              key={st.id}
              onClick={() => {
                setStore(st as any)
                logActivity(`Loja selecionada • ${st.nome}`, 'info', { store_id: st.id })
                navigate('/loja')
              }}
            >
              {st.nome}
            </Button>
          ))}
          {!stores.length && company?.id && (
            <div className="text-sm text-slate-400">Nenhuma loja cadastrada para esta empresa.</div>
          )}
        </div>
      )}
    </div>
  )
}
