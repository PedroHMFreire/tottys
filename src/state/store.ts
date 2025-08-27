
import { create } from 'zustand'
import type { Product, Sale, SaleItem, Store, User, Customer } from '@/domain/types'
import { nanoid } from '@/ui/nanoid'

export interface AppState {
  user?: User
  store?: Store
  cart: SaleItem[]
  products: Product[]
  customers: Customer[]
  setUser: (u?: User) => void
  setStore: (s?: Store) => void
  setProducts: (p: Product[]) => void
  addToCart: (item: Omit<SaleItem, 'id'>) => void
  clearCart: () => void
  removeFromCart: (id: string) => void
  setQty: (id: string, qty: number) => void
}

export const useApp = create<AppState>((set, get) => ({
  cart: [],
  products: [],
  customers: [],
  setUser: (user) => set({ user }),
  setStore: (store) => set({ store }),
  setProducts: (products) => set({ products }),
  addToCart: (item) => set({ cart: [...get().cart, { ...item, id: nanoid() }] }),
  clearCart: () => set({ cart: [] }),
  removeFromCart: (id) => set({ cart: get().cart.filter(i => i.id !== id) }),
  setQty: (id, qty) => set({ cart: get().cart.map(i => i.id === id ? { ...i, qtde: qty } : i) }),
}))
