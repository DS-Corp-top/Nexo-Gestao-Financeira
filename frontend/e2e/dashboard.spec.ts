import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || 'E2ePlaywright!123';
const ACCOUNT_PREFIX = 'Conta Dashboard E2E';
const INCOME_CATEGORY_PREFIX = 'Receita Dashboard E2E';
const EXPENSE_CATEGORY_PREFIX = 'Despesa Dashboard E2E';
const INCOME_DESCRIPTION_PREFIX = 'Renda Dashboard E2E';
const EXPENSE_DESCRIPTION_PREFIX = 'Compra Dashboard E2E';

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function moneyDigits(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercentageBR(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
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

async function ensureAccount(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  name: string,
): Promise<number> {
  const accountsResponse = await page.request.get('/api/v1/accounts/', { headers });
  expect(accountsResponse.ok()).toBeTruthy();
  const accounts = asList<{ id: number; name: string }>(await accountsResponse.json());
  const existing = accounts.find((account) => account.name === name);
  if (existing) return existing.id;

  const createAccount = await page.request.post('/api/v1/accounts/', {
    headers,
    data: {
      name,
      account_type: 'bank',
      currency: 'BRL',
      initial_balance: '0.00',
      credit_limit: null,
      backing_investment: null,
      include_in_balance: true,
      is_active: true,
    },
  });
  expect(createAccount.ok()).toBeTruthy();
  const created = await createAccount.json();
  return created.id as number;
}

async function ensureCategory(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  name: string,
  categoryType: 'income' | 'expense',
): Promise<number> {
  const categoriesResponse = await page.request.get('/api/v1/categories/', { headers });
  expect(categoriesResponse.ok()).toBeTruthy();
  const categories = asList<{ id: number; name: string; category_type: string }>(
    await categoriesResponse.json()
  );
  const existing = categories.find(
    (category) => category.name === name && category.category_type === categoryType
  );
  if (existing) return existing.id;

  const createCategory = await page.request.post('/api/v1/categories/', {
    headers,
    data: {
      name,
      category_type: categoryType,
      ...(categoryType === 'expense' ? { expense_kind: 'operating' } : {}),
    },
  });
  expect(createCategory.ok()).toBeTruthy();
  const created = await createCategory.json();
  return created.id as number;
}

async function ensureTransaction(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  info: MonthInfo,
  options: {
    account: number;
    category: number;
    transactionType: 'income' | 'expense';
    amount: string;
    description: string;
  },
) {
  const transactionsResponse = await page.request.get('/api/v1/transactions/', {
    headers,
    params: {
      account: String(options.account),
      date__gte: info.firstDay,
      date__lte: info.lastDay,
    },
  });
  expect(transactionsResponse.ok()).toBeTruthy();
  const transactions = asList<{ description: string }>(await transactionsResponse.json());
  const alreadyExists = transactions.some(
    (transaction) => transaction.description === options.description
  );
  if (alreadyExists) return;

  const createTransaction = await page.request.post('/api/v1/transactions/', {
    headers,
    data: {
      transaction_type: options.transactionType,
      amount: options.amount,
      date: info.firstDay,
      account: options.account,
      destination_account: null,
      category: options.category,
      description: options.description,
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

async function seedIncomeAndExpense(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  info: MonthInfo,
  options: { incomeAmount: string; expenseAmount: string; runId: string },
) {
  const accountName = `${ACCOUNT_PREFIX} ${info.monthParam} ${options.runId}`;
  const incomeCategoryName = `${INCOME_CATEGORY_PREFIX} ${info.monthParam} ${options.runId}`;
  const expenseCategoryName = `${EXPENSE_CATEGORY_PREFIX} ${info.monthParam} ${options.runId}`;

  const accountId = await ensureAccount(page, headers, accountName);
  const incomeCategoryId = await ensureCategory(page, headers, incomeCategoryName, 'income');
  const expenseCategoryId = await ensureCategory(page, headers, expenseCategoryName, 'expense');

  await ensureTransaction(page, headers, info, {
    account: accountId,
    category: incomeCategoryId,
    transactionType: 'income',
    amount: options.incomeAmount,
    description: `${INCOME_DESCRIPTION_PREFIX} ${info.monthParam} ${options.runId}`,
  });
  await ensureTransaction(page, headers, info, {
    account: accountId,
    category: expenseCategoryId,
    transactionType: 'expense',
    amount: options.expenseAmount,
    description: `${EXPENSE_DESCRIPTION_PREFIX} ${info.monthParam} ${options.runId}`,
  });
}

async function fetchDashboardTotals(
  page: import('@playwright/test').Page,
  headers: Record<string, string>,
  monthParam: string,
) {
  const response = await page.request.get('/api/v1/dashboard/', {
    headers,
    params: { month: monthParam },
  });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return {
    income: parseFloat(data.kpis.monthly_income),
    expense: parseFloat(data.kpis.monthly_expense),
    debtPercentage: parseFloat(data.alerts.debt_percentage),
  };
}

test('shows the committed income percentage on the dashboard', async ({ page }) => {
  const current = monthInfo(0);
  const runId = `run-${Date.now()}`;

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  const headers = await getTenantHeaders(page);
  await seedIncomeAndExpense(page, headers, current, {
    incomeAmount: '1000.00',
    expenseAmount: '250.00',
    runId,
  });

  const totals = await fetchDashboardTotals(page, headers, current.monthParam);

  await page.goto(`/dashboard?month=${current.monthParam}`);

  const debtCard = page.locator('.kpi-card').filter({ hasText: 'Renda comprometida' });
  await expect(debtCard).toBeVisible();
  await expect(debtCard).toContainText(formatPercentageBR(totals.debtPercentage));
  await expect(debtCard).toContainText(
    new RegExp(`${escapeRegex(moneyDigits(totals.expense))}\\s+de\\s+R\\$\\s*${escapeRegex(moneyDigits(totals.income))}`)
  );
});

test('updates the committed income percentage when navigating between months', async ({ page }) => {
  const current = monthInfo(0);
  const previous = monthInfo(-1);
  const runId = `run-${Date.now()}`;

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  const headers = await getTenantHeaders(page);
  await seedIncomeAndExpense(page, headers, current, {
    incomeAmount: '1000.00',
    expenseAmount: '250.00',
    runId,
  });
  await seedIncomeAndExpense(page, headers, previous, {
    incomeAmount: '800.00',
    expenseAmount: '400.00',
    runId,
  });

  const currentTotals = await fetchDashboardTotals(page, headers, current.monthParam);
  const previousTotals = await fetchDashboardTotals(page, headers, previous.monthParam);

  await page.goto(`/dashboard?month=${current.monthParam}`);

  const debtCard = page.locator('.kpi-card').filter({ hasText: 'Renda comprometida' });
  await expect(debtCard).toContainText(formatPercentageBR(currentTotals.debtPercentage));

  await page.getByRole('button', { name: 'Mês anterior' }).click();
  await page.waitForURL(`**/dashboard?month=${previous.monthParam}`);
  await expect(debtCard).toContainText(formatPercentageBR(previousTotals.debtPercentage));
  await expect(debtCard).toContainText(
    new RegExp(`${escapeRegex(moneyDigits(previousTotals.expense))}\\s+de\\s+R\\$\\s*${escapeRegex(moneyDigits(previousTotals.income))}`)
  );

  await page.getByRole('button', { name: 'Mês seguinte' }).click();
  await page.waitForURL(`**/dashboard?month=${current.monthParam}`);
  await expect(debtCard).toContainText(formatPercentageBR(currentTotals.debtPercentage));
});
