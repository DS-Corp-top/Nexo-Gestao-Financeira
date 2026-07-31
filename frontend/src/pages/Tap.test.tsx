import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Tap from './Tap';
import * as tapApi from '../api/tap';
import * as todosApi from '../api/todos';
import * as tenantApi from '../api/tenant';
import * as printDocument from '../utils/printDocument';
import type { Project } from '../api/todos';
import type { ProjectCharter } from '../api/tap';

vi.mock('../api/tap', async () => {
  const actual = await vi.importActual<typeof import('../api/tap')>('../api/tap');
  return {
    ...actual,
    fetchCharters: vi.fn(),
    createCharter: vi.fn(),
    updateCharter: vi.fn(),
    deleteCharter: vi.fn(),
  };
});
vi.mock('../api/todos', async () => {
  const actual = await vi.importActual<typeof import('../api/todos')>('../api/todos');
  return { ...actual, fetchProjects: vi.fn() };
});
vi.mock('../api/tenant', async () => {
  const actual = await vi.importActual<typeof import('../api/tenant')>('../api/tenant');
  return { ...actual, fetchTenantProfile: vi.fn() };
});
vi.mock('../utils/printDocument', async () => {
  const actual = await vi.importActual<typeof import('../utils/printDocument')>('../utils/printDocument');
  return { ...actual, openPrintWindow: vi.fn(), writePrintDocument: vi.fn() };
});

function renderTap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Tap />
    </QueryClientProvider>
  );
}

const project: Project = {
  id: 1,
  name: 'Implantação ERP',
  description: '',
  color: '#ffffff',
  is_finished: false,
  finished_at: null,
  todo_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const charter: ProjectCharter = {
  id: 5,
  project: 1,
  project_name: 'Implantação ERP',
  number: 1,
  number_display: '0001/2026',
  status: 'draft',
  status_display: 'Rascunho',
  justification: 'Reduzir retrabalho manual.',
  objectives: 'Automatizar o financeiro.',
  scope: '',
  technologies: 'React, Django e PostgreSQL.',
  deliverables: '',
  assumptions: '',
  constraints: '',
  risks: '',
  stakeholders: '',
  sponsor_name: 'Diretoria',
  project_manager_name: 'Daniel',
  co_responsibles: 'Ana Souza\nBruno Lima',
  start_date: null,
  end_date: null,
  estimated_budget: '10000.00',
  approved_at: null,
  approved_by_name: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('Tap Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (tenantApi.fetchTenantProfile as any).mockResolvedValue({ id: 1, name: 'DS Corp', logo: null });
  });

  it('shows an empty state prompting to create a project when there are none', async () => {
    (todosApi.fetchProjects as any).mockResolvedValue([]);
    (tapApi.fetchCharters as any).mockResolvedValue([]);
    renderTap();

    expect(await screen.findByText('Nenhum projeto cadastrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo TAP/ })).toBeDisabled();
  });

  it('lists an existing charter with its number, project and status', async () => {
    (todosApi.fetchProjects as any).mockResolvedValue([project]);
    (tapApi.fetchCharters as any).mockResolvedValue([charter]);
    renderTap();

    expect(await screen.findByText('TAP 0001/2026')).toBeInTheDocument();
    expect(screen.getByText('Implantação ERP')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('creates a new charter for the selected project', async () => {
    (todosApi.fetchProjects as any).mockResolvedValue([project]);
    (tapApi.fetchCharters as any).mockResolvedValue([]);
    (tapApi.createCharter as any).mockResolvedValue(charter);
    renderTap();

    const newButton = await screen.findByRole('button', { name: /Novo TAP/ });
    await waitFor(() => expect(newButton).not.toBeDisabled());
    fireEvent.click(newButton);
    fireEvent.change(await screen.findByLabelText('Projeto *'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Patrocinador'), { target: { value: 'Diretoria' } });
    fireEvent.change(screen.getByLabelText('Co-responsáveis'), { target: { value: 'Ana Souza\nBruno Lima' } });
    fireEvent.change(screen.getByLabelText('Tecnologias utilizadas'), { target: { value: 'React e Django' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar TAP' }));

    // react-query's mutate() invokes the mutationFn with a trailing context
    // object as a 2nd arg when it's passed directly (no wrapper) — harmless
    // in production since createCharter(payload) ignores extra args.
    await waitFor(() => {
      expect(tapApi.createCharter).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 1,
          sponsor_name: 'Diretoria',
          co_responsibles: 'Ana Souza\nBruno Lima',
          technologies: 'React e Django',
        }),
        expect.anything()
      );
    });
  });

  it('pre-fills the form and updates an existing charter', async () => {
    (todosApi.fetchProjects as any).mockResolvedValue([project]);
    (tapApi.fetchCharters as any).mockResolvedValue([charter]);
    (tapApi.updateCharter as any).mockResolvedValue(charter);
    renderTap();

    fireEvent.click(await screen.findByTitle('Editar'));

    const sponsorInput = await screen.findByLabelText('Patrocinador') as HTMLInputElement;
    const coResponsiblesInput = screen.getByLabelText('Co-responsáveis') as HTMLTextAreaElement;
    const technologiesInput = screen.getByLabelText('Tecnologias utilizadas') as HTMLTextAreaElement;
    expect(sponsorInput.value).toBe('Diretoria');
    expect(coResponsiblesInput.value).toBe('Ana Souza\nBruno Lima');
    expect(technologiesInput.value).toBe('React, Django e PostgreSQL.');

    fireEvent.change(sponsorInput, { target: { value: 'Novo Patrocinador' } });
    fireEvent.change(coResponsiblesInput, { target: { value: 'Carla Martins' } });
    fireEvent.change(technologiesInput, { target: { value: 'React, Django, PostgreSQL e Redis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar TAP' }));

    await waitFor(() => {
      expect(tapApi.updateCharter).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          sponsor_name: 'Novo Patrocinador',
          co_responsibles: 'Carla Martins',
          technologies: 'React, Django, PostgreSQL e Redis',
        })
      );
    });
  });

  it('deletes a charter after confirmation', async () => {
    (todosApi.fetchProjects as any).mockResolvedValue([project]);
    (tapApi.fetchCharters as any).mockResolvedValue([charter]);
    (tapApi.deleteCharter as any).mockResolvedValue(undefined);
    renderTap();

    fireEvent.click(await screen.findByTitle('Excluir'));
    const dialog = (await screen.findByText('Excluir TAP')).closest('.modal-content') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => {
      expect(tapApi.deleteCharter).toHaveBeenCalledWith(5, expect.anything());
    });
  });

  it('opens the print window with the charter data', async () => {
    (todosApi.fetchProjects as any).mockResolvedValue([project]);
    (tapApi.fetchCharters as any).mockResolvedValue([charter]);
    const fakeWindow = {} as Window;
    (printDocument.openPrintWindow as any).mockReturnValue(fakeWindow);
    renderTap();

    fireEvent.click(await screen.findByTitle('Imprimir'));

    await waitFor(() => {
      expect(printDocument.writePrintDocument).toHaveBeenCalledTimes(1);
    });
    const [, html] = (printDocument.writePrintDocument as any).mock.calls[0];
    expect(html).toContain('Implantação ERP');
    expect(html).toContain('Reduzir retrabalho manual.');
    expect(html).toContain('React, Django e PostgreSQL.');
    expect(html).toContain('Ana Souza');
    expect(html).toContain('Bruno Lima');
    expect(html).toContain('Data de emissão');
    expect(html).toContain('01/01/2026');
    expect(html).toContain('Assinaturas');
  });
});
