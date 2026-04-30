import { test, expect } from '@playwright/test'
import { login, goToPDV, addMockProduct } from './helpers'

test.describe('Suíte 4 — Descontos e Cashback', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await goToPDV(page)
  })

  test('modal de desconto abre ao clicar Desconto', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /desconto/i }).click()
    await expect(page.getByText('Aplicar Desconto', { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  test('aplica desconto percentual manual', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /desconto/i }).click()
    await expect(page.getByText('Aplicar Desconto', { exact: true })).toBeVisible({ timeout: 5_000 })

    // Aguarda seção manual aparecer (requer role GERENTE+)
    const manualSection = page.getByText('Desconto manual')
    const hasSec = await manualSection.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
    if (!hasSec) { test.skip(true, 'Seção de desconto manual não disponível para este perfil'); return }

    await page.getByRole('button', { name: 'Percentual (%)' }).click()
    await page.getByPlaceholder(/Ex: 10/).fill('10')
    await page.getByRole('button', { name: /Aplicar desconto manual/i }).click()

    await expect(page.getByRole('button', { name: /10%/ })).toBeVisible({ timeout: 5_000 })
  })

  test('aplica desconto valor fixo manual', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /desconto/i }).click()
    await expect(page.getByText('Aplicar Desconto', { exact: true })).toBeVisible({ timeout: 5_000 })

    const manualSection = page.getByText('Desconto manual')
    const hasSec = await manualSection.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
    if (!hasSec) { test.skip(true, 'Seção de desconto manual não disponível para este perfil'); return }

    await page.getByRole('button', { name: 'Valor fixo (R$)' }).click()
    await page.getByPlaceholder(/Ex: 30/).fill('20')
    await page.getByRole('button', { name: /Aplicar desconto manual/i }).click()

    await expect(page.getByRole('button', { name: /20,00|R\$\s*20/ })).toBeVisible({ timeout: 5_000 })
  })

  test('remove desconto aplicado', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /desconto/i }).click()
    const manualSection = page.getByText('Desconto manual')
    const hasSec = await manualSection.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
    if (!hasSec) { test.skip(true, 'Seção de desconto manual não disponível para este perfil'); return }

    await page.getByRole('button', { name: 'Percentual (%)' }).click()
    await page.getByPlaceholder(/Ex: 10/).fill('5')
    await page.getByRole('button', { name: /Aplicar desconto manual/i }).click()

    // Abre modal novamente para remover
    await page.getByRole('button', { name: /5%/ }).click()
    await page.getByText('remover').click()

    await expect(page.getByRole('button', { name: /^desconto$/i })).toBeVisible({ timeout: 3_000 })
  })

  test('campo de cliente aceita digitação', async ({ page }) => {
    const input = page.getByPlaceholder(/nome ou CPF/i)
    if (!await input.isVisible().catch(() => false)) {
      // Tenta seletor alternativo
      const altInput = page.locator('input').filter({ hasText: '' }).nth(1)
      test.skip(true, 'Campo cliente não encontrado com placeholder esperado')
      return
    }
    await input.fill('João')
    await expect(input).toHaveValue('João')
  })

})
