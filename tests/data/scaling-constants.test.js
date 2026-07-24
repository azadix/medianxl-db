import { describe, expect, it } from 'vitest';
import { loadActiveTreeData } from '../helpers/tree-data.js';
import {
  validateScalingConstantsArray,
  variantKeysFromVariants,
} from '@/shared/skill-json-validation.js';

const data = loadActiveTreeData();
const { skills, subskills, statsMap, gameMeta } = data;
const tabIds = new Set((gameMeta.classTabs || []).map((t) => t.id));

describe('scalingConstants (shared validator)', () => {
  it('validates every skill and subskill scalingConstants array', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      const errors = validateScalingConstantsArray(row.scalingConstants || [], {
        statsByKeyLower: statsMap,
        variantKeys: variantKeysFromVariants(row.variants || []),
        tabIds,
        skillId: row.id,
      });
      failures.push(...errors);
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });
});
