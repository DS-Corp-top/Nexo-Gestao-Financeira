import api from './client';

export interface Folder {
  id: number;
  name: string;
  company: number | null;
  company_name: string | null;
  parent: number | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: number;
  title: string;
  file_url: string;
  thumbnail_url: string | null;
  file_type: string;
  file_size: number;
  company: number | null;
  company_name: string | null;
  folder: number | null;
  folder_name: string | null;
  user: number;
  user_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchFolders(params?: { company?: string; parent?: string }) {
  const { data } = await api.get<{ results: Folder[]; count: number }>('/drive/folders/', { params });
  return data;
}

export async function createFolder(payload: { name: string; company?: string; parent?: string }) {
  const { data } = await api.post<Folder>('/drive/folders/', payload);
  return data;
}

export async function deleteFolder(id: number) {
  await api.delete(`/drive/folders/${id}/`);
}

export async function fetchDocuments(params?: { company?: string, search?: string, folder?: string }) {
  const { data } = await api.get<{ results: Document[]; count: number }>('/drive/documents/', { params });
  return data;
}

export async function uploadDocument(file: File, companyId?: string, folderId?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (companyId) {
    formData.append('company', companyId.toString());
  }
  if (folderId) {
    formData.append('folder', folderId.toString());
  }

  const { data } = await api.post<Document>('/drive/documents/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}

export async function deleteDocument(id: number) {
  await api.delete(`/drive/documents/${id}/`);
}
