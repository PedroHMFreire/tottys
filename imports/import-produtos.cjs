#!/usr/bin/env node
// imports/import-produtos.cjs
// Importa produtos do sistema legado para o Tottys (produtos + variantes)
// Uso: node imports/import-produtos.cjs

const XLSX  = require('xlsx')
const path  = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL     = 'https://ccspbvekbnwhblmjobql.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjc3BidmVrYm53aGJsbWpvYnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIwNjQ4MSwiZXhwIjoyMDkxNzgyNDgxfQ.cQ_Ioqn3FOVk7ufCR75h8Ro42Aj23J7_jncew3HzRaM'
const COMPANY_ID       = '7e6e3725-abc3-42cc-bfeb-0b9078c9b84b'
const FILES            = [
  path.join(__dirname, 'Produtos_1_ate_30000.xlsx'),
  path.join(__dirname, 'Produtos_30001_ate_45891.xlsx'),
]
const BATCH = 500

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Helpers ────────────────────────────────────────────────────────────────

const nil = v => !v || ['---','SEM GTIN','0',''].includes(String(v).trim())

const SIZES = ['4XG','3XG','2XG','XGG','XGG','EXG','XG','GG','PP','XP','XM',
               'G','M','P','U','UNI','UNICO',
               '56','54','52','50','48','46','44','42','40','38','36','34']
const SIZES_PATTERN = SIZES.join('|')
const RE_COR_TAM = /^(.+?)\s*-\s*COR:\s*([^,]+),\s*TAM:\s*(.+)$/i
const RE_SIZE_END = new RegExp('^(.+?)\\s+(' + SIZES_PATTERN + ')\\s*$', 'i')

function parseName(nome) {
  const s = String(nome ?? '').trim()

  // Padrão 1: "NOME - COR: AZUL, TAM: G"
  const m1 = s.match(RE_COR_TAM)
  if (m1) return {
    family:  m1[1].trim().toUpperCase(),
    cor:     m1[2].trim().toUpperCase(),
    tamanho: m1[3].trim().toUpperCase(),
  }

  // Padrão 2: "NOME XG" (tamanho no final)
  const m2 = s.match(RE_SIZE_END)
  if (m2) return {
    family:  m2[1].trim().toUpperCase(),
    cor:     '-',
    tamanho: m2[2].trim().toUpperCase(),
  }

  // Produto simples
  return { family: s.toUpperCase(), cor: '-', tamanho: 'UN' }
}

// Preço mais frequente (mode) de um conjunto de variantes
function modePrice(rows) {
  const prices = rows.map(({ r }) => Number(r['ValorPrecoFixado']) || 0).filter(p => p > 0)
  if (!prices.length) return 0
  const freq = {}
  let maxF = 0, mode = prices[0]
  for (const p of prices) {
    freq[p] = (freq[p] || 0) + 1
    if (freq[p] > maxF) { maxF = freq[p]; mode = p }
  }
  return mode
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📂 Lendo planilhas...')
  let all = []
  for (const f of FILES) {
    const rows = XLSX.utils.sheet_to_json(XLSX.readFile(f).Sheets['DATAEXPORT'], { defval: null })
    all = all.concat(rows)
    console.log(`   ${path.basename(f)}: ${rows.length} linhas`)
  }
  console.log(`📋 Total de SKUs: ${all.length}`)

  // ── PASSO 1: Agrupar por família ─────────────────────────────────────────
  console.log('\n🗂️  Agrupando por família de produto...')
  const families = new Map() // familyName → { meta, rows }

  for (const r of all) {
    const { family, cor, tamanho } = parseName(r['Nome'])

    if (!families.has(family)) {
      families.set(family, {
        ncm:       nil(r['NCM'])              ? null : String(r['NCM']).trim(),
        unidade:   nil(r['UnidadeComercial'])  ? 'UN'  : String(r['UnidadeComercial']).trim(),
        marca:     nil(r['Marca'])             ? null  : String(r['Marca']).trim().toUpperCase(),
        categoria: nil(r['Categoria'])         ? null  : String(r['Categoria']).split('|')[0].trim(),
        rows:      [],
      })
    }
    families.get(family).rows.push({ r, cor, tamanho })
  }
  console.log(`✅ ${families.size} famílias identificadas`)

  // ── PASSO 2: Inserir produtos (famílias) ──────────────────────────────────
  const productRows = []
  for (const [family, fam] of families) {
    productRows.push({
      company_id:   COMPANY_ID,
      nome:         family,
      preco:        modePrice(fam.rows),
      ncm:          fam.ncm,
      unidade:      fam.unidade,
      marca:        fam.marca,
      categoria:    fam.categoria,
      has_variants: fam.rows.length > 1,
      ativo:        true,
    })
  }

  console.log(`\n📦 Inserindo ${productRows.length} produtos...`)
  const productIdMap = new Map() // nome → id
  let prodErros = 0

  for (let i = 0; i < productRows.length; i += BATCH) {
    const batch = productRows.slice(i, i + BATCH)
    const { data, error } = await supabase
      .from('products')
      .insert(batch)
      .select('id, nome')

    if (error) {
      console.error(`\n❌ Erro produtos lote ${Math.floor(i / BATCH) + 1}:`, error.message)
      prodErros++
      continue
    }
    for (const p of data) productIdMap.set(p.nome, p.id)
    process.stdout.write(`\r⏳ Produtos: ${Math.min(i + BATCH, productRows.length)}/${productRows.length}`)
  }
  console.log(`\n✅ Produtos no mapa: ${productIdMap.size} (${prodErros} lotes com erro)`)

  // ── PASSO 3: Inserir variantes ────────────────────────────────────────────
  console.log(`\n🎨 Preparando variantes...`)
  const variantRows = []
  const variantKeys = new Set()
  let dupCount = 0

  for (const [family, fam] of families) {
    const productId = productIdMap.get(family)
    if (!productId) continue

    const basePrice = modePrice(fam.rows)

    for (const { r, cor, tamanho } of fam.rows) {
      // Garante unicidade de (product_id, tamanho, cor)
      let tam = tamanho, attempt = 0
      let key = `${productId}|${tam}|${cor}`
      while (variantKeys.has(key)) {
        attempt++
        tam = `${tamanho}-${attempt}`
        key = `${productId}|${tam}|${cor}`
        dupCount++
      }
      variantKeys.add(key)

      const ean   = nil(r['EAN (Codigo Barras)']) ? null : String(r['EAN (Codigo Barras)']).trim()
      const preco = Number(r['ValorPrecoFixado']) || 0

      variantRows.push({
        product_id:     productId,
        tamanho:        tam,
        cor,
        sku:            nil(r['CodigoNFe']) ? null : String(r['CodigoNFe']).trim(),
        ean:            ean,
        price_override: preco > 0 && preco !== basePrice ? preco : null,
        external_id:    r['Identificador'] ? String(r['Identificador']) : null,
      })
    }
  }
  console.log(`✅ ${variantRows.length} variantes preparadas (${dupCount} desambiguações de nome)`)

  console.log(`\n🎨 Inserindo variantes em lotes de ${BATCH}...`)
  let variantTotal = 0, varErros = 0

  for (let i = 0; i < variantRows.length; i += BATCH) {
    const batch = variantRows.slice(i, i + BATCH)
    const { error } = await supabase.from('product_variants').insert(batch)
    if (error) {
      console.error(`\n❌ Erro variantes lote ${Math.floor(i / BATCH) + 1}:`, error.message)
      varErros++
      continue
    }
    variantTotal += batch.length
    process.stdout.write(`\r⏳ Variantes: ${variantTotal}/${variantRows.length}`)
  }

  console.log('\n')
  console.log('═'.repeat(44))
  console.log('🎉 IMPORTAÇÃO DE PRODUTOS CONCLUÍDA')
  console.log('═'.repeat(44))
  console.log(`  ✅ Famílias de produto:    ${productIdMap.size}`)
  console.log(`  ✅ Variantes (SKUs):       ${variantTotal}`)
  console.log(`  🔀 Desambiguações:         ${dupCount}`)
  console.log(`  ❌ Lotes com erro (prod):  ${prodErros}`)
  console.log(`  ❌ Lotes com erro (var):   ${varErros}`)
  console.log('═'.repeat(44))
}

main().catch(err => { console.error('\nErro fatal:', err); process.exit(1) })
