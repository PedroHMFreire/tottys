
import Button from '@/ui/Button'
import { Link } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'

export default function Settings() {
  const { admin } = useRole()
  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-3">Configurações</h2>
      <div className="space-y-2">
        <Link to="/company"><Button>Selecionar Empresa</Button></Link>
        <Link to="/store"><Button>Selecionar Loja</Button></Link>
        <Button>Impressora Térmica</Button>
        <Button>Provedor Fiscal</Button>
        {admin && <Link to="/adm/companies"><Button>Empresas (Admin)</Button></Link>}
        {admin && <Link to="/adm/stores"><Button>Lojas (Admin)</Button></Link>}
      </div>
    </div>
  )
}
