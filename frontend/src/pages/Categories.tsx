import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Tags, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchCategories, createCategory, updateCategory, deleteCategory, type Category } from '../api/categories';
import CategoryModal from '../components/Categories/CategoryModal';
import { useViewMode } from '../contexts/ViewModeContext';

export default function Categories() {
  const { isMobile } = useViewMode();
  const cols2 = isMobile ? '1fr' : '1fr 1fr';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateCategory(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const handleOpenNew = () => {
    setEditingCategory(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setModalOpen(true);
  };

  const handleSave = async (payload: any) => {
    if (editingCategory) {
      await updateMutation.mutateAsync({ id: editingCategory.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const incomeCategories = categories?.filter(c => c.category_type === 'income') || [];
  const expenseCategories = categories?.filter(c => c.category_type === 'expense') || [];

  const renderCategoryGroup = (title: string, list: Category[], icon: React.ReactNode) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        {icon}
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
      </div>
      
      {list.length === 0 ? (
        <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Nenhuma categoria cadastrada.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {list.map((cat, index) => (
            <div 
              key={cat.id} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '12px var(--space-lg)',
                borderBottom: index < list.length - 1 ? '1px solid var(--color-border)' : 'none',
                transition: 'background var(--transition-fast)'
              }}
              className="hover-bg"
            >
              <span>{cat.name}</span>
              <button
                className="btn-ghost btn-icon"
                onClick={() => handleOpenEdit(cat)}
              >
                <Edit2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <style>{`
        .hover-bg:hover { background: var(--color-bg-hover); }
      `}</style>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Nova Categoria
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: cols2, gap: 'var(--space-md)' }}>
          <div className="skeleton" style={{ height: 300 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      ) : categories?.length === 0 ? (
        <div className="empty-state">
          <Tags className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma categoria cadastrada</h3>
          <p className="empty-state-text">Crie categorias para organizar suas despesas e receitas.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-lg)' }}>
          {renderCategoryGroup('Despesas', expenseCategories, <TrendingDown size={18} style={{ color: 'var(--color-danger)' }} />)}
          {renderCategoryGroup('Receitas', incomeCategories, <TrendingUp size={18} style={{ color: 'var(--color-success)' }} />)}
        </div>
      )}

      {modalOpen && (
        <CategoryModal
          category={editingCategory}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
