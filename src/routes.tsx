import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Páginas
import Login from '@/pages/Login'
import Gate from '@/pages/Gate'
import AdminUsers from '@/pages/AdminUsers'

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

// ADM (retaguarda)
import AdminDashboard from '@/pages/AdminDashboard'
import StockAdmin from '@/pages/StockAdmin'

// Guards
import RequireRole from './components/auth/RequireRole'
import RequireArea from './components/auth/RequireArea'
import RequireCompany from './components/auth/RequireCompany'
import RequireStore from './components/auth/RequireStore'

const router = createBrowserRouter([
  // Página inicial = Login
  { path: '/', element: <Login /> },
  { path: '/login', element: <Login /> },

  // Gate opcional
  { path: '/gate', element: <Gate /> },

  // Grupo LOJA (acesso livre)
  { path: '/loja', element: <RequireCompany><Home /></RequireCompany> },
  { path: '/loja/sell', element: <RequireCompany><RequireStore><Sell /></RequireStore></RequireCompany> },
  { path: '/loja/cash', element: <RequireCompany><RequireStore><Cash /></RequireStore></RequireCompany> },
  { path: '/loja/products', element: <RequireCompany><Products /></RequireCompany> },
  { path: '/loja/reports', element: <RequireCompany><Reports /></RequireCompany> },
  { path: '/loja/stock', element: <RequireCompany><Stock /></RequireCompany> },
  { path: '/loja/settings', element: <RequireCompany><Settings /></RequireCompany> },
  { path: '/loja/store', element: <SelectStore /> },
  { path: '/loja/company', element: <SelectCompany /> },

  // Grupo ADM (proteção por papel + áreas)
  {
    path: '/adm',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area="ADM_ROOT" mode="any">
          <RequireCompany>
            <AdminDashboard />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/products',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'PRODUTOS']} mode="all">
          <RequireCompany>
            <Products />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/reports',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'RELATORIOS']} mode="all">
          <RequireCompany>
            <Reports />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/stock',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'ESTOQUE_ADMIN']} mode="all">
          <RequireCompany>
            <StockAdmin />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/settings',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'CONFIG']} mode="all">
          <RequireCompany>
            <Settings />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/companies',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'CONFIG']} mode="all">
          <AdminCompanies />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/stores',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'CONFIG']} mode="all">
          <RequireCompany>
            <AdminStores />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/store',
    element: (
    <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
        <RequireArea area={['ADM_ROOT', 'CONFIG']} mode="all">
          <RequireCompany>
            <SelectStore />
          </RequireCompany>
        </RequireArea>
      </RequireRole>
    ),
  },
  {
  path: '/adm/users',
  element: (
  <RequireRole roles={['OWNER', 'ADMIN', 'GERENTE', 'GESTOR']}>
      <RequireArea area={['ADM_ROOT','USERS']} mode="all">
        <RequireCompany>
          <AdminUsers />
        </RequireCompany>
      </RequireArea>
    </RequireRole>
  ),
},

  // --- Aliases legados (compatibilidade com links antigos) ---
  { path: '/sell', element: <RequireCompany><RequireStore><Sell /></RequireStore></RequireCompany> },
  { path: '/cash', element: <RequireCompany><RequireStore><Cash /></RequireStore></RequireCompany> },
  { path: '/products', element: <RequireCompany><Products /></RequireCompany> },
  { path: '/reports', element: <RequireCompany><Reports /></RequireCompany> },
  { path: '/settings', element: <RequireCompany><Settings /></RequireCompany> },
  { path: '/store', element: <SelectStore /> },
  { path: '/company', element: <SelectCompany /> },
  { path: '/stock', element: <RequireCompany><Stock /></RequireCompany> },
  { path: '*', element: <NotFound /> },
])

export default function AppRoutes() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />
}
