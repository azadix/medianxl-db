import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import Character from '@/character/Character.js';
import { getOSkillsForBuildExport } from '@/character/planner-build-io.js';
import { setCharacterInstance } from '@/character/planner-instance.js';
import { CHARM_ROLL_KEYS } from '@/items/charm-items.js';
import * as skillDataStore from '@/shared/skill-data-store.js';
import { useItemsStore } from '@/stores/items.js';
import { applyTswOSkillLeftovers, isTswEnvelope, mapTswItemsToSnapshot } from '@/planner/tsw-build-import.js';
import {
  cloneTswRow,
  plannerItemToTswRow,
  savedBuildName,
  setSavedBuildName,
  tswRelicDisplayName,
  tswStatsText,
  wrapPlannerBuildForTswExport,
} from '@/planner/tsw-build-export.js';

const helm = {
  id: 'u:petulant:ssu',
  name: 'The Petulant',
  rarity: 'unique',
  uniqueKind: 'ssu',
  baseName: 'Hard Leather Armor (Sacred)',
  category: 'armor',
  slot: 'tors',
  reqLevel: 100,
  reqStr: 550,
  icon: 'invhvy',
  modifiers: ['+200% Enhanced Defense'],
};

describe('tsw build export', () => {
  it('emits TSW item rows with Gear slot names', () => {
    const row = plannerItemToTswRow(helm, { extras: ['+20 Required Level'] }, { location: 'Gear', slot: 'Torso' });
    expect(row.item).toBe('The Petulant');
    expect(row.location).toBe('Gear');
    expect(row.slot).toBe('Torso');
    expect(row.quality).toBe('Unique');
    expect(row.display_quality).toBe('SSU');
    expect(row.type).toBe('Hard Leather Armor (Sacred)');
    expect(row).toMatchObject({
      ilvl: null,
      ilvl_original: null,
      quantity: null,
      compactable: false,
      area: 'character',
      storage: null,
      row: null,
      col: null,
      locid: null,
    });
    expect(row.stat_ranges).toEqual([]);
    expect(row.charm_ranges).toEqual([]);
    expect(Array.isArray(row.description_lines)).toBe(true);
    expect(row.mystic_orbs).toEqual([]);
    expect(row.socketables).toEqual([]);
  });

  it('wraps a native planner snapshot in the TSW envelope', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [helm];
    store.catalogLoaded = true;
    const envelope = wrapPlannerBuildForTswExport(
      {
        name: 'Test',
        class: 'Amazon',
        level: 120,
        version: '2.14',
        skillPoints: { Barrage: 20 },
        oSkills: {},
        allSkillsBonus: 2,
        stats: '{{life}}=100',
        items: {
          weaponSet: 0,
          equipment: { tors: { defId: 'u:petulant:ssu', extras: ['+20 Required Level'] } },
          inventory: [],
          charms: [],
          relics: [],
        },
      },
      store
    );
    expect(isTswEnvelope(envelope)).toBe(true);
    expect(envelope.ok).toBe(true);
    expect(envelope.api_version).toBe(1);
    expect(envelope.build.name).toBe('Test');
    expect(envelope.build.items).toBeUndefined();
    expect(envelope.items).toHaveLength(1);
    expect(envelope.items[0].slot).toBe('Torso');
    const { snapshot } = mapTswItemsToSnapshot(envelope.items, store, 'Amazon');
    expect(snapshot.equipment.tors.defId).toBe('u:petulant:ssu');
    expect(envelope.build.items).toBeUndefined();
    expect(savedBuildName(envelope)).toBe('Test');
    setSavedBuildName(envelope, 'Renamed');
    expect(savedBuildName(envelope)).toBe('Renamed');
    expect(envelope.build.spentPoints).toBeUndefined();
    expect(envelope.build.questCompletionOptOut).toBeUndefined();
  });

  it('emits TSW quest objects and strips mirrored current pool stats', () => {
    const envelope = wrapPlannerBuildForTswExport({
      name: 'Q',
      class: 'Druid',
      level: 150,
      skillPoints: {},
      oSkills: { Teleport: 12 },
      allSkillsBonus: 1,
      stats: '{{life}}=10\n{{current_life}}=10\n{{mana}}=4\n{{current_mana}}=3',
      questsCompleted: { den_of_evil: [1, 1, 1] },
      spentPoints: 99,
      classSkillsBonus: 20,
    });
    expect(envelope.build.questsCompleted.den_of_evil).toEqual({
      normal: true,
      nightmare: true,
      hell: true,
    });
    expect(envelope.build.spentPoints).toBeUndefined();
    expect(envelope.build.classSkillsBonus).toBeUndefined();
    expect(envelope.build.stats).toBe('{{life}}=10\n{{mana}}=4\n{{current_mana}}=3');
    expect(envelope.meta.marker_warmed_at).toBeNull();
  });

  it('omits inferred inquisitor and keeps magic resistance 0', () => {
    const envelope = wrapPlannerBuildForTswExport({
      name: 'Q',
      version: '2.14',
      class: 'Druid',
      level: 150,
      skillPoints: {},
      oSkills: {},
      allSkillsBonus: 0,
      stats: '{{life}}=10\n{{fire_resistance}}=1',
      questsCompleted: {
        den_of_evil: [1, 1, 1],
        inquisitor_of_the_triune: { normal: false, nightmare: false, hell: true },
      },
    });
    expect(envelope.build.questsCompleted.inquisitor_of_the_triune).toBeUndefined();
    expect(envelope.build.stats).toContain('{{magic_resistance}}=0');
    expect(Object.keys(envelope.build)).toEqual([
      'name',
      'version',
      'class',
      'level',
      'skillPoints',
      'oSkills',
      'allSkillsBonus',
      'stats',
      'questsCompleted',
      'savedAt',
    ]);
  });
});

function descTexts(row) {
  return (row.description_lines || []).map((line) =>
    Array.isArray(line) ? line.map((seg) => (Array.isArray(seg) ? seg[0] : String(seg))).join('') : String(line)
  );
}

const horazon = {
  id: 'cm:horazon',
  name: "Horazon's Focus",
  category: 'charms',
  rarity: 'unique',
  keepInInventory: true,
  reqLevel: 80,
  modifiers: ['+(3 to 5)% Life stolen per Hit', '+(21 to 25) to all Attributes'],
  trophy: ['+1 to All Skills'],
};

const relicHb = {
  id: 'relic:hunting-banshee',
  name: 'Relic (Hunting Banshee)',
  category: 'relics',
  rarity: 'relic',
  keepInInventory: true,
  modifiers: ['+1 to Hunting Banshee'],
};

describe('canonical TSW item rows', () => {
  it('keeps ranged charm affixes and TSW inventory header', () => {
    const row = plannerItemToTswRow(
      horazon,
      { rolls: { [`${CHARM_ROLL_KEYS.affixPrefix}base:m0:r0`]: 4, [`${CHARM_ROLL_KEYS.affixPrefix}base:m1:r0`]: 21 } },
      { location: 'Inventory', slot: null }
    );
    const texts = descTexts(row);
    expect(texts).toContain('Keep in Inventory to Gain Bonus');
    expect(texts.some((t) => /Life stolen per Hit/i.test(t))).toBe(true);
    expect(texts.some((t) => /to all Attributes/i.test(t))).toBe(true);
    expect(texts).not.toContain('Charm');
    expect(texts.some((t) => t.startsWith('[Upgrade]'))).toBe(false);
  });

  it('sets relic display names, trophy, and upgrade flags', () => {
    expect(tswRelicDisplayName('Relic (Hunting Banshee)')).toBe('Relic: Hunting Banshee');
    const relicRow = plannerItemToTswRow(relicHb, {}, { location: 'Inventory', slot: null });
    expect(relicRow.item).toBe('Relic');
    expect(relicRow.display_name).toBe('Relic: Hunting Banshee');
    const trophyRow = plannerItemToTswRow(
      horazon,
      { rolls: { [CHARM_ROLL_KEYS.trophy]: 1, [`${CHARM_ROLL_KEYS.upgradePrefix}0`]: 1 } },
      { location: 'Inventory', slot: null }
    );
    expect(trophyRow.has_trophy).toBe(true);
    expect(trophyRow.is_upgraded).toBe(true);
    expect(descTexts(trophyRow).some((t) => t.startsWith('[Trophy]'))).toBe(false);
  });

  it('scratch charm rows match imported-then-normalized shape', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [horazon];
    store.catalogLoaded = true;
    const scratch = plannerItemToTswRow(horazon, {}, { location: 'Inventory', slot: null });
    const { snapshot } = mapTswItemsToSnapshot([scratch], store, 'Druid');
    store.fromSnapshot(snapshot);
    const id = store.enabledCharms[horazon.id];
    const live = store.instances[id].tswRow;
    expect(live.type).toBe(scratch.type);
    expect(live.quality).toBe(scratch.quality);
    expect(live.display_quality).toBe(scratch.display_quality);
    expect(live.is_charm).toBe(true);
    expect(descTexts(live)).toContain('Keep in Inventory to Gain Bonus');
    expect(Object.keys(live).sort()).toEqual(Object.keys(scratch).sort());
  });

  it('keeps socketable mods off the parent description', () => {
    const row = plannerItemToTswRow(
      helm,
      {
        socketables: [
          { name: 'Jewel', type: 'Jewel', quality: 'Crafted', modifiers: ['+50% Enhanced Damage'] },
        ],
      },
      { location: 'Gear', slot: 'Torso' }
    );
    expect(descTexts(row).some((t) => /Enhanced Damage/.test(t) && !/Enhanced Defense/.test(t))).toBe(false);
    expect(row.socketables).toHaveLength(1);
    expect(row.socketables[0].name).toBe('Jewel');
  });
});

describe('live tswRow on instances', () => {
  afterEach(() => {
    setCharacterInstance(null);
  });

  it('stores tswRow on create, updates on roll edit, and snapshot round-trips it', () => {
    setActivePinia(createPinia());
    setCharacterInstance(new Character('Druid', 150));
    const store = useItemsStore();
    store.catalog = [horazon];
    store.catalogLoaded = true;
    expect(store.toggleCharm(horazon.id, true)).toBe(true);
    const id = store.enabledCharms[horazon.id];
    expect(store.instances[id].tswRow.display_name).toBe("Horazon's Focus");
    expect(descTexts(store.instances[id].tswRow)).toContain('Keep in Inventory to Gain Bonus');
    store.updateInstanceRolls(id, { [CHARM_ROLL_KEYS.trophy]: 1 });
    expect(store.instances[id].tswRow.has_trophy).toBe(true);
    const snap = store.toSnapshot();
    expect(snap.charms[0].tswRow.has_trophy).toBe(true);
    store.fromSnapshot({ equipment: {}, charms: [], relics: [] });
    store.fromSnapshot(snap);
    const id2 = store.enabledCharms[horazon.id];
    expect(store.instances[id2].tswRow.has_trophy).toBe(true);
  });
});

describe('tsw oSkill export totals', () => {
  afterEach(() => {
    setCharacterInstance(null);
    vi.restoreAllMocks();
  });

  it('includes item-granted oSkill points', () => {
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      catalog: [{ id: 'teleport', displayName: 'Teleport', class: 'Sorceress', image: 'tp' }],
    });
    const ch = new Character('Druid', 150);
    ch.oSkills = [{ skillName: 'teleport', displayName: 'Teleport', points: 1, itemPoints: 11, slotId: 's1' }];
    setCharacterInstance(ch);
    expect(getOSkillsForBuildExport()).toEqual({ Teleport: 12 });
  });

  it('exports TSW oSkill totals after leftover import', () => {
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      catalog: [{ id: 'purify', displayName: 'Purify', class: 'Paladin', image: 'pu' }],
    });
    const ch = new Character('Assassin', 150);
    ch.oSkills = [{ skillName: 'purify', displayName: 'Purify', points: 0, itemPoints: 1, slotId: 's1' }];
    setCharacterInstance(ch);
    applyTswOSkillLeftovers({ Purify: 4 });
    expect(getOSkillsForBuildExport()).toEqual({ Purify: 4 });
  });
});

describe('tswStatsText', () => {
  it('drops current pools that match max', () => {
    expect(tswStatsText('{{life}}=10\n{{current_life}}=10\n{{mana}}=2')).toBe('{{life}}=10\n{{mana}}=2');
  });
});

describe('cloneTswRow', () => {
  it('deep-clones Vue reactive rows without sharing nested objects', () => {
    const row = reactive({
      display_name: 'Fat Charm',
      nested: { n: 1 },
      description_lines: [[['Keep in Inventory to Gain Bonus', -1]]],
    });
    const cloned = cloneTswRow(row);
    expect(cloned).not.toBeNull();
    cloned.nested.n = 9;
    cloned.description_lines.push([['extra', 3]]);
    expect(row.nested.n).toBe(1);
    expect(row.description_lines).toHaveLength(1);
    expect(cloned.display_name).toBe('Fat Charm');
  });
});

describe('large TSW item export', () => {
  it('wraps many cached tswRows without nesting snap.items on the build', () => {
    setActivePinia(createPinia());
    const store = useItemsStore();
    const description_lines = Array.from({ length: 40 }, (_, i) => [[`+${i} to Strength`, 3]]);
    const charms = Array.from({ length: 50 }, (_, i) => ({
      id: `cm:export-${i}`,
      name: `Export Charm ${i}`,
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      rarity: 'unique',
      reqLevel: 1,
      modifiers: ['+1 to Strength'],
    }));
    store.catalog = charms;
    store.catalogLoaded = true;
    store.fromSnapshot({
      weaponSet: 0,
      equipment: {},
      charms: charms.map((c) => ({
        defId: c.id,
        tswRow: {
          item: c.name,
          display_name: c.name,
          type: 'Charm',
          quality: 'Unique',
          display_quality: 'Charm',
          is_charm: true,
          location: 'Inventory',
          slot: null,
          description_lines,
          socketables: [],
          mystic_orbs: [],
        },
      })),
      relics: [],
    });
    const started = Date.now();
    const envelope = wrapPlannerBuildForTswExport(
      {
        name: 'RiseWasGood',
        class: 'Paladin',
        level: 150,
        skillPoints: {},
        oSkills: { Disintegrate: 47 },
        allSkillsBonus: 23,
        stats: '{{life}}=14635',
        items: { should: 'be-dropped' },
      },
      store
    );
    expect(Date.now() - started).toBeLessThan(5000);
    expect(isTswEnvelope(envelope)).toBe(true);
    expect(envelope.build.items).toBeUndefined();
    expect(envelope.items).toHaveLength(50);
    expect(envelope.items[0].display_name).toBe('Export Charm 0');
    expect(JSON.stringify(envelope).length).toBeGreaterThan(1000);
  });
});

describe('TSW import/export round-trip', () => {
  it('keeps original rows, order, and passthrough stash items', () => {
    setActivePinia(createPinia());
    setCharacterInstance(new Character('Assassin', 150));
    const store = useItemsStore();
    store.catalog = [helm, horazon];
    store.catalogLoaded = true;
    const charmRow = {
      item: "Horazon's Focus",
      display_name: "Horazon's Focus",
      code: 'a59',
      ilvl: 99,
      ilvl_original: 99,
      location: 'Inventory',
      slot: null,
      display_quality: 'Charm',
      is_charm: true,
      description_lines: [[['Horazon original', 4]]],
    };
    const stashRow = {
      item: 'Jewel',
      display_name: 'Jewel',
      code: 'jew',
      ilvl: 1,
      location: 'Stash',
      slot: null,
      display_quality: 'Normal',
      description_lines: [[['Jewel', 0]]],
    };
    const helmRow = {
      item: 'The Petulant',
      display_name: 'The Petulant',
      code: '@67',
      ilvl: 99,
      location: 'Gear',
      slot: 'Torso',
      display_quality: 'SSSU',
      description_lines: [[['The Petulant', 4]], [['Hard Leather Armor (Sacred)', 4]]],
    };
    const mapped = mapTswItemsToSnapshot([charmRow, stashRow, helmRow], store);
    expect(mapped.snapshot.tswPassthroughItems).toHaveLength(1);
    store.fromSnapshot(mapped.snapshot);
    const envelope = wrapPlannerBuildForTswExport({ name: 'Siny', class: 'Assassin', level: 150 }, store);
    expect(envelope.items.map((row) => row.display_name)).toEqual([
      "Horazon's Focus",
      'Jewel',
      'The Petulant',
    ]);
    expect(envelope.items[0].description_lines).toEqual(charmRow.description_lines);
    expect(envelope.items[0].code).toBe('a59');
    expect(envelope.items[0].ilvl).toBe(99);
    expect(envelope.items[1].location).toBe('Stash');
    expect(envelope.items[2].code).toBe('@67');
    expect(envelope.items[2].display_quality).toBe('SSSU');
    expect(envelope.items[2].description_lines).toEqual(helmRow.description_lines);
  });
});

