import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeTswImportCodeFromLocation,
  fetchTswBuildByCode,
  parseTswImportCodeFromHash,
  takePendingTswImportCode,
  TSW_CHARACTER_EXPORT_URL,
} from '@/planner/tsw-code-import.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  takePendingTswImportCode();
});

describe('parseTswImportCodeFromHash', () => {
  it('reads code from #code=', () => {
    expect(parseTswImportCodeFromHash('#code=abc-123')).toBe('abc-123');
    expect(parseTswImportCodeFromHash('code=abc-123')).toBe('abc-123');
    expect(parseTswImportCodeFromHash('#other=1')).toBe('');
    expect(parseTswImportCodeFromHash('')).toBe('');
  });
});

describe('consumeTswImportCodeFromLocation', () => {
  it('stashes the code and strips it from the address bar', () => {
    const loc = {
      hash: '#code=tmp-xyz',
      pathname: '/medianxl-db/import/tsw',
      search: '',
    };
    const hist = {
      state: { keep: true },
      replaceState: vi.fn(),
    };
    expect(consumeTswImportCodeFromLocation(loc, hist)).toBe('tmp-xyz');
    expect(hist.replaceState).toHaveBeenCalledWith(
      { keep: true },
      '',
      '/medianxl-db/import/tsw'
    );
    expect(takePendingTswImportCode()).toBe('tmp-xyz');
    expect(takePendingTswImportCode()).toBe('');
  });
});

describe('fetchTswBuildByCode', () => {
  it('POSTs only {code} to TSW and returns the envelope', async () => {
    const envelope = { ok: true, build: { name: 'X', class: 'Amazon' }, items: [] };
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe(TSW_CHARACTER_EXPORT_URL);
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.headers.Authorization).toBeUndefined();
      expect(JSON.parse(init.body)).toEqual({ code: 'abc-123' });
      expect(JSON.stringify(init.headers)).not.toMatch(/Bearer/i);
      return {
        ok: true,
        status: 200,
        json: async () => envelope,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTswBuildByCode('abc-123')).resolves.toEqual(envelope);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects when TSW reports ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: 'code expired' }),
    })));
    await expect(fetchTswBuildByCode('deadbeef')).rejects.toThrow('code expired');
  });
});
