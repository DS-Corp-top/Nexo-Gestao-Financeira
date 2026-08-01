import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { BucketTab } from './BucketTab';
import * as bucketApi from '../api/bucket';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/bucket', async () => {
  const actual = await vi.importActual<typeof import('../api/bucket')>('../api/bucket');
  return {
    ...actual,
    fetchBucketList: vi.fn(),
    fetchBucketStats: vi.fn(),
    deleteBucketObject: vi.fn(),
  };
});

function renderBucketTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BucketTab />
    </QueryClientProvider>
  );
}

const mockListResponse: bucketApi.BucketListResponse = {
  provider: 'Local (FileSystem)',
  prefix: '',
  breadcrumbs: [{ name: 'Raiz', prefix: '' }],
  folders: [
    { name: 'drive', key: 'drive/', type: 'folder', size: 4096, size_display: '4.0 KB', children_count: 12 },
    { name: 'tenants', key: 'tenants/', type: 'folder', size: 2048, size_display: '2.0 KB', children_count: 5 },
  ],
  files: [
    { name: 'backup.sql', key: 'backup.sql', type: 'file', size: 1024, size_display: '1.0 KB', modified: 1700000000 },
  ],
  total_items: 3,
};

const mockStatsResponse: bucketApi.BucketStats = {
  provider: 'Local (FileSystem)',
  media_root: '/app/backend/media',
  total_files: 42,
  total_size: 1048576,
  total_size_display: '1.0 MB',
  type_breakdown: { pdf: 10, jpg: 8, png: 6, xlsx: 3 },
  top_folders: [
    { name: 'drive', files: 30, size: 800000, size_display: '781.3 KB' },
    { name: 'tenants', files: 10, size: 200000, size_display: '195.3 KB' },
  ],
};

describe('BucketTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (bucketApi.fetchBucketList as any).mockResolvedValue(mockListResponse);
    (bucketApi.fetchBucketStats as any).mockResolvedValue(mockStatsResponse);
  });

  // ─── Explorer view ────────────────────────────────────────────────────────

  it('renders the explorer view by default with folders and files', async () => {
    renderBucketTab();

    expect(await screen.findByText('drive')).toBeInTheDocument();
    expect(screen.getByText('tenants')).toBeInTheDocument();
    expect(screen.getByText('backup.sql')).toBeInTheDocument();
  });

  it('renders breadcrumbs for root', async () => {
    renderBucketTab();

    expect(await screen.findByText('Raiz')).toBeInTheDocument();
  });

  it('shows folder children count badge', async () => {
    renderBucketTab();

    expect(await screen.findByText('12 arquivos')).toBeInTheDocument();
  });

  it('shows file size', async () => {
    renderBucketTab();

    // The file size "1.0 KB" appears for the file
    const sizeElements = await screen.findAllByText('1.0 KB');
    expect(sizeElements.length).toBeGreaterThan(0);
  });

  it('shows provider info in footer', async () => {
    renderBucketTab();

    const providerLabels = await screen.findAllByText('Local (FileSystem)');
    expect(providerLabels.length).toBeGreaterThan(0);
  });

  it('shows item counts in footer', async () => {
    renderBucketTab();

    expect(await screen.findByText(/2 pastas/)).toBeInTheDocument();
    expect(screen.getByText(/1 arquivo(?!s)/)).toBeInTheDocument();
  });

  it('navigates into a folder when clicked', async () => {
    const nestedResponse: bucketApi.BucketListResponse = {
      provider: 'Local (FileSystem)',
      prefix: 'drive/',
      breadcrumbs: [
        { name: 'Raiz', prefix: '' },
        { name: 'drive', prefix: 'drive/' },
      ],
      folders: [
        { name: 'tenant_1', key: 'drive/tenant_1/', type: 'folder', size: 1024, size_display: '1.0 KB', children_count: 3 },
      ],
      files: [],
      total_items: 1,
    };
    (bucketApi.fetchBucketList as any)
      .mockResolvedValueOnce(mockListResponse)
      .mockResolvedValueOnce(nestedResponse);

    renderBucketTab();

    const driveFolder = await screen.findByText('drive');
    fireEvent.click(driveFolder);

    expect(await screen.findByText('tenant_1')).toBeInTheDocument();
  });

  it('filters items by search term', async () => {
    renderBucketTab();

    await screen.findByText('drive');

    const searchInput = screen.getByPlaceholderText('Filtrar neste diretório...');
    fireEvent.change(searchInput, { target: { value: 'backup' } });

    expect(screen.getByText('backup.sql')).toBeInTheDocument();
    expect(screen.queryByText('drive')).not.toBeInTheDocument();
    expect(screen.queryByText('tenants')).not.toBeInTheDocument();
  });

  it('shows empty state when filter has no matches', async () => {
    renderBucketTab();

    await screen.findByText('drive');

    const searchInput = screen.getByPlaceholderText('Filtrar neste diretório...');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    expect(screen.getByText('Nenhum resultado')).toBeInTheDocument();
  });

  it('shows the delete confirmation modal outside the page container', async () => {
    const { container } = renderBucketTab();

    await screen.findByText('backup.sql');

    // Click the delete button (trash icon) for the file
    const deleteButtons = screen.getAllByTitle('Excluir arquivo');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    const heading = await screen.findByText('Excluir arquivo');
    const modalRoot = heading.closest('div')!.parentElement!.parentElement as HTMLElement;
    expectPortaledToBody(modalRoot, container);
  });

  it('displays the file key in the delete modal', async () => {
    renderBucketTab();

    await screen.findByText('backup.sql');

    const deleteButtons = screen.getAllByTitle('Excluir arquivo');
    fireEvent.click(deleteButtons[0]);

    expect(await screen.findByText('backup.sql', { selector: 'div' })).toBeInTheDocument();
  });

  it('calls deleteBucketObject when confirming deletion', async () => {
    (bucketApi.deleteBucketObject as any).mockResolvedValue({ detail: 'Removido' });

    renderBucketTab();

    await screen.findByText('backup.sql');

    const deleteButtons = screen.getAllByTitle('Excluir arquivo');
    fireEvent.click(deleteButtons[0]);

    const confirmButton = await screen.findByText('Sim, excluir');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(bucketApi.deleteBucketObject).toHaveBeenCalledWith('backup.sql', expect.anything());
    });
  });

  it('can cancel the delete modal', async () => {
    renderBucketTab();

    await screen.findByText('backup.sql');

    const deleteButtons = screen.getAllByTitle('Excluir arquivo');
    fireEvent.click(deleteButtons[0]);

    const cancelButton = await screen.findByText('Cancelar');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Excluir arquivo')).not.toBeInTheDocument();
  });

  // ─── Stats view ───────────────────────────────────────────────────────────

  it('switches to stats view when clicking Estatísticas button', async () => {
    renderBucketTab();

    const statsButton = await screen.findByText('Estatísticas');
    fireEvent.click(statsButton);

    expect(await screen.findByText('Total de Arquivos')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('shows top folders in stats view', async () => {
    renderBucketTab();

    fireEvent.click(await screen.findByText('Estatísticas'));

    expect(await screen.findByText('Uso por Pasta')).toBeInTheDocument();
    expect(screen.getByText('drive/')).toBeInTheDocument();
    expect(screen.getByText('tenants/')).toBeInTheDocument();
    expect(screen.getByText('781.3 KB')).toBeInTheDocument();
  });

  it('shows type breakdown badges in stats view', async () => {
    renderBucketTab();

    fireEvent.click(await screen.findByText('Estatísticas'));

    expect(await screen.findByText('Tipos de Arquivo')).toBeInTheDocument();
    expect(screen.getByText('.pdf')).toBeInTheDocument();
    expect(screen.getByText('.jpg')).toBeInTheDocument();
    expect(screen.getByText('.png')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // pdf count
  });

  it('can switch back from stats to explorer', async () => {
    renderBucketTab();

    fireEvent.click(await screen.findByText('Estatísticas'));
    expect(await screen.findByText('Total de Arquivos')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Explorar'));
    expect(await screen.findByText('drive')).toBeInTheDocument();
  });

  // ─── Loading / empty states ───────────────────────────────────────────────

  it('shows spinner while loading', async () => {
    // Never resolve to keep loading
    (bucketApi.fetchBucketList as any).mockReturnValue(new Promise(() => {}));

    const { container } = renderBucketTab();

    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('shows empty state when folder has no items', async () => {
    (bucketApi.fetchBucketList as any).mockResolvedValue({
      ...mockListResponse,
      folders: [],
      files: [],
      total_items: 0,
    });

    renderBucketTab();

    expect(await screen.findByText('Pasta vazia')).toBeInTheDocument();
  });
});
