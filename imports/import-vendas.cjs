#!/usr/bin/env node
// imports/import-vendas.cjs
// Importa histórico de vendas 2025 (Santê Ilha + Santê Calhau)
// Uso: node imports/import-vendas.cjs

const XLSX  = require('xlsx')
const path  = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL     = 'https://ccspbvekbnwhblmjobql.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjc3BidmVrYm53aGJsbWpvYnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIwNjQ4MSwiZXhwIjoyMDkxNzgyNDgxfQ.cQ_Ioqn3FOVk7ufCR75h8Ro42Aj23J7_jncew3HzRaM'
const COMPANY_ID       = '7e6e3725-abc3-42cc-bfeb-0b9078c9b84b'
const BATCH            = 200

const FILES = [
  {
    file:    path.join(__dirname, 'ReportPedidosItens.xlsx'),
    store:   'SANTÊ ILHA',
    storeId: '01b8b809-a60f-4e49-b74d-aad36fc2ac9f',
  },
  {
    file:    path.join(__dirname, 'ReportPedidosItens (1).xlsx'),
    store:   'SANTÊ CALHAU',
    storeId: '7ed27057-5e3b-4878-bf65-064f31e421f6',
  },
]

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Helpers ────────────────────────────────────────────────────────────────

function excelToISO(serial) {
  if (!serial) return null
  return new Date((serial - 25569) * 86400 * 1000).toISOString()
}

function normDoc(v) {
  return String(v || '').replace(/\D/g, '')
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
}

function mapMeio(forma) {
  if (!forma) return 'DINHEIRO'
  const f = String(forma).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (f.includes('pix'))               return 'PIX'
  if (f.includes('dinheiro'))          return 'DINHEIRO'
  if (f.includes('credito loja'))      return 'CREDIARIO'
  if (f.includes('vale credito'))      return 'CASHBACK'
  if (f.includes('cartao') || f.includes('credito') || f.includes('debito')) return 'CARTAO'
  return 'DINHEIRO'
}

function mapMode(forma) {
  if (!forma) return null
  const f = String(forma).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (f.includes('debito'))  return 'DEBITO'
  if (f.includes('credito')) return 'CREDITO'
  return null
}

// ── Main ───────────────────────────────────────────────────────────────────

// Modo: 'full' (padrão) ou 'items-only' (reusa vendas existentes, só insere itens)
const MODE = process.argv[2] === '--items-only' ? 'items-only' : 'full'

async function main() {
  console.log(`\n🚀 Modo: ${MODE}`)

  // ── Lookup maps ───────────────────────────────────────────────────────────
  console.log('\n📚 Carregando dados de referência...')

  const { data: custData } = await supabase
    .from('customers')
    .select('id, cpf_cnpj')
    .eq('company_id', COMPANY_ID)
    .not('cpf_cnpj', 'is', null)
  const customerMap = new Map()
  for (const c of custData || []) {
    const k = normDoc(c.cpf_cnpj)
    if (k) customerMap.set(k, c.id)
  }
  console.log(`   Clientes:   ${customerMap.size}`)

  // Carrega variantes por SKU (sku = CodigoNFe do sistema legado, ex: "142912-12")
  const variantMap = new Map() // sku → { id, product_id }
  let vPage = 0
  while (true) {
    const { data: vd } = await supabase
      .from('product_variants')
      .select('id, product_id, sku')
      .not('sku', 'is', null)
      .range(vPage * 1000, vPage * 1000 + 999)
    if (!vd || !vd.length) break
    for (const v of vd) variantMap.set(String(v.sku).trim(), { id: v.id, product_id: v.product_id })
    vPage++
  }
  console.log(`   Variantes:  ${variantMap.size}`)

  const { data: vendData } = await supabase
    .from('vendedores')
    .select('id, nome')
    .eq('company_id', COMPANY_ID)
  const vendedorMap = new Map()
  for (const v of vendData || []) {
    const key = normName(v.nome).split(' ').slice(0, 2).join(' ')
    vendedorMap.set(key, v.id)
  }
  console.log(`   Vendedores: ${vendedorMap.size}`)

  // ── Processar cada planilha ────────────────────────────────────────────────
  let totalSales = 0, totalItems = 0, totalPayments = 0
  let errosSales = 0, errosItems = 0, errosPays = 0

  for (const { file, store, storeId } of FILES) {
    console.log(`\n📂 ${path.basename(file)} — ${store}`)

    const rawRows = XLSX.utils.sheet_to_json(
      XLSX.readFile(file).Sheets['Sheet 1'],
      { defval: null, header: 1 }
    )
    const headers = rawRows[3]
    const allRows = rawRows.slice(4).map(r => {
      const obj = {}
      headers.forEach((h, i) => { if (h) obj[h] = r[i] })
      return obj
    })

    const rows = allRows.filter(r => r['Status'] === 'Pedido Faturado')
    console.log(`   ${rows.length} itens faturados`)

    // Agrupar por Código Venda
    const grouped = new Map()
    for (const r of rows) {
      const key = String(r['Código Venda'])
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(r)
    }
    console.log(`   ${grouped.size} vendas únicas`)

    // Montar linhas de sales
    const salesRows   = []
    const itemsByKey  = new Map()
    const paysByKey   = new Map()

    for (const [extId, itens] of grouped) {
      const first     = itens[0]
      const cpf       = normDoc(first['CNPJ/CPF'])
      const custId    = cpf ? (customerMap.get(cpf) ?? null) : null
      const vendKey   = normName(first['Vendedor']).split(' ').slice(0, 2).join(' ')
      const vendId    = vendedorMap.get(vendKey) ?? null
      const total     = itens.reduce((s, r) => s + (Number(r['Preço Venda Total (R$)']) || 0), 0)
      const createdAt = excelToISO(first['Data'])

      salesRows.push({
        store_id:    storeId,
        user_id:     null,
        customer_id: custId,
        vendedor_id: vendId,
        total:       Number(total.toFixed(2)),
        desconto:    0,
        status:      'PAGA',
        created_at:  createdAt,
        external_id: extId,
      })

      itemsByKey.set(extId, itens.map(r => ({
        qtde:       Number(r['Quantidade']) || 1,
        preco_unit: Number(r['Preço Venda (R$)']) || 0,
        desconto:   0,
        _cod:       r['Código Prod.'] ? String(r['Código Prod.']).trim() : null,
      })))

      // Agrupa pagamentos por meio dentro da venda
      const payGroups = new Map()
      for (const r of itens) {
        const forma = r['Forma Pagamento'] || ''
        const meio  = mapMeio(forma)
        const mode  = mapMode(forma)
        const k2    = `${meio}|${mode}`
        if (!payGroups.has(k2)) payGroups.set(k2, { meio, mode, valor: 0 })
        payGroups.get(k2).valor += Number(r['Preço Venda Total (R$)']) || 0
      }
      paysByKey.set(extId, [...payGroups.values()].map(p => ({
        meio:  p.meio,
        mode:  p.mode,
        valor: Number(p.valor.toFixed(2)),
      })))
    }

    // ── Inserir OU recuperar sales ─────────────────────────────────────────
    const insertedMap = new Map() // external_id → sale uuid

    if (MODE === 'items-only') {
      // Recupera IDs das vendas já existentes
      console.log(`\n   ⏳ Recuperando ${salesRows.length} vendas existentes...`)
      const extIds = salesRows.map(s => s.external_id)
      for (let i = 0; i < extIds.length; i += BATCH) {
        const slice = extIds.slice(i, i + BATCH)
        const { data } = await supabase
          .from('sales')
          .select('id, external_id')
          .eq('store_id', storeId)
          .in('external_id', slice)
        for (const s of data || []) insertedMap.set(s.external_id, s.id)
        process.stdout.write(`\r   ⏳ Recuperadas: ${Math.min(i + BATCH, extIds.length)}/${extIds.length}`)
      }
      console.log(`\n   ✅ ${insertedMap.size} vendas localizadas`)
    } else {
      console.log(`\n   ⏳ Inserindo ${salesRows.length} vendas...`)
      for (let i = 0; i < salesRows.length; i += BATCH) {
        const batch = salesRows.slice(i, i + BATCH)
        const { data, error } = await supabase
          .from('sales')
          .insert(batch)
          .select('id, external_id')

        if (error) {
          console.error(`\n   ❌ Erro sales lote ${Math.floor(i / BATCH) + 1}:`, error.message)
          errosSales++
          continue
        }
        for (const s of data || []) insertedMap.set(s.external_id, s.id)
        process.stdout.write(`\r   ⏳ Vendas: ${Math.min(i + BATCH, salesRows.length)}/${salesRows.length}`)
      }
      console.log(`\n   ✅ ${insertedMap.size} vendas inseridas`)
      totalSales += insertedMap.size
    }

    // ── Inserir itens ──────────────────────────────────────────────────────
    const allItems = []
    for (const [extId, rawItems] of itemsByKey) {
      const saleId = insertedMap.get(extId)
      if (!saleId) continue
      for (const item of rawItems) {
        const variant = item._cod ? variantMap.get(item._cod) : null
        allItems.push({
          sale_id:    saleId,
          product_id: variant?.product_id ?? null,
          variant_id: variant?.id ?? null,
          qtde:       item.qtde,
          preco_unit: item.preco_unit,
          desconto:   item.desconto,
        })
      }
    }

    console.log(`   ⏳ Inserindo ${allItems.length} itens...`)
    for (let i = 0; i < allItems.length; i += BATCH) {
      const batch = allItems.slice(i, i + BATCH)
      const { error } = await supabase.from('sale_items').insert(batch)
      if (error) {
        console.error(`\n   ❌ Erro items lote ${Math.floor(i / BATCH) + 1}:`, error.message)
        errosItems++
        continue
      }
      totalItems += batch.length
      process.stdout.write(`\r   ⏳ Itens: ${Math.min(i + BATCH, allItems.length)}/${allItems.length}`)
    }
    console.log()

    // ── Inserir pagamentos ─────────────────────────────────────────────────
    const allPays = []
    for (const [extId, pays] of paysByKey) {
      const saleId = insertedMap.get(extId)
      if (!saleId) continue
      for (const p of pays) allPays.push({ sale_id: saleId, ...p })
    }

    console.log(`   ⏳ Inserindo ${allPays.length} pagamentos...`)
    for (let i = 0; i < allPays.length; i += BATCH) {
      const batch = allPays.slice(i, i + BATCH)
      const { error } = await supabase.from('payments').insert(batch)
      if (error) {
        console.error(`\n   ❌ Erro payments lote ${Math.floor(i / BATCH) + 1}:`, error.message)
        errosPays++
        continue
      }
      totalPayments += batch.length
      process.stdout.write(`\r   ⏳ Pagamentos: ${Math.min(i + BATCH, allPays.length)}/${allPays.length}`)
    }
    console.log()
  }

  console.log('\n' + '═'.repeat(44))
  console.log('🎉 IMPORTAÇÃO DE VENDAS CONCLUÍDA')
  console.log('═'.repeat(44))
  console.log(`  ✅ Vendas inseridas:   ${totalSales}`)
  console.log(`  ✅ Itens inseridos:    ${totalItems}`)
  console.log(`  ✅ Pagamentos:         ${totalPayments}`)
  console.log(`  ❌ Erros sales:        ${errosSales}`)
  console.log(`  ❌ Erros itens:        ${errosItems}`)
  console.log(`  ❌ Erros pagamentos:   ${errosPays}`)
  console.log('═'.repeat(44))
}

main().catch(err => { console.error('\nErro fatal:', err); process.exit(1) })
