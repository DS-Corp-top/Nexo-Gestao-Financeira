import api from './client';

export type CharterStatus = 'draft' | 'approved';

export interface ProjectCharter {
  id: number;
  project: number;
  project_name: string;
  number: number;
  number_display: string;
  status: CharterStatus;
  status_display: string;
  justification: string;
  objectives: string;
  scope: string;
  technologies: string;
  deliverables: string;
  assumptions: string;
  constraints: string;
  risks: string;
  stakeholders: string;
  sponsor_name: string;
  project_manager_name: string;
  co_responsibles: string;
  start_date: string | null;
  end_date: string | null;
  estimated_budget: string | null;
  approved_at: string | null;
  approved_by_name: string;
  created_at: string;
  updated_at: string;
}

export type ProjectCharterPayload = Partial<
  Pick<
    ProjectCharter,
    | 'project'
    | 'status'
    | 'justification'
    | 'objectives'
    | 'scope'
    | 'technologies'
    | 'deliverables'
    | 'assumptions'
    | 'constraints'
    | 'risks'
    | 'stakeholders'
    | 'sponsor_name'
    | 'project_manager_name'
    | 'co_responsibles'
    | 'start_date'
    | 'end_date'
    | 'estimated_budget'
    | 'approved_at'
    | 'approved_by_name'
  >
>;

export async function fetchCharters(params?: { project?: number; status?: CharterStatus }): Promise<ProjectCharter[]> {
  const { data } = await api.get<ProjectCharter[]>('/tap/', { params });
  return data;
}

export async function fetchCharter(id: number): Promise<ProjectCharter> {
  const { data } = await api.get<ProjectCharter>(`/tap/${id}/`);
  return data;
}

export async function createCharter(payload: ProjectCharterPayload): Promise<ProjectCharter> {
  const { data } = await api.post<ProjectCharter>('/tap/', payload);
  return data;
}

export async function updateCharter(id: number, payload: ProjectCharterPayload): Promise<ProjectCharter> {
  const { data } = await api.patch<ProjectCharter>(`/tap/${id}/`, payload);
  return data;
}

export async function deleteCharter(id: number): Promise<void> {
  await api.delete(`/tap/${id}/`);
}
