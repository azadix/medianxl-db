/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPatchItemCatalogFromData,
  lookupPatchItemRecord,
  resetPatchItemCatalogCache,
  setPatchItemCatalogForFolder,
} from '@/items/patch-item-catalog.js';
import {
  buildMysticOrbTooltipHtml,
  buildRuneTooltipHtml,
  buildSetOverviewTooltipHtml,
} from '@/items/item-tooltip.js';
import {
  highlightItemNamesInRenderedHtml,
  highlightPatchNoteMarkers,
} from '@/composables/usePatchNotesData.js';

const ROOT = resolve(import.meta.dirname, '../..');
const ITEMS_214 = resolve(ROOT, 'public/items/2_14');

function readJson(file) {
  return JSON.parse(readFileSync(resolve(ITEMS_214, file), 'utf8'));
}

afterEach(() => {
  resetPatchItemCatalogCache();
});

describe('patch item catalog lookup', () => {
  it('resolves 2_14 uniques, sets, pieces, runewords, runes, and mystic orbs', () => {
    const catalog = buildPatchItemCatalogFromData({
      folderKey: '2_14',
      bases: readJson('baseitems.json'),
      charms: readJson('charms.json'),
      other: readJson('other.json'),
      relics: readJson('relics.json'),
      uniqueStats: readJson('unique-stats-db.json'),
      runewords: readJson('runewords.json'),
      socketables: readJson('socketables.json'),
      mysticOrbs: readJson('mystic-orbs.json'),
    });

    const pantheon = lookupPatchItemRecord(catalog, 'pantheon');
    expect(pantheon?.kind).toBe('set');
    expect(pantheon?.displayName).toBe('Pantheon');
    expect(pantheon?.pieces.length).toBeGreaterThan(1);

    const piece = lookupPatchItemRecord(catalog, 'Killing Vector');
    expect(piece?.kind).toBe('item');
    expect(piece?.def?.rarity).toBe('set');
    expect(piece?.setDef?.name).toBe('Universal Law');

    const raven = lookupPatchItemRecord(catalog, 'Ravenflock');
    expect(raven?.kind).toBe('item');
    expect(raven?.def?.uniqueKind).toBe('tiered');
    expect(raven?.def?.tier).toBe(4);

    const edge = lookupPatchItemRecord(catalog, 'Edge');
    expect(edge?.kind).toBe('item');
    expect(edge?.def?.rarity).toBe('runeword');

    const rune = lookupPatchItemRecord(catalog, 'El Rune');
    expect(rune?.kind).toBe('rune');

    const mo = lookupPatchItemRecord(catalog, 'MO - Strength');
    expect(mo?.kind).toBe('mo');

    const charm = lookupPatchItemRecord(catalog, "Paragon's Hammer");
    expect(charm?.kind).toBe('item');
    expect(charm?.def?.category).toBe('charms');
  });

  it('prefers a set name over a piece, and SU over TU', () => {
    const catalog = buildPatchItemCatalogFromData({
      folderKey: '2_14',
      uniqueStats: [
        {
          name: 'Twin Name',
          quality: 'TU',
          tier: 4,
          type: 'Ring',
          stats: 'Required Level: 1\n+1 to Strength',
        },
        {
          name: 'Twin Name',
          quality: 'SU',
          type: 'Ring',
          stats: 'Required Level: 1\n+2 to Strength',
        },
        {
          name: 'Twin Name',
          quality: 'Set',
          stats: 'Set Bonus with complete set:\n+10 to Strength',
        },
        {
          name: 'Twin Piece',
          quality: 'Sacred Set',
          setName: 'Twin Name',
          type: 'Ring',
          stats: 'Required Level: 1\n+3 to Strength',
        },
      ],
    });

    expect(lookupPatchItemRecord(catalog, 'Twin Name')?.kind).toBe('set');
    expect(lookupPatchItemRecord(catalog, 'Twin Piece')?.kind).toBe('item');

    const tuOnly = buildPatchItemCatalogFromData({
      folderKey: '2_14',
      uniqueStats: [
        {
          name: 'Shared Blade',
          quality: 'TU',
          tier: 1,
          type: 'Ring',
          stats: 'Required Level: 1\n+1 to Strength',
        },
        {
          name: 'Shared Blade',
          quality: 'SU',
          type: 'Ring',
          stats: 'Required Level: 1\n+9 to Strength',
        },
      ],
    });
    const shared = lookupPatchItemRecord(tuOnly, 'Shared Blade');
    expect(shared?.def?.uniqueKind).toBe('su');
  });

  it('keeps folder catalogs isolated', () => {
    const older = buildPatchItemCatalogFromData({
      folderKey: '2_13',
      uniqueStats: [
        {
          name: 'Old Unique',
          quality: 'SU',
          type: 'Ring',
          stats: 'Required Level: 1\n+1 to Strength',
        },
      ],
    });
    const newer = buildPatchItemCatalogFromData({
      folderKey: '2_14',
      uniqueStats: [
        {
          name: 'New Unique',
          quality: 'SU',
          type: 'Ring',
          stats: 'Required Level: 1\n+1 to Strength',
        },
      ],
    });
    expect(lookupPatchItemRecord(older, 'New Unique')).toBeNull();
    expect(lookupPatchItemRecord(newer, 'Old Unique')).toBeNull();
    expect(lookupPatchItemRecord(newer, 'New Unique')?.displayName).toBe('New Unique');
  });
});

describe('patch item marker highlight', () => {
  it('wraps known [[items]] and leaves unknown markers and {{skills}}', () => {
    const catalog = buildPatchItemCatalogFromData({
      folderKey: '2_14',
      uniqueStats: [
        {
          name: 'Banner of Bitter Winds',
          quality: 'SU',
          type: 'Kite Shield (Sacred)',
          stats: 'Required Level: 100\n+1 to All Skills',
        },
        {
          name: 'Pantheon',
          quality: 'Set',
          stats: 'Set Bonus with complete set:\n+1 to All Skills',
        },
      ],
      socketables: [{ name: 'El Rune', type: 'Rune', weapon: '+1', armor: '+1', shield: '+1' }],
      mysticOrbs: [{ name: 'MO - Strength', kind: 'mo', modifiers: ['+5 to Strength'] }],
    });
    setPatchItemCatalogForFolder('2_14', catalog);

    const html = highlightPatchNoteMarkers(
      '<p>Keep {{Lightning Shield}} and [[Banner of Bitter Winds]] plus [[Pantheon]], [[El Rune]], [[MO - Strength]], and [[No Such Item]].</p>',
      '2_14'
    );
    expect(html).toContain('{{Lightning Shield}}');
    expect(html).toContain('[[No Such Item]]');
    expect(html).toContain('patch-item-highlight');
    expect(html).toContain('item-tooltip-name--unique');
    expect(html).toContain('item-tooltip-name--set');
    expect(html).toContain('item-tooltip-sock__name--rune');
    expect(html).toContain('Banner of Bitter Winds');
    expect(html).not.toMatch(/\[\[Banner of Bitter Winds\]\]/);
  });

  it('does not eat skill markers when only item catalogs are loaded', () => {
    const catalog = buildPatchItemCatalogFromData({
      folderKey: '2_14',
      uniqueStats: [
        {
          name: 'Askarbydd',
          quality: 'SU',
          type: 'Ring',
          stats: 'Required Level: 1\n+1 to Strength',
        },
      ],
    });
    setPatchItemCatalogForFolder('2_14', catalog);
    const html = highlightItemNamesInRenderedHtml('<p>{{Barrage}} on [[Askarbydd]]</p>', '2_14');
    expect(html).toContain('{{Barrage}}');
    expect(html).toContain('Askarbydd');
    expect(html).toContain('patch-item-highlight');
  });
});

describe('set overview tooltip', () => {
  it('includes set name, pieces, and bonus labels', () => {
    const html = buildSetOverviewTooltipHtml(
      {
        name: 'Pantheon',
        bonuses: [
          { required: 2, modifiers: ['50% Attack Speed'] },
          { required: 'complete', modifiers: ['Weapon Physical Damage +100%'] },
        ],
      },
      [{ name: 'Hratli\'s Craft' }, { name: 'Skovos\' Madness' }]
    );
    expect(html).toContain('item-tooltip-name--set');
    expect(html).toContain('Pantheon');
    expect(html).toContain("Hratli's Craft");
    expect(html).toContain("Skovos' Madness");
    expect(html).toContain('Set Bonus with 2 or more set items');
    expect(html).toContain('Set Bonus with complete set');
    expect(html).toContain('50% Attack Speed');
  });

  it('renders rune and mystic orb cards', () => {
    const rune = buildRuneTooltipHtml({
      name: 'El Rune',
      weapon: '+3 to all Attributes',
      armor: '+3 to all Attributes',
      shield: '+3 to all Attributes',
    });
    expect(rune).toContain('El Rune');
    expect(rune).toContain('item-tooltip-sock__name--rune');
    expect(rune).toContain('Weapon: +3 to all Attributes');

    const mo = buildMysticOrbTooltipHtml({
      name: 'MO - Strength',
      kind: 'mo',
      modifiers: ['+5 to Strength'],
    });
    expect(mo).toContain('MO - Strength');
    expect(mo).toContain('+5 to Strength');
  });
});
