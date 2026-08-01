import api from './client';

export interface BucketItem {
  name: string;
  key: string;
  type: 'folder' | 'file';
  size: number | null;
  size_display: string;
  children_count?: number | null;
  modified?: number | null;
}

export interface BucketBreadcrumb {
  name: string;
  prefix: string;
}

export interface BucketListResponse {
  provider: string;
  prefix: string;
  breadcrumbs: BucketBreadcrumb[];
  folders: BucketItem[];
  files: BucketItem[];
  total_items: number;
}

export interface BucketStats {
  provider: string;
  media_root: string;
  total_files: number | string;
  total_size: number | string;
  total_size_display: string;
  type_breakdown: Record<string, number>;
  top_folders: { name: string; files: number; size: number; size_display: string }[];
  note?: string;
}

export async function fetchBucketList(prefix = ''): Promise<BucketListResponse> {
  const { data } = await api.get<BucketListResponse>('/system/bucket/', {
    params: { prefix },
  });
  return data;
}

export async function fetchBucketStats(): Promise<BucketStats> {
  const { data } = await api.get<BucketStats>('/system/bucket/stats/');
  return data;
}

export async function deleteBucketObject(key: string): Promise<{ detail: string }> {
  const { data } = await api.delete<{ detail: string }>('/system/bucket/object/', {
    params: { key },
  });
  return data;
}
