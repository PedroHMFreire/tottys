import { test, expect } from '@playwright/test'
import { TEST_EMAIL, TEST_PASSWORD, login } from './helpers'

test.describe('Suíte 1 — Autenticação', () => {

  test('página raiz renderiza formulário de login', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByPlaceholder('voce@email.com')).toBeVisible({ timeout: 8_000 })
  })

  test('/adm carrega sem redirecionamento (RLS protege os dados)', async ({ page }) => {
    await page.goto('/adm')
    // A página carrega — não há guard de rota, proteção é via RLS no Supabase
    await expect(page).toHaveURL(/adm/)
  })

  test('login com credenciais inválidas exibe erro', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('voce@email.com').fill('invalido@nao.existe')
    await page.getByPlaceholder('••••••••').fill('senhaerrada')
    await page.locator('button[type="submit"]').click()
    await expect(page.locator('text=/falha|inválid|incorrect|Invalid/i')).toBeVisible({ timeout: 8_000 })
  })

  test('login válido redireciona para área autenticada', async ({ page }) => {
    await login(page)
    await expect(page).not.toHaveURL(/login/)
  })

  test('logout retorna para /login', async ({ page }) => {
    await login(page)
    // Clica no primeiro botão Sair visível (header)
    await page.locator('button:has-text("Sair")').first().click()
    await expect(page).toHaveURL(/login/, { timeout: 8_000 })
  })

})
