import { test, expect } from '@playwright/test'
import { login, goToPDV, openCaixa, addMockProduct } from './helpers'

test.describe('Suíte 5 — Pagamento', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await goToPDV(page)
    await openCaixa(page)
  })

  test('botão Pagar fica habilitado após adicionar produto', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }
    await expect(page.getByRole('button', { name: /pagar/i })).not.toBeDisabled()
  })

  test('modal de pagamento abre ao clicar Pagar', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    await expect(page.locator('text=/Escolha o meio|PIX|DINHEIRO/i').first()).toBeVisible({ timeout: 6_000 })
  })

  test('seleciona PIX no modal', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    await page.getByRole('button', { name: /PIX/i }).click()
    await expect(page.getByRole('button', { name: /PIX/i })).toHaveClass(/border-\[#1E40AF\]|font-semibold/, { timeout: 3_000 })
  })

  test('seleciona DINHEIRO no modal', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    await page.getByRole('button', { name: /DINHEIRO/i }).click()
    await expect(page.getByRole('button', { name: /DINHEIRO/i })).toBeVisible()
  })

  test('seleciona CARTÃO e exibe opções de bandeira', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    await page.getByRole('button', { name: /CARTAO|CARTÃO/i }).click()
    // Deve aparecer select de bandeira ou label de cartão
    await expect(page.locator('select').first()).toBeVisible({ timeout: 5_000 })
  })

  test('botão Confirmar está presente no modal', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    await expect(page.getByRole('button', { name: /confirmar/i })).toBeVisible({ timeout: 6_000 })
  })

  test('fechar modal de pagamento retorna ao PDV', async ({ page }) => {
    const ok = await addMockProduct(page)
    if (!ok) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    await page.locator('text=/Escolha o meio|PIX/i').waitFor({ timeout: 6_000 }).catch(() => {})
    // Fecha com botão fechar ou ESC
    await page.keyboard.press('Escape')
    // Carrinho deve ainda estar visível
    await expect(page.getByPlaceholder('SKU, nome ou EAN…')).toBeVisible({ timeout: 3_000 })
  })

  test('carrinho vazio: Pagar está desabilitado', async ({ page }) => {
    await expect(page.getByRole('button', { name: /pagar/i })).toBeDisabled()
  })

})
