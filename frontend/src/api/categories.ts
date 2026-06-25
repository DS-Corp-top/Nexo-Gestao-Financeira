import api from './client';

export interface Category {
  id: number;
  name: string;
  category_type: 'income' | 'expense';
  created_at: string;
}

export type CreateCategoryPayload = Omit<Category, 'id' | 'created_at'>;

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/categories/');
  return data;
}

export async function createCategory(payload: CreateCategoryPayload): Promise<Category> {
  const { data } = await api.post<Category>('/categories/', payload);
  return data;
}

export async function updateCategory(id: number, payload: Partial<CreateCategoryPayload>): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}/`, payload);
  return data;
}

export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/categories/${id}/`);
}
