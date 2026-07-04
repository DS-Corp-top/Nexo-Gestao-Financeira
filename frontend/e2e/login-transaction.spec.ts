import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123';

test('login, navega até Financeiro e cria uma transação', async ({ page }) => {
  // --- Login ---
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Login shows a ~2.5s splash screen before redirecting — give it room.
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Financeiro' })).toBeVisible();

  // --- Navegação ---
  await page.getByRole('link', { name: 'Financeiro' }).click();
  await page.waitForURL('**/transactions');

  // --- Ação financeira: criar uma transação ---
  await page.getByRole('button', { name: '+ Nova transação' }).click();
  await page.waitForURL('**/transactions/new');

  const description = `E2E Playwright ${Date.now()}`;
  await page.getByPlaceholder('Ex: Mercado, Salário...').fill(description);
  await page.locator('label:has-text("Valor (R$)") + input').fill('123.45');
  await page.locator('label:has-text("Conta bancária") + select').selectOption({ label: 'Conta E2E' });

  await page.getByRole('button', { name: 'Salvar' }).click();

  await page.waitForURL('**/transactions');
  await expect(page.getByText(description)).toBeVisible({ timeout: 10_000 });
});
