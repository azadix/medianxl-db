import { describe, expect, it } from 'vitest';
import {
  compressBuildToUrlParam,
  decompressBuildFromUrlParam,
} from '@/planner/build-url-codec.js';

describe('build-url-codec', () => {
  it('round-trips a payload that compresses past 100k bytes', async () => {
    const blob = Array.from({ length: 80000 }, (_, i) => ((i * 2654435761) >>> 0).toString(16));
    const jsonStr = JSON.stringify({ blob });
    const encoded = await compressBuildToUrlParam(jsonStr);
    expect(encoded.length).toBeGreaterThan(100000);
    const restored = await decompressBuildFromUrlParam(encoded);
    expect(restored).toEqual({ blob });
  });
});
