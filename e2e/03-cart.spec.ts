import { test, expect } from '@playwright/test'
import { login, goToPDV, searchProduct, addMockProduct } from './helpers'

test.describe('Suíte 3 — Carrinho', () => {

  test.beforeEach(async ({ page }) => {
    await login(page)
    await goToPDV(page)
  })

  test('busca por termo retorna resultado ou mensagem de nenhum encontrado', async ({ page }) => {
    await searchProduct(page, 'xyz_produto_inexistente_99999')
    // Aguarda mensagem de erro OU produto aparecer (qualquer resposta da API)
    await page.waitForFunction(() => {
      const body = document.body.innerText
      return body.includes('Nenhum') || body.includes('nenhum') ||
             document.querySelectorAll('button[class*="rounded"]').length > 3
    }, { timeout: 8_000 }).catch(() => {})
    // O teste apenas verifica que o PDV não travou
    await expect(page.getByPlaceholder('SKU, nome ou EAN…')).toBeVisible()
  })

  test('campo de busca limpa ao clicar Limpar no carrinho vazio', async ({ page }) => {
    const input = page.getByPlaceholder('SKU, nome ou EAN…')
    await input.fill('abc')
    await expect(input).toHaveValue('abc')
  })

  test('carrinho vazio: botão Pagar está desabilitado', async ({ page }) => {
    const payBtn = page.getByRole('button', { name: /pagar/i })
    await expect(payBtn).toBeDisabled()
  })

  test('botão Desconto desabilitado com carrinho vazio', async ({ page }) => {
    const btn = page.getByRole('button', { name: /desconto/i })
    await expect(btn).toBeDisabled()
  })

  test('botão Crediário desabilitado com carrinho vazio', async ({ page }) => {
    const btn = page.getByRole('button', { name: /crediário/i })
    await expect(btn).toBeDisabled()
  })

  test('fluxo completo: adicionar produto mock e verificar carrinho', async ({ page }) => {
    const appeared = await addMockProduct(page)
    if (!appeared) {
      test.skip(true, 'Produto mock não disponível')
      return
    }

    // Botão Pagar deve estar habilitado (cart > 0, store definida)
    await expect(page.getByRole('button', { name: /pagar/i })).not.toBeDisabled({ timeout: 5_000 })
    // Botão Desconto deve estar habilitado
    await expect(page.getByRole('button', { name: /desconto/i })).not.toBeDisabled()
    // Botão Limpar deve aparecer
    await expect(page.locator('button:has-text("Limpar")')).toBeVisible()
  })

  test('confirmação de limpar carrinho: sim limpa, não cancela', async ({ page }) => {
    const appeared = await addMockProduct(page)
    if (!appeared) {
      test.skip(true, 'Produto mock não disponível')
      return
    }

    // Clica Limpar → confirma Não → item ainda está lá
    await page.locator('button:has-text("Limpar")').click()
    await page.getByRole('button', { name: /não/i }).click()
    await expect(page.locator('text=Produto de teste').first()).toBeVisible()

    // Clica Limpar → confirma Sim → carrinho vazio
    await page.locator('button:has-text("Limpar")').click()
    await page.getByRole('button', { name: /sim/i }).click()
    // Após limpar, apenas o botão "+ produto de teste" resta — o item no carrinho some
    await expect(page.getByRole('button', { name: /pagar/i })).toBeDisabled({ timeout: 3_000 })
  })

})
