
import Button from '@/ui/Button'
import { useApp } from '@/state/store'

export default function SelectStore() {
  const setStore = useApp(s => s.setStore)
  const stores = [
    { id: '1', company_id: 'c1', nome: 'Santê Calhau', uf: 'MA', ambiente_fiscal: 'homologacao' },
    { id: '2', company_id: 'c1', nome: 'Santê Ilha', uf: 'MA', ambiente_fiscal: 'homologacao' },
  ] as any[]

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">Selecione a Loja</h2>
      <div className="space-y-3">
        {stores.map(st => (
          <Button key={st.id} onClick={() => setStore(st as any)}>{st.nome}</Button>
        ))}
      </div>
    </div>
  )
}
