import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Notes from './Notes';
import * as notesApi from '../api/notes';
import type { Note } from '../api/notes';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/notes', async () => {
  const actual = await vi.importActual<typeof import('../api/notes')>('../api/notes');
  return {
    ...actual,
    fetchNoteLists: vi.fn(),
    fetchNotes: vi.fn(),
    createNote: vi.fn(),
    createNoteSubtask: vi.fn(),
    toggleNoteSubtask: vi.fn(),
    deleteNoteSubtask: vi.fn(),
  };
});

function renderNotes() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Notes />
    </QueryClientProvider>
  );
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    note_list: null,
    note_list_name: null,
    title: 'Nota existente',
    content: 'Conteudo existente',
    color: '#fef08a',
    is_pinned: false,
    subtasks: [],
    subtasks_total: 0,
    subtasks_done: 0,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

describe('Notes Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notesApi.fetchNoteLists as any).mockResolvedValue([]);
    (notesApi.fetchNotes as any).mockResolvedValue([]);
  });

  it('renders the "Nova lista" modal outside the page container when opened', async () => {
    const { container } = renderNotes();

    fireEvent.click(await screen.findByText('Nova lista'));

    const heading = await screen.findByText('Nova lista', { selector: 'h3' });
    const modalRoot = heading.closest('.modal-overlay') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
  });

  it('disables the create button while the title is empty', async () => {
    renderNotes();

    fireEvent.click(await screen.findByText('Nova anotação'));

    const createButton = await screen.findByRole('button', { name: 'Criar' });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Minha nota' } });
    expect(createButton).not.toBeDisabled();
  });

  it('allows creating a note with only a title, leaving content empty', async () => {
    (notesApi.createNote as any).mockResolvedValue(makeNote({ id: 2, title: 'So titulo', content: '' }));
    renderNotes();

    fireEvent.click(await screen.findByText('Nova anotação'));
    fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'So titulo' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(notesApi.createNote).toHaveBeenCalled();
    });
    expect((notesApi.createNote as any).mock.calls[0][0]).toEqual({
      note_list: null,
      title: 'So titulo',
      content: '',
    });
  });

  it('shows the subtasks progress badge on a note card when subtasks exist', async () => {
    (notesApi.fetchNotes as any).mockResolvedValue([
      makeNote({ subtasks_total: 3, subtasks_done: 1 }),
    ]);
    renderNotes();

    expect(await screen.findByText('1/3 subtarefas')).toBeInTheDocument();
  });

  it('does not show the subtasks badge when a note has no subtasks', async () => {
    (notesApi.fetchNotes as any).mockResolvedValue([makeNote()]);
    renderNotes();

    await screen.findByText('Nota existente');
    expect(screen.queryByText(/subtarefas$/)).not.toBeInTheDocument();
  });

  it('lists subtasks and their progress inside the note detail view', async () => {
    (notesApi.fetchNotes as any).mockResolvedValue([
      makeNote({
        subtasks: [
          { id: 10, note: 1, title: 'Item pendente', is_done: false, created_at: '', updated_at: '' },
          { id: 11, note: 1, title: 'Item concluido', is_done: true, created_at: '', updated_at: '' },
        ],
        subtasks_total: 2,
        subtasks_done: 1,
      }),
    ]);
    renderNotes();

    fireEvent.click(await screen.findByText('Nota existente'));

    expect(await screen.findByText('Item pendente')).toBeInTheDocument();
    expect(screen.getByText('Item concluido')).toBeInTheDocument();
    expect(screen.getByText(/Subtarefas.*1\/2/)).toBeInTheDocument();
  });

  it('adds a new subtask from the note detail view', async () => {
    (notesApi.fetchNotes as any).mockResolvedValue([makeNote({ id: 5 })]);
    (notesApi.createNoteSubtask as any).mockResolvedValue({
      id: 20, note: 5, title: 'Novo item', is_done: false, created_at: '', updated_at: '',
    });
    renderNotes();

    fireEvent.click(await screen.findByText('Nota existente'));

    const input = await screen.findByPlaceholderText('Adicionar subtarefa...');
    fireEvent.change(input, { target: { value: 'Novo item' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar subtarefa' }));

    await waitFor(() => {
      expect(notesApi.createNoteSubtask).toHaveBeenCalled();
    });
    expect((notesApi.createNoteSubtask as any).mock.calls[0][0]).toEqual({ note: 5, title: 'Novo item' });
    expect(await screen.findByText('Novo item')).toBeInTheDocument();
  });

  it('toggles a subtask as done from the note detail view', async () => {
    (notesApi.fetchNotes as any).mockResolvedValue([
      makeNote({
        id: 5,
        subtasks: [{ id: 30, note: 5, title: 'Marcar isso', is_done: false, created_at: '', updated_at: '' }],
        subtasks_total: 1,
        subtasks_done: 0,
      }),
    ]);
    (notesApi.toggleNoteSubtask as any).mockResolvedValue({
      id: 30, note: 5, title: 'Marcar isso', is_done: true, created_at: '', updated_at: '',
    });
    renderNotes();

    fireEvent.click(await screen.findByText('Nota existente'));
    fireEvent.click(await screen.findByTitle('Marcar como concluída'));

    await waitFor(() => {
      expect(notesApi.toggleNoteSubtask).toHaveBeenCalled();
    });
    expect((notesApi.toggleNoteSubtask as any).mock.calls[0][0]).toBe(30);
  });

  it('deletes a subtask from the note detail view', async () => {
    (notesApi.fetchNotes as any).mockResolvedValue([
      makeNote({
        id: 5,
        subtasks: [{ id: 40, note: 5, title: 'Remover isso', is_done: false, created_at: '', updated_at: '' }],
        subtasks_total: 1,
        subtasks_done: 0,
      }),
    ]);
    (notesApi.deleteNoteSubtask as any).mockResolvedValue(undefined);
    renderNotes();

    fireEvent.click(await screen.findByText('Nota existente'));
    fireEvent.click(await screen.findByTitle('Excluir subtarefa'));

    await waitFor(() => {
      expect(notesApi.deleteNoteSubtask).toHaveBeenCalled();
    });
    expect((notesApi.deleteNoteSubtask as any).mock.calls[0][0]).toBe(40);
  });
});
