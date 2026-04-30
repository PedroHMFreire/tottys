import { useNavigate } from 'react-router-dom'
import Button from '@/ui/Button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Página não encontrada</h1>
          <p className="text-zinc-500 text-sm mt-1">A URL informada não existe neste sistema.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => navigate('/login')}>Ir para Login</Button>
          <Button variant="ghost" onClick={() => navigate('/')}>Voltar ao início</Button>
        </div>
      </div>
    </div>
  )
}
