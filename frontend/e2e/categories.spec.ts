import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123';

async function fetchPendingCode(request: import('@playwright/test').APIRequestContext, email: string) {
  const response = await request.get('/api/v1/auth/password-reset/debug-code/', {
    params: { email },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.code as string;
}

async function ensureKnownPassword(request: import('@playwright/test').APIRequestContext) {
  const requestReset = await request.post('/api/v1/auth/password-reset/request/', {
    data: { email: E2E_EMAIL },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(requestReset.ok()).toBeTruthy();

  const code = await fetchPendingCode(request, E2E_EMAIL);

  const confirmReset = await request.post('/api/v1/auth/password-reset/confirm/', {
    data: { email: E2E_EMAIL, code },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(confirmReset.ok()).toBeTruthy();
  const confirmBody = await confirmReset.json();

  const completeReset = await request.post('/api/v1/auth/password-reset/complete/', {
    data: {
      reset_token: confirmBody.reset_token,
      new_password: E2E_PASSWORD,
      new_password_confirm: E2E_PASSWORD,
    },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(completeReset.ok()).toBeTruthy();
}

test('valida tipo obrigatório, cria receita e bloqueia duplicidade de categoria', async ({ page, request }) => {
  await ensureKnownPassword(request);

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  await page.goto('/categories');
  await expect(page.getByRole('button', { name: 'Nova Categoria' })).toBeVisible();

  const uniqueName = `Receita E2E ${Date.now()}`;
  const modal = page.locator('.modal-content');
  const nameInput = modal.getByRole('textbox');

  await page.getByRole('button', { name: 'Nova Categoria' }).click();
  await expect(page.getByRole('heading', { name: 'Nova Categoria' })).toBeVisible();

  await nameInput.fill(uniqueName);
  await modal.getByRole('button', { name: 'Salvar' }).click();
  await expect(modal.getByText(/Escolha se esta categoria é uma receita ou uma despesa\./)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nova Categoria' })).toBeVisible();

  await page.getByLabel('Receita').check();
  await modal.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('heading', { name: 'Nova Categoria' })).not.toBeVisible();

  const incomePanel = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Receitas' }) });
  await expect(incomePanel.getByText(uniqueName)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Nova Categoria' }).click();
  await nameInput.fill(uniqueName);
  await page.getByLabel('Receita').check();
  await modal.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByText(/Já existe uma categoria com este nome para este tipo\./)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nova Categoria' })).toBeVisible();
});
