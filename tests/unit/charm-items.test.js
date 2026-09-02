import { describe, it, expect } from 'vitest';
import {
  isCharmItem,
  charmMeetsLevel,
  isCharmBonusActive,
  getCharmStatLines,
  getCharmUpgradeEntries,
  getCharmDetailStatRows,
  resolveCharmBaseModifiers,
  resolveCharmUpgradeModifiers,
  resolveCharmTrophyModifiers,
} from '@/items/charm-items.js';
import { getItemStatLines, getItemDetailStatRows, defaultRollsForDef } from '@/items/item-stats.js';

const butcher = {
  id: 'a60',
  name: "The Butcher's Tooth",
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  reqLevel: 100,
  dungeon: 'Horror Under Tristram',
  modifiers: ['+10 to all Attributes', '20% Magic Find'],
};

const lylia = {
  id: '|ld',
  name: "Lylia's Curse",
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  reqLevel: 120,
  modifiers: [
    '+20 Life Regenerated per Second',
    {
      oneOf: [
        'Maximum Fire Resist +1%',
        'Maximum Lightning Resist +1%',
        'Maximum Cold Resist +1%',
        'Maximum Poison Resist +1%',
      ],
    },
  ],
};

const medallion = {
  id: 'test',
  name: 'Crystalline Flame Medallion',
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  reqLevel: 120,
  modifiers: ['+1 to All Skills'],
  upgrade: ['+1 to All Skills', '+40 to All Attributes'],
  trophy: ['5% to All Attributes'],
};

const riftwalker = {
  id: 'ktzx',
  type: 'charm',
  category: 'charms',
  keepInInventory: true,
  upgrades: [['+1 to All Skills'], ['Increase Maximum Life and Mana 2%'], ['Maximum Elemental Resists +1%']],
};

describe('charm-items', () => {
  it('detects charm catalog entries', () => {
    expect(isCharmItem(butcher)).toBe(true);
    expect(isCharmItem({ category: 'weapons' })).toBe(false);
  });

  it('requires inventory placement and level for active bonuses', () => {
    expect(isCharmBonusActive(butcher, 100, { inInventory: true })).toBe(true);
    expect(isCharmBonusActive(butcher, 99, { inInventory: true })).toBe(false);
    expect(isCharmBonusActive(butcher, 120, { inInventory: false })).toBe(false);
    expect(charmMeetsLevel(butcher, 100)).toBe(true);
  });

  it('renders charm lines without inactive markers', () => {
    const lines = getCharmStatLines(butcher, 90, { inInventory: true });
    expect(lines[0]).toBe('Horror Under Tristram');
    expect(lines).not.toContain('Keep in Inventory to Gain Bonus');
    expect(lines.some((line) => line.includes('(inactive)'))).toBe(false);
    expect(lines.some((line) => line.includes('Inactive at level'))).toBe(false);
  });

  it('includes charm lines in item stat output', () => {
    const lines = getItemStatLines(butcher, null, {
      characterLevel: 110,
      charmInInventory: true,
    });
    expect(lines).toContain('Required Level: 100');
    expect(lines).not.toContain('Keep in Inventory to Gain Bonus');
    expect(lines).toContain('+10 to all Attributes');
  });

  it('resolves one-of modifier pools from rolls', () => {
    const rolls = { charmPool0: 2 };
    expect(resolveCharmBaseModifiers(lylia, rolls)).toEqual([
      '+20 Life Regenerated per Second',
      'Maximum Cold Resist +1%',
    ]);
  });

  it('exposes one checkbox entry per upgrade step', () => {
    const entries = getCharmUpgradeEntries(riftwalker);
    expect(entries).toHaveLength(3);
    expect(entries[0].key).toBe('charmUpgrade0');
    expect(entries[1].key).toBe('charmUpgrade1');
    expect(entries[2].affixes).toEqual(['Maximum Elemental Resists +1%']);
  });

  it('adds enabled upgrade bundle and trophy affixes', () => {
    const rolls = { charmUpgrade0: 1, charmTrophy: 1 };
    const lines = getCharmStatLines(medallion, 120, { inInventory: true, rolls });
    expect(lines).toContain('[Upgrade] +1 to All Skills');
    expect(lines).toContain('[Upgrade] +40 to All Attributes');
    expect(lines).toContain('[Trophy] 5% to All Attributes');
    expect(resolveCharmUpgradeModifiers(medallion, rolls)).toEqual([
      '+1 to All Skills',
      '+40 to All Attributes',
    ]);
    expect(resolveCharmTrophyModifiers(medallion, rolls)).toEqual(['5% to All Attributes']);
  });

  it('defaults per-upgrade roll keys', () => {
    const rolls = defaultRollsForDef(riftwalker);
    expect(rolls.charmUpgrade0).toBe(0);
    expect(rolls.charmUpgrade1).toBe(0);
    expect(rolls.charmUpgrade2).toBe(0);
  });

  it('applies only checked upgrade steps', () => {
    const rolls = { charmUpgrade0: 1, charmUpgrade2: 1 };
    expect(resolveCharmUpgradeModifiers(riftwalker, rolls)).toEqual([
      '+1 to All Skills',
      'Maximum Elemental Resists +1%',
    ]);
  });

  it('hides ranged affixes from charm lines when hideRollableRanges is true', () => {
    const ranged = {
      id: 'a68',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      reqLevel: 100,
      modifiers: ['+(21 to 25) to all Attributes', '+10 Life Regenerated per Second'],
    };
    const lines = getCharmStatLines(ranged, 110, {
      inInventory: true,
      rolls: defaultRollsForDef(ranged),
      hideRollableRanges: true,
    });
    expect(lines.some((line) => line.includes('all Attributes'))).toBe(false);
    expect(lines).toContain('+10 Life Regenerated per Second');
  });

  it('keeps upgrades after base affixes and trophies after upgrades', () => {
    const bag = {
      id: 'w48',
      type: 'charm',
      category: 'charms',
      keepInInventory: true,
      reqLevel: 105,
      modifiers: ['(3 to 5)% Innate Elemental Damage', 'Fire Resist +(21 to 25)%'],
      upgrades: [
        ['-(2 to 5)% to All Enemy Resistances', '3% Chance of Crushing Blow', '+(-3 to 5) to Light Radius'],
      ],
      trophy: ['10% Magic Find'],
    };
    const rolls = { ...defaultRollsForDef(bag), charmUpgrade0: 1, charmTrophy: 1 };
    const rows = getItemDetailStatRows(bag, rolls, { charmInInventory: true, characterLevel: 120 });
    const labels = rows.map((row) => (row.kind === 'text' ? row.text : row.stat.display));
    const innate = labels.findIndex((line) => line.includes('Innate Elemental Damage'));
    const fire = labels.findIndex((line) => line.includes('Fire Resist'));
    const crush = labels.findIndex((line) => line.includes('Crushing Blow'));
    const enemy = labels.findIndex((line) => line.includes('Enemy Resistances'));
    const radius = labels.findIndex((line) => line.includes('Light Radius'));
    const trophy = labels.findIndex((line) => line.includes('Magic Find'));
    expect(innate).toBeGreaterThan(-1);
    expect(fire).toBeGreaterThan(innate);
    expect(enemy).toBeGreaterThan(fire);
    expect(crush).toBeGreaterThan(enemy);
    expect(radius).toBeGreaterThan(crush);
    expect(trophy).toBeGreaterThan(radius);
    expect(labels[crush]).toMatch(/^\[Upgrade\]/);
    expect(labels[trophy]).toMatch(/^\[Trophy\]/);
    expect(getCharmDetailStatRows(bag, rolls).at(-1)?.kind).toBe('text');
  });

});
