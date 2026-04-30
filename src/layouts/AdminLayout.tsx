import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'
import { useRole } from '@/hooks/useRole'
import { useAreas } from '@/hooks/useAreas'
import {
  LayoutDashboard, Package, Warehouse, BarChart3, Users, CreditCard,
  Bell, Star, Wallet, FileText, TrendingUp, UserCog, Store, Settings,
  Layers, Tag, Printer, Menu, X, LogOut, Building2, ShoppingBag, ExternalLink,
  MessageSquare, type LucideIcon,
} from 'lucide-react'

// area: área necessária para ver o item. null = visível para todos autenticados.
type NavItem  = { to: string; label: string; Icon: LucideIcon; area?: string }
type NavGroup = { group: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    group: '',
    items: [
      { to: '/adm', label: 'Dashboard', Icon: LayoutDashboard, area: 'ADM_ROOT' },
    ],
  },
  {
    group: 'Vendas',
    items: [
      { to: '/adm/reports',     label: 'Relatórios', Icon: BarChart3, area: 'RELATORIOS'  },
      { to: '/adm/collections', label: 'Coleções',   Icon: Layers,   area: 'PRODUTOS'    },
      { to: '/adm/promocoes',   label: 'Promoções',  Icon: Tag,      area: 'PRODUTOS'    },
    ],
  },
  {
    group: 'Catálogo',
    items: [
      { to: '/adm/products',   label: 'Produtos',  Icon: Package,   area: 'PRODUTOS'      },
      { to: '/adm/stock',      label: 'Estoque',   Icon: Warehouse, area: 'ESTOQUE_ADMIN' },
      { to: '/adm/etiquetas',  label: 'Etiquetas', Icon: Printer,   area: 'PRODUTOS'      },
    ],
  },
  {
    group: 'Clientes',
    items: [
      { to: '/customers',    label: 'Clientes',  Icon: Users,          area: 'CLIENTES'  },
      { to: '/crediario',    label: 'Crediário', Icon: CreditCard,     area: 'CREDIARIO' },
      { to: '/cobranca',     label: 'Cobranças', Icon: Bell,           area: 'CREDIARIO' },
      { to: '/adm/cashback', label: 'Cashback',  Icon: Star,           area: 'CASHBACK'  },
      { to: '/adm/nps',      label: 'NPS',       Icon: MessageSquare,  area: 'INSIGHTS'  },
    ],
  },
  {
    group: 'Financeiro',
    items: [
      { to: '/financeiro',   label: 'Financeiro',     Icon: Wallet,     area: 'FINANCEIRO' },
      { to: '/contas-pagar', label: 'Contas a Pagar', Icon: FileText,   area: 'FINANCEIRO' },
      { to: '/insights',     label: 'Insights',       Icon: TrendingUp, area: 'INSIGHTS'   },
    ],
  },
  {
    group: 'Configurações',
    items: [
      { to: '/adm/users',    label: 'Usuários', Icon: UserCog, area: 'USERS'  },
      { to: '/adm/stores',   label: 'Lojas',    Icon: Store,   area: 'CONFIG' },
      { to: '/adm/settings', label: 'Config',   Icon: Settings,area: 'CONFIG' },
    ],
  },
]

function SidebarContent({ onClose, userName }: { onClose: () => void; userName: string }) {
  const { company, store, setStore } = useApp()
  const { role, isAdmin } = useRole()
  const { has } = useAreas()
  const navigate = useNavigate()
  const [storeList, setStoreList] = useState<Array<{ id: string; nome: string; company_id: string; uf: string }>>([])

  useEffect(() => {
    if (!company?.id) { setStoreList([]); return }
    supabase.from('stores').select('id, nome, company_id, uf').eq('company_id', company.id).order('nome').then(({ data }) => {
      if (!data) return
      setStoreList(data as any)
      const alreadySelected = store?.id && data.some(s => s.id === store.id)
      if (!alreadySelected && data.length > 0) {
        setStore(data[0] as any)
        localStorage.setItem('app_selected_store', JSON.stringify(data[0]))
      }
    })
  }, [company?.id])

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function openPDV() {
    if (!store?.id) return
    window.open('/loja/sell', '_blank', 'noopener,noreferrer')
  }

  // Filtra itens de menu por área do usuário
  function canSee(item: NavItem): boolean {
    if (!item.area) return true
    if (role === 'OWNER' || role === 'ADMIN') return true
    return has(item.area)
  }

  return (
    <div className="flex flex-col h-full w-60 bg-white border-r border-slate-200">

      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100 shrink-0">
        <span className="font-display text-[1.1rem] font-semibold text-[#1E1B4B] tracking-tight select-none">
          Tottys
        </span>
        <button
          className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      {/* PDV CTA */}
      <div className="px-3 py-3 border-b border-slate-100 shrink-0 space-y-2">
        {storeList.length > 0 && (
          <select
            value={store?.id || ''}
            onChange={e => {
              const s = storeList.find(s => s.id === e.target.value)
              if (s) { setStore(s as any); localStorage.setItem('app_selected_store', JSON.stringify(s)) }
            }}
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white cursor-pointer focus:outline-none focus:border-[#3B82F6] truncate"
          >
            <option value="" disabled>Selecionar loja…</option>
            {storeList.map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        )}
        <button
          onClick={openPDV}
          disabled={!store?.id}
          title={!store?.id ? 'Selecione uma loja para abrir o PDV' : `Abrir PDV — ${store?.nome}`}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          <ShoppingBag size={15} strokeWidth={2.2} />
          <span className="flex-1 text-left">Abrir PDV</span>
          <ExternalLink size={12} strokeWidth={2} className="opacity-70" />
        </button>
      </div>

      {/* Nav filtrado por área */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map(({ group, items }) => {
          const visible = items.filter(canSee)
          if (!visible.length) return null
          return (
            <div key={group} className="mb-1">
              {group && (
                <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {group}
                </div>
              )}
              {visible.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/adm'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                      isActive
                        ? 'bg-[#EFF6FF] text-[#1E40AF]'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={14} strokeWidth={isActive ? 2.2 : 1.75} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-100 p-3 shrink-0">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-xs font-bold text-[#1E40AF] shrink-0">
            {(userName.charAt(0) || 'U').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-800 truncate">{userName || 'Usuário'}</div>
            {company?.nome && (
              <div className="text-xs text-slate-400 truncate">{company.nome}</div>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
        >
          <LogOut size={12} />
          Sair da conta
        </button>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { company, setCompany } = useApp()
  const navigate  = useNavigate()
  const [userName, setUserName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('nome, email').eq('id', user.id).maybeSingle()
        .then(({ data }) => setUserName(data?.nome || data?.email || user.email || ''))
    })
  }, [])

  useEffect(() => {
    if (company?.id) return
    supabase.rpc('get_my_company').then(({ data }) => {
      if (data && data.length > 0) setCompany(data[0] as any)
    })
  }, [company?.id, setCompany])

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">

      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <SidebarContent onClose={() => {}} userName={userName} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 h-full">
            <SidebarContent onClose={() => setSidebarOpen(false)} userName={userName} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 shrink-0">
          <button
            className="md:hidden -ml-1 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            {company?.nome ? (
              <>
                <Building2 size={13} className="text-slate-400 shrink-0" />
                <span className="text-sm font-medium text-slate-600 truncate">{company.nome}</span>
              </>
            ) : (
              <span className="font-display text-[1rem] font-semibold text-[#1E1B4B]">Tottys</span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-400 hidden sm:block max-w-[140px] truncate">
              {userName}
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
              title="Sair"
            >
              <LogOut size={14} />
              <span className="hidden sm:block">Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
