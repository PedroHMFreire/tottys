import { Link, useLocation } from 'react-router-dom'
import { Home, ShoppingCart, Landmark, Users, Trophy } from 'lucide-react'

const tabs = [
  { to: '/loja',             label: 'Início',      Icon: Home        },
  { to: '/loja/sell',        label: 'Vender',      Icon: ShoppingCart },
  { to: '/loja/cash',        label: 'Caixa',       Icon: Landmark    },
  { to: '/customers',        label: 'Clientes',    Icon: Users       },
  { to: '/loja/performance', label: 'Performance', Icon: Trophy      },
]

export default function TabBar() {
  const { pathname } = useLocation()

  function isActive(to: string) {
    // /loja deve ser ativo apenas quando exatamente /loja (não /loja/sell etc.)
    if (to === '/loja') return pathname === '/loja'
    return pathname.startsWith(to)
  }

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-[#0B0F1A] border-t border-[#1E2D45] safe-area-inset-bottom">
      <div className="grid grid-cols-5 text-center">
        {tabs.map(({ to, label, Icon }) => {
          const active = isActive(to)
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center py-2.5 gap-1 transition-colors duration-150 cursor-pointer ${
                active ? 'text-emerald-400' : 'text-[#475569] hover:text-[#64748B]'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.75} />
              <span className={`text-xs font-manrope ${active ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
