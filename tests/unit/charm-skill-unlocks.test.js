import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildCharmSkillUnlockRequirements,
  findMissingCharmSkillUnlocks,
} from '@/items/charm-skill-unlocks.js';

const ROOT = resolve(import.meta.dirname, '../..');
const charms = JSON.parse(readFileSync(resolve(ROOT, 'public/items/2_14/charms.json'), 'utf8'));

describe('charm-skill-unlocks', () => {
  it('maps mastery unlocks from charm text', () => {
    const reqs = buildCharmSkillUnlockRequirements(charms, 'Assassin');
    expect(reqs.get('tenacity')?.charmNames).toContain('Optical Detector');
    expect(reqs.get('endurance')?.charmNames).toContain('Legacy of Blood');
    expect(reqs.get('chemistry')?.charmNames).toContain('Dragon Claw');
    expect(reqs.get('continuity')?.charmNames).toContain('Idol of Vanity');
    expect(reqs.get('specialization')?.charmNames).toContain('Spirit of Creation');
    expect(reqs.get('paragon_of_fate')?.charmNames).toContain("Paragon's Hammer");
    expect(reqs.get('paragon_of_sanctity')?.charmNames).toContain("Paragon's Hammer");
  });

  it('maps class Ennead and Black Road skills', () => {
    const assassin = buildCharmSkillUnlockRequirements(charms, 'Assassin');
    expect(assassin.get('prismatic_cloak')?.charmNames).toEqual(['Shadow Vortex']);
    expect(assassin.get('vampiric_icon')?.charmNames).toEqual(['The Black Road']);
    expect(assassin.has('spellbind')).toBe(false);

    const amazon = buildCharmSkillUnlockRequirements(charms, 'Amazon');
    expect(amazon.get('spellbind')?.charmNames).toEqual(['Sacred Sunstone']);
    expect(amazon.get('war_spirit')?.charmNames).toEqual(['The Black Road']);
  });

  it('reports spent skills missing their unlocking charm', () => {
    const missing = findMissingCharmSkillUnlocks({
      className: 'Assassin',
      charms,
      ownedCharmIds: ['x02', 'tbr'],
      skillPoints: {
        tenacity: 3,
        prismatic_cloak: 1,
        vampiric_icon: 5,
        endurance: 2,
      },
      skillDisplayNames: {
        tenacity: 'Tenacity',
        endurance: 'Endurance',
        prismatic_cloak: 'Prismatic Cloak',
        vampiric_icon: 'Vampiric Icon',
      },
    });
    expect(missing.map((row) => row.skillId).sort()).toEqual(['endurance', 'tenacity']);
    expect(missing.find((row) => row.skillId === 'tenacity')?.charmNames).toContain('Optical Detector');
  });

  it('is quiet when required charms are present', () => {
    const missing = findMissingCharmSkillUnlocks({
      className: 'Assassin',
      charms,
      ownedCharmIds: ['a55', 'adi', 'x02'],
      skillPoints: { tenacity: 3, endurance: 1, prismatic_cloak: 1 },
    });
    expect(missing).toEqual([]);
  });
});
