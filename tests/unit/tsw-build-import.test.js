import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import { useItemsStore } from '@/stores/items.js';
import Character from '@/character/Character.js';
import { setCharacterInstance } from '@/character/planner-instance.js';
import * as skillDataStore from '@/shared/skill-data-store.js';
import {
  unwrapTswOrNativeBuild,
  coerceSkillPointsMap,
  isTswEnvelope,
  mapTswItemsToSnapshot,
  isIgnoredTswItem,
  resolveTswItemDefId,
  resolveTswRunewordDefId,
  inferTswQuestsCompleted,
  tswTierFromRow,
  applyTswOSkillLeftovers,
  TSW_SLOT_TO_EQUIPMENT,
} from '@/planner/tsw-build-import.js';
import { runewordEntryToItemDef } from '@/items/runeword-items.js';
import { canEquipInSlot } from '@/items/item-types.js';
import { inferTswClassSkillsBonus } from '@/planner/tsw-item-rolls.js';
import { CHARM_ROLL_KEYS, charmAffixRollKey } from '@/items/charm-items.js';
import { DIM_KEY_ROLL_KEYS } from '@/items/dimensional-key.js';
import { relicAffixRollKey } from '@/items/relic-items.js';

const ROOT = resolve(import.meta.dirname, '../..');

const catalog = {
  catalog: [
    { id: '@17', name: 'Skull Cap', rarity: 'normal', category: 'armor' },
    { id: '@14', name: 'Full Plate Mail (Sacred)', rarity: 'normal', category: 'armor', slot: 'tors', sockets: 6 },
    { id: 'rin', name: 'Ring', rarity: 'normal', category: 'jewelry' },
    { id: 'amu', name: 'Amulet', rarity: 'normal', category: 'jewelry' },
    { id: '@36', name: 'Light Gauntlets (Sacred)', rarity: 'normal', category: 'armor', slot: 'glov' },
    { id: 'cap-sacred', name: 'Cap (Sacred)', rarity: 'normal', category: 'armor', slot: 'head' },
    { id: 'u:lacuni-cowl:su', name: 'Lacuni Cowl', uniqueKind: 'su', rarity: 'unique' },
    {
      id: 'u:tinkers-gambit:su',
      name: "Tinker's Gambit",
      uniqueKind: 'su',
      rarity: 'unique',
      slot: 'head',
      classRestriction: 'Assassin Only',
      modifiers: ['+3 to Assassin Skill Levels'],
    },
    {
      id: 'u:lionblood-crest:su',
      name: 'Lionblood Crest',
      uniqueKind: 'su',
      rarity: 'unique',
      slot: 'head',
      classRestriction: 'Amazon Only',
      modifiers: ['+100% Damage to Demons'],
    },
    {
      id: 'u:mindflayers-mayhem:su',
      name: "Mindflayer's Mayhem",
      uniqueKind: 'su',
      rarity: 'unique',
      slot: 'feet',
      modifiers: ['+40% Movement Speed'],
    },
    {
      id: 'u:acidblood:tu:1',
      name: 'Acidblood',
      uniqueKind: 'tiered',
      tier: 1,
      rarity: 'unique',
      baseType: 'Leather Armor (1)',
    },
    {
      id: 'u:acidblood:tu:2',
      name: 'Acidblood',
      uniqueKind: 'tiered',
      tier: 2,
      rarity: 'unique',
      baseType: 'Leather Armor (2)',
    },
    {
      id: 'u:acidblood:tu:3',
      name: 'Acidblood',
      uniqueKind: 'tiered',
      tier: 3,
      rarity: 'unique',
      baseType: 'Leather Armor (3)',
    },
    {
      id: 'u:acidblood:tu:4',
      name: 'Acidblood',
      uniqueKind: 'tiered',
      tier: 4,
      rarity: 'unique',
      baseType: 'Leather Armor (4)',
    },
    { id: 'a68', name: "Horazon's Focus", type: 'charm', category: 'charms', keepInInventory: true },
    {
      id: 'ebw',
      name: 'Dimensional Key',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
    },
    {
      id: 'relic:lightning-wall',
      name: 'Relic (Lightning Wall)',
      type: 'relic',
      category: 'relics',
      rarity: 'relic',
    },
    runewordEntryToItemDef({
      id: 'rw:lionheart',
      name: 'Lionheart',
      runeCode: 'OhmThulFal',
      runes: ['Ohm', 'Thul', 'Fal'],
      reqLevel: 80,
      allowedTypes: ['Body Armors'],
      modifiers: ['+20% Enhanced Damage'],
    }),
  ].filter(Boolean),
};

function byIdCatalog() {
  /** @type {Record<string, object>} */
  const catalogById = {};
  for (const def of catalog.catalog) {
    catalogById[def.id] = def;
    // Mirror store alias: bare `:tu` → T4
    if (def.uniqueKind === 'tiered' && Number(def.tier) === 4 && typeof def.id === 'string') {
      const alias = def.id.replace(/:4$/, '');
      if (alias.endsWith(':tu') && catalogById[alias] == null) catalogById[alias] = def;
    }
  }
  return { catalog: catalog.catalog, catalogById };
}

describe('tsw-build-import', () => {
  it('unwraps a TSW envelope and leaves native JSON alone', () => {
    const envelope = {
      ok: true,
      build: { name: 'Miss_Peeled', class: 'Assassin', level: 150, skillPoints: {}, oSkills: {} },
      items: [{ item: 'Ring', location: 'Gear' }],
    };
    expect(isTswEnvelope(envelope)).toBe(true);
    const unwrapped = unwrapTswOrNativeBuild(envelope);
    expect(unwrapped.build.name).toBe('Miss_Peeled');
    expect(unwrapped.build.__tswEnvelope).toBe(true);
    expect(unwrapped.tswItems).toHaveLength(1);

    const native = { name: 'Local', class: 'Amazon', level: 10, skillPoints: {}, oSkills: {} };
    expect(isTswEnvelope(native)).toBe(false);
    expect(unwrapTswOrNativeBuild(native).build).toBe(native);
    expect(unwrapTswOrNativeBuild(native).tswItems).toBeNull();
  });

  it('turns TSW stats objects into key=value text', () => {
    const { build } = unwrapTswOrNativeBuild({
      ok: true,
      build: {
        name: 'X',
        class: 'Necromancer',
        level: 150,
        skillPoints: {},
        stats: { life: 100, mana: 40 },
      },
      items: [],
    });
    expect(build.stats).toBe('life=100\nmana=40');
  });

  it('coerces empty TSW skillPoints arrays to an object', () => {
    expect(coerceSkillPointsMap([])).toEqual({});
    expect(coerceSkillPointsMap(null)).toEqual({});
    const { build } = unwrapTswOrNativeBuild({
      ok: true,
      build: {
        name: 'ZHoNG-JKLSP',
        class: 'Druid',
        level: 150,
        skillPoints: [],
        oSkills: { Teleport: 4 },
      },
      items: [],
    });
    expect(build.skillPoints).toEqual({});
    expect(build.oSkills).toEqual({ Teleport: 4 });
  });

  it('infers Inquisitor of the Triune hell complete when TSW level is above 110', () => {
    const quests = {
      den_of_evil: { normal: true, nightmare: true, hell: true },
    };
    expect(inferTswQuestsCompleted({ level: 110, questsCompleted: quests }).inquisitor_of_the_triune).toBeUndefined();
    expect(inferTswQuestsCompleted({ level: 111, questsCompleted: quests }).inquisitor_of_the_triune).toEqual({
      normal: false,
      nightmare: false,
      hell: true,
    });
    expect(
      inferTswQuestsCompleted({
        level: 150,
        questsCompleted: {
          ...quests,
          inquisitor_of_the_triune: { normal: false, nightmare: false, hell: false },
        },
      }).inquisitor_of_the_triune
    ).toEqual({ normal: false, nightmare: false, hell: false });
  });

  it('maps Head unique, charm code, Primordia, relic, and a rare ring', () => {
    const rows = [
      {
        item: 'Lacuni Cowl',
        display_name: 'Lacuni Cowl',
        code: '@17',
        quality: 'Unique',
        display_quality: 'SU',
        location: 'Gear',
        slot: 'Head',
      },
      {
        item: "Horazon's Focus",
        display_name: "Horazon's Focus",
        code: 'a68',
        is_charm: true,
        location: 'Inventory',
        slot: null,
      },
      {
        item: 'Primordia',
        display_name: 'Primordia',
        code: 'eby',
        type: 'Charm',
        is_charm: true,
        location: 'Inventory',
        description_lines: [[['Primordia', 4]], [['Dimensional Key', 4]]],
      },
      {
        item: 'Relic: Lightning Wall',
        display_name: 'Relic: Lightning Wall',
        is_charm: true,
        location: 'Inventory',
      },
      {
        item: 'Ring',
        display_name: 'Ring',
        quality: 'Rare',
        display_quality: 'Rare',
        code: 'rin',
        location: 'Gear',
        slot: 'LeftFinger',
        description_lines: [[['Ring', 9]], [['Prefixes: 3', 9]], [['+1 to All Skills', 3]]],
      },
    ];
    const { snapshot, skipped } = mapTswItemsToSnapshot(rows, byIdCatalog());
    expect(snapshot.equipment.head).toMatchObject({ defId: 'u:lacuni-cowl:su' });
    expect(snapshot.equipment.lrin).toMatchObject({
      defId: 'rin',
      custom: { quality: 'rare', name: 'Ring', modifiers: ['+1 to All Skills'] },
      tswIndex: expect.any(Number),
    });
    expect(snapshot.equipment.lrin.tswRow.display_name).toBe('Ring');
    expect(snapshot.equipment.head.tswRow.display_name).toBe('Lacuni Cowl');
    expect(snapshot.charms.map((row) => row.defId)).toEqual(['a68', 'ebw']);
    expect(snapshot.charms[1].rolls?.[DIM_KEY_ROLL_KEYS.variant]).toBe(3);
    expect(snapshot.relics.map((row) => row.defId)).toEqual(['relic:lightning-wall']);
    expect(skipped.some((s) => s.name === 'Ring')).toBe(false);
  });

  it('silently ignores Cursor-slot items instead of treating them as uncatalogued', () => {
    expect(
      isIgnoredTswItem({
        item: 'Horadric Cube',
        display_name: 'Horadric Cube',
        code: 'box',
        image: 'invbox',
        location: 'Gear',
        slot: 'Cursor',
      })
    ).toBe(true);
    expect(
      isIgnoredTswItem({
        item: 'Horadric Cube',
        display_name: 'Horadric Cube',
        code: 'box',
        location: 'Inventory',
        slot: null,
      })
    ).toBe(false);
    const { snapshot, skipped } = mapTswItemsToSnapshot(
      [
        {
          item: 'Horadric Cube',
          display_name: 'Horadric Cube',
          code: 'box',
          location: 'Gear',
          slot: 'Cursor',
        },
      ],
      byIdCatalog()
    );
    expect(snapshot.charms).toEqual([]);
    expect(snapshot.relics).toEqual([]);
    expect(skipped.find((s) => s.name === 'Horadric Cube')?.reason).toBe('ignored');
    expect(snapshot.tswPassthroughItems).toEqual([]);
  });

  it('maps Dimensional Key Star Chart, Dream Fragment, and lab progression from TSW lines', () => {
    const rows = [
      {
        item: 'Primordia',
        display_name: 'Primordia',
        code: 'eby',
        type: 'Charm',
        is_charm: true,
        location: 'Inventory',
        description_lines: [
          [['Primordia', 4]],
          [['Dimensional Key', 4]],
          [['Dream Fragment (2)', 2]],
          [['Dream Fragment (3)', 2]],
          [['Star Chart (1)', 2]],
          [['Star Chart (4)', 2]],
          [['+10% Innate Elemental Damage', 3]],
          [['+52% Magic Find', 3]],
          [['Adds 100-200 Fire Damage', 3]],
        ],
      },
    ];
    const { snapshot } = mapTswItemsToSnapshot(rows, byIdCatalog());
    expect(snapshot.charms).toHaveLength(1);
    expect(snapshot.charms[0].defId).toBe('ebw');
    expect(snapshot.charms[0].rolls).toMatchObject({
      [DIM_KEY_ROLL_KEYS.variant]: 3,
      [`${DIM_KEY_ROLL_KEYS.starPrefix}1`]: 1,
      [`${DIM_KEY_ROLL_KEYS.starPrefix}4`]: 1,
      [`${DIM_KEY_ROLL_KEYS.dreamPrefix}2`]: 1,
      [`${DIM_KEY_ROLL_KEYS.dreamPrefix}3`]: 1,
      [DIM_KEY_ROLL_KEYS.labs]: 8,
      [DIM_KEY_ROLL_KEYS.invasion]: 1,
    });
    expect(snapshot.charms[0].extras || []).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Dream Fragment/i),
        expect.stringMatching(/Star Chart/i),
        expect.stringMatching(/Magic Find/i),
      ])
    );
  });

  it('maps each TSW Dimensional Key unique onto catalog ebw with the matching variant', () => {
    const cases = [
      { item: 'Arcana', code: 'ebw', variant: 0 },
      { item: 'Mandate', code: 'ebv', variant: 1 },
      { item: 'Onslaught', code: 'ebu', variant: 2 },
      { item: 'Primordia', code: 'eby', variant: 3 },
      { item: 'Nephalem Mandate', code: 'ebv', variant: 1, nephalem: true },
    ];
    for (const row of cases) {
      const { snapshot } = mapTswItemsToSnapshot(
        [
          {
            item: row.item,
            display_name: row.item,
            code: row.code,
            type: 'Charm',
            is_charm: true,
            location: 'Inventory',
            description_lines: [
              [[row.item, 4]],
              [['Dimensional Key', 4]],
              ...(row.nephalem ? [[['Occult Smithing Unlocked', 3]], [['+1 to Void Armor', 3]]] : []),
            ],
          },
        ],
        byIdCatalog()
      );
      expect(snapshot.charms).toHaveLength(1);
      expect(snapshot.charms[0].defId).toBe('ebw');
      expect(snapshot.charms[0].rolls?.[DIM_KEY_ROLL_KEYS.variant]).toBe(row.variant);
      if (row.nephalem) {
        expect(snapshot.charms[0].rolls?.[DIM_KEY_ROLL_KEYS.nephalem]).toBe(1);
      }
    }
  });

  it('maps Mindflayer boots as the boots unique, keeping the helm name and dropping class restriction', () => {
    const rows = [
      {
        item: "Tinker's Gambit",
        display_name: "Tinker's Gambit",
        type: "Mindflayer's Mayhem",
        quality: 'Unique',
        display_quality: 'SSU',
        code: 'DU1',
        image: 'mfboots',
        location: 'Gear',
        slot: 'Feet',
        mystic_orbs: [[1, 'MO - HP']],
        description_lines: [
          [["Tinker's Gambit", 4]],
          [["Mindflayer's Mayhem", 4]],
          [['Defense: 888', -1]],
          [['Required Level: 100', -1]],
          [['+1% Trap Damage per 5 Base Strength', 8]],
          [['+3 to Assassin Skill Levels', 3]],
          [['+40% Movement Speed', 3]],
        ],
      },
      {
        item: 'Lionblood Crest',
        display_name: 'Lionblood Crest',
        type: "Mindflayer's Mayhem",
        quality: 'Unique',
        display_quality: 'SU',
        code: 'DU1',
        image: 'mfboots',
        location: 'Gear',
        slot: 'Feet',
        description_lines: [
          [['Lionblood Crest', 4]],
          [["Mindflayer's Mayhem", 4]],
          [['(Amazon Only)', -1]],
          [['+100% Damage to Demons', 3]],
          [['+40% Movement Speed', 3]],
        ],
      },
    ];
    const cat = byIdCatalog();
    expect(resolveTswItemDefId(rows[0], catalogIndexForTests())).toBe('u:mindflayers-mayhem:su');
    const assassin = mapTswItemsToSnapshot([rows[0]], cat, 'Assassin');
    expect(assassin.skipped).toEqual([]);
    expect(assassin.snapshot.equipment.feet).toMatchObject({
      defId: 'u:mindflayers-mayhem:su',
      icon: 'mfboots',
      name: "Tinker's Gambit",
      extras: ['{orange}+1% Trap Damage per 5 Base Strength', '+3 to Assassin Skill Levels'],
    });
    expect(assassin.snapshot.equipment.feet.mysticOrbs).toBeUndefined();
    expect(assassin.snapshot.equipment.head).toBeNull();

    const amazonHelmOnSin = mapTswItemsToSnapshot([rows[1]], cat, 'Assassin');
    expect(amazonHelmOnSin.skipped).toEqual([]);
    expect(amazonHelmOnSin.snapshot.equipment.feet).toMatchObject({
      defId: 'u:mindflayers-mayhem:su',
      name: 'Lionblood Crest',
      extras: ['+100% Damage to Demons'],
    });
  });

  it('loads mirrored Mindflayer boots from Azalea and dabomei TSW dumps', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const baseItems = JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8'));
    const other = JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8'));
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items: overlays } = buildCatalogFromUniqueStats(db, [...baseItems, ...other]);
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [...baseItems, ...other, ...overlays];
    store.catalogLoaded = true;
    store.catalogVersionFolder = '2_14';

    let testedItem = {
      item: "Tinker's Gambit",
      display_name: "Tinker's Gambit",
      type: "Mindflayer's Mayhem",
      quality: 'Unique',
      display_quality: 'SSU',
      code: 'DU1',
      image: 'mfboots',
      location: 'Gear',
      slot: 'Feet',
    };
    const { snapshot: tinkerSnap, skipped: tinkerSkipped } = mapTswItemsToSnapshot(
      [testedItem],
      store,
      'Assassin'
    );
    expect(tinkerSkipped.some((row) => /Tinker|Mindflayer/i.test(row.name))).toBe(false);
    store.fromSnapshot(tinkerSnap);
    const tinkerFeet = store.getEquipmentDef('feet');
    expect(tinkerFeet?.id).toBe('u:mindflayers-mayhem:su');
    expect(tinkerFeet?.name).toBe("Tinker's Gambit");
    expect(tinkerFeet?.reqLevel).toBe(140);
    expect(tinkerFeet?.classRestriction).toBeFalsy();
    expect(canEquipInSlot(tinkerFeet, 'feet', 'Assassin')).toBe(true);
    expect(canEquipInSlot(tinkerFeet, 'feet', 'Amazon')).toBe(true);

    testedItem = {
      item: 'Lionblood Crest',
      display_name: 'Lionblood Crest',
      type: "Mindflayer's Mayhem",
      quality: 'Unique',
      display_quality: 'SU',
      code: 'DU1',
      image: 'mfboots',
      location: 'Gear',
      slot: 'Feet',
    };
    const { snapshot: lionbloodSnap, skipped: lionbloodSkipped } = mapTswItemsToSnapshot(
      [testedItem],
      store,
      'Assassin'
    );
    expect(lionbloodSkipped.some((row) => /Lionblood|Mindflayer/i.test(row.name))).toBe(false);
    store.fromSnapshot(lionbloodSnap);
    const lionbloodFeet = store.getEquipmentDef('feet');
    expect(lionbloodFeet?.id).toBe('u:mindflayers-mayhem:su');
    expect(lionbloodFeet?.name).toBe('Lionblood Crest');
    expect(lionbloodFeet?.classRestriction).toBeFalsy();
    expect(canEquipInSlot(lionbloodFeet, 'feet', 'Assassin')).toBe(true);
  });

  it('loads Valthek quest set pieces from NgucBu-ViE.json', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const baseItems = JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8'));
    const other = JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8'));
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items: overlays, sets } = buildCatalogFromUniqueStats(db, [...baseItems, ...other]);
    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [...baseItems, ...other, ...overlays];
    store.sets = sets;
    store.catalogLoaded = true;
    store.catalogVersionFolder = '2_14';

    const valthekItems = [
      { display_name: "Horazon's Guard", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'Torso' },
      { display_name: "Zoltun's Gauntlets", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'Hands' },
      { display_name: "Bartuc's Blood", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'Waist' },
      { display_name: "Deckard Cain's Gem", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'LeftFinger' },
      { display_name: "Jered Cain's Diamond", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'RightFinger' },
      { display_name: "Tal Rasha's Talisman", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'Neck' },
      { display_name: "Quov Tsin's Crown", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'Head' },
      { display_name: "Radament's Greaves", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'Feet' },
      { display_name: "Valthek's Blade", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'RightHandMain' },
      { display_name: "Nor Tiraj's Safeguard", quality: 'Set', display_quality: 'Set', location: 'Gear', slot: 'LeftHandMain' },
    ];
    const { snapshot, skipped } = mapTswItemsToSnapshot(valthekItems, store, 'Amazon');
    const valthekNames = valthekItems.map((row) => row.display_name);
    expect(skipped.filter((row) => valthekNames.includes(row.name))).toEqual([]);
    expect(snapshot.equipment.tors?.defId).toBe('s:horazons-guard:sacred-set');
    expect(snapshot.equipment.rarm?.defId).toBe('s:valtheks-blade:sacred-set');
    expect(snapshot.equipment.larm?.defId).toBe('s:nor-tirajs-safeguard:sacred-set');
    expect(snapshot.equipment.head?.defId).toBe('s:quov-tsins-crown:sacred-set');
    expect(snapshot.equipment.glov?.defId).toBe('s:zoltuns-gauntlets:sacred-set');
    expect(snapshot.equipment.belt?.defId).toBe('s:bartucs-blood:sacred-set');
    expect(snapshot.equipment.feet?.defId).toBe('s:radaments-greaves:sacred-set');
    expect(snapshot.equipment.neck?.defId).toBe('s:tal-rashas-talisman:sacred-set');
    expect(snapshot.equipment.lrin?.defId).toBe('s:deckard-cains-gem:sacred-set');
    expect(snapshot.equipment.rrin?.defId).toBe('s:jered-cains-diamond:sacred-set');
  });

  it('loads the I Am Rich secret charm from garden.json', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const charms = JSON.parse(readFileSync(resolve(dir, 'charms.json'), 'utf8'));
    const rich = charms.find((c) => c.id === 'u@+' || c.name === 'I Am Rich');
    expect(rich).toMatchObject({
      id: 'u@+',
      name: 'I Am Rich',
      icon: 'redgem',
      reqLevel: 1,
    });

    const testedItem = {
      item: 'I Am Rich',
      display_name: 'I Am Rich',
      type: 'Charm',
      quality: 'Unique',
      display_quality: 'Charm',
      code: 'u@+',
      image: 'redgem',
      is_charm: true,
      location: 'Inventory',
      slot: null,
    };
    const { snapshot, skipped } = mapTswItemsToSnapshot([testedItem], {
      catalog: charms.map((c) => ({ ...c, type: 'charm', category: 'charms', keepInInventory: true })),
    });
    expect(skipped.some((row) => /I Am Rich/i.test(row.name))).toBe(false);
    expect(snapshot.charms.some((row) => row.defId === 'u@+')).toBe(true);
  });

  it('maps magic, honorific, and angelic gear onto the matching base', () => {
    const rows = [
      {
        item: 'Ring',
        display_name: 'Ring',
        type: 'Ring',
        quality: 'Magic',
        display_quality: 'Magic',
        code: 'rin',
        location: 'Gear',
        slot: 'RightFinger',
        description_lines: [[['Ring', 3]], [['+10 to Strength', 3]]],
      },
      {
        item: 'Cap (Honorific)',
        display_name: 'Cap (Honorific)',
        type: 'Cap (Sacred)',
        quality: 'Honorific',
        location: 'Gear',
        slot: 'Head',
        description_lines: [
          [['Cap (Honorific)', 3]],
          [['Required Level: 1', 1]],
          [['+5% Enhanced Defense', 3]],
        ],
      },
      {
        item: 'Light Gauntlets (Angelic)',
        display_name: 'Light Gauntlets (Angelic)',
        type: 'Light Gauntlets (Angelic)',
        quality: 'Rare',
        display_quality: 'Rare',
        code: 'an05',
        image: 'angelicgloves',
        location: 'Gear',
        slot: 'Hands',
        description_lines: [
          [['Light Gauntlets (Angelic)', 9]],
          [['Defense: 670', -1]],
          [['Required Strength: 600', 1]],
          [['Prefixes: 3', 9]],
          [['+3 to All Skills', 3]],
        ],
      },
    ];
    const { snapshot, skipped } = mapTswItemsToSnapshot(rows, byIdCatalog());
    expect(skipped).toEqual([]);
    expect(snapshot.equipment.rrin).toMatchObject({
      defId: 'rin',
      custom: { quality: 'magic', name: 'Ring', modifiers: ['+10 to Strength'] },
    });
    expect(snapshot.equipment.head).toMatchObject({
      defId: 'cap-sacred',
      custom: {
        quality: 'honorific',
        name: 'Cap (Honorific)',
        reqLevel: 1,
        modifiers: ['+5% Enhanced Defense'],
      },
    });
    expect(snapshot.equipment.glov).toMatchObject({
      defId: '@36:angelic',
      icon: 'angelicgloves',
      custom: {
        quality: 'rare',
        angelic: true,
        name: 'Light Gauntlets (Angelic)',
        modifiers: ['+3 to All Skills'],
      },
    });
  });

  it('maps Sleep-awakening remnant superior Full Plate Mail onto the sacred base', () => {
    const rows = [
      {
        item: 'Superior Full Plate Mail (Sacred)',
        display_name: 'Superior Full Plate Mail (Sacred)',
        type: 'Superior Full Plate Mail (Sacred) [eth]',
        quality: 'High',
        display_quality: 'Superior',
        code: '@14',
        image: 'invful',
        eth: true,
        is_rw: false,
        location: 'Gear',
        slot: 'Torso',
        description_lines: [
          [['Superior Full Plate Mail (Sacred)', 5]],
          [['Defense: ', -1], ['8062', 3], [' (4771)', -1]],
          [['Required Level: 30', -1]],
          [['Required Strength: 690', -1]],
          [['Ethereal', 5]],
          [['remainders of a once powerful armor...', 5]],
          [['+69% Enhanced Defense', 3]],
          [['Socketed (0/6)', 3]],
        ],
      },
    ];
    const { snapshot, skipped } = mapTswItemsToSnapshot(rows, byIdCatalog());
    expect(skipped).toEqual([]);
    expect(snapshot.equipment.tors).toMatchObject({
      defId: '@14',
      icon: 'invful',
      custom: {
        quality: 'superior',
        name: 'Superior Full Plate Mail (Sacred)',
        defenseDisplay: '8062 (4771)',
        reqLevel: 30,
        reqStr: 690,
        sockets: 6,
        ethereal: true,
        modifiers: ['{grey}remainders of a once powerful armor...', '+69% Enhanced Defense'],
      },
    });
  });

  it('maps a runeword in remnant Full Plate Mail to template + base id', () => {
    const row = {
      item: 'Lionheart',
      display_name: 'Lionheart',
      type: 'Superior Full Plate Mail (Sacred) [eth]',
      quality: 'Unique',
      display_quality: 'RW',
      code: '@14',
      image: 'invful',
      is_rw: true,
      location: 'Gear',
      slot: 'Torso',
      description_lines: [
        [['Lionheart', 4]],
        [['Full Plate Mail (Sacred)', -1]],
        [['remainders of a once powerful armor...', 5]],
        [['OhmOhmOhm', 4]],
      ],
    };
    const cat = catalogIndexForTests();
    expect(resolveTswRunewordDefId(row, cat)).toBe('rw:lionheart:@14');
    expect(resolveTswItemDefId(row, cat)).toBe('rw:lionheart:@14');
    const { snapshot, skipped } = mapTswItemsToSnapshot([row], byIdCatalog());
    expect(skipped).toEqual([]);
    expect(snapshot.equipment.tors).toMatchObject({
      defId: 'rw:lionheart:@14',
      icon: 'invful',
      extras: expect.arrayContaining(['{grey}remainders of a once powerful armor...']),
    });
    expect(snapshot.equipment.tors?.extras).not.toEqual(
      expect.arrayContaining(['OhmOhmOhm'])
    );
  });

  it('imports runeword socket count from Socketed (n/m), not the base max', () => {
    const row = {
      item: 'Lionheart',
      display_name: 'Lionheart',
      type: 'Superior Full Plate Mail (Sacred)',
      quality: 'RW',
      display_quality: 'RW',
      code: '@14',
      image: 'invful',
      is_rw: true,
      location: 'Gear',
      slot: 'Torso',
      description_lines: [
        [['Lionheart', 4]],
        [['Superior Full Plate Mail (Sacred)', 5]],
        [['Socketed (1/1)', 3]],
      ],
    };
    const { snapshot, skipped } = mapTswItemsToSnapshot([row], byIdCatalog());
    expect(skipped).toEqual([]);
    expect(snapshot.equipment.tors).toMatchObject({
      defId: 'rw:lionheart:@14',
      rolls: { sockets: 1 },
    });
  });

  it('resolves catalog ids used by the mapper', () => {
    const cat = catalogIndexForTests();
    expect(
      resolveTswItemDefId(
        { display_name: 'Lacuni Cowl', display_quality: 'SU' },
        cat
      )
    ).toBe('u:lacuni-cowl:su');
    expect(resolveTswItemDefId({ display_name: "Horazon's Focus", code: 'a68' }, cat)).toBe('a68');
    expect(TSW_SLOT_TO_EQUIPMENT.Hands).toBe('glov');
  });

  it('resolves TU tiers from TSW type instead of always aliasing to T4', () => {
    const cat = catalogIndexForTests();
    expect(tswTierFromRow({ type: 'Leather Armor (2)' })).toBe(2);
    expect(tswTierFromRow({ type: 'Leather Armor (3) [eth]' })).toBe(3);
    expect(tswTierFromRow({ type: 'Cap (Sacred)' })).toBe(null);

    expect(
      resolveTswItemDefId(
        { display_name: 'Acidblood', display_quality: 'TU', type: 'Leather Armor (1)' },
        cat
      )
    ).toBe('u:acidblood:tu:1');
    expect(
      resolveTswItemDefId(
        { display_name: 'Acidblood', display_quality: 'TU', type: 'Leather Armor (2)' },
        cat
      )
    ).toBe('u:acidblood:tu:2');
    expect(
      resolveTswItemDefId(
        { display_name: 'Acidblood', display_quality: 'TU', type: 'Leather Armor (3) [eth]' },
        cat
      )
    ).toBe('u:acidblood:tu:3');
    expect(
      resolveTswItemDefId(
        { display_name: 'Acidblood', display_quality: 'TU', type: 'Leather Armor (4)' },
        cat
      )
    ).toBe('u:acidblood:tu:4');
    // No tier marker → legacy bare `:tu` alias (T4)
    expect(
      resolveTswItemDefId({ display_name: 'Acidblood', display_quality: 'TU' }, cat)
    ).toBe('u:acidblood:tu');

    const { snapshot, skipped } = mapTswItemsToSnapshot(
      [
        {
          display_name: 'Acidblood',
          display_quality: 'TU',
          type: 'Leather Armor (2)',
          location: 'Gear',
          slot: 'Torso',
        },
      ],
      byIdCatalog()
    );
    expect(skipped).toEqual([]);
    expect(snapshot.equipment.tors?.defId).toBe('u:acidblood:tu:2');
  });

  it('maps Miss_Peeled TSW items onto catalog uniques, charms, and relics', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const bases = [
      ...JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8')),
      ...JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8')),
    ];
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items: uniques } = buildCatalogFromUniqueStats(db, bases);
    const charms = JSON.parse(readFileSync(resolve(dir, 'charms.json'), 'utf8'));
    const relics = JSON.parse(readFileSync(resolve(dir, 'relics.json'), 'utf8'));
    const tsw = JSON.parse(readFileSync(resolve(ROOT, 'schemas/examples/Miss_Peeled.json'), 'utf8'));
    const { snapshot, skipped } = mapTswItemsToSnapshot(
      tsw.items,
      { catalog: [...bases, ...uniques, ...charms, ...relics] },
      'Assassin'
    );
    expect(snapshot.equipment.head).toMatchObject({ defId: 'u:lacuni-cowl:su' });
    expect(snapshot.equipment.rarm?.defId).toBe('u:mekanism:su');
    expect(snapshot.charms.some((row) => row.defId === 'a68')).toBe(true);
    expect(snapshot.charms.find((row) => row.defId === 'a68')?.icon).toBe('invhorazon');
    const dimKey = snapshot.charms.find((row) => row.defId === 'ebw');
    expect(dimKey).toBeTruthy();
    expect(dimKey?.rolls?.[DIM_KEY_ROLL_KEYS.variant]).toBe(3);
    expect(snapshot.relics.map((row) => row.defId).sort()).toEqual(
      ['relic:hailstorm', 'relic:lightning-wall', 'relic:whirlwind'].sort()
    );
    expect(snapshot.equipment.lrin?.defId).toBe('rin');
    expect(snapshot.equipment.lrin?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.lrin?.custom?.modifiers).toEqual(
      expect.arrayContaining([
        'Physical Damage Taken Reduced by 25',
        '+60 Life on Melee Attack',
        '+40 Required Level',
      ])
    );
    expect(snapshot.equipment.lrin?.mysticOrbs).toEqual([
      [5, 'MO - Damage Reduced'],
      [2, "Farnham's Lost Marble"],
    ]);
    expect(snapshot.equipment.rrin?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.neck?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.glov?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.glov?.custom?.angelic).toBe(true);
    expect(snapshot.equipment.glov?.defId).toBe('@36:angelic');
    expect(snapshot.equipment.glov?.mysticOrbs).toEqual(
      expect.arrayContaining([
        [5, 'MO - Total Char Defense'],
        [1, "Zayl's Soul Orb"],
        [1, 'Rare MO - Fire Resist'],
      ])
    );
    expect(snapshot.equipment.feet?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.feet?.custom?.angelic).toBe(true);
    expect(snapshot.equipment.tors).toMatchObject({
      defId: 'u:silks-of-the-victor:su',
      ethereal: true,
      mysticOrbs: [
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ],
    });
    expect(snapshot.equipment.tors?.extras).toEqual(
      expect.arrayContaining([
        '+35 Required Level',
        'Requirements -5%',
        '+25% Bonus to Defense',
      ])
    );
    expect(skipped.every((row) => row.reason === 'uncatalogued' || row.reason === 'stash')).toBe(true);
    expect(skipped.some((row) => row.name === 'Ring')).toBe(false);
    expect(skipped.some((row) => /Angelic/.test(row.name))).toBe(false);
  });

  it('applies Miss_Peeled items through the Pinia store catalog index', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const baseItems = JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8'));
    const other = JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8'));
    const charms = JSON.parse(readFileSync(resolve(dir, 'charms.json'), 'utf8')).map((c) => ({
      ...c,
      type: c.type || 'charm',
      category: c.category || 'charms',
      keepInInventory: true,
    }));
    const relics = JSON.parse(readFileSync(resolve(dir, 'relics.json'), 'utf8')).map((r) => ({
      ...r,
      type: r.type || 'jewl',
      category: r.category || 'relics',
      rarity: r.rarity || 'relic',
      keepInInventory: true,
    }));
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items: overlays } = buildCatalogFromUniqueStats(db, [...baseItems, ...other]);
    const tsw = JSON.parse(readFileSync(resolve(ROOT, 'schemas/examples/Miss_Peeled.json'), 'utf8'));

    setActivePinia(createPinia());
    const store = useItemsStore();
    store.catalog = [...baseItems, ...charms, ...other, ...overlays, ...relics];
    store.catalogLoaded = true;
    store.catalogVersionFolder = '2_14';

    const { snapshot } = mapTswItemsToSnapshot(tsw.items, store);
    store.fromSnapshot(snapshot);

    expect(store.getEquipmentDef('head')?.id).toBe('u:lacuni-cowl:su');
    expect(store.getEquipmentDef('rarm')?.id).toBe('u:mekanism:su');
    expect(store.getEquipmentDef('lrin')?.customQuality).toBe('rare');
    expect(store.getEquipmentDef('glov')?.customQuality).toBe('rare');
    expect(store.getEquipmentDef('glov')?.angelic).toBe(true);
    expect(store.getEquipmentDef('tors')?.ethereal).toBe(true);
    const torsId = store.equipment.tors;
    expect(store.getExtrasForInstance(torsId)).toEqual(
      expect.arrayContaining(['+35 Required Level', 'Requirements -5%'])
    );
    expect(store.getRequirementsForInstance(torsId)?.reqLevel).toBeGreaterThanOrEqual(135);
    expect(store.enabledCharms.a68).toBeTruthy();
    expect(store.enabledCharms.ebw).toBeTruthy();
    expect(store.instances[store.enabledCharms.ebw]?.rolls?.[DIM_KEY_ROLL_KEYS.variant]).toBe(3);
    expect(Object.keys(store.enabledRelics).sort()).toEqual(
      ['relic:hailstorm', 'relic:lightning-wall', 'relic:whirlwind'].sort()
    );
    const roundTrip = store.toSnapshot();
    expect(roundTrip.equipment.tors).toMatchObject({
      ethereal: true,
      mysticOrbs: [
        [5, 'MO - Total Char Defense'],
        [1, 'Weight of Talent'],
      ],
    });
  });

  it('sets Miss_Peeled charm, relic, and unique rolls from description lines', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const bases = [
      ...JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8')),
      ...JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8')),
    ];
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items: uniques } = buildCatalogFromUniqueStats(db, bases);
    const charms = JSON.parse(readFileSync(resolve(dir, 'charms.json'), 'utf8'));
    const relics = JSON.parse(readFileSync(resolve(dir, 'relics.json'), 'utf8'));
    const tsw = JSON.parse(readFileSync(resolve(ROOT, 'schemas/examples/Miss_Peeled.json'), 'utf8'));
    const { snapshot } = mapTswItemsToSnapshot(
      tsw.items,
      { catalog: [...bases, ...uniques, ...charms, ...relics] },
      'Assassin'
    );

    const horazon = snapshot.charms.find((row) => row.defId === 'a68');
    expect(horazon?.rolls?.[charmAffixRollKey('base:m0', 0)]).toBe(4);
    expect(horazon?.rolls?.[charmAffixRollKey('base:m2', 0)]).toBe(24);

    const vortex = snapshot.charms.find((row) => row.defId === 'x02');
    expect(vortex?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '0']).toBe(1);

    const pact = snapshot.charms.find((row) => row.defId === '##.');
    expect(pact?.rolls?.[CHARM_ROLL_KEYS.trophy]).toBe(1);

    const sleep = snapshot.charms.find((row) => row.defId === 'ths');
    expect(sleep?.rolls?.[CHARM_ROLL_KEYS.trophyIndex]).toBe(16); // Astrogha
    expect(sleep?.rolls?.[CHARM_ROLL_KEYS.awakening]).toBe(1);
    expect(sleep?.rolls?.[CHARM_ROLL_KEYS.trophyIndex2]).toBe(19); // Nephalem's Sacrifice

    const medallion = snapshot.charms.find((row) => row.defId === 'lok');
    expect(medallion?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '0']).toBe(1);
    expect(medallion?.rolls?.[CHARM_ROLL_KEYS.trophy]).toBe(1);

    const dimKey = snapshot.charms.find((row) => row.defId === 'ebw');
    expect(dimKey?.rolls?.[DIM_KEY_ROLL_KEYS.variant]).toBe(3);

    const vial = snapshot.charms.find((row) => row.defId === 'ebx');
    expect(vial?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '0']).toBe(1);

    const twinSeas = snapshot.charms.find((row) => row.defId === 'twi');
    expect(twinSeas?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '0']).toBe(1);
    expect(twinSeas?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '1']).toBe(1);
    expect(twinSeas?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '2']).toBe(1);

    const riftwalker = snapshot.charms.find((row) => row.defId === 'ktzx');
    expect(riftwalker?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '0']).toBe(1);
    expect(riftwalker?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '1']).toBe(1);
    expect(riftwalker?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '2']).toBe(1);
    expect(riftwalker?.rolls?.[CHARM_ROLL_KEYS.upgradePrefix + '3']).toBe(1);

    const hammer = snapshot.charms.find((row) => row.defId === '0u1');
    expect(hammer?.rolls?.[CHARM_ROLL_KEYS.paragonPath]).toBe(2);
    expect(hammer?.rolls?.[`${CHARM_ROLL_KEYS.paragonRegularPrefix}0`]).toBe(1);
    expect(hammer?.rolls?.[`${CHARM_ROLL_KEYS.paragonRegularPrefix}1`]).toBe(1);

    const wall = snapshot.relics.find((row) => row.defId === 'relic:lightning-wall');
    expect(wall?.rolls?.[relicAffixRollKey('base:m0', 0)]).toBe(7);
    expect(wall?.rolls?.[relicAffixRollKey('base:m1', 0)]).toBe(19);
    expect(wall?.rolls?.[relicAffixRollKey('base:m2', 0)]).toBe(2);

    expect(Object.values(snapshot.equipment.head?.rolls || {})).toEqual(
      expect.arrayContaining([19, 24, 149])
    );
    expect(inferTswClassSkillsBonus(tsw.items, 'Assassin')).toBe(20);
  });
});

function catalogIndexForTests() {
  const { catalog: list, catalogById } = byIdCatalog();
  return { list, byId: catalogById };
}

describe('applyTswOSkillLeftovers', () => {
  afterEach(() => {
    setCharacterInstance(null);
    vi.restoreAllMocks();
  });

  it('applies leftover TSW oSkill map points without throwing', () => {
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      catalog: [
        { id: 'lightning-fury', displayName: 'Lightning Fury', class: 'Amazon', image: 'lf' },
      ],
    });
    const ch = new Character('Amazon', 150);
    ch.oSkills = [{ skillName: 'lightning-fury', points: 0, itemPoints: 10, slotId: 's1' }];
    setCharacterInstance(ch);

    const result = applyTswOSkillLeftovers({ 'Lightning Fury': 25 });
    expect(result.skipped).toEqual([]);
    expect(ch.oSkills[0].points).toBe(15);
  });

  it('does not throw when oSkills are missing', () => {
    const ch = new Character('Amazon', 150);
    setCharacterInstance(ch);
    expect(() => applyTswOSkillLeftovers(undefined)).not.toThrow();
    expect(ch.oSkills).toEqual([]);
  });

  it('skips TSW stat grants listed as oSkills', () => {
    vi.spyOn(skillDataStore, 'getFileSkillStore').mockReturnValue({
      catalog: [
        { id: 'lightning-fury', displayName: 'Lightning Fury', class: 'Amazon', image: 'lf' },
      ],
    });
    const ch = new Character('Amazon', 150);
    setCharacterInstance(ch);
    const result = applyTswOSkillLeftovers({
      'Life and Mana': 40,
      'Lightning Fury': 12,
    });
    expect(result.skipped).toEqual([]);
    expect(ch.oSkills).toEqual([
      expect.objectContaining({ skillName: 'lightning-fury', points: 12 }),
    ]);
  });
});
