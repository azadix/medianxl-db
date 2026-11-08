import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assurCounts,
  assurLightRadiusRemoved,
  assurMaxForUpgrade,
  assurMechanicForDef,
  assurPurifierCount,
  assurRequiredLevelBonus,
  assurRollKey,
  assurUpgradeDisplayLines,
  assurUpgradeGroup,
  defHasItemMechanic,
  getMechanicBonusLines,
  loadItemMechanics,
  mechanicsWithAssurCount,
  restoreMechanicForDef,
  restorePercent,
} from '@/items/item-mechanics.js';
import { loadAffixTemplates } from '@/items/affix-templates.js';

loadAffixTemplates(JSON.parse(readFileSync(resolve('public/items/2_14/affix-templates.json'), 'utf8')));
loadItemMechanics({
  ...JSON.parse(readFileSync(resolve('public/items/2_14/item-mechanics.json'), 'utf8')),
  assur: JSON.parse(readFileSync(resolve('public/items/2_14/assur.json'), 'utf8')),
});

describe('item-mechanics', () => {
  const arrogance = { name: 'Arrogance' };

  it('matches restore items by name', () => {
    expect(defHasItemMechanic(arrogance)).toBe(true);
    expect(restoreMechanicForDef(arrogance)?.itemId).toBe('su_arrogance');
    expect(restorePercent(restoreMechanicForDef(arrogance), 25)).toBe(100);
  });

  it('emits restore output lines', () => {
    const lines = getMechanicBonusLines(arrogance, { restore: 25 });
    expect(lines[0]).toBe('Restore +100%');
    expect(lines.length).toBeGreaterThan(1);
  });

  describe("Assur's Bane upgrade", () => {
    const assurBane = { name: "Assur's Bane" };
    const mechanic = assurMechanicForDef(assurBane);

    it('matches Assur\'s Bane by name', () => {
      expect(defHasItemMechanic(assurBane)).toBe(true);
      expect(mechanic?.itemId).toBe('su_assurs_bane');
      expect(mechanic?.upgrades.length).toBe(17);
      expect(mechanic?.baseLightRadius).toBe(2);
    });

    it('caps applications by Light Radius budget and Purify slot', () => {
      const du01 = mechanic.upgrades.find((u) => u.id === 'du01');
      const du09 = mechanic.upgrades.find((u) => u.id === 'du09');
      const du11 = mechanic.upgrades.find((u) => u.id === 'du11');
      const du13 = mechanic.upgrades.find((u) => u.id === 'du13');
      // du01 has no budget cost → high/unlimited cap.
      expect(assurMaxForUpgrade(mechanic, {}, du01)).toBeGreaterThanOrEqual(99);
      // du09 costs 1 Light Radius (needs 1); base is 2 → max 2.
      expect(assurMaxForUpgrade(mechanic, {}, du09)).toBe(2);
      // du11 costs 2 Light Radius (needs 2) → max 1.
      expect(assurMaxForUpgrade(mechanic, {}, du11)).toBe(1);
      // du13 replaces Purify → max 1.
      expect(assurMaxForUpgrade(mechanic, {}, du13)).toBe(1);
    });

    it('shares the Light Radius budget across scrolls', () => {
      const du10 = mechanic.upgrades.find((u) => u.id === 'du10');
      const counts = { du09: 2 };
      expect(assurLightRadiusRemoved(mechanic, counts)).toBe(2);
      // With both Light Radius spent, another 1-cost scroll cannot be applied.
      expect(assurMaxForUpgrade(mechanic, counts, du10)).toBe(0);
    });

    it('treats Purify-replacing scrolls as mutually exclusive', () => {
      const du14 = mechanic.upgrades.find((u) => u.id === 'du14');
      expect(assurMaxForUpgrade(mechanic, { du13: 1 }, du14)).toBe(0);
      expect(assurPurifierCount(mechanic, { du13: 1 })).toBe(1);
    });

    it('reads counts from the flat mechanics record', () => {
      expect(assurCounts({ [assurRollKey('du09')]: 2, restore: 25 })).toEqual({ du09: 2 });
    });

    it('emits multi-apply bonus lines with budget summary', () => {
      const lines = getMechanicBonusLines(assurBane, { assur_du09: 2, assur_du13: 1 });
      expect(lines).toContain('Fire Resist -10% ×2');
      expect(lines).toContain('+40% Weapon Physical Damage ×2');
      expect(lines).toContain('Light Radius -2');
      expect(lines).toContain('Replaces Purify');
      expect(lines).toContain('1% Fire Spell Damage per 5 Spell Focus above the cap');
    });

    it('accumulates Required Level from stacking scrolls', () => {
      expect(assurRequiredLevelBonus(mechanic, { du01: 2 })).toBe(8);
      expect(assurRequiredLevelBonus(mechanic, { du01: 1, du02: 1 })).toBe(16);
      expect(assurRequiredLevelBonus(mechanic, { du09: 2 })).toBe(0);
      // Required Level is a structured stat applied by resolveItemRequirements, not a display line.
      expect(getMechanicBonusLines(assurBane, { assur_du01: 2 })).not.toContain('Required Level');
    });

    it('emits no lines when no scroll is applied', () => {
      expect(getMechanicBonusLines(assurBane, {})).toEqual([]);
    });

    it('groups scrolls and formats stacked display lines', () => {
      const du01 = mechanic.upgrades.find((u) => u.id === 'du01');
      const du09 = mechanic.upgrades.find((u) => u.id === 'du09');
      const du13 = mechanic.upgrades.find((u) => u.id === 'du13');
      expect(assurUpgradeGroup(du01)).toBe('Upgrade');
      expect(assurUpgradeGroup(du09)).toBe('Light Radius');
      expect(assurUpgradeGroup(du13)).toBe('Replaces Purify');
      expect(assurUpgradeDisplayLines(du09, 2)).toEqual([
        'Fire Resist -10% ×2',
        '+40% Weapon Physical Damage ×2',
      ]);
      expect(mechanicsWithAssurCount({ restore: 1 }, 'du01', 3)).toEqual({
        restore: 1,
        assur_du01: 3,
      });
      expect(mechanicsWithAssurCount({ assur_du01: 3 }, 'du01', 0)).toEqual({});
    });
  });
});
