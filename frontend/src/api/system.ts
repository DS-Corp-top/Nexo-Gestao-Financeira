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

export async function uploadBackupFile(file: File): Promise<{ detail: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const { data } = await api.post<{ detail: string }>('/system/restore-backup/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}
