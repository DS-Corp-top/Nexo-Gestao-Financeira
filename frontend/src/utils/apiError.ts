// Primeira mensagem legível de um erro do DRF: `detail` ou o primeiro erro de campo.
export function firstApiError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  const first = Object.values(record)[0];
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  return null;
}
