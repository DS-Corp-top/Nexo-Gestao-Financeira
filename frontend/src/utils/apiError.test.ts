import { describe, it, expect } from 'vitest';
import { firstApiError } from './apiError';

describe('firstApiError', () => {
  it('prefers detail', () => {
    expect(firstApiError({ detail: 'Sem permissão.' })).toBe('Sem permissão.');
  });

  it('falls back to the first field error', () => {
    expect(firstApiError({ head_count: ['Informe o número de cabeças.'], amount: ['x'] })).toBe('Informe o número de cabeças.');
  });

  it('returns null for unknown shapes', () => {
    expect(firstApiError(undefined)).toBeNull();
    expect(firstApiError('erro')).toBeNull();
    expect(firstApiError({ amount: 'texto solto' })).toBeNull();
  });
});
