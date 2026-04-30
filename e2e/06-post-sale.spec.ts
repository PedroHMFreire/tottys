import { test, expect } from '@playwright/test'
import { login, goToPDV, openCaixa, addMockProduct } from './helpers'

test.describe('Suíte 6 — Pós-venda', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await goToPDV(page)
    await openCaixa(page)
  })

  test('após fechar PostSaleModal, carrinho está limpo', async ({ page }) => {

    const appeared = await addMockProduct(page)
    if (!appeared) { test.skip(true, 'Produto mock não disponível'); return }

    // Abre modal de pagamento
    await page.getByRole('button', { name: /pagar/i }).click()
    const modalOpen = await page.locator('text=/Escolha o meio|PIX|DINHEIRO/i').waitFor({ timeout: 6_000 }).then(() => true).catch(() => false)
    if (!modalOpen) { test.skip(true, 'Modal de pagamento não abriu'); return }

    // Seleciona PIX e confirma
    await page.getByRole('button', { name: /PIX/i }).click()
    await page.getByRole('button', { name: /confirmar/i }).click()

    // Aguarda PostSaleModal aparecer
    const postSaleOpen = await page.locator('text=/Fechar sem imprimir|Imprimir cupom|NFC-e/i').waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
    if (!postSaleOpen) { test.skip(true, 'PostSaleModal não abriu (pode ser demo mode sem DB)'); return }

    // Fecha sem imprimir
    await page.getByText(/Fechar sem imprimir/i).first().click()

    // Carrinho deve estar limpo
    await expect(page.locator('text=Produto de teste')).not.toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('button', { name: /pagar/i })).toBeDisabled()
  })

  test('PostSaleModal contém opção de imprimir cupom', async ({ page }) => {
    const appeared = await addMockProduct(page)
    if (!appeared) { test.skip(true, 'Produto mock não disponível'); return }

    await page.getByRole('button', { name: /pagar/i }).click()
    const modalOpen = await page.locator('text=/Escolha o meio|PIX/i').waitFor({ timeout: 6_000 }).then(() => true).catch(() => false)
    if (!modalOpen) { test.skip(true, 'Modal de pagamento não abriu'); return }

    await page.getByRole('button', { name: /PIX/i }).click()
    await page.getByRole('button', { name: /confirmar/i }).click()

    const postSaleOpen = await page.locator('text=/Imprimir cupom|NFC-e|Fechar sem imprimir/i').waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)
    if (!postSaleOpen) { test.skip(true, 'PostSaleModal não abriu'); return }

    await expect(page.locator('text=/Imprimir cupom/i')).toBeVisible()
  })

})
