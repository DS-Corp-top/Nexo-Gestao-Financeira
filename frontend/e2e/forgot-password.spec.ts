import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123';
const TEMP_PASSWORD = 'TempE2EPlaywright!456';

// Reads the pending code from the debug-only endpoint (unlocked via
// E2E_TESTING=true in playwright.config.ts) — there's no real mailbox to
// read from in this environment.
async function fetchPendingCode(request: import('@playwright/test').APIRequestContext, email: string) {
  const response = await request.get('/api/v1/auth/password-reset/debug-code/', {
    params: { email },
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.code as string;
}

// Assumes the page is already on /forgot-password.
async function completeResetFlow(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  newPassword: string
) {
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByLabel('Código de confirmação')).toBeVisible();

  const code = await fetchPendingCode(request, E2E_EMAIL);

  await page.getByLabel('Código de confirmação').fill(code);
  await page.getByRole('button', { name: 'Confirmar código' }).click();
  await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();

  await page.getByLabel('Nova senha', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirmar nova senha').fill(newPassword);
  await page.getByRole('button', { name: 'Redefinir senha' }).click();

  await expect(page.getByText('Sua senha foi alterada.')).toBeVisible();
}

test('recupera a senha por e-mail e consegue logar com a nova senha', async ({ page, request }) => {
  // Chega em /forgot-password pelo link da tela de login (prova que o link existe e funciona).
  await page.goto('/login');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.waitForURL('**/forgot-password');

  await completeResetFlow(page, request, TEMP_PASSWORD);
  await page.getByRole('link', { name: 'Ir para o login' }).click();
  await page.waitForURL('**/login');

  // Prova que a senha nova realmente funciona.
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(TEMP_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // Restaura a senha original — outros specs (ex: login-transaction) contam
  // com E2E_USER_PASSWORD, e o seed só roda uma vez no início da suíte.
  // Vai direto pra /forgot-password: passar por /login autenticado
  // redirecionaria pro dashboard antes de dar tempo de clicar no link.
  await page.goto('/forgot-password');
  await completeResetFlow(page, request, E2E_PASSWORD);
});
