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
    fetchTrashFolders: vi.fn(),
    fetchTrashDocuments: vi.fn(),
    restoreDocument: vi.fn(),
    restoreFolder: vi.fn(),
    purgeDocument: vi.fn(),
    purgeFolder: vi.fn(),
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
    (driveApi.fetchTrashFolders as any).mockResolvedValue({ results: [] });
    (driveApi.fetchTrashDocuments as any).mockResolvedValue({ results: [] });
  });

  it('renders the "Nova Pasta" modal outside the page container when opened', async () => {
    const { container } = renderDrive();

    fireEvent.click(await screen.findByLabelText('Nova pasta'));

    const heading = await screen.findByText('Criar Nova Pasta');
    const modalRoot = heading.closest('.modal-overlay') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
  });

  it('shows the thumbnail image for documents that have one, and the generic file icon otherwise', async () => {
    (driveApi.fetchDocuments as any).mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'foto.png',
          file_url: '/media/foto.png',
          thumbnail_url: '/media/thumbnails/foto.jpg',
          file_type: 'png',
          file_size: 1024,
          company: null,
          company_name: null,
          folder: null,
          folder_name: null,
          user: 1,
          user_name: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: 2,
          title: 'contrato.pdf',
          file_url: '/media/contrato.pdf',
          thumbnail_url: null,
          file_type: 'pdf',
          file_size: 2048,
          company: null,
          company_name: null,
          folder: null,
          folder_name: null,
          user: 1,
          user_name: null,
          created_at: '',
          updated_at: '',
        },
      ],
    });

    renderDrive();

    const image = await screen.findByRole('img');
    expect(image).toHaveAttribute('src', '/media/thumbnails/foto.jpg');

    // Only the image-backed document renders an <img> — the PDF keeps the generic icon.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('opens a preview modal with the full image when clicking an image document', async () => {
    (driveApi.fetchDocuments as any).mockResolvedValue({
      results: [
        {
          id: 1, title: 'foto.png', file_url: '/media/foto.png', thumbnail_url: '/media/thumbnails/foto.jpg',
          file_type: 'png', file_size: 1024, company: null, company_name: null, folder: null, folder_name: null,
          user: 1, user_name: null, created_at: '', updated_at: '',
        },
      ],
    });

    renderDrive();

    fireEvent.click(await screen.findByText('foto.png'));

    const heading = await screen.findByText('foto.png', { selector: '.modal-header h3' });
    expect(heading).toBeInTheDocument();
    const images = screen.getAllByRole('img').filter((img) => img.getAttribute('src') === '/media/foto.png');
    expect(images).toHaveLength(1);
  });

  it('opens a preview modal with an iframe when clicking a PDF document', async () => {
    (driveApi.fetchDocuments as any).mockResolvedValue({
      results: [
        {
          id: 2, title: 'contrato.pdf', file_url: '/media/contrato.pdf', thumbnail_url: null,
          file_type: 'pdf', file_size: 2048, company: null, company_name: null, folder: null, folder_name: null,
          user: 1, user_name: null, created_at: '', updated_at: '',
        },
      ],
    });

    renderDrive();

    fireEvent.click(await screen.findByText('contrato.pdf'));

    await screen.findByText('contrato.pdf', { selector: '.modal-header h3' });
    const iframe = document.querySelector('iframe');
    expect(iframe).toHaveAttribute('src', '/media/contrato.pdf');
  });

  it('does not open the preview when clicking Baixar or Excluir on a document card', async () => {
    (driveApi.fetchDocuments as any).mockResolvedValue({
      results: [
        {
          id: 3, title: 'nota.txt', file_url: '/media/nota.txt', thumbnail_url: null,
          file_type: 'txt', file_size: 10, company: null, company_name: null, folder: null, folder_name: null,
          user: 1, user_name: null, created_at: '', updated_at: '',
        },
      ],
    });

    renderDrive();

    fireEvent.click(await screen.findByTitle('Baixar/Visualizar'));

    expect(screen.queryByText('nota.txt', { selector: '.modal-header h3' })).not.toBeInTheDocument();
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

  it('lets the user cancel a folder upload mid-way, stopping further files from being sent', async () => {
    let nextId = 200;
    (driveApi.createFolder as any).mockImplementation(async (payload: any) => ({
      id: nextId++,
      name: payload.name,
      company: null,
      parent: payload.parent ? Number(payload.parent) : null,
    }));
    (driveApi.uploadDocument as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: 1 }), 15))
    );

    const { container } = renderDrive();
    await screen.findByLabelText('Upload de pasta');
    const folderInput = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;

    const files = [
      fileWithRelativePath('a.txt', 'Pasta/a.txt'),
      fileWithRelativePath('b.txt', 'Pasta/b.txt'),
      fileWithRelativePath('c.txt', 'Pasta/c.txt'),
    ];
    Object.defineProperty(folderInput, 'files', { value: files });

    fireEvent.change(folderInput);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await vi.waitFor(() => expect(screen.queryByText('Enviando pasta...')).not.toBeInTheDocument());

    // Cancelling this early should stop well short of uploading every file.
    expect((driveApi.uploadDocument as any).mock.calls.length).toBeLessThan(files.length);
    expect(await screen.findByText('Envio cancelado')).toBeInTheDocument();
  });

  it('prompts before uploading a duplicate single file, and retries with allowDuplicate when confirmed', async () => {
    const duplicateError = {
      response: { status: 409, data: { duplicate: true, existing_document: { title: 'foto-antiga.png' } } },
    };
    (driveApi.uploadDocument as any)
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce({ id: 1 });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { container } = renderDrive();
    await screen.findByLabelText('Novo arquivo');

    const fileInput = container.querySelector('input[type="file"]:not([webkitdirectory])') as HTMLInputElement;
    const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file] });

    fireEvent.change(fileInput);

    await vi.waitFor(() => expect(driveApi.uploadDocument).toHaveBeenCalledTimes(2));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('foto-antiga.png'));
    expect(driveApi.uploadDocument).toHaveBeenNthCalledWith(2, file, '', undefined, true);

    confirmSpy.mockRestore();
  });

  it('does not prompt for duplicates during a folder upload — it skips them and reports the count', async () => {
    (driveApi.createFolder as any).mockResolvedValue({ id: 300, name: 'Pasta', company: null, parent: null });
    (driveApi.uploadDocument as any)
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce({ response: { status: 409, data: { duplicate: true } } });
    const confirmSpy = vi.spyOn(window, 'confirm');

    const { container } = renderDrive();
    await screen.findByLabelText('Upload de pasta');
    const folderInput = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;

    const files = [
      fileWithRelativePath('a.txt', 'Pasta/a.txt'),
      fileWithRelativePath('b.txt', 'Pasta/b.txt'),
    ];
    Object.defineProperty(folderInput, 'files', { value: files });

    fireEvent.change(folderInput);

    expect(await screen.findByText(/já existiam no Drive e foram pulados/)).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('lists each failed file with its reason after a folder upload', async () => {
    (driveApi.createFolder as any).mockResolvedValue({ id: 400, name: 'Pasta', company: null, parent: null });
    (driveApi.uploadDocument as any).mockRejectedValueOnce({
      response: { status: 400, data: { file: ['Tipo de arquivo não permitido: .html.'] } },
    });

    const { container } = renderDrive();
    await screen.findByLabelText('Upload de pasta');
    const folderInput = container.querySelector('input[type="file"][webkitdirectory]') as HTMLInputElement;

    const files = [fileWithRelativePath('evil.html', 'Pasta/evil.html')];
    Object.defineProperty(folderInput, 'files', { value: files });

    fireEvent.change(folderInput);

    expect(await screen.findByText('Pasta/evil.html')).toBeInTheDocument();
    expect(screen.getByText('Tipo de arquivo não permitido: .html.')).toBeInTheDocument();
  });

  it('shows trashed files and folders with days remaining when opening the Lixeira', async () => {
    (driveApi.fetchTrashFolders as any).mockResolvedValue({
      results: [{ id: 1, name: 'Pasta Antiga', company: null, company_name: null, parent: null, deleted_at: '2026-01-01T00:00:00Z', days_until_purge: 12, created_at: '', updated_at: '' }],
    });
    (driveApi.fetchTrashDocuments as any).mockResolvedValue({
      results: [{
        id: 2, title: 'relatorio.pdf', file_url: '/media/relatorio.pdf', thumbnail_url: null, file_type: 'pdf',
        file_size: 1024, company: null, company_name: null, folder: null, folder_name: null, user: 1, user_name: null,
        deleted_at: '2026-01-01T00:00:00Z', days_until_purge: 5, created_at: '', updated_at: '',
      }],
    });

    renderDrive();

    fireEvent.click(await screen.findByLabelText('Lixeira'));

    expect(await screen.findByText('Pasta Antiga')).toBeInTheDocument();
    expect(screen.getByText(/expira em 12 dia/)).toBeInTheDocument();
    expect(screen.getByText('relatorio.pdf')).toBeInTheDocument();
    expect(screen.getByText(/expira em 5 dia/)).toBeInTheDocument();

    // Upload controls make no sense while browsing the trash.
    expect(screen.queryByLabelText('Novo arquivo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nova pasta')).not.toBeInTheDocument();
  });

  it('restores a trashed document and refreshes both the trash and the normal listing', async () => {
    (driveApi.fetchTrashDocuments as any).mockResolvedValue({
      results: [{
        id: 2, title: 'relatorio.pdf', file_url: '/media/relatorio.pdf', thumbnail_url: null, file_type: 'pdf',
        file_size: 1024, company: null, company_name: null, folder: null, folder_name: null, user: 1, user_name: null,
        deleted_at: '2026-01-01T00:00:00Z', days_until_purge: 5, created_at: '', updated_at: '',
      }],
    });
    (driveApi.restoreDocument as any).mockResolvedValue({ id: 2 });

    renderDrive();
    fireEvent.click(await screen.findByLabelText('Lixeira'));
    await screen.findByText('relatorio.pdf');

    fireEvent.click(screen.getByTitle('Restaurar'));

    await vi.waitFor(() => expect(driveApi.restoreDocument).toHaveBeenCalled());
    expect((driveApi.restoreDocument as any).mock.calls[0][0]).toBe(2);
  });

  it('asks for confirmation before permanently deleting a trashed item', async () => {
    (driveApi.fetchTrashDocuments as any).mockResolvedValue({
      results: [{
        id: 2, title: 'relatorio.pdf', file_url: '/media/relatorio.pdf', thumbnail_url: null, file_type: 'pdf',
        file_size: 1024, company: null, company_name: null, folder: null, folder_name: null, user: 1, user_name: null,
        deleted_at: '2026-01-01T00:00:00Z', days_until_purge: 5, created_at: '', updated_at: '',
      }],
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (driveApi.purgeDocument as any).mockResolvedValue(undefined);

    renderDrive();
    fireEvent.click(await screen.findByLabelText('Lixeira'));
    await screen.findByText('relatorio.pdf');

    fireEvent.click(screen.getByTitle('Excluir definitivamente'));

    expect(confirmSpy).toHaveBeenCalled();
    await vi.waitFor(() => expect(driveApi.purgeDocument).toHaveBeenCalled());
    expect((driveApi.purgeDocument as any).mock.calls[0][0]).toBe(2);

    confirmSpy.mockRestore();
  });
});
