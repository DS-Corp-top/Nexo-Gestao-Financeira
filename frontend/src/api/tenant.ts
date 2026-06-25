import api from './client';

export interface TenantProfile {
  id: number;
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  address_number: string;
  address_complement: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  full_address: string;
  logo: string | null;
}

export async function fetchTenantProfile(): Promise<TenantProfile> {
  const { data } = await api.get<TenantProfile>('/tenant/');
  return data;
}

export async function updateTenantProfile(payload: FormData): Promise<TenantProfile> {
  const { data } = await api.patch<TenantProfile>('/tenant/', payload, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}
