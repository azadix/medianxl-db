import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useItemsStore } from '@/stores/items.js';
import { createCharacterInstance, setCharacterInstance } from '@/character/planner-instance.js';
import { applyClassBaselineStatsToCharacter } from '@/character/planner-core.js';
import { mapTswItemsToSnapshot, unwrapTswOrNativeBuild } from '@/planner/tsw-build-import.js';
import {
  detectCompleteItemText,
  setCompleteItemText,
} from '@/items/item-text-completeness.js';
import {
  getFileSkillStore,
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { createCharacterBucket, createStatRegistry } from '@/character/bucket/index.js';
import { getPlannerCharacterStatDefs } from '@/character/planner-stats-config.js';
import { applyCharacterSources } from '@/character/bucket/engine.js';
import { parseImportedStatsText } from '@/character/bucket/sources/imports.js';
import { getEquippedWeaponProfile } from '@/items/equipped-weapon.js';
import { collectSkillDamage } from '@/skills/domain/skill-damage.js';
import { loadBuildFixture, loadPlannerCatalog } from '../helpers/planner-catalog.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

/**
 * Miss_Peeled wields Mekanism: a throw-only claw with no melee damage line but with
 * innate lightning, plus "Adds 6-8 Damage" and elemental damage from the cowl/charms.
 * The Noctule tooltip must show every element, not just the skill's magic damage.
 */
describe('Noctule damage from the Miss_Peeled build', () => {
  let restoreFetch;
  let stats;
  let profile;
  let damage;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();

    const planner = loadPlannerCatalog();
    const raw = loadBuildFixture('Miss_Peeled_04_11_2026_10_45.json');
    const { build, tswItems } = unwrapTswOrNativeBuild(raw);

    setActivePinia(createPinia());
    const itemsStore = useItemsStore();
    itemsStore.catalog = planner.catalog;
    itemsStore.sets = planner.sets;
    itemsStore.catalogLoaded = true;
    itemsStore.catalogVersionFolder = '2_14';

    const level = Number(build.level) || 150;
    const character = createCharacterInstance(build.class, level);
    character.setAllSkillPoints(build.skillPoints || {});
    character.setAllOSkills(build.oSkills || []);
    itemsStore.syncViewerClassName(build.class);
    setCompleteItemText(detectCompleteItemText(tswItems || []));
    const { snapshot } = mapTswItemsToSnapshot(tswItems || [], itemsStore, build.class);
    itemsStore.fromSnapshot(snapshot);

    const blob = Object.fromEntries(
      parseImportedStatsText(build.stats).map((entry) => [entry.key, entry.value])
    );
    applyClassBaselineStatsToCharacter(build.class);
    for (const attribute of ['strength', 'dexterity', 'vitality', 'energy']) {
      if (Number.isFinite(Number(blob[attribute]))) {
        character.setStat(attribute, Number(blob[attribute]));
      }
    }

    const registry = createStatRegistry(getPlannerCharacterStatDefs());
    const bucket = createCharacterBucket({ registry });
    const result = applyCharacterSources(bucket, {
      character,
      registry,
      itemsStore,
      effectiveLevel: level,
      allSkillsBonus: Number(build.allSkillsBonus) || 0,
    });
    stats = result.snapshot.values;
    profile = getEquippedWeaponProfile(itemsStore);
    setCharacterInstance(character);

    const store = getFileSkillStore();
    const row =
      store.catalogByInternalId.get('noctule') ||
      store.catalog.find((entry) => String(entry.displayName) === 'Noctule');
    const skillLevel = Math.max(1, Number(character.getAllSkillPoints()?.noctule) || 1);
    damage = collectSkillDamage({
      row,
      level: skillLevel,
      characterState: { blvl: {}, lvl: {}, stats },
      characterLevel: level,
      weapon: profile,
    });
  });

  afterAll(() => {
    setCharacterInstance(null);
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  it('resolves the equipped claw as a zero-base weapon with innate lightning', () => {
    expect(profile).toMatchObject({ name: 'Mekanism', min: 0, max: 0 });
    expect(profile.innate).toEqual([{ type: 'lightning', attribute: 'dexterity', percent: 0.62 }]);
    // In-game sheet: 61% innate elemental (54 from flat item lines, +5 Silks of the
    // Victor's grey Nephalem Weapons line, +2.32 Bone Chimes = 8% of 29% demons).
    expect(stats.innate_elemental_damage).toBeCloseTo(61.32, 2);
  });

  it('shows physical, fire, lightning and magic components', () => {
    const byKey = new Map(damage.components.map((component) => [component.key, component]));
    for (const key of [
      'weapon_damage',
      'weapon_fire_damage',
      'weapon_lightning_damage',
      'magic_damage',
    ]) {
      expect(byKey.has(key)).toBe(true);
    }

    // Throw-only claw: "Adds 6-8 Damage" is the physical source.
    expect(byKey.get('weapon_damage').label).toBe('Physical');
    expect(byKey.get('weapon_damage').min).toBeGreaterThan(0);
    expect(byKey.get('weapon_fire_damage').min).toBeGreaterThan(0);
    // Gear + Way of the Gryphon lightning (routed into the min/max damage stats) +
    // Nephalem Weapons (247-371 at level 10) + innate (4,735) = 5,803-8,501.
    expect(byKey.get('weapon_lightning_damage')).toMatchObject({ min: 5803, max: 8501 });
    expect(byKey.get('magic_damage').max).toBeGreaterThan(0);
  });
});
