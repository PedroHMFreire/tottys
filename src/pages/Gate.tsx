import { useNavigate } from 'react-router-dom'
import Button from '@/ui/Button'

export default function Gate() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Marca / título */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Anot.AI</h1>
          <p className="text-zinc-500 text-sm mt-1">Escolha seu ambiente de trabalho</p>
        </div>

        {/* Cartão com ações */}
        <div className="rounded-3xl border bg-white shadow-sm p-4 space-y-3">
          <div className="text-sm text-zinc-600">
            Você verá apenas o que tem permissão para acessar.
          </div>

          <Button className="h-14 text-base" onClick={() => navigate('/loja')}>
            LOJA (PDV)
          </Button>

          <Button className="h-14 text-base bg-zinc-800" onClick={() => navigate('/adm')}>
            ADM (Retaguarda)
          </Button>
        </div>

        <div className="text-[11px] text-zinc-400 text-center mt-4">
          Dica: você pode voltar aqui a qualquer momento.
        </div>
      </div>
    </div>
  )
}