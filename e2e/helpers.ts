import { Page } from '@playwright/test'

export const TEST_EMAIL    = process.env.TEST_EMAIL    ?? 'teste@tottys.com.br'
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'teste123456'

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByPlaceholder('voce@email.com').fill(TEST_EMAIL)
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/(adm|loja|gate)/, { timeout: 10_000 })
}

export async function goToPDV(page: Page) {
  // Passa pelo /adm para que o AdminLayout popule company+store no localStorage via Supabase
  await page.goto('/adm')

  await page.waitForFunction(() => {
    try {
      const store   = localStorage.getItem('app_selected_store')
      const company = localStorage.getItem('app_selected_company')
      return store ? JSON.parse(store)?.id && JSON.parse(company!)?.id : false
    } catch {
      return false
    }
  }, { timeout: 15_000 })

  await page.goto('/loja/sell')
  await page.waitForSelector('input[placeholder="SKU, nome ou EAN…"]', { timeout: 15_000 })
}

/** Abre o caixa via página /loja/cash se ainda estiver fechado. */
export async function openCaixa(page: Page) {
  await page.goto('/loja/cash')

  // Aguarda página carregar e verifica se caixa já está aberto ("ABERTO" no status)
  await page.waitForLoadState('networkidle').catch(() => {})
  const jaAberto = await page.locator('text=ABERTO').waitFor({ timeout: 5_000 })
    .then(() => true).catch(() => false)
  if (jaAberto) {
    await page.goto('/loja/sell')
    await page.waitForSelector('input[placeholder="SKU, nome ou EAN…"]', { timeout: 10_000 })
    return
  }

  // Aguarda o botão Abrir ser habilitado (store carrega async)
  await page.waitForSelector('button:not([disabled])', { timeout: 10_000 }).catch(() => {})
  const abrirBtn = page.locator('button', { hasText: 'Abrir' }).last()
  const enabled = await abrirBtn.isEnabled().catch(() => false)

  if (enabled) {
    await page.getByPlaceholder('Valor inicial').fill('0')
    await abrirBtn.click()
    await page.locator('text=/aberto/i').waitFor({ timeout: 8_000 }).catch(() => {})
  }

  await page.goto('/loja/sell')
  await page.waitForSelector('input[placeholder="SKU, nome ou EAN…"]', { timeout: 10_000 })
}

/** Adiciona o produto de teste ao carrinho clicando no botão visível no PDV. */
export async function addMockProduct(page: Page): Promise<boolean> {
  // Botão só aparece para OWNER/ADMIN/GERENTE — aguarda o role carregar
  const btn = page.locator('button:has-text("produto de teste")')
  const visible = await btn.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)
  if (!visible) return false
  await btn.click()
  // Usa .first() para evitar strict mode violation (o botão tb contém "produto de teste")
  return page.locator('text=Produto de teste').first().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
}

export async function searchProduct(page: Page, term: string) {
  const input = page.getByPlaceholder('SKU, nome ou EAN…')
  await input.clear()
  await input.fill(term)
  await page.getByRole('button', { name: /buscar/i }).click()
}
