import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { applyCharacterSources } from '@/character/bucket/engine.js';
import { applyImportedStats } from '@/character/bucket/sources/imports.js';
import {
  applyClassSources,
  applyDerivedSources,
} from '@/character/bucket/sources/class.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const TOTALS = [
  '{{life}}=9999',
  '{{mana}}=8888',
  '{{strength}}=100',
  '{{dexterity}}=50',
  '{{vitality}}=60',
  '{{energy}}=20',
  '{{fire_resistance}}=75',
].join('\n');

describe('imported stats source', () => {
  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  afterEach(() => {
    setCharacterInstance(null);
  });

  function engine(character, extra = {}) {
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    const result = applyCharacterSources(bucket, {
      character,
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
      effectiveLevel: 10,
      includeItems: false,
      includeSkills: false,
      ...extra,
    });
    return { bucket, snap: result.snapshot };
  }

  it('keeps final totals as comparison values and attributes as base', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    const { snap } = engine(character, { importText: TOTALS, importMode: 'totals' });

    expect(snap.imported.life).toBe(9999);
    expect(snap.imported.mana).toBe(8888);
    expect(snap.imported.fire_resistance).toBe(75);
    expect(snap.getValue('life')).not.toBe(9999);
    expect(snap.getValue('fire_resistance')).toBe(0);
    expect(snap.getValue('strength')).toBe(100);
    expect(snap.getValue('vitality')).toBe(60);
  });

  it('keeps base-mode pools as comparisons instead of adding them', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    const { snap } = engine(character, {
      importText: '{{life}}=1000\n{{mana}}=500\n{{strength}}=100',
      importMode: 'base',
    });
    expect(snap.imported.life).toBe(1000);
    expect(snap.imported.mana).toBe(500);
    expect(snap.getValue('life')).not.toBe(1000);
    expect(snap.getValue('mana')).not.toBe(500);
    expect(snap.getValue('strength')).toBe(100);
  });

  it('clears old imports when the text is removed', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    const registry = createStatRegistry(getPlannerCharacterStatDefs());
    const bucket = createCharacterBucket({ registry });
    applyClassSources(bucket, { character, registry });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const before = bucket.commit().getValue('life');

    applyImportedStats(bucket, { text: '{{life}}=9999', mode: 'totals' });
    expect(bucket.commit().imported.life).toBe(9999);
    expect(bucket.commit().getValue('life')).toBe(before);

    applyClassSources(bucket, { character, registry });
    applyImportedStats(bucket, { text: '', mode: 'totals' });
    expect(bucket.commit().imported.life).toBeUndefined();
    expect(bucket.commit().getValue('life')).toBe(before);
  });
});
