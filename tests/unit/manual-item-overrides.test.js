import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name) =>
  JSON.parse(readFileSync(resolve('public/items/2_14', name), 'utf8'));

describe('manual item overrides', () => {
  const overrides = JSON.parse(
    readFileSync(resolve('tools/item_generation/manual-overrides.json'), 'utf8')
  );
  const unique = read('unique-stats-db.json').entries;
  const setBonuses = read('set-bonuses.json').entries;
  const byName = (name) => unique.filter((entry) => entry.name === name);

  it('records the manual correction groups', () => {
    expect(overrides.stat_corrections).toHaveLength(2);
    expect(overrides.added_items).toHaveLength(2);
    expect(overrides.mystic_orbs).toHaveLength(1);
    expect(overrides.runeword_corrections).toHaveLength(6);
    expect(overrides.icon_overrides.length).toBeGreaterThan(0);
  });

  it('keeps the corrected unique stats', () => {
    for (const entry of byName('Killing Vector')) {
      expect(entry.stats).toContain('Required Level: 80');
      expect(entry.stats).not.toContain('Required Level: 90');
    }
    const curse = setBonuses.filter((entry) => entry.name === 'Curse of the Zakarum');
    expect(curse.some((entry) => entry.stats.includes('10% Chance of Crushing Blow'))).toBe(true);
    expect(
      curse.some((entry) => entry.stats.includes('(40 to 70)% Chance of Crushing Blow'))
    ).toBe(false);
  });

  it('keeps set bonuses in their own catalog', () => {
    expect(setBonuses).toHaveLength(53);
    expect(unique.some((entry) => entry.quality === 'Set')).toBe(false);
    expect(setBonuses.every((entry) => entry.stats.startsWith('Set Bonus with'))).toBe(true);
  });

  it('keeps both Bag of Tricks variants', () => {
    expect(byName('Bag of Tricks').map((entry) => entry.type).sort()).toEqual([
      'Arrow Quiver',
      'Bolt Quiver',
    ]);
  });

  it('keeps the Empyrean Touch ethereal flag', () => {
    const orb = read('mystic-orbs.json').find((entry) => entry.name === 'Empyrean Touch');
    expect(orb?.setsEthereal).toBe(true);
  });

  it('keeps Assur mechanics in their own file', () => {
    const mechanics = read('item-mechanics.json');
    const assur = read('assur.json');
    expect(mechanics).not.toHaveProperty('assur');
    expect(assur.su_assurs_bane.itemId).toBe('su_assurs_bane');
    expect(assur.su_assurs_bane.upgrades).toHaveLength(17);
  });

  it('keeps class restriction colors and manual icon fixes', () => {
    expect(unique.some((entry) => entry.stats.includes('{red}('))).toBe(true);
    const stareye = unique.find((entry) => entry.name === "Stareye's Claws");
    expect(stareye?.icon).toBe('set_pewpew4');
  });

  it('keeps the runeword color corrections', () => {
    const runewords = read('runewords.json').entries;
    const demhe = runewords.find((entry) => entry.name === 'Demhe');
    expect(demhe?.modifiers).toContain('Stun Attack');
    expect(demhe?.modifiers).not.toContain('{orange}Stun Attack');
  });
});
