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
    createFolder: vi.fn(),
    uploadDocument: vi.fn(),
  };
});

function fileWithRelativePath(name: string, relativePath: string): File {
  const file = new File(['conteudo'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}
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

  it('uploads a whole folder tree: recreates real nested subfolders and uploads each file into its matching folder', async () => {
    let nextId = 100;
    (driveApi.createFolder as any).mockImplementation(async (payload: any) => ({
      id: nextId++,
      name: payload.name,
      company: null,
      parent: payload.parent ? Number(payload.parent) : null,
    }));
    // Small artificial delay so the test can observe the progress modal
    // mid-upload instead of it resolving before the first render flushes.
    (driveApi.uploadDocument as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 1 }), 10))
    );

    const { container } = renderDrive();
    await screen.findByLabelText('Upload de pasta');

    const folderInput = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;
    expect(folderInput).not.toBeNull();

    const files = [
      fileWithRelativePath('a.txt', 'MinhaPasta/a.txt'),
      fileWithRelativePath('b.txt', 'MinhaPasta/Sub/b.txt'),
    ];
    Object.defineProperty(folderInput, 'files', { value: files });

    fireEvent.change(folderInput);

    // The progress modal shows up while the upload is running...
    expect(await screen.findByText('Enviando pasta...')).toBeInTheDocument();

    await vi.waitFor(() => expect(driveApi.uploadDocument).toHaveBeenCalledTimes(2));

    // "MinhaPasta" is created first (root), then "Sub" as its child.
    expect(driveApi.createFolder).toHaveBeenNthCalledWith(1, { name: 'MinhaPasta', company: undefined, parent: undefined });
    expect(driveApi.createFolder).toHaveBeenNthCalledWith(2, { name: 'Sub', company: undefined, parent: '100' });

    // a.txt lands directly in "MinhaPasta" (id 100); b.txt in "Sub" (id 101) — no flattening, no title hack.
    expect(driveApi.uploadDocument).toHaveBeenCalledWith(files[0], '', '100');
    expect(driveApi.uploadDocument).toHaveBeenCalledWith(files[1], '', '101');

    // ...and disappears once every file has been processed.
    await vi.waitFor(() => expect(screen.queryByText('Enviando pasta...')).not.toBeInTheDocument());
  });
});
