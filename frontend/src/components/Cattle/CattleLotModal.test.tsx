import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import CattleLotModal from './CattleLotModal';
import type { CattleLot } from '../../api/cattle';
import { todayInBrasilia } from '../../utils/date';

const existingLot = {
  id: 5,
  name: 'Lote Angus',
  system: 'semi_feedlot',
  status: 'open',
  location: 'Piquete 2',
  start_date: '2026-03-01',
  end_date: null,
  notes: 'Comprado no leilão',
} as CattleLot;

function renderModal(props: Partial<React.ComponentProps<typeof CattleLotModal>> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn();
  render(<CattleLotModal lot={null} onClose={onClose} onSave={onSave} onDelete={onDelete} {...props} />);
  return { onClose, onSave, onDelete };
}

describe('CattleLotModal', () => {
  it('creates a lot with sensible defaults', async () => {
    const { onSave, onClose } = renderModal();

    expect(screen.getByRole('dialog', { name: 'Novo lote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome do lote'), { target: { value: 'Lote 01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      name: 'Lote 01',
      system: 'feedlot',
      status: 'open',
      location: '',
      start_date: todayInBrasilia(),
      end_date: null,
      notes: '',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('prefills an existing lot and saves the edited fields', async () => {
    const { onSave } = renderModal({ lot: existingLot });

    expect(screen.getByRole('dialog', { name: 'Editar lote' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do lote')).toHaveValue('Lote Angus');
    expect(screen.getByLabelText('Sistema')).toHaveValue('semi_feedlot');
    expect(screen.getByLabelText('Local / Curral')).toHaveValue('Piquete 2');
    expect(screen.getByLabelText('Observações')).toHaveValue('Comprado no leilão');

    fireEvent.change(screen.getByLabelText('Sistema'), { target: { value: 'feedlot' } });
    fireEvent.change(screen.getByLabelText('Data de saída'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ system: 'feedlot', end_date: '2026-06-30', start_date: '2026-03-01' });
  });

  it('sends start date, location and notes typed by the user', async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByLabelText('Nome do lote'), { target: { value: 'Lote 02' } });
    fireEvent.change(screen.getByLabelText('Data de entrada'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Local / Curral'), { target: { value: 'Curral 7' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Recria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      start_date: '2026-02-01', location: 'Curral 7', notes: 'Recria',
    });
    expect(screen.getByLabelText('Data de saída')).toHaveAttribute('min', '2026-02-01');
  });

  it('fills the exit date with today when the lot is closed without one', () => {
    renderModal({ lot: existingLot });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'closed' } });

    expect(screen.getByLabelText('Data de saída')).toHaveValue(todayInBrasilia());
  });

  it('keeps an exit date that was already informed when closing', () => {
    renderModal({ lot: { ...existingLot, end_date: '2026-05-15' } });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'closed' } });

    expect(screen.getByLabelText('Data de saída')).toHaveValue('2026-05-15');
  });

  it('shows the field error returned by the API and stays open', async () => {
    const onSave = vi.fn().mockRejectedValue({
      response: { data: { end_date: ['A data de saída não pode ser anterior à entrada.'] } },
    });
    const { onClose } = renderModal({ lot: existingLot, onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('A data de saída não pode ser anterior à entrada.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
  });

  it('falls back to a generic message for unexpected errors', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network'));
    renderModal({ onSave });

    fireEvent.change(screen.getByLabelText('Nome do lote'), { target: { value: 'Lote 01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Erro ao salvar lote.')).toBeInTheDocument();
  });

  it('asks the page to delete the lot being edited', () => {
    const { onDelete, onSave } = renderModal({ lot: existingLot });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('closes from the close and cancel buttons', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders outside the page tree (portal)', () => {
    const { container } = render(
      <CattleLotModal lot={null} onClose={vi.fn()} onSave={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('.modal-overlay')).not.toBeNull();
  });
});
