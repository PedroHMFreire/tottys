
import { create } from 'zustand'
import type { Product, SaleItem, Store, User, Customer, Company, Role } from '@/domain/types'
import { nanoid } from '@/ui/nanoid'

export interface AppState {
  user?: User
  company?: Company
  store?: Store
  cart: SaleItem[]
  products: Product[]
  customers: Customer[]
  // Cache de permissões — lido uma vez no login, evita queries repetidas nos guards
  role: Role
  areas: string[]
  permissionsLoaded: boolean
  setUser: (u?: User) => void
  setCompany: (c?: Company) => void
  setStore: (s?: Store) => void
  setProducts: (p: Product[]) => void
  addToCart: (item: Omit<SaleItem, 'id'>) => void
  clearCart: () => void
  removeFromCart: (id: string) => void
  setQty: (id: string, qty: number) => void
  setPermissions: (role: Role, areas: string[]) => void
  clearPermissions: () => void
}

const storedCompany = (() => {
  try {
    const raw = localStorage.getItem('app_selected_company')
    return raw ? (JSON.parse(raw) as Company) : undefined
  } catch {
    return undefined
  }
})()

const storedStore = (() => {
  try {
    const raw = localStorage.getItem('app_selected_store')
    return raw ? (JSON.parse(raw) as Store) : undefined
  } catch {
    return undefined
  }
})()

export const useApp = create<AppState>((set, get) => ({
  company: storedCompany,
  store: storedStore,
  cart: [],
  products: [],
  customers: [],
  role: 'ANON',
  areas: [],
  permissionsLoaded: false,
  setPermissions: (role, areas) => set({ role, areas, permissionsLoaded: true }),
  clearPermissions: () => set({ role: 'ANON', areas: [], permissionsLoaded: false }),
  setUser: (user) => set({ user }),
  setCompany: (company) => {
    if (company) {
      localStorage.setItem('app_selected_company', JSON.stringify(company))
    } else {
      localStorage.removeItem('app_selected_company')
    }
    const currentStore = get().store
    const shouldClearStore = currentStore && company && (currentStore as any).company_id !== company.id
    if (shouldClearStore) {
      localStorage.removeItem('app_selected_store')
      set({ company, store: undefined })
    } else {
      set({ company })
    }
  },
  setStore: (store) => {
    if (store) {
      localStorage.setItem('app_selected_store', JSON.stringify(store))
    } else {
      localStorage.removeItem('app_selected_store')
    }
    set({ store })
  },
  setProducts: (products) => set({ products }),
  addToCart: (item) => set({ cart: [...get().cart, { ...item, id: nanoid() }] }),
  clearCart: () => set({ cart: [] }),
  removeFromCart: (id) => set({ cart: get().cart.filter(i => i.id !== id) }),
  setQty: (id, qty) => set({ cart: get().cart.map(i => i.id === id ? { ...i, qtde: qty } : i) }),
}))
