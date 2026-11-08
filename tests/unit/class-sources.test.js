import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createCharacterInstance,
  setCharacterInstance,
} from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import {
  applyClassSources,
  applyDerivedSources,
} from '@/character/bucket/sources/class.js';
import { initSkillDataStore, resetSkillDataStoreForTests } from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

describe('class and derived sources', () => {
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

  it.each([
    ['Amazon', 10],
    ['Paladin', 40],
    ['Necromancer', 120],
  ])('reproduces the class baseline for %s level %i', (className, level) => {
    const character = createCharacterInstance(className, level);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter(className);
    const expected = character.getAllRawStats();

    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applyClassSources(bucket, { character, registry: null });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const snap = bucket.commit();

    expect(snap.getValue('strength')).toBe(Number(expected.strength) || 0);
    expect(snap.getValue('dexterity')).toBe(Number(expected.dexterity) || 0);
    expect(snap.getValue('vitality')).toBe(Number(expected.vitality) || 0);
    expect(snap.getValue('energy')).toBe(Number(expected.energy) || 0);
    expect(snap.getValue('life')).toBe(Number(expected.life) || 0);
    expect(snap.getValue('mana')).toBe(Number(expected.mana) || 0);
  });

  it('matches the naked level-150 Assassin baseline', () => {
    const character = createCharacterInstance('Assassin', 150);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Assassin');
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applyClassSources(bucket, { character, registry: null });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const snap = bucket.commit();
    expect(snap.getValue('strength')).toBe(20);
    expect(snap.getValue('dexterity')).toBe(35);
    expect(snap.getValue('vitality')).toBe(15);
    expect(snap.getValue('energy')).toBe(15);
    expect(snap.getValue('life')).toBe(4759);
    expect(snap.getValue('mana')).toBe(1132);
  });

  it('matches the naked level-150 Druid baseline', () => {
    const character = createCharacterInstance('Druid', 150);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Druid');
    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applyClassSources(bucket, { character, registry: null });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const snap = bucket.commit();
    expect(snap.getValue('strength')).toBe(25);
    expect(snap.getValue('dexterity')).toBe(20);
    expect(snap.getValue('vitality')).toBe(15);
    expect(snap.getValue('energy')).toBe(25);
    expect(snap.getValue('life')).toBe(3940);
    expect(snap.getValue('mana')).toBe(1515);
  });

  it('applies flat life and maximum life percent to the class pool', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');

    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applyClassSources(bucket, { character, registry: null });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    bucket.setSource('items', 'test', {
      contributions: [
        {
          id: 'item:life',
          stat: 'life',
          op: 'base',
          stage: 'pre',
          value: 100,
          source: { kind: 'item', id: 'test', label: 'Test Item' },
          conditions: [],
          unique: false,
        },
        {
          id: 'item:maxlife',
          stat: 'maximum_life',
          op: 'base',
          stage: 'pre',
          value: 50,
          source: { kind: 'item', id: 'test', label: 'Test Item' },
          conditions: [],
          unique: false,
        },
      ],
    });
    const snap = bucket.commit();
    expect(snap.getValue('maximum_life')).toBe(50);
    // Class base 70 + flat 100 + level life 258.75 = 428.75, multiplied by 1.5.
    expect(snap.getValue('life')).toBe(643);
  });

  it('adds bonus vitality life after the pool percentage', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');

    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applyClassSources(bucket, { character, registry: null });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    bucket.setSource('items', 'test', {
      contributions: [
        {
          id: 'item:vit',
          stat: 'vitality',
          op: 'base',
          stage: 'pre',
          value: 100,
          source: { kind: 'item', id: 'test', label: 'Test Item' },
          conditions: [],
          unique: false,
        },
        {
          id: 'item:maxlife',
          stat: 'maximum_life',
          op: 'base',
          stage: 'pre',
          value: 50,
          source: { kind: 'item', id: 'test', label: 'Test Item' },
          conditions: [],
          unique: false,
        },
      ],
    });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const snap = bucket.commit();
    // Base 70 + level life 258.75 = 328.75, multiplied by 1.5, plus
    // bonus vitality 100 * 2.25 = 225 (post-%).
    expect(snap.getValue('life')).toBe(718);
    expect(snap.getValue('vitality')).toBe(120);
  });

  it('applies percent vitality before the derived life contribution', () => {
    const character = createCharacterInstance('Amazon', 10);
    setCharacterInstance(character);
    applyClassBaselineStatsToCharacter('Amazon');
    const base = character.getAllRawStats();

    const bucket = createCharacterBucket({
      registry: createStatRegistry(getPlannerCharacterStatDefs()),
    });
    applyClassSources(bucket, { character, registry: null });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const before = bucket.commit().getValue('life');

    bucket.setSource('items', 'test', {
      contributions: [
        {
          id: 'item:pctvit',
          stat: 'percent_vitality',
          op: 'base',
          stage: 'pre',
          value: 100,
          source: { kind: 'item', id: 'test', label: 'Test Item' },
          conditions: [],
          unique: false,
        },
      ],
    });
    bucket.commit();
    applyDerivedSources(bucket, { character });
    const snap = bucket.commit();
    expect(snap.getValue('vitality')).toBe((Number(base.vitality) || 0) * 2);
    expect(snap.getValue('life')).toBeGreaterThan(before);
  });
});
