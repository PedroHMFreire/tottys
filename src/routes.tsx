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

// ADM (retaguarda)
import AdminDashboard from '@/pages/AdminDashboard'
import StockAdmin from '@/pages/StockAdmin'

// Guards
import RequireRole from './components/auth/RequireRole'
import RequireArea from './components/auth/RequireArea'

const router = createBrowserRouter([
  // Página inicial = Login
  { path: '/', element: <Login /> },

  // Gate opcional
  { path: '/gate', element: <Gate /> },

  // Grupo LOJA (acesso livre)
  { path: '/loja', element: <Home /> },
  { path: '/loja/sell', element: <Sell /> },
  { path: '/loja/cash', element: <Cash /> },
  { path: '/loja/products', element: <Products /> },
  { path: '/loja/reports', element: <Reports /> },
  { path: '/loja/stock', element: <Stock /> },
  { path: '/loja/settings', element: <Settings /> },
  { path: '/loja/store', element: <SelectStore /> },

  // Grupo ADM (proteção por papel + áreas)
  {
    path: '/adm',
    element: (
    <RequireRole area="ADM_ROOT">
        <RequireArea area="ADM_ROOT" mode="any">
          <AdminDashboard />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/products',
    element: (
    <RequireRole area="ADM_ROOT">
        <RequireArea area={['ADM_ROOT', 'PRODUTOS']} mode="all">
          <Products />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/reports',
    element: (
    <RequireRole area="ADM_ROOT">
        <RequireArea area={['ADM_ROOT', 'RELATORIOS']} mode="all">
          <Reports />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/stock',
    element: (
    <RequireRole area="ADM_ROOT">
        <RequireArea area={['ADM_ROOT', 'ESTOQUE_ADMIN']} mode="all">
          <StockAdmin />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/settings',
    element: (
    <RequireRole area="ADM_ROOT">
        <RequireArea area={['ADM_ROOT', 'CONFIG']} mode="all">
          <Settings />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
    path: '/adm/store',
    element: (
    <RequireRole area="ADM_ROOT">
        <RequireArea area={['ADM_ROOT', 'CONFIG']} mode="all">
          <SelectStore />
        </RequireArea>
      </RequireRole>
    ),
  },
  {
  path: '/adm/users',
  element: (
  <RequireRole area="ADM_ROOT">
      <RequireArea area={['ADM_ROOT','USERS']} mode="all">
        <AdminUsers />
      </RequireArea>
    </RequireRole>
  ),
},

  // --- Aliases legados (compatibilidade com links antigos) ---
  { path: '/sell', element: <Sell /> },
  { path: '/cash', element: <Cash /> },
  { path: '/products', element: <Products /> },
  { path: '/reports', element: <Reports /> },
  { path: '/settings', element: <Settings /> },
  { path: '/store', element: <SelectStore /> },
  { path: '/stock', element: <Stock /> },
])

export default function AppRoutes() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />
}
