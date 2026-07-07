import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Drive from './Drive';
import * as driveApi from '../api/drive';
import * as tenantApi from '../api/tenant';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/drive', async () => {
  const actual = await vi.importActual<typeof import('../api/drive')>('../api/drive');
  return {
    ...actual,
    fetchFolders: vi.fn(),
    fetchDocuments: vi.fn(),
  };
});
vi.mock('../api/tenant', async () => {
  const actual = await vi.importActual<typeof import('../api/tenant')>('../api/tenant');
  return {
    ...actual,
    fetchTenantCompanies: vi.fn(),
  };
});

function renderDrive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Drive />
    </QueryClientProvider>
  );
}

describe('Drive Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (tenantApi.fetchTenantCompanies as any).mockResolvedValue([]);
    (driveApi.fetchFolders as any).mockResolvedValue({ results: [] });
    (driveApi.fetchDocuments as any).mockResolvedValue({ results: [] });
  });

  it('renders the "Nova Pasta" modal outside the page container when opened', async () => {
    const { container } = renderDrive();

    fireEvent.click(await screen.findByLabelText('Nova pasta'));

    const heading = await screen.findByText('Criar Nova Pasta');
    const modalRoot = heading.closest('.modal-overlay') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
  });
});
