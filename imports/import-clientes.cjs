#!/usr/bin/env node
// imports/import-clientes.js
// Importa clientes do sistema legado para o Tottys
// Uso: node imports/import-clientes.js

const XLSX  = require('xlsx')
const path  = require('path')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL      = 'https://ccspbvekbnwhblmjobql.supabase.co'
const SERVICE_ROLE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjc3BidmVrYm53aGJsbWpvYnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIwNjQ4MSwiZXhwIjoyMDkxNzgyNDgxfQ.cQ_Ioqn3FOVk7ufCR75h8Ro42Aj23J7_jncew3HzRaM'
const COMPANY_ID        = '7e6e3725-abc3-42cc-bfeb-0b9078c9b84b'
const FILE              = path.join(__dirname, '0bed2d9e-17e3-493b-85cb-6f21ccdd89bb.xlsx')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Helpers ────────────────────────────────────────────────────────────────

const nil = v => !v || String(v).trim() === '---' || String(v).trim() === ''

// Converte serial do Excel para string de data (YYYY-MM-DD)
function excelToDate(serial) {
  if (!serial || typeof serial !== 'number') return null
  const d = new Date((serial - 25569) * 86400 * 1000)
  return isNaN(d) ? null : d.toISOString().split('T')[0]
}

// Converte serial do Excel para ISO timestamp
function excelToISO(serial) {
  if (!serial || typeof serial !== 'number') return null
  const d = new Date((serial - 25569) * 86400 * 1000)
  return isNaN(d) ? null : d.toISOString()
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📂 Lendo planilha...')
  const wb  = XLSX.readFile(FILE)
  const raw = XLSX.utils.sheet_to_json(wb.Sheets['DATAEXPORT'], { defval: null })

  // 1. Filtra somente clientes
  let clientes = raw.filter(r => r['Cliente'] === 'SIM')
  console.log(`📋 Total de clientes na planilha: ${clientes.length}`)

  // 2. Descarta registros com só o nome (sem CPF, telefone e email)
  const totalAntes = clientes.length
  clientes = clientes.filter(r => {
    const cpf   = nil(r['CNPJ_CPF'])   ? null : String(r['CNPJ_CPF']).replace(/\D/g, '')
    const tel   = nil(r['Telefone'])   ? null : String(r['Telefone']).replace(/\D/g, '')
    const cel   = nil(r['Celular'])    ? null : String(r['Celular']).replace(/\D/g, '')
    const email = nil(r['Email'])      ? null : String(r['Email']).trim()
    return (cpf && cpf.length >= 11) || !!(tel || cel) || (email && email.includes('@'))
  })
  console.log(`🗑️  Descartados (só nome, sem contato): ${totalAntes - clientes.length}`)

  // 3. Deduplica CPFs: mantém o registro mais recente
  const cpfMap = new Map()
  const semCpf = []
  for (const r of clientes) {
    const cpf = nil(r['CNPJ_CPF']) ? null : String(r['CNPJ_CPF']).replace(/\D/g, '')
    if (!cpf || cpf.length < 11) { semCpf.push(r); continue }
    const existing = cpfMap.get(cpf)
    const dataAtual    = r['Data de Registro'] || 0
    const dataExisting = existing ? (existing['Data de Registro'] || 0) : 0
    if (!existing || dataAtual > dataExisting) cpfMap.set(cpf, r)
  }
  const deduped = [...cpfMap.values(), ...semCpf]
  console.log(`🔄 Após deduplicação: ${deduped.length} (removidos ${clientes.length - deduped.length} CPFs duplicados)`)

  // 4. Busca CPFs já existentes no banco para não criar duplicatas
  const { data: existentes } = await supabase
    .from('customers')
    .select('cpf_cnpj')
    .eq('company_id', COMPANY_ID)
    .not('cpf_cnpj', 'is', null)
  const cpfsExistentes = new Set((existentes || []).map(r => r.cpf_cnpj))
  console.log(`🏦 CPFs já cadastrados no banco: ${cpfsExistentes.size}`)

  // 5. Monta registros para inserção
  const rows = deduped
    .filter(r => {
      const cpf = nil(r['CNPJ_CPF']) ? null : String(r['CNPJ_CPF']).replace(/\D/g, '')
      // Pula se CPF já existe no banco
      if (cpf && cpf.length >= 11 && cpfsExistentes.has(cpf)) return false
      return true
    })
    .map(r => {
      const cpf   = nil(r['CNPJ_CPF']) ? null : String(r['CNPJ_CPF']).replace(/\D/g, '')
      const tel   = nil(r['Telefone']) ? null : String(r['Telefone']).replace(/\D/g, '')
      const cel   = nil(r['Celular'])  ? null : String(r['Celular']).replace(/\D/g, '')
      const email = nil(r['Email'])    ? null : String(r['Email']).trim().toLowerCase()
      return {
        company_id:      COMPANY_ID,
        nome:            String(r['NomeFantasia']).trim().toUpperCase(),
        cpf_cnpj:        cpf && cpf.length >= 11 ? cpf : null,
        contato:         cel || tel || null,
        email:           email && email.includes('@') ? email : null,
        data_nascimento: excelToDate(r['DataNascimentoFundacao']),
        external_id:     r['Identificador'] ? String(r['Identificador']) : null,
        created_at:      excelToISO(r['Data de Registro']) || new Date().toISOString(),
      }
    })

  console.log(`✅ Registros prontos para inserção: ${rows.length}`)
  if (rows.length === 0) { console.log('Nada a inserir. Encerrando.'); return }

  // 6. Insere em lotes de 500
  const BATCH_SIZE = 500
  let totalInserido = 0
  let lotesComErro  = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('customers').insert(lote)
    if (error) {
      console.error(`\n❌ Erro no lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message)
      lotesComErro++
    } else {
      totalInserido += lote.length
      process.stdout.write(`\r⏳ Inseridos: ${totalInserido}/${rows.length}`)
    }
  }

  console.log('\n')
  console.log('═'.repeat(40))
  console.log('🎉 IMPORTAÇÃO CONCLUÍDA')
  console.log('═'.repeat(40))
  console.log(`  ✅ Clientes inseridos:  ${totalInserido}`)
  console.log(`  ⚠️  Lotes com erro:     ${lotesComErro}`)
  console.log(`  ⏭️  CPFs já existentes: ${cpfsExistentes.size}`)
  console.log('═'.repeat(40))
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1) })
