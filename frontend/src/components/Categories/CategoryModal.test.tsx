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

describe('CategoryModal — Natureza da Despesa', () => {
  it('shows the "Natureza da Despesa" selector by default (new category defaults to Despesa)', () => {
    renderModal();
    expect(screen.getByText('Natureza da Despesa')).toBeInTheDocument();
    expect(screen.getByLabelText('Despesa Operacional')).toBeChecked();
  });

  it('hides "Natureza da Despesa" when the type is switched to Receita', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText('Receita'));
    expect(screen.queryByText('Natureza da Despesa')).not.toBeInTheDocument();
  });

  it('submits expense_kind: "cost" when Custo do Serviço/Produto is selected', async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Materiais' } });
    fireEvent.click(screen.getByLabelText('Custo do Serviço/Produto'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Materiais',
      category_type: 'expense',
      expense_kind: 'cost',
    });
  });

  it('forces expense_kind: "operating" when saving an income category, even if cost was picked before switching', async () => {
    const { onSave } = renderModal();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Salário' } });
    fireEvent.click(screen.getByLabelText('Custo do Serviço/Produto'));
    fireEvent.click(screen.getByLabelText('Receita'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Salário',
      category_type: 'income',
      expense_kind: 'operating',
    });
  });

  it('pre-selects "Custo do Serviço/Produto" when editing a category with expense_kind: cost', () => {
    const category: Category = {
      id: 1, name: 'Materiais', category_type: 'expense', expense_kind: 'cost', created_at: '2026-01-01T00:00:00Z',
    };
    renderModal({ category });

    expect(screen.getByLabelText('Custo do Serviço/Produto')).toBeChecked();
    expect(screen.getByLabelText('Despesa Operacional')).not.toBeChecked();
  });
});
