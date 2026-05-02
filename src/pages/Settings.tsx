// src/pages/Settings.tsx
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import Button from '@/ui/Button'
import PrinterSettingsModal from '@/components/settings/PrinterSettingsModal'
import FiscalSettingsModal from '@/components/settings/FiscalSettingsModal'

export default function Settings() {
  const { admin } = useRole()
  const [showPrinter, setShowPrinter] = useState(false)
  const [showFiscal, setShowFiscal] = useState(false)

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-navy mb-3">Configurações</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <Link to="/company"><Button className="w-full">Selecionar Empresa</Button></Link>
        <Link to="/store"><Button className="w-full">Selecionar Loja</Button></Link>
        <Button onClick={() => setShowPrinter(true)}>Impressora Térmica</Button>
        <Button onClick={() => setShowFiscal(true)}>Provedor Fiscal</Button>
        {admin && <Link to="/adm/companies"><Button className="w-full">Empresas (Admin)</Button></Link>}
        {admin && <Link to="/adm/stores"><Button className="w-full">Lojas (Admin)</Button></Link>}
      </div>

      {showPrinter && <PrinterSettingsModal onClose={() => setShowPrinter(false)} />}
      {showFiscal  && <FiscalSettingsModal  onClose={() => setShowFiscal(false)} />}
    </div>
  )
}
