import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import CategoryModal from './CategoryModal';
import type { Category } from '../../api/categories';

function renderModal(overrides: Partial<React.ComponentProps<typeof CategoryModal>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <CategoryModal
      category={null}
      isOpen={true}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />
  );
  return { onSave, onClose };
}

describe('CategoryModal - category type flow', () => {
  it('starts with no type selected for a new category', () => {
    renderModal();

    expect(screen.getByLabelText('Despesa')).not.toBeChecked();
    expect(screen.getByLabelText('Receita')).not.toBeChecked();
    expect(screen.queryByText('Natureza da Despesa')).not.toBeInTheDocument();
  });

  it('shows "Natureza da Despesa" when the type is switched to Despesa', () => {
    renderModal();

    fireEvent.click(screen.getByLabelText('Despesa'));

    expect(screen.getByText('Natureza da Despesa')).toBeInTheDocument();
    expect(screen.getByLabelText('Despesa Operacional')).toBeChecked();
  });

  it('submits expense_kind: "cost" when Custo do Servico/Produto is selected', () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Materiais' } });
    fireEvent.click(screen.getByLabelText('Despesa'));
    fireEvent.click(screen.getByLabelText('Custo do Serviço/Produto'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Materiais',
      category_type: 'expense',
      expense_kind: 'cost',
    });
  });

  it('forces expense_kind: "operating" when saving an income category', () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Salário' } });
    fireEvent.click(screen.getByLabelText('Despesa'));
    fireEvent.click(screen.getByLabelText('Custo do Serviço/Produto'));
    fireEvent.click(screen.getByLabelText('Receita'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Salário',
      category_type: 'income',
      expense_kind: 'operating',
    });
  });

  it('pre-selects "Custo do Servico/Produto" when editing a category with expense_kind: cost', () => {
    const category: Category = {
      id: 1,
      name: 'Materiais',
      category_type: 'expense',
      expense_kind: 'cost',
      created_at: '2026-01-01T00:00:00Z',
    };
    renderModal({ category });

    expect(screen.getByLabelText('Custo do Serviço/Produto')).toBeChecked();
    expect(screen.getByLabelText('Despesa Operacional')).not.toBeChecked();
  });

  it('shows an error when trying to save without selecting the type', async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Serviços Prestados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Selecione se a categoria é uma receita ou despesa.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the API field error when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue({
      response: {
        data: {
          name: ['Já existe uma categoria com este nome para este tipo.'],
        },
      },
    });

    renderModal({ onSave });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Serviços Prestados' } });
    fireEvent.click(screen.getByLabelText('Receita'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe uma categoria com este nome para este tipo.')).toBeInTheDocument();
  });

  it('shows an internal confirmation before deleting a category', async () => {
    const category: Category = {
      id: 7,
      name: 'Materiais',
      category_type: 'expense',
      expense_kind: 'operating',
      created_at: '2026-01-01T00:00:00Z',
    };
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderModal({ category, onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Excluir categoria')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza que deseja excluir esta categoria? As transações vinculadas poderão ser afetadas.')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('allows cancelling the internal delete confirmation', async () => {
    const category: Category = {
      id: 8,
      name: 'Materiais',
      category_type: 'expense',
      expense_kind: 'operating',
      created_at: '2026-01-01T00:00:00Z',
    };
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderModal({ category, onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[1]);

    expect(screen.queryByText('Excluir categoria')).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('confirms delete inside the modal', async () => {
    const category: Category = {
      id: 9,
      name: 'Materiais',
      category_type: 'expense',
      expense_kind: 'operating',
      created_at: '2026-01-01T00:00:00Z',
    };
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderModal({ category, onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onDelete).toHaveBeenCalledWith(9);
  });
});
