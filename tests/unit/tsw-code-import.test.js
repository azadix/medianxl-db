import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginPendingTswImportFetch,
  clearPendingTswImportState,
  consumeTswImportCodeFromLocation,
  fetchTswBuildByCode,
  parseTswImportCodeFromHash,
  peekPendingTswImportCode,
  takePendingTswImportCode,
  takePendingTswImportEnvelope,
  TSW_IMPORT_URL,
} from '@/planner/tsw-code-import.js';

function stubOkFetch(envelope) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => envelope,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  clearPendingTswImportState();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
  it('stashes the code, strips it from the address bar, and prefetches', async () => {
    const envelope = { ok: true, build: { name: 'X', class: 'Amazon' }, items: [] };
    const fetchMock = stubOkFetch(envelope);
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
    expect(peekPendingTswImportCode()).toBe('tmp-xyz');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(takePendingTswImportCode()).toBe('tmp-xyz');
    expect(takePendingTswImportCode()).toBe('');
    await expect(takePendingTswImportEnvelope('tmp-xyz')).resolves.toEqual(envelope);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('takePendingTswImportEnvelope', () => {
  it('reuses a single prefetch POST for the pending code', async () => {
    const envelope = { ok: true, build: { name: 'Y', class: 'Barbarian' }, items: [] };
    const fetchMock = stubOkFetch(envelope);
    const loc = {
      hash: '#code=reuse-1',
      pathname: '/import/tsw',
      search: '',
    };
    const hist = { state: null, replaceState: vi.fn() };

    consumeTswImportCodeFromLocation(loc, hist);
    expect(beginPendingTswImportFetch()).toBeInstanceOf(Promise);
    expect(fetchMock).toHaveBeenCalledOnce();

    const code = takePendingTswImportCode();
    expect(code).toBe('reuse-1');
    await expect(takePendingTswImportEnvelope(code)).resolves.toEqual(envelope);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('fetches when there is no prefetch', async () => {
    const envelope = { ok: true, build: { name: 'Z', class: 'Amazon' }, items: [] };
    const fetchMock = stubOkFetch(envelope);
    await expect(takePendingTswImportEnvelope('fresh-code')).resolves.toEqual(envelope);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: 'fresh-code' });
  });
});

describe('fetchTswBuildByCode', () => {
  it('POSTs only {code} to azadi.pl and returns the envelope', async () => {
    const envelope = { ok: true, build: { name: 'X', class: 'Amazon' }, items: [] };
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe(TSW_IMPORT_URL);
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
