import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, Circle, ShoppingCart, Trash2, ArrowLeft, Edit2 } from 'lucide-react';
import { 
  fetchShoppingLists, fetchShoppingList, createShoppingList, deleteShoppingList,
  updateShoppingList, createShoppingItem, updateShoppingItem, deleteShoppingItem, toggleShoppingItem,
  type ShoppingItem
} from '../api/shopping';

function formatCurrency(value: string | number): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Shopping() {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: lists, isLoading: listsLoading } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: fetchShoppingLists,
  });

  const { data: currentList, isLoading: listLoading } = useQuery({
    queryKey: ['shopping-list', selectedListId],
    queryFn: () => fetchShoppingList(selectedListId!),
    enabled: !!selectedListId,
  });

  const createListMutation = useMutation({
    mutationFn: createShoppingList,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
      setSelectedListId(data.id);
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: deleteShoppingList,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
      setSelectedListId(null);
    },
  });

  const updateListMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateShoppingList(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', selectedListId] });
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });

  const createItemMutation = useMutation({
    mutationFn: createShoppingItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', selectedListId] });
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateShoppingItem(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', selectedListId] });
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: deleteShoppingItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', selectedListId] });
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: toggleShoppingItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shopping-list', selectedListId] });
      queryClient.invalidateQueries({ queryKey: ['shopping-lists'] });
    },
  });

  const handleCreateList = () => {
    const name = prompt('Nome da nova lista:');
    if (name) {
      createListMutation.mutate({ name, list_date: new Date().toISOString().split('T')[0], notes: '' });
    }
  };

  const handleEditList = () => {
    if (!currentList) return;
    const name = prompt('Nome da lista:', currentList.name);
    if (name === null || !name.trim()) return;
    const listDate = prompt('Data da lista (AAAA-MM-DD):', currentList.list_date);
    if (listDate === null || !listDate.trim()) return;
    updateListMutation.mutate({ id: currentList.id, payload: { name, list_date: listDate, notes: currentList.notes || '' } });
  };

  const handleEditItem = (item: ShoppingItem) => {
    const title = prompt('Item:', item.title);
    if (title === null || !title.trim()) return;
    const quantityRaw = prompt('Quantidade:', String(item.quantity));
    if (quantityRaw === null) return;
    const unitPrice = prompt('Preço unitário:', item.unit_price || '');
    updateItemMutation.mutate({
      id: item.id,
      payload: {
        title,
        quantity: Number(quantityRaw || 1),
        unit_price: unitPrice || null,
        notes: item.notes || '',
      },
    });
  };

  const handleCreateItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedListId) return;
    
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const quantity = Number(formData.get('quantity') || 1);
    const unitPriceRaw = formData.get('unit_price') as string;
    const unitPrice = unitPriceRaw ? unitPriceRaw : null;

    if (title) {
      createItemMutation.mutate({
        shopping_list: selectedListId,
        title,
        quantity,
        unit_price: unitPrice,
        notes: '',
      });
      e.currentTarget.reset();
    }
  };

  if (selectedListId) {
    // List Detail View
    if (listLoading) return <div className="page-header"><span className="spinner"/></div>;
    
    return (
      <div className="animate-slide-in">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button className="btn-ghost btn-icon" onClick={() => setSelectedListId(null)}>
              <ArrowLeft size={20} />
            </button>
            <h2 className="page-title">{currentList?.name}</h2>
          </div>
          <button className="btn btn-secondary" onClick={handleEditList}>
            <Edit2 size={18} style={{ marginRight: 6 }} /> Editar Lista
          </button>
          <button 
            className="btn btn-ghost" 
            style={{ color: 'var(--color-danger)' }}
            onClick={() => {
              if (window.confirm('Excluir esta lista e todos os seus itens?')) {
                deleteListMutation.mutate(selectedListId);
              }
            }}
          >
            <Trash2 size={18} style={{ marginRight: 6 }} /> Excluir Lista
          </button>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="kpi-card">
            <div className="kpi-label">Itens Pendentes</div>
            <div className="kpi-value">{currentList?.pending_count}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Itens Comprados</div>
            <div className="kpi-value">{currentList?.purchased_count}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Total Gasto (Est.)</div>
            <div className="kpi-value accent">{formatCurrency(currentList?.purchased_total || 0)}</div>
          </div>
        </div>

        <div className="card">
          <form onSubmit={handleCreateItem} style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
            <input type="text" name="title" className="input" placeholder="Novo item..." style={{ flex: 2 }} required />
            <input type="number" name="quantity" className="input" placeholder="Qtd" defaultValue="1" min="1" style={{ width: 80 }} />
            <input type="number" step="0.01" name="unit_price" className="input" placeholder="Preço Un. (opcional)" style={{ width: 140 }} />
            <button type="submit" className="btn btn-primary" disabled={createItemMutation.isPending}>
              Adicionar
            </button>
          </form>

          {currentList?.items?.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
              <p className="empty-state-text">Lista vazia. Adicione itens acima.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {currentList?.items?.map((item) => (
                <div 
                  key={item.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px 0',
                    borderBottom: '1px solid var(--color-border)',
                    opacity: item.is_purchased ? 0.6 : 1
                  }}
                >
                  <button 
                    className="btn-ghost btn-icon" 
                    onClick={() => toggleItemMutation.mutate(item.id)}
                    style={{ color: item.is_purchased ? 'var(--color-success)' : 'var(--color-text-muted)', marginRight: 'var(--space-md)' }}
                  >
                    {item.is_purchased ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                  </button>
                  <div style={{ flex: 1, textDecoration: item.is_purchased ? 'line-through' : 'none' }}>
                    <div style={{ fontWeight: 500 }}>{item.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Qtd: {item.quantity} {item.unit_price && `× ${formatCurrency(item.unit_price)}`}
                    </div>
                  </div>
                  {item.unit_price && (
                    <div style={{ fontWeight: 600, marginRight: 'var(--space-lg)', textDecoration: item.is_purchased ? 'line-through' : 'none' }}>
                      {formatCurrency(item.estimated_total)}
                    </div>
                  )}
                  <button
                    className="btn-ghost btn-icon"
                    onClick={() => handleEditItem(item)}
                    title="Editar item"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    className="btn-ghost btn-icon" 
                    onClick={() => { if(window.confirm('Excluir item?')) deleteItemMutation.mutate(item.id); }}
                  >
                    <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Lists View
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">Listas de Compras</h2>
        <button className="btn btn-primary" onClick={handleCreateList}>
          <Plus size={18} /> Nova Lista
        </button>
      </div>

      {listsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : lists?.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma lista</h3>
          <p className="empty-state-text">Crie uma lista para planejar suas compras no mercado.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {lists?.map((list) => (
            <div 
              key={list.id} 
              className="card" 
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedListId(list.id)}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>{list.name}</h3>
              <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                <div>Pendentes: <strong style={{ color: 'var(--color-text-primary)' }}>{list.pending_count}</strong></div>
                <div>Comprados: <strong style={{ color: 'var(--color-text-primary)' }}>{list.purchased_count}</strong></div>
              </div>
              <div style={{ marginTop: 'var(--space-md)', fontWeight: 600, color: 'var(--color-accent)' }}>
                {formatCurrency(list.purchased_total)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
