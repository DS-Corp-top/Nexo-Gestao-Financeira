import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Todos from './Todos';
import * as todosApi from '../api/todos';
import type { Project, TodoItem } from '../api/todos';

vi.mock('../api/todos', async () => {
  const actual = await vi.importActual<typeof import('../api/todos')>('../api/todos');
  return {
    ...actual,
    fetchProjects: vi.fn(),
    fetchTodos: vi.fn(),
    fetchTenantMembers: vi.fn(),
    uploadTodoAttachment: vi.fn(),
    deleteTodoAttachment: vi.fn(),
  };
});

const project: Project = {
  id: 1,
  name: 'Projeto Teste',
  description: '',
  color: '#ffffff',
  is_finished: false,
  finished_at: null,
  todo_count: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const baseTodo: TodoItem = {
  id: 10,
  title: 'Tarefa com anexo',
  description: '',
  is_done: false,
  status: 'pending',
  priority: 'medium',
  due_date: null,
  done_at: null,
  project: 1,
  parent: null,
  assigned_to: null,
  assigned_to_name: null,
  subtasks: [],
  subtask_count: 0,
  completed_subtask_count: 0,
  attachments: [],
  attachment_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderTodos() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Todos />
    </QueryClientProvider>
  );
}

async function openProjectAndTodo(todo: TodoItem) {
  (todosApi.fetchProjects as any).mockResolvedValue([project]);
  (todosApi.fetchTenantMembers as any).mockResolvedValue([]);
  (todosApi.fetchTodos as any).mockResolvedValue([todo]);

  renderTodos();

  fireEvent.click(await screen.findByText('Projeto Teste'));
  fireEvent.click(await screen.findByText(todo.title));

  await screen.findByText('Anexos');
}

describe('Todos attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when the todo has no attachments', async () => {
    await openProjectAndTodo(baseTodo);
    expect(screen.getByText('Nenhum anexo enviado ainda.')).toBeInTheDocument();
  });

  it('lists an existing attachment with its name and formatted size', async () => {
    const todoWithAttachment: TodoItem = {
      ...baseTodo,
      attachment_count: 1,
      attachments: [
        {
          id: 1,
          todo: 10,
          file: '/media/todos/contrato.pdf',
          file_url: 'http://localhost/media/todos/contrato.pdf',
          file_name: 'contrato.pdf',
          file_type: 'pdf',
          file_size: 2048,
          user: 1,
          user_name: 'Daniel',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    await openProjectAndTodo(todoWithAttachment);

    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('uploads the selected file for the open todo', async () => {
    (todosApi.uploadTodoAttachment as any).mockResolvedValue({});
    await openProjectAndTodo(baseTodo);

    const file = new File(['conteudo'], 'novo.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(todosApi.uploadTodoAttachment).toHaveBeenCalledWith(baseTodo.id, file);
    });
  });

  it('deletes an attachment when its trash button is clicked', async () => {
    (todosApi.deleteTodoAttachment as any).mockResolvedValue(undefined);
    const todoWithAttachment: TodoItem = {
      ...baseTodo,
      attachment_count: 1,
      attachments: [
        {
          id: 42,
          todo: 10,
          file: '/media/todos/contrato.pdf',
          file_url: 'http://localhost/media/todos/contrato.pdf',
          file_name: 'contrato.pdf',
          file_type: 'pdf',
          file_size: 2048,
          user: 1,
          user_name: 'Daniel',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    await openProjectAndTodo(todoWithAttachment);
    fireEvent.click(screen.getByLabelText('Excluir anexo'));

    // react-query's mutate() invokes the mutationFn with a trailing context
    // object as a 2nd arg when it's passed directly (no wrapper) — harmless
    // in production since deleteTodoAttachment(id) ignores extra args.
    await waitFor(() => {
      expect(todosApi.deleteTodoAttachment).toHaveBeenCalledWith(42, expect.anything());
    });
  });

  it('shows the attachment count badge on the kanban card', async () => {
    const todoWithAttachments: TodoItem = { ...baseTodo, attachment_count: 3 };
    (todosApi.fetchProjects as any).mockResolvedValue([project]);
    (todosApi.fetchTenantMembers as any).mockResolvedValue([]);
    (todosApi.fetchTodos as any).mockResolvedValue([todoWithAttachments]);

    renderTodos();
    fireEvent.click(await screen.findByText('Projeto Teste'));

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});
