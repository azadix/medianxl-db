import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCatalogFromUniqueStats } from '@/items/unique-stats-catalog.js';
import {
  unwrapTswOrNativeBuild,
  isTswEnvelope,
  mapTswItemsToSnapshot,
  resolveTswItemDefId,
  inferTswQuestsCompleted,
  TSW_SLOT_TO_EQUIPMENT,
} from '@/planner/tsw-build-import.js';

const ROOT = resolve(import.meta.dirname, '../..');

const catalog = {
  catalog: [
    { id: '@17', name: 'Skull Cap', rarity: 'normal', category: 'armor' },
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
  ],
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
    expect(snapshot.equipment.head).toEqual({ defId: 'u:lacuni-cowl:su' });
    expect(snapshot.equipment.lrin).toEqual({
      defId: 'rin',
      custom: { quality: 'rare', name: 'Ring', modifiers: ['+1 to All Skills'] },
    });
    expect(snapshot.charms).toEqual([{ defId: 'a68' }, { defId: 'ebw-primordia' }]);
    expect(snapshot.relics).toEqual([{ defId: 'relic:lightning-wall' }]);
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
      custom: { quality: 'honorific', name: 'Cap (Honorific)', modifiers: ['+5% Enhanced Defense'] },
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
    const { snapshot, skipped } = mapTswItemsToSnapshot(tsw.items, {
      catalog: [...bases, ...uniques, ...charms, ...relics],
    });
    expect(snapshot.equipment.head).toEqual({ defId: 'u:lacuni-cowl:su' });
    expect(snapshot.equipment.rarm?.defId).toBe('u:mekanism:su');
    expect(snapshot.charms.some((row) => row.defId === 'a68')).toBe(true);
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
});

function catalogIndexForTests() {
  /** @type {Record<string, object>} */
  const byId = {};
  for (const def of catalog.catalog) byId[def.id] = def;
  return { list: catalog.catalog, byId };
}
