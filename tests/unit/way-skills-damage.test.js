/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { refreshCharacterStatsSnapshot } from '@/character/stats-provider.js';
import { collectPlannerDamageSkills } from '@/character/planner-damage.js';
import {
  buildFixedLevelSkillTooltipHtml,
  resetFixedLevelSkillTooltipCacheForTests,
} from '@/skills/fixed-level-skill-tooltip.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * The three Assassin Ways are passives that add elemental damage to weapon hits.
 * Phoenix/Raven used to be treated as disabled toggles (missing Passive tag) and
 * Gryphon's description resolved the plain `lightning_damage` stat instead.
 */
describe('Way skills', () => {
  let restoreFetch;
  let character;
  let stats;

  beforeAll(async () => {
    setActivePinia(createPinia());
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();

    character = createCharacterInstance('Assassin', 150);
    applyClassBaselineStatsToCharacter('Assassin');
    character.setAllSkillPoints({
      way_of_the_gryphon: 25,
      way_of_the_phoenix: 25,
      way_of_the_raven: 15,
    });
    setCharacterInstance(character);

    const snapshot = refreshCharacterStatsSnapshot();
    stats = snapshot.values;
  });

  afterAll(() => {
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('applies all three weapon damage bonuses without toggles', () => {
    expect(character.isSkillDisabled('way_of_the_gryphon')).toBe(false);
    expect(character.isSkillDisabled('way_of_the_phoenix')).toBe(false);
    expect(character.isSkillDisabled('way_of_the_raven')).toBe(false);
    // Skill ranges are routed into the min/max damage stats, like the game's
    // firemindam/firemaxdam (48/49), lightmindam (50/51) and coldmindam (54/55).
    expect(stats.minimum_lightning_damage).toBeGreaterThan(0);
    expect(stats.maximum_lightning_damage).toBeGreaterThan(0);
    expect(stats.minimum_fire_damage).toBeGreaterThan(0);
    expect(stats.maximum_fire_damage).toBeGreaterThan(0);
    expect(stats.minimum_cold_damage).toBeGreaterThan(0);
    expect(stats.maximum_cold_damage).toBeGreaterThan(0);
  });

  it('adds the elemental damage to a bare-handed attack', () => {
    const rows = collectPlannerDamageSkills({
      character,
      store: getFileSkillStore(),
      effectiveLevel: 150,
    });
    const attack = rows.find((entry) => entry.id === 'attack');
    const keys = new Set((attack?.components || []).map((component) => component.key));
    expect(keys.has('weapon_fire_damage')).toBe(true);
    expect(keys.has('weapon_cold_damage')).toBe(true);
    expect(keys.has('weapon_lightning_damage')).toBe(true);
  });

  it('labels the tooltip stat as damage to weapon', async () => {
    const expectations = [
      ['way_of_the_gryphon', 70, 'Lightning Damage to Weapon'],
      ['way_of_the_phoenix', 70, 'Fire Damage to Weapon'],
      ['way_of_the_raven', 60, 'Cold Damage to Weapon'],
    ];
    for (const [id, level, label] of expectations) {
      resetFixedLevelSkillTooltipCacheForTests();
      const html = await buildFixedLevelSkillTooltipHtml(id, level);
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(text).toContain(`${label}:`);
      expect(text).not.toContain('???');
    }
  });
});
