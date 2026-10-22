import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCattleLot,
  createCattleLotEntry,
  deleteCattleLot,
  deleteCattleLotEntry,
  entryTypeLabels,
  fetchCattleLot,
  fetchCattleLots,
  updateCattleLot,
} from './cattle';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('./client', () => ({
  default: apiMock,
}));

describe('cattle api', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach((fn) => fn.mockReset());
  });

  it('unwraps paginated lot lists', async () => {
    apiMock.get.mockResolvedValueOnce({ data: { count: 1, results: [{ id: 1 }] } });

    await expect(fetchCattleLots()).resolves.toEqual([{ id: 1 }]);
    expect(apiMock.get).toHaveBeenCalledWith('/cattle-lots/');
  });

  it('accepts non-paginated lot lists', async () => {
    apiMock.get.mockResolvedValueOnce({ data: [{ id: 2 }] });

    await expect(fetchCattleLots()).resolves.toEqual([{ id: 2 }]);
  });

  it('fetches a single lot by id', async () => {
    apiMock.get.mockResolvedValueOnce({ data: { id: 7, entries: [] } });

    await expect(fetchCattleLot(7)).resolves.toEqual({ id: 7, entries: [] });
    expect(apiMock.get).toHaveBeenCalledWith('/cattle-lots/7/');
  });

  it('creates, updates and deletes lots', async () => {
    const payload = {
      name: 'Lote 01', system: 'feedlot' as const, status: 'open' as const,
      location: '', start_date: '2026-01-01', end_date: null, notes: '',
    };
    apiMock.post.mockResolvedValueOnce({ data: { id: 1, ...payload } });
    apiMock.patch.mockResolvedValueOnce({ data: { id: 1, ...payload, status: 'closed' } });
    apiMock.delete.mockResolvedValueOnce({});

    await createCattleLot(payload);
    await updateCattleLot(1, { status: 'closed' });
    await deleteCattleLot(1);

    expect(apiMock.post).toHaveBeenCalledWith('/cattle-lots/', payload);
    expect(apiMock.patch).toHaveBeenCalledWith('/cattle-lots/1/', { status: 'closed' });
    expect(apiMock.delete).toHaveBeenCalledWith('/cattle-lots/1/');
  });

  it('creates and deletes entries', async () => {
    const payload = {
      lot: 1, entry_type: 'freight' as const, date: '2026-01-10', amount: '350.00',
      head_count: null, weight_kg: null, description: 'Transporte',
    };
    apiMock.post.mockResolvedValueOnce({ data: { id: 9, ...payload } });
    apiMock.delete.mockResolvedValueOnce({});

    await expect(createCattleLotEntry(payload)).resolves.toMatchObject({ id: 9 });
    await deleteCattleLotEntry(9);

    expect(apiMock.post).toHaveBeenCalledWith('/cattle-lot-entries/', payload);
    expect(apiMock.delete).toHaveBeenCalledWith('/cattle-lot-entries/9/');
  });

  it('labels every entry type in Portuguese', () => {
    expect(entryTypeLabels).toEqual({
      acquisition: 'Aquisição',
      feed: 'Trato / Alimentação',
      medicine: 'Remédio',
      vaccine: 'Vacina',
      freight: 'Frete',
      other_cost: 'Outros custos',
      sale: 'Venda',
    });
  });
});
