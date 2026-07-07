import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Notes from './Notes';
import * as notesApi from '../api/notes';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/notes', async () => {
  const actual = await vi.importActual<typeof import('../api/notes')>('../api/notes');
  return {
    ...actual,
    fetchNoteLists: vi.fn(),
    fetchNotes: vi.fn(),
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
});
