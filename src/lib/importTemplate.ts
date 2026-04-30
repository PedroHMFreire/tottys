// src/lib/importTemplate.ts
import * as XLSX from 'xlsx'

const PRODUCT_FIELDS = [
  { header: 'SKU / Código',         desc: 'Código interno. Gerado automaticamente se vazio.' },
  { header: 'Nome / Descrição',      desc: 'OBRIGATÓRIO.' },
  { header: 'Preço de Venda',        desc: 'OBRIGATÓRIO. Ex: 89.90 ou 89,90  (sem R$)' },
  { header: 'Custo',                 desc: 'Preço de custo/compra. Ex: 45.00' },
  { header: 'EAN / Cód. Barras',     desc: 'EAN-8 ou EAN-13.' },
  { header: 'Estoque Inicial',       desc: 'Número inteiro. Ex: 10' },
  { header: 'Marca',                 desc: 'Ex: Nike, Zara, Própria' },
  { header: 'Categoria',             desc: 'Ex: Blusas, Calças, Acessórios' },
  { header: 'Unidade',               desc: 'UN, PC, KG, PAR, M...' },
  { header: 'NCM',                   desc: '8 dígitos. Ex: 62034200' },
  { header: 'CFOP',                  desc: 'Ex: 5102' },
  { header: 'CEST',                  desc: 'Apenas se produto tem Substituição Tributária.' },
  { header: 'Origem',                desc: '0=Nacional  1=Estrangeiro (importação direta)  2=Estrangeiro (mercado interno)' },
  { header: 'Grupo Tributário',      desc: 'CSOSN ou CST. Ex: 400, 102' },
]

const EXAMPLE_ROW_1 = [
  'CAL-001', 'Calça Jeans Slim Azul', '149.90', '75.00', '7891234567890',
  '10', 'Marca X', 'Calças', 'UN', '62034200', '5102', '', '0', '400',
]

const EXAMPLE_ROW_2 = [
  'BLU-002', 'Blusa Listrada Branca P', '89.90', '40.00', '',
  '5', 'Marca Y', 'Blusas', 'UN', '61091000', '5102', '', '0', '400',
]

const INSTRUCTIONS = [
  ['INSTRUÇÕES DE PREENCHIMENTO'],
  [],
  ['COMO USAR ESTA PLANILHA'],
  ['1.', 'Preencha a aba "Produtos" a partir da linha 2 (apague ou substitua os exemplos).'],
  ['2.', 'Salve o arquivo (mantenha o formato .xlsx ou salve como .csv).'],
  ['3.', 'Na tela de importação, clique em "Selecionar arquivo" e escolha este arquivo.'],
  ['4.', 'Confirme o mapeamento de colunas e clique em "Importar".'],
  [],
  ['CAMPOS OBRIGATÓRIOS'],
  ['Nome / Descrição', 'Nome do produto. Ex: Calça Jeans Slim Azul'],
  ['Preço de Venda', 'Use ponto ou vírgula como decimal. Sem R$. Ex: 89.90 ou 89,90'],
  [],
  ['CAMPOS OPCIONAIS'],
  ['SKU / Código', 'Se vazio, será gerado automaticamente pelo sistema.'],
  ['Custo', 'Preço de compra. Usado para calcular margem.'],
  ['EAN / Cód. Barras', 'Código de barras EAN-8 ou EAN-13.'],
  ['Estoque Inicial', 'Quantidade em estoque. Se vazio, produto é cadastrado sem saldo.'],
  ['Marca', 'Fabricante ou marca do produto.'],
  ['Categoria', 'Categoria para filtros e relatórios.'],
  ['Unidade', 'Unidade de medida: UN, PC, KG, PAR, M, etc.'],
  [],
  ['CAMPOS FISCAIS (necessários apenas para emissão de NF-e)'],
  ['NCM', '8 dígitos. Nomenclatura Comum do Mercosul.'],
  ['CFOP', 'Código Fiscal de Operações. Ex: 5102'],
  ['CEST', 'Código de Substituição Tributária. Apenas produtos com ST.'],
  ['Origem', '0 = Nacional, 1 = Estrangeiro importação direta, 2 = Estrangeiro mercado interno.'],
  ['Grupo Tributário', 'CSOSN ou CST. Ex: 400 (Simples sem ST), 102 (Simples sem ST).'],
  [],
  ['DÚVIDAS'],
  ['', 'Campos extras na sua planilha são simplesmente ignorados na importação.'],
  ['', 'A ordem das colunas não precisa ser igual — você mapeia na próxima tela.'],
  ['', 'Arquivos com até 30.000 linhas são suportados.'],
]

function writeBlob(wb: XLSX.WorkBook, filename: string) {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadProductTemplate() {
  const headers = PRODUCT_FIELDS.map(f => f.header)
  const ws = XLSX.utils.aoa_to_sheet([headers, EXAMPLE_ROW_1, EXAMPLE_ROW_2])
  ws['!cols'] = PRODUCT_FIELDS.map((_, i) => ({
    wch: i === 1 ? 32 : i === 0 ? 14 : i < 6 ? 18 : 16,
  }))

  const wsInstr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS)
  wsInstr['!cols'] = [{ wch: 22 }, { wch: 70 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções')
  writeBlob(wb, 'modelo_produtos_tottys.xlsx')
}

/** Template simplificado (5 campos) para o fluxo de onboarding */
export function downloadOnboardingTemplate() {
  const headers = ['SKU / Código', 'Nome / Descrição', 'Preço de Venda', 'Estoque Inicial', 'EAN / Cód. Barras']
  const ex1 = ['CAL-001', 'Calça Jeans Slim Azul', '149.90', '10', '7891234567890']
  const ex2 = ['BLU-002', 'Blusa Listrada Branca P', '89.90', '5', '']
  const ex3 = ['VES-003', 'Vestido Floral M', '119.90', '8', '']

  const ws = XLSX.utils.aoa_to_sheet([headers, ex1, ex2, ex3])
  ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 20 }]

  const wsInstr = XLSX.utils.aoa_to_sheet([
    ['INSTRUÇÕES'],
    [],
    ['1.', 'Preencha seus produtos a partir da linha 2 (apague os exemplos).'],
    ['2.', 'Salve e importe na tela anterior.'],
    [],
    ['OBRIGATÓRIO', 'Nome / Descrição e Preço de Venda.'],
    ['OPCIONAL', 'SKU (gerado automaticamente se vazio), Estoque e EAN.'],
    [],
    ['PREÇOS', 'Use ponto ou vírgula: 89.90 ou 89,90. Sem R$.'],
    ['ESTOQUE', 'Número inteiro. Deixe vazio para cadastrar sem saldo.'],
  ])
  wsInstr['!cols'] = [{ wch: 14 }, { wch: 60 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instruções')
  writeBlob(wb, 'modelo_produtos_simples.xlsx')
}
