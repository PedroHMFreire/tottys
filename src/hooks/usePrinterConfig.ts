// src/hooks/usePrinterConfig.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useApp } from '@/state/store'

export interface PrinterConfig {
  store_id: string
  model: string
  paper_width: 58 | 80
  connection: 'usb' | 'network' | 'serial'
  ip_address: string | null
  port: number | null
  auto_print: boolean
  modo_padrao: 'fiscal' | 'modelo' | 'perguntar'
  copies: number
}

export const PRINTER_DEFAULTS: Omit<PrinterConfig, 'store_id'> = {
  model: 'generic',
  paper_width: 80,
  connection: 'usb',
  ip_address: null,
  port: 9100,
  auto_print: false,
  modo_padrao: 'perguntar',
  copies: 1,
}

export function usePrinterConfig() {
  const { store } = useApp()
  const [config, setConfig] = useState<PrinterConfig>({ store_id: '', ...PRINTER_DEFAULTS })
  const [loading, setLoading] = useState(false)

  async function reload() {
    if (!store?.id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('printer_config')
        .select('*')
        .eq('store_id', store.id)
        .maybeSingle()
      setConfig(data
        ? { ...PRINTER_DEFAULTS, ...data }
        : { store_id: store.id, ...PRINTER_DEFAULTS }
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [store?.id])

  async function save(updates: Partial<PrinterConfig>) {
    if (!store?.id) return
    const payload = { store_id: store.id, ...PRINTER_DEFAULTS, ...config, ...updates }
    await supabase
      .from('printer_config')
      .upsert(payload, { onConflict: 'store_id' })
    setConfig(payload)
  }

  return { config, loading, save, reload }
}
