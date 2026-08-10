import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123';
const CARD_PREFIX = 'Cartao Dashboard E2E';
const CATEGORY_PREFIX = 'Categoria Dashboard E2E';
const TRANSACTION_PREFIX = 'Compra Dashboard E2E';

type MonthInfo = {
  monthParam: string;
  firstDay: string;
  lastDay: string;
  year: number;
  month: number;
};

function monthInfo(offset = 0): MonthInfo {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const iso = (value: Date) => value.toISOString().slice(0, 10);

  return {
    monthParam: `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`,
    firstDay: iso(base),
    lastDay: iso(lastDay),
    year: base.getFullYear(),
    month: base.getMonth() + 1,
  };
}

function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && 'results' in payload) {
    return (payload as { results?: T[] }).results || [];
  }
  return [];
}

async function getTenantHeaders(page: import('@playwright/test').Page) {
  const meResponse = await page.request.get('/api/v1/me/', {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  expect(meResponse.ok()).toBeTruthy();
  const me = await meResponse.json();
  const tenantId = me.tenant?.id ? String(me.tenant.id) : null;
  expect(tenantId).toBeTruthy();

  return {
    'X-Requested-With': 'XMLHttpRequest',
    'X-Tenant-ID': tenantId!,
  };
}

async function prepareDashboardScenario(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  info: MonthInfo,
  options: { totalLimit: string; expenseAmount: string; runId: string },
) {
  const cardName = `${CARD_PREFIX} ${info.monthParam} ${options.runId}`;
  const categoryName = `${CATEGORY_PREFIX} ${info.monthParam} ${options.runId}`;
  const transactionDescription = `${TRANSACTION_PREFIX} ${info.monthParam} ${options.runId}`;

  const accountsResponse = await page.request.get('/api/v1/accounts/', { headers });
  expect(accountsResponse.ok()).toBeTruthy();
  const accounts = asList<{ id: number; name: string; account_type: string; is_active: boolean }>(
    await accountsResponse.json()
  );
  const existingCard = accounts.find((account) => account.name === cardName);

  let cardId = existingCard?.id;
  if (!cardId) {
    const createCard = await page.request.post('/api/v1/accounts/', {
      headers,
      data: {
        name: cardName,
        account_type: 'card',
        currency: 'BRL',
        initial_balance: '0.00',
        credit_limit: null,
        backing_investment: null,
        include_in_balance: false,
        is_active: true,
      },
    });
    expect(createCard.ok()).toBeTruthy();
    const createdCard = await createCard.json();
    cardId = createdCard.id as number;
  } else {
    const updateCard = await page.request.patch(`/api/v1/accounts/${cardId}/`, {
      headers,
      data: {
        credit_limit: null,
        include_in_balance: false,
        is_active: true,
      },
    });
    expect(updateCard.ok()).toBeTruthy();
  }

  const categoriesResponse = await page.request.get('/api/v1/categories/', { headers });
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = asList<{ id: number; name: string; category_type: string }>(
    await categoriesResponse.json()
  );
  const existingCategory = categories.find(
    (category) => category.name === categoryName && category.category_type === 'expense'
  );

  let categoryId = existingCategory?.id;
  if (!categoryId) {
    const createCategory = await page.request.post('/api/v1/categories/', {
      headers,
      data: {
        name: categoryName,
        category_type: 'expense',
        expense_kind: 'operating',
      },
    });
    expect(createCategory.ok()).toBeTruthy();
    const createdCategory = await createCategory.json();
    categoryId = createdCategory.id as number;
  }

  const upsertLimit = await page.request.post('/api/v1/card-limits/', {
    headers,
    data: {
      account: cardId,
      year: info.year,
      month: info.month,
      amount: options.totalLimit,
    },
  });
  expect(upsertLimit.ok()).toBeTruthy();

  const transactionsResponse = await page.request.get('/api/v1/transactions/', {
    headers,
    params: {
      account: String(cardId),
      date__gte: info.firstDay,
      date__lte: info.lastDay,
    },
  });
  expect(transactionsResponse.ok()).toBeTruthy();
  const transactions = asList<{ description: string }>(await transactionsResponse.json());
  const existingScenario = transactions.some(
    (transaction) => transaction.description === transactionDescription
  );

  if (!existingScenario) {
    const createTransaction = await page.request.post('/api/v1/transactions/', {
      headers,
      data: {
        transaction_type: 'expense',
        amount: options.expenseAmount,
        date: info.firstDay,
        account: cardId,
        destination_account: null,
        category: categoryId,
        description: transactionDescription,
        is_cleared: true,
        is_ignored: false,
        recurrence_type: 'once',
        recurrence_interval: 1,
        recurrence_interval_unit: 'month',
        installment_count: null,
      },
    });
    expect(createTransaction.ok()).toBeTruthy();
  }
}

async function deactivateOtherDashboardCards(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  allowedCardNames: string[],
) {
  const accountsResponse = await page.request.get('/api/v1/accounts/', { headers });
  expect(accountsResponse.ok()).toBeTruthy();
  const accounts = asList<{ id: number; name: string; account_type: string; is_active: boolean }>(
    await accountsResponse.json()
  );
  const allowedNames = new Set(allowedCardNames);

  for (const account of accounts) {
    if (account.account_type !== 'card') continue;
    if (!account.name.startsWith(CARD_PREFIX)) continue;
    if (allowedNames.has(account.name)) continue;
    if (!account.is_active) continue;

    const deactivate = await page.request.patch(`/api/v1/accounts/${account.id}/`, {
      headers,
      data: { is_active: false },
    });
    expect(deactivate.ok()).toBeTruthy();
  }
}

test('shows debt percentage on the dashboard', async ({ page }) => {
  const current = monthInfo(0);
  const runId = `run-${Date.now()}`;

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  const headers = await getTenantHeaders(page);
  const currentCardName = `${CARD_PREFIX} ${current.monthParam} ${runId}`;
  await prepareDashboardScenario(page, headers, current, {
    totalLimit: '1000.00',
    expenseAmount: '250.00',
    runId,
  });
  await deactivateOtherDashboardCards(page, headers, [currentCardName]);

  await page.goto(`/dashboard?month=${current.monthParam}`);

  const debtCard = page.locator('.kpi-card').filter({ hasText: 'Endividamento' });
  await expect(debtCard).toBeVisible();
  await expect(debtCard).toContainText('25,0%');
  await expect(debtCard).toContainText(/250,00\s+de\s+R\$\s*1\.000,00/);
});

test('updates the debt percentage when navigating between months', async ({ page }) => {
  const current = monthInfo(0);
  const previous = monthInfo(-1);
  const runId = `run-${Date.now()}`;

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  const headers = await getTenantHeaders(page);
  const currentCardName = `${CARD_PREFIX} ${current.monthParam} ${runId}`;
  const previousCardName = `${CARD_PREFIX} ${previous.monthParam} ${runId}`;
  await prepareDashboardScenario(page, headers, current, {
    totalLimit: '1000.00',
    expenseAmount: '250.00',
    runId,
  });
  await prepareDashboardScenario(page, headers, previous, {
    totalLimit: '800.00',
    expenseAmount: '400.00',
    runId,
  });
  await deactivateOtherDashboardCards(page, headers, [currentCardName, previousCardName]);

  await page.goto(`/dashboard?month=${current.monthParam}`);

  const debtCard = page.locator('.kpi-card').filter({ hasText: 'Endividamento' });
  await expect(debtCard).toContainText('25,0%');

  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.waitForURL(`**/dashboard?month=${previous.monthParam}`);
  await expect(debtCard).toContainText('50,0%');
  await expect(debtCard).toContainText(/400,00\s+de\s+R\$\s*800,00/);

  await page.getByRole('button', { name: 'Mês seguinte' }).click();
  await page.waitForURL(`**/dashboard?month=${current.monthParam}`);
  await expect(debtCard).toContainText('25,0%');
});
