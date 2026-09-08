import api from './client';

export const AUTH_SESSION_HINT_KEY = 'nexo.hasAuthSession';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  person_type: 'pf' | 'pj';
  name: string;
  document: string;
  email: string;
  password: string;
  password_confirm: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superuser: boolean;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  person_type: 'pf' | 'pj';
  person_type_display: string;
  created_at: string;
  role: 'owner' | 'admin' | 'member' | null;
  is_view_only: boolean;
}

export interface MeResponse {
  user: User;
  tenant: Tenant | null;
}

export async function login(payload: LoginPayload): Promise<void> {
  // Tokens stay in httpOnly cookies; this flag is only a non-sensitive session hint.
  await api.post('/auth/token/', payload);
  localStorage.setItem(AUTH_SESSION_HINT_KEY, 'true');
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/password-reset/request/', { email });
}

export async function confirmPasswordResetCode(email: string, code: string): Promise<string> {
  const { data } = await api.post<{ reset_token: string }>('/auth/password-reset/confirm/', {
    email,
    code,
  });
  return data.reset_token;
}

export async function completePasswordReset(
  resetToken: string,
  newPassword: string,
  newPasswordConfirm: string
): Promise<void> {
  await api.post('/auth/password-reset/complete/', {
    reset_token: resetToken,
    new_password: newPassword,
    new_password_confirm: newPasswordConfirm,
  });
}

export async function register(payload: RegisterPayload): Promise<void> {
  await api.post('/auth/register/', payload);
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>('/me/');
  localStorage.setItem(AUTH_SESSION_HINT_KEY, 'true');
  return data;
}

export async function refreshToken(): Promise<void> {
  await api.post('/auth/token/refresh/', {});
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout/');
  } catch {
    // best-effort: clear cookies server-side even if request fails
  }
  localStorage.removeItem(AUTH_SESSION_HINT_KEY);
  window.location.href = '/login';
}
