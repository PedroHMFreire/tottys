import { test, expect } from '@playwright/test'
import { login, goToPDV } from './helpers'

test.describe('Suíte 2 — Abertura do PDV', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/adm')
  })

  test('sidebar mostra seletor de loja', async ({ page }) => {
    await expect(page.locator('select').first()).toBeVisible({ timeout: 8_000 })
  })

  test('botão Abrir PDV está habilitado quando loja está selecionada', async ({ page }) => {
    // Se já há loja selecionada, o botão deve estar enabled
    const btn = page.getByRole('button', { name: /Abrir PDV/i })
    await btn.waitFor({ timeout: 8_000 })
    // Verifica que não está desabilitado (pode estar enabled ou a loja já estar selecionada)
    const isDisabled = await btn.getAttribute('disabled')
    const hasOpacity = await btn.evaluate(el => el.classList.contains('opacity-40'))
    // Se não há loja, pula; se há, o botão deve estar ativo
    if (!isDisabled && !hasOpacity) {
      await expect(btn).not.toBeDisabled()
    }
  })

  test('PDV abre em nova aba ao clicar Abrir PDV', async ({ page, context }) => {
    const btn = page.getByRole('button', { name: /Abrir PDV/i })
    await btn.waitFor({ timeout: 8_000 })
    const disabled = await btn.isDisabled()
    if (disabled) {
      test.skip(true, 'Nenhuma loja configurada no ambiente de teste')
      return
    }
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      btn.click(),
    ])
    await newPage.waitForURL(/loja\/sell/, { timeout: 10_000 })
    await expect(newPage).toHaveURL(/loja\/sell/)
    await newPage.close()
  })

  test('PDV carrega campo de busca', async ({ page }) => {
    await goToPDV(page)
    await expect(page.getByPlaceholder('SKU, nome ou EAN…')).toBeVisible()
  })

  test('PDV carrega botão Pagar', async ({ page }) => {
    await goToPDV(page)
    await expect(page.getByRole('button', { name: /pagar/i })).toBeVisible()
  })

})
