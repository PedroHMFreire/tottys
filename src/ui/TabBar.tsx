
import { Link, useLocation } from 'react-router-dom'

const tabs = [
  { to: '/sell', label: 'Vender' },
  { to: '/cash', label: 'Caixa' },
  { to: '/products', label: 'Produtos' },
  { to: '/reports', label: 'Relatórios' },
  { to: '/settings', label: 'Config' },
]

export default function TabBar() {
  const { pathname } = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 bg-white border-t border-zinc-200">
      <div className="grid grid-cols-5 text-center text-xs">
        {tabs.map(t => (
          <Link key={t.to} to={t.to} className={`py-3 ${pathname.startsWith(t.to) ? 'text-black font-semibold' : 'text-zinc-500'}`}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
