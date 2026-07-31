import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123';

test('cria TAP com tecnologias, co-responsaveis e imprime com data e assinaturas', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  const suffix = Date.now();
  const projectName = `Projeto TAP E2E ${suffix}`;

  await page.evaluate(async (name) => {
    const response = await fetch('/api/v1/todo-projects/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        name,
        description: 'Projeto criado para validar o fluxo E2E de TAP.',
      }),
    });
    if (!response.ok) {
      throw new Error(`Falha ao criar projeto E2E: ${response.status}`);
    }
  }, projectName);

  await page.goto('/tap');
  await expect(page.getByRole('heading', { name: /Termo de Abertura de Projeto/ })).toBeVisible();

  const newTapButton = page.getByRole('button', { name: /Novo TAP/ });
  await expect(newTapButton).toBeEnabled();
  await newTapButton.click();

  await page.getByLabel('Projeto *').selectOption({ label: projectName });
  await page.getByLabel('Patrocinador').fill('Diretoria E2E');
  await page.getByLabel('Gerente do projeto').fill('Gerente E2E');
  await page.getByLabel('Co-responsáveis').fill('Ana E2E\nBruno E2E');
  await page.getByLabel('Tecnologias utilizadas').fill('React, Django, PostgreSQL e Redis');
  await page.getByLabel('Justificativa').fill('Validar impressao completa do TAP.');
  await page.getByLabel('Objetivos').fill('Garantir data de emissao e assinaturas no documento.');

  await page.getByRole('button', { name: 'Salvar TAP' }).click();

  await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Diretoria E2E')).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await page.getByTitle('Imprimir').first().click();
  const popup = await popupPromise;

  await expect(popup.locator('body')).toContainText(projectName);
  await expect(popup.locator('body')).toContainText('Validar impressao completa do TAP.');
  await expect(popup.locator('body')).toContainText('React, Django, PostgreSQL e Redis');
  await expect(popup.locator('body')).toContainText(/Data de emiss/i);
  await expect(popup.locator('body')).toContainText('Assinaturas');
  await expect(popup.locator('body')).toContainText('Diretoria E2E');
  await expect(popup.locator('body')).toContainText('Gerente E2E');
  await expect(popup.locator('body')).toContainText('Ana E2E');
  await expect(popup.locator('body')).toContainText('Bruno E2E');
});
