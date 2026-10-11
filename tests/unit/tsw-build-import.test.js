import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import { useItemsStore } from '@/stores/items.js';
import {
  unwrapTswOrNativeBuild,
  isTswEnvelope,
  mapTswItemsToSnapshot,
  resolveTswItemDefId,
  resolveTswRunewordDefId,
  inferTswQuestsCompleted,
  TSW_SLOT_TO_EQUIPMENT,
} from '@/planner/tsw-build-import.js';
import { runewordEntryToItemDef } from '@/items/runeword-items.js';
import { inferTswClassSkillsBonus } from '@/planner/tsw-item-rolls.js';
import { CHARM_ROLL_KEYS, charmAffixRollKey } from '@/items/charm-items.js';
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
    { id: 'a68', name: "Horazon's Focus", type: 'charm', category: 'charms', keepInInventory: true },
    {
      id: 'ebw-primordia',
      name: 'Dimensional Key - Primordia',
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
  for (const def of catalog.catalog) catalogById[def.id] = def;
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
    expect(snapshot.equipment.lrin).toEqual({
      defId: 'rin',
      custom: { quality: 'rare', name: 'Ring', modifiers: ['+1 to All Skills'] },
    });
    expect(snapshot.charms.map((row) => row.defId)).toEqual(['a68', 'ebw-primordia']);
    expect(snapshot.relics.map((row) => row.defId)).toEqual(['relic:lightning-wall']);
    expect(skipped.some((s) => s.name === 'Ring')).toBe(false);
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
      defId: '@36',
      icon: 'angelicgloves',
      custom: {
        quality: 'angelic',
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
    expect(snapshot.equipment.tors).toEqual({ defId: 'rw:lionheart:@14', icon: 'invful' });
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

  it('maps Miss_Ter remnant torso through the real 2.14 catalog', () => {
    const dir = resolve(ROOT, 'public/items/2_14');
    const bases = [
      ...JSON.parse(readFileSync(resolve(dir, 'baseitems.json'), 'utf8')),
      ...JSON.parse(readFileSync(resolve(dir, 'other.json'), 'utf8')),
    ];
    const db = JSON.parse(readFileSync(resolve(dir, 'unique-stats-db.json'), 'utf8'));
    const { items: uniques } = buildCatalogFromUniqueStats(db, bases);
    const charms = JSON.parse(readFileSync(resolve(dir, 'charms.json'), 'utf8'));
    const relics = JSON.parse(readFileSync(resolve(dir, 'relics.json'), 'utf8'));
    const runewordsData = JSON.parse(readFileSync(resolve(dir, 'runewords.json'), 'utf8'));
    const rwEntries = Array.isArray(runewordsData) ? runewordsData : runewordsData.entries || [];
    const runewords = rwEntries.map(runewordEntryToItemDef).filter(Boolean);
    const tsw = JSON.parse(readFileSync(resolve(ROOT, 'schemas/examples/Miss_Ter.json'), 'utf8'));
    const { snapshot, skipped } = mapTswItemsToSnapshot(
      tsw.items,
      { catalog: [...bases, ...uniques, ...charms, ...relics, ...runewords] },
      'Paladin'
    );
    expect(snapshot.equipment.tors).toMatchObject({
      defId: '@14',
      custom: {
        quality: 'superior',
        ethereal: true,
        modifiers: expect.arrayContaining([
          '{grey}remainders of a once powerful armor...',
          '+69% Enhanced Defense',
        ]),
      },
    });
    expect(skipped.some((row) => /Full Plate Mail/.test(row.name))).toBe(false);
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
    expect(snapshot.charms.some((row) => row.defId === 'ebw-primordia')).toBe(true);
    expect(snapshot.relics.map((row) => row.defId).sort()).toEqual(
      ['relic:hailstorm', 'relic:lightning-wall', 'relic:whirlwind'].sort()
    );
    expect(snapshot.equipment.lrin?.defId).toBe('rin');
    expect(snapshot.equipment.lrin?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.rrin?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.neck?.custom?.quality).toBe('rare');
    expect(snapshot.equipment.glov?.custom?.quality).toBe('angelic');
    expect(snapshot.equipment.feet?.custom?.quality).toBe('angelic');
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
    expect(store.getEquipmentDef('glov')?.customQuality).toBe('angelic');
    expect(store.enabledCharms.a68).toBeTruthy();
    expect(store.enabledCharms['ebw-primordia']).toBeTruthy();
    expect(Object.keys(store.enabledRelics).sort()).toEqual(
      ['relic:hailstorm', 'relic:lightning-wall', 'relic:whirlwind'].sort()
    );
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
  /** @type {Record<string, object>} */
  const byId = {};
  for (const def of catalog.catalog) byId[def.id] = def;
  return { list: catalog.catalog, byId };
}
