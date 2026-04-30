import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Páginas
import Login from '@/pages/Login'
import Gate from '@/pages/Gate'
import AdminUsers from '@/pages/AdminUsers'
import Onboarding from '@/pages/Onboarding'

// LOJA (vendedor)
import Home from '@/pages/Home'
import Sell from '@/pages/Sell'
import Cash from '@/pages/Cash'
import Products from '@/pages/Products'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import SelectStore from '@/pages/SelectStore'
import Stock from '@/pages/Stock'
import NotFound from '@/pages/NotFound'
import SelectCompany from '@/pages/SelectCompany'
import AdminCompanies from '@/pages/AdminCompanies'
import AdminStores from '@/pages/AdminStores'
import NPS from '@/pages/NPS'
import NPSDashboard from '@/pages/NPSDashboard'

// ADM (retaguarda)
import AdminDashboard from '@/pages/AdminDashboard'
import StockAdmin from '@/pages/StockAdmin'
import Collections from '@/pages/Collections'
import Customers from '@/pages/Customers'
import Crediario from '@/pages/Crediario'
import Promocoes from '@/pages/Promocoes'
import Insights from '@/pages/Insights'
import Cobranca from '@/pages/Cobranca'
import CashbackConfig from '@/pages/CashbackConfig'
import Labels from '@/pages/Labels'
import Financeiro from '@/pages/Financeiro'
import ContasPagar from '@/pages/ContasPagar'

// Layout
import AdminLayout from '@/layouts/AdminLayout'

// Guards — usados apenas nas rotas de LOJA (PDV)
import RequireCompany from './components/auth/RequireCompany'
import RequireStore from './components/auth/RequireStore'

const router = createBrowserRouter([
  // Página inicial = Login
  { path: '/', element: <Login /> },
  { path: '/login', element: <Login /> },
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/gate', element: <Gate /> },
  { path: '/nps', element: <NPS /> },

  // ── Grupo LOJA (PDV) — requer empresa/loja selecionada ────────────────────
  { path: '/loja',          element: <RequireCompany><Home /></RequireCompany> },
  { path: '/loja/sell',     element: <RequireCompany><RequireStore><Sell /></RequireStore></RequireCompany> },
  { path: '/loja/cash',     element: <RequireCompany><RequireStore><Cash /></RequireStore></RequireCompany> },
  { path: '/loja/products', element: <RequireCompany><Products /></RequireCompany> },
  { path: '/loja/reports',  element: <RequireCompany><Reports /></RequireCompany> },
  { path: '/loja/stock',    element: <RequireCompany><Stock /></RequireCompany> },
  { path: '/loja/settings', element: <RequireCompany><Settings /></RequireCompany> },
  { path: '/loja/store',    element: <SelectStore /> },
  { path: '/loja/company',  element: <SelectCompany /> },

  // Aliases legados PDV
  { path: '/sell',    element: <RequireCompany><RequireStore><Sell /></RequireStore></RequireCompany> },
  { path: '/cash',    element: <RequireCompany><RequireStore><Cash /></RequireStore></RequireCompany> },
  { path: '/stock',   element: <RequireCompany><Stock /></RequireCompany> },
  { path: '/store',   element: <SelectStore /> },
  { path: '/company', element: <SelectCompany /> },

  // ── Grupo ADM — sem guards de papel/empresa nas rotas ─────────────────────
  // O Supabase RLS protege os dados. Cada página mostra estado vazio se não
  // houver empresa. O usuário pode explorar livremente antes de configurar.
  {
    element: <AdminLayout />,
    children: [
      { path: '/adm',              element: <AdminDashboard /> },
      { path: '/adm/products',     element: <Products /> },
      { path: '/adm/stock',        element: <Stock /> },
      { path: '/adm/etiquetas',   element: <Labels /> },
      { path: '/adm/reports',      element: <Reports /> },
      { path: '/adm/collections',  element: <Collections /> },
      { path: '/adm/promocoes',    element: <Promocoes /> },
      { path: '/adm/cashback',     element: <CashbackConfig /> },
      { path: '/adm/settings',     element: <Settings /> },
      { path: '/adm/companies',    element: <AdminCompanies /> },
      { path: '/adm/stores',       element: <AdminStores /> },
      { path: '/adm/store',        element: <SelectStore /> },
      { path: '/adm/users',        element: <AdminUsers /> },
      { path: '/adm/nps',          element: <NPSDashboard /> },

      // Rotas funcionais
      { path: '/products',     element: <Products /> },
      { path: '/reports',      element: <Reports /> },
      { path: '/settings',     element: <Settings /> },
      { path: '/collections',  element: <Collections /> },
      { path: '/customers',    element: <Customers /> },
      { path: '/crediario',    element: <Crediario /> },
      { path: '/cobranca',     element: <Cobranca /> },
      { path: '/cashback',     element: <CashbackConfig /> },
      { path: '/insights',     element: <Insights /> },
      { path: '/financeiro',   element: <Financeiro /> },
      { path: '/contas-pagar', element: <ContasPagar /> },
    ],
  },

  { path: '*', element: <NotFound /> },
])

export default function AppRoutes() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />
}
