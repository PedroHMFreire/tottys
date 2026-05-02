import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Button from '@/ui/Button'
import Card from '@/ui/Card'
import ImportBatchModal from '@/components/products/ImportBatchModal'
import NewProductModal from '@/components/products/NewProductModal'
import { useApp } from '@/state/store'

export default function StockAdmin() {
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const { company, setCompany } = useApp()
  useEffect(() => {
    // Busca o companyId do usuário logado
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
        const cid = company?.id ?? prof?.company_id ?? null
        setCompanyId(cid)
        if (!company && prof?.company_id) {
          const { data: compRow } = await supabase
            .from('companies')
            .select('id, nome')
            .eq('id', prof.company_id)
            .maybeSingle()
          if (compRow) setCompany(compRow as any)
        }
      }
    })()
  }, [company, setCompany])

  useEffect(() => {
    if (company?.id) setCompanyId(company.id)
  }, [company?.id])

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-navy">Estoque (Admin)</h1>
      </div>

      {/* Ações rápidas: agora o ADM > Estoque também importa/cadastra produtos */}
      <div className="rounded-2xl border bg-white p-3">
        <div className="text-sm font-semibold mb-2">Ações rápidas</div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setShowImport(true)}>Importar Produtos</Button>
          <Button variant="ghost" onClick={() => setShowNew(true)}>Cadastrar Produto</Button>
        </div>
      </div>

      {/* Blocos informativos/atalhos de gestão de estoque */}
      <Card title="Operações de estoque">
        <ul className="text-sm text-zinc-600 space-y-1">
          <li>• Entradas de nota / Ajustes (em breve)</li>
          <li>• Transferências entre lojas (enviar/receber) (em breve)</li>
          <li>• Auditoria de contagem (em breve)</li>
        </ul>
      </Card>

      {/* Modais */}
      {showImport && (
        <ImportBatchModal
          onClose={() => setShowImport(false)}
        />
      )}

      {showNew && (
        <NewProductModal
          onClose={() => setShowNew(false)}
          companyId={companyId || ''}
        />
      )}
    </div>
  )
}
