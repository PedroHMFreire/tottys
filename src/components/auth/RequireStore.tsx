import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/state/store'
import Button from '@/ui/Button'

export default function RequireStore({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { store, company } = useApp()

  if (!store?.id) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border bg-white p-4 space-y-3 text-center">
          <div className="text-lg font-semibold">Selecione uma loja</div>
          <div className="text-sm text-zinc-600">
            Para vender ou operar o caixa, escolha a loja ativa.
          </div>
          <div className="grid grid-cols-1 gap-2 pt-1">
            {!company?.id && (
              <Button onClick={() => navigate('/company')}>Selecionar Empresa</Button>
            )}
            <Button onClick={() => navigate('/store')}>Selecionar Loja</Button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
