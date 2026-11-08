import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extrasWithAppliedItemBonuses,
  getItemStatSections,
} from '@/items/item-stats.js';
import { getMysticOrbBonusLines, loadMysticOrbsCatalog } from '@/items/mystic-orbs.js';
import { buildItemTooltipHtml } from '@/items/item-tooltip.js';

loadMysticOrbsCatalog(
  JSON.parse(readFileSync(resolve('public/items/2_14/mystic-orbs.json'), 'utf8'))
);

describe('mystic orb effect multipliers', () => {
  const baseDef = {
    id: 'aqv',
    name: 'Arrow Quiver',
    rarity: 'magic',
    customQuality: 'magic',
    modifiers: [],
  };

  it('has the orb row', () => {
    expect(getMysticOrbBonusLines('MO - Strength', 1)).toEqual(['+5 to Strength']);
  });

  it('doubles applied orb bonuses on an item with the doubled state flag', () => {
    const def = {
      ...baseDef,
      modifiers: ['Orb Effects Applied to this Item are Doubled'],
    };
    expect(
      extrasWithAppliedItemBonuses([], def, { mysticOrbs: [[1, 'MO - Strength']] })
    ).toContain('+10 to Strength');
  });

  it('quadruples applied orb bonuses on an item with the quadrupled state flag', () => {
    const def = {
      ...baseDef,
      modifiers: ['Orb Effects Applied to this Item are Quadrupled'],
    };
    expect(
      extrasWithAppliedItemBonuses([], def, { mysticOrbs: [[1, 'MO - Strength']] })
    ).toContain('+20 to Strength');
  });

  it("applies Craftsman's Brand double to other orbs on a magic quiver", () => {
    const mysticOrbs = [
      [1, "Craftsman's Brand"],
      [1, 'MO - Strength'],
    ];
    expect(extrasWithAppliedItemBonuses([], baseDef, { mysticOrbs })).toContain(
      '+10 to Strength'
    );
    const sections = getItemStatSections(baseDef, null, { mysticOrbs });
    expect(sections.base).toContain('{darkgreen}Orb Effects Applied to this Item are Doubled');
    const tooltip = buildItemTooltipHtml(baseDef, null, null, { mysticOrbs });
    expect(tooltip).toContain('Orb Effects Applied to this Item are Doubled');
  });
});
