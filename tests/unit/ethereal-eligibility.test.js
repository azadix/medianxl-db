import { describe, expect, it } from 'vitest';
import { canBeEthereal } from '@/items/item-types.js';
import { getItemStatSections } from '@/items/item-stats.js';
import { resolveItemRequirements } from '@/items/item-requirements.js';
import { tswInstanceExtras } from '@/planner/tsw-item-rolls.js';

describe('ethereal eligibility', () => {
  const ring = { id: 'rin', name: 'Ring', type: 'ring', slot: 'ring', category: 'jewelry' };
  const amulet = { id: 'amu', name: 'Amulet', type: 'amul', slot: 'neck', category: 'jewelry' };
  const quiver = { id: 'aqv', name: 'Arrow Quiver', type: 'bowq', category: 'quivers' };
  const armor = { id: 'tors', name: 'Ancient Armor', type: 'tors', slot: 'tors', category: 'armors' };

  it('rejects rings, amulets and quivers', () => {
    expect(canBeEthereal(ring)).toBe(false);
    expect(canBeEthereal(amulet)).toBe(false);
    expect(canBeEthereal(quiver)).toBe(false);
    expect(canBeEthereal(armor)).toBe(true);
  });

  it('does not show Ethereal on ineligible items even when the flag is forced', () => {
    const sections = getItemStatSections(ring, null, { ethereal: true });
    expect(sections.base.some((line) => /Ethereal/i.test(line))).toBe(false);
  });

  it('does not apply the ethereal requirement reduction to rings', () => {
    const reqs = resolveItemRequirements({ ...ring, baseReqStr: 50, baseReqDex: 50 }, {
      ethereal: true,
    });
    expect(reqs.reqStr).toBe(50);
    expect(reqs.reqDex).toBe(50);
  });

  it('ignores ethereal on imported rings and quivers', () => {
    for (const def of [ring, quiver]) {
      const meta = tswInstanceExtras(
        { item: def.name, display_name: def.name, type: def.type, eth: true },
        def
      );
      expect(meta.ethereal).toBeUndefined();
    }
  });
});
