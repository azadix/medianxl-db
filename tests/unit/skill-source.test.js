import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { createStatRegistry } from '@/character/bucket/index.js';
import { createCharacterBucket } from '@/character/bucket/bucket.js';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { applySkillSources } from '@/character/bucket/sources/skills.js';
import { orderSkillEntries } from '@/character/bucket/sources/skills.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('skill source', () => {
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

  it('emits a constant skill stat through the bucket', () => {
    const character = createCharacterInstance('Amazon', 150);
    character.setAllSkillPoints({ ancestral_endurance: 10 });
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    const stats = applySkillSources(bucket, {
      character,
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
      effectiveLevel: 150,
    });
    expect(stats.skills).toBeGreaterThan(0);
    expect(bucket.commit().getValue('grit')).toBe(20);
  });

  it('adds soft levels from +all skills to the scaling level', () => {
    const character = createCharacterInstance('Amazon', 150);
    character.setAllSkillPoints({ blessed_life: 5 });
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applySkillSources(bucket, {
      character,
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
      effectiveLevel: 150,
      allSkillsBonus: 2,
    });
    // Scaling uses the effective level (7) for row lookup, while the formula's `blvl`
    // is the hard level (5): min(10 + (5 - 1) * 2, 50) = 18.
    expect(bucket.commit().getValue('physical_resistance')).toBe(18);
  });

  it('reports skill-scoped damage stats instead of counting them', () => {
    const character = createCharacterInstance('Amazon', 150);
    character.setAllSkillPoints({ absolution: 20 });
    character.setEnabledSkillIds(['absolution']);
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applySkillSources(bucket, {
      character,
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
      effectiveLevel: 150,
    });
    const snap = bucket.commit();
    expect(snap.values.magic_damage).toBeUndefined();
    expect(snap.ignored.some((report) => report.reason === 'skill-scoped')).toBe(true);
  });

  it('keeps disabled buff levels available to passives that reference them', () => {
    const character = createCharacterInstance('Paladin', 150);
    character.setAllSkillPoints({ veneration_of_justice: 13, reverence: 1 });
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applySkillSources(bucket, {
      character,
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
      effectiveLevel: 150,
    });
    // Veneration is a disabled toggle, but Reverence reads its level (13) and adds
    // 30 energy per level; Veneration itself must not contribute its own row.
    expect(bucket.commit().getValue('energy')).toBe(390);
  });

  it('uses effective level for bare cross-skill references', () => {
    const character = createCharacterInstance('Paladin', 150);
    character.setAllSkillPoints({ veneration_of_justice: 13, reverence: 1 });
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applySkillSources(bucket, {
      character,
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
      effectiveLevel: 150,
      allSkillsBonus: 2,
    });
    // Reverence reads Veneration at effective level 15, not hard 13.
    expect(bucket.commit().getValue('energy')).toBe(450);
  });

  it('orders a skill_duration producer before its consumers', () => {
    const store = getFileSkillStore();
    const continuity = store.catalogByInternalId.get('continuity');
    const ancestral = store.catalogByInternalId.get('ancestral_endurance');
    expect(continuity).toBeTruthy();
    expect(ancestral).toBeTruthy();
    const { order } = orderSkillEntries(
      [
        { key: 'ancestral_endurance', row: ancestral },
        { key: 'continuity', row: continuity },
      ],
      createStatRegistry(getPlannerCharacterStatDefs())
    );
    const keys = order.map((entry) => entry.key);
    expect(keys.indexOf('continuity')).toBeLessThan(keys.indexOf('ancestral_endurance'));
  });
});
