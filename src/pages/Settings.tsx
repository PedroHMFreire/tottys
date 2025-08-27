
import Button from '@/ui/Button'
import { Link } from 'react-router-dom'

export default function Settings() {
  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-3">Configurações</h2>
      <div className="space-y-2">
        <Link to="/store"><Button>Selecionar Loja</Button></Link>
        <Button>Impressora Térmica</Button>
        <Button>Provedor Fiscal</Button>
      </div>
    </div>
  )
}
