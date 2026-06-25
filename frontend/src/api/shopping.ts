import api from './client';

export interface ShoppingItem {
  id: number;
  shopping_list: number;
  title: string;
  quantity: number;
  unit_price: string | null;
  notes: string;
  is_purchased: boolean;
  purchased_at: string | null;
  estimated_total: string;
}

export interface ShoppingList {
  id: number;
  name: string;
  list_date: string;
  notes: string;
  pending_count: number;
  purchased_count: number;
  purchased_total: string;
  items?: ShoppingItem[];
}

export type CreateShoppingListPayload = Pick<ShoppingList, 'name' | 'list_date' | 'notes'>;
export type CreateShoppingItemPayload = Pick<ShoppingItem, 'shopping_list' | 'title' | 'quantity' | 'unit_price' | 'notes'>;

export async function fetchShoppingLists(): Promise<ShoppingList[]> {
  const { data } = await api.get<ShoppingList[]>('/shopping-lists/');
  return data;
}

export async function fetchShoppingList(id: number): Promise<ShoppingList> {
  const { data } = await api.get<ShoppingList>(`/shopping-lists/${id}/`);
  return data;
}

export async function createShoppingList(payload: CreateShoppingListPayload): Promise<ShoppingList> {
  const { data } = await api.post<ShoppingList>('/shopping-lists/', payload);
  return data;
}

export async function deleteShoppingList(id: number): Promise<void> {
  await api.delete(`/shopping-lists/${id}/`);
}

export async function createShoppingItem(payload: CreateShoppingItemPayload): Promise<ShoppingItem> {
  const { data } = await api.post<ShoppingItem>('/shopping-items/', payload);
  return data;
}

export async function deleteShoppingItem(id: number): Promise<void> {
  await api.delete(`/shopping-items/${id}/`);
}

export async function toggleShoppingItem(id: number): Promise<ShoppingItem> {
  const { data } = await api.post<ShoppingItem>(`/shopping-items/${id}/toggle_purchased/`);
  return data;
}
