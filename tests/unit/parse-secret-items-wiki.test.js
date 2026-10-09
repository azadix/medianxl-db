import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSecretItemsWiki } from '../../tools/item_generation/parse-secret-items-wiki.mjs';
import {
  buildCatalogFromUniqueStats,
  entryToItemDef,
} from '../../src/items/unique-stats-catalog.js';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURE = readFileSync(resolve(ROOT, 'tests/fixtures/secret-items-wiki.html'), 'utf8');

const SNIPPET = `
<h2><span class="mw-headline" id="Samael_items">Samael items</span></h2>
<div class="mxl-tooltip"><div class="mxl-tt-name mxl-unique">Locked Samael item</div><div class="mxl-tt-stats">Transmute this item</div></div>
<div class="mxl-tooltip">
  <div class="mxl-tt-name mxl-unique">Maleficence</div>
  <div class="mxl-tt-base">Tyrannical Blade</div>
  <div class="mxl-tt-stats">Required Level: 125<br>Item Level: 110<br><span class="mxl-magic">+200% Enhanced Damage</span></div>
</div>
<h2><span class="mw-headline" id="Other_secret_uniques">Other secret uniques</span></h2>
<div class="mxl-tooltip">
  <div class="mxl-tt-name mxl-unique">Staff of Herding</div>
  <div class="mxl-tt-base">Elder Staff</div>
  <div class="mxl-tt-stats">Required Level: 33</div>
</div>
<h3><span class="mw-headline" id="Relics_and_special_items">Relics and special items</span></h3>
<div class="mxl-tooltip">
  <div class="mxl-tt-name mxl-unique">Essence of Time</div>
  <div class="mxl-tt-stats">Required Level: 1<br><span class="mxl-magic">+1 to Time Warp</span></div>
</div>
<div class="mxl-tooltip">
  <div class="mxl-tt-name mxl-unique">Soulstone of the Hallows</div>
  <div class="mxl-tt-stats">Required Level: 125</div>
</div>
<h3><span class="mw-headline" id="Time-Lost_Relics">Time-Lost Relics</span></h3>
<div class="mxl-tooltip">
  <div class="mxl-tt-label">Disabled</div>
  <div class="mxl-tt-name mxl-unique">Time-Lost Relic</div>
  <div class="mxl-tt-stats">Required Level: 75</div>
</div>
<h2><span class="mw-headline" id="Disabled_items">Disabled items</span></h2>
<div class="mxl-tooltip">
  <div class="mxl-tt-name mxl-unique">Storm Shard</div>
  <div class="mxl-tt-base">Jewel</div>
  <div class="mxl-tt-stats">Required Level: 20</div>
</div>
`;

describe('parseSecretItemsWiki', () => {
  it('skips locked, herding, soulstone, disabled outcomes, and the disabled section', () => {
    const entries = parseSecretItemsWiki(SNIPPET);
    expect(entries.map((e) => e.name)).toEqual(['Maleficence', 'Essence of Time']);
    expect(entries[0]).toMatchObject({
      quality: 'SU',
      type: 'Tyrannical Blade',
      source: 'secret',
    });
    expect(entries[0].stats).toContain('+200% Enhanced Damage');
    expect(entries[1].quality).toBe('Charm');
  });

  it('parses the live Secret Items fixture', () => {
    const entries = parseSecretItemsWiki(FIXTURE);
    const names = entries.map((e) => e.name);

    expect(names).toContain('Maleficence');
    expect(names).toContain("Valkyrie's Prime");
    expect(names).toContain("Akara's Robe");
    expect(names).toContain('Essence of Time');
    expect(names).toContain('Blood of Creation');
    expect(names).not.toContain('Staff of Herding');
    expect(names).not.toContain('Soulstone of the Hallows');
    expect(names).not.toContain('Storm Shard');
    expect(names).not.toContain('Ground Zero');
    expect(entries.some((e) => e.variant === 'Disabled')).toBe(false);

    const akara = entries.filter((e) => e.name === "Akara's Robe");
    expect(akara.map((e) => [e.quality, e.tier, e.type])).toEqual([
      ['TU', 1, 'Quilted Armor (1)'],
      ['TU', 3, 'Quilted Armor (3)'],
      ['SU', undefined, 'Quilted Armor (Sacred)'],
    ]);

    const relics = entries.filter((e) => e.quality === 'Relic');
    expect(relics.filter((e) => e.name === 'Time-Lost Relic')).toHaveLength(6);
    expect(relics.filter((e) => e.name === 'Blood of Creation')).toHaveLength(7);

    const maleficence = entries.find((e) => e.name === 'Maleficence');
    expect(maleficence?.stats).toContain('+50 to Harbinger');
    const despondence = entries.find((e) => e.name === 'Despondence');
    expect(despondence?.stats).toContain('{grey}Despair');
  });
});

describe('secret item catalog overlays', () => {
  it('equips unique-only bases using a shape fallback and keeps relics in-inventory', () => {
    const bases = [
      {
        id: 'crs',
        name: 'Crystal Sword (Sacred)',
        type: 'crs',
        category: 'weapons',
        slot: 'arms',
        invWidth: 2,
        invHeight: 3,
        icon: 'invcrs',
        group: 'Swords',
      },
      {
        id: 'rin',
        name: 'Ring',
        type: 'ring',
        category: 'jewelry',
        slot: 'ring',
        invWidth: 1,
        invHeight: 1,
        icon: 'invrin',
      },
    ];
    const maleficence = entryToItemDef(
      {
        name: 'Maleficence',
        quality: 'SU',
        type: 'Tyrannical Blade',
        stats: 'Required Level: 125\n+200% Enhanced Damage',
        source: 'secret',
      },
      bases
    );
    expect(maleficence?.slot).toBe('arms');
    expect(maleficence?.baseName).toBe('Tyrannical Blade');
    expect(maleficence?.baseId).toBeUndefined();
    expect(maleficence?.id).toBe('u:maleficence:su');

    const relic = entryToItemDef(
      {
        name: 'Blood of Creation',
        quality: 'Relic',
        type: 'Relic',
        variant: 'Version 1',
        stats: 'Required Level: 50\n+1 to Crystalline Arsenal',
        source: 'secret',
      },
      bases
    );
    expect(relic).toMatchObject({
      id: 'relic:blood-of-creation-version-1',
      name: 'Blood of Creation (Version 1)',
      rarity: 'relic',
      keepInInventory: true,
      category: 'relics',
    });

    const { items } = buildCatalogFromUniqueStats(
      parseSecretItemsWiki(SNIPPET),
      bases
    );
    expect(items.find((d) => d.name === 'Maleficence')?.slot).toBe('arms');
    expect(items.find((d) => d.name === 'Essence of Time')?.keepInInventory).toBe(true);
  });
});
