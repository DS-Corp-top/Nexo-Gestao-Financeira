import api from './client';

export interface AllCompanyItem {
  id: number;
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  name: string;
  document: string;
  sequence_number: string;
  is_default: boolean;
  is_active: boolean;
}

export async function fetchAllCompanies(): Promise<AllCompanyItem[]> {
  const { data } = await api.get<AllCompanyItem[]>('/system/all-companies/');
  return data;
}

export async function uploadBackupFile(file: File, password: string): Promise<{ detail: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('password', password);

  const { data } = await api.post<{ detail: string }>('/system/restore-backup/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function toggleTenantStatus(id: number, is_active: boolean): Promise<void> {
  await api.patch(`/system/tenants/${id}/`, { is_active });
}
export async function deleteTenant(id: number): Promise<void> {
  await api.delete(`/system/tenants/${id}/`);
}

export async function toggleCompanyStatus(id: number, is_active: boolean): Promise<void> {
  await api.patch(`/system/companies/${id}/`, { is_active });
}
export async function deleteCompany(id: number): Promise<void> {
  await api.delete(`/system/companies/${id}/`);
}

export async function toggleUserStatus(id: number, is_active: boolean): Promise<void> {
  await api.patch(`/system/users/${id}/`, { is_active });
}
export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/system/users/${id}/`);
}
