/**
 * @file Tests for item-granted oSkills collection and inspector skill wrapping.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initSkillDataStore,
  resetSkillDataStoreForTests,
} from '@/shared/skill-data-store.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';
import {
  matchCatalogSkillGrantFromLine,
  collectOSkillGrantsFromModifierLines,
  collectOSkillGrantsFromCharmDefs,
  collectOSkillGrantsFromRelicDefs,
  collectOSkillGrantsFromEquippedDefs,
  collectEnabledCharmOSkillGrants,
  collectEnabledRelicOSkillGrants,
  collectEnabledItemOSkillGrants,
  wrapNamedSkillGrantMarkers,
  formatItemModifierLineHtml,
  annotateAffixDisplayPartsWithSkills,
} from '@/items/item-granted-oskills.js';
import { normalizeItemSkillGrantName } from '@/items/skill-bonus-from-modifiers.js';
import { charmAffixRollKey } from '@/items/charm-items.js';
import { relicAffixRollKey } from '@/items/relic-items.js';
import { SCALING_DISPLAY_HTML_CLASSES } from '@/shared/utils.js';

describe('item-granted oSkills', () => {
  let restoreFetch;

  beforeAll(async () => {
    restoreFetch = installTreeDataFetchMock();
    resetSkillDataStoreForTests();
    await initSkillDataStore();
  });

  afterAll(() => {
    resetSkillDataStoreForTests();
    restoreFetch?.();
  });

  const booksOfKalan = {
    id: 'voXX',
    name: 'Books of Kalan',
    keepInInventory: true,
    rarity: 'unique',
    category: 'charms',
    type: 'charm',
    reqLevel: 130,
    modifiers: [
      '+1 to All Skills',
      '+(3 to 15) to Teleport',
      '+25 to Life',
      '+50 to Mana',
    ],
  };

  const teleportRelic = {
    id: 'relic:teleport',
    name: 'Relic (Teleport)',
    rarity: 'relic',
    keepInInventory: true,
    category: 'relics',
    reqLevel: 75,
    modifiers: [
      '(3 to 7)% Movement Speed',
      'Teleport Cooldown Reduced by 0.8 seconds',
      '+(6 to 14) to Teleport',
    ],
  };

  it('matches Teleport grant and rejects Life', () => {
    expect(matchCatalogSkillGrantFromLine('+9 to Teleport')).toMatchObject({
      skillId: 'teleport',
      displayName: 'Teleport',
      amount: 9,
      classOnly: false,
    });
    expect(matchCatalogSkillGrantFromLine('+25 to Life')).toBeNull();
    expect(matchCatalogSkillGrantFromLine('+1 to All Skills')).toBeNull();
  });

  it('maps "+1 to passive Bear Stance" to bear_stance oSkill grants', () => {
    expect(normalizeItemSkillGrantName('passive Bear Stance')).toBe('Bear Stance');
    expect(matchCatalogSkillGrantFromLine('{orange}+1 to passive Bear Stance')).toMatchObject({
      skillId: 'bear_stance',
      displayName: 'Bear Stance',
      amount: 1,
      classOnly: false,
    });
    // Bear Stance is Barbarian — for Paladin/Amazon it is an oSkill grant.
    expect(
      collectOSkillGrantsFromModifierLines(['{orange}+1 to passive Bear Stance'], {
        className: 'Paladin',
      })
    ).toEqual({ bear_stance: 1 });
    // On-tree Barbarian → soft path, not oSkill duplicate
    expect(
      collectOSkillGrantsFromModifierLines(['{orange}+1 to passive Bear Stance'], {
        className: 'Barbarian',
      })
    ).toEqual({});
    expect(
      collectOSkillGrantsFromEquippedDefs(
        [
          {
            def: {
              id: 'rw:test-bear',
              name: 'Test Bear RW',
              modifiers: ['{orange}+1 to passive Bear Stance'],
            },
          },
        ],
        { className: 'Paladin' }
      )
    ).toEqual({ bear_stance: 1 });
    expect(formatItemModifierLineHtml('{orange}+1 to passive Bear Stance')).toContain(
      SCALING_DISPLAY_HTML_CLASSES.skill
    );
  });

  it('collects Books of Kalan Teleport grant at rolled value', () => {
    const rollKey = charmAffixRollKey('base:m1', 0);
    const grants = collectOSkillGrantsFromCharmDefs(
      [{ def: booksOfKalan, rolls: { [rollKey]: 9 } }],
      { className: 'Amazon' }
    );
    expect(grants).toEqual({ teleport: 9 });
  });

  it('stacks charm + relic Teleport grants', () => {
    const charmKey = charmAffixRollKey('base:m1', 0);
    const relicKey = relicAffixRollKey('base:m2', 0);
    const fromCharm = collectOSkillGrantsFromCharmDefs(
      [{ def: booksOfKalan, rolls: { [charmKey]: 9 } }],
      { className: 'Amazon' }
    );
    const fromRelic = collectOSkillGrantsFromRelicDefs(
      [{ def: teleportRelic, rolls: { [relicKey]: 10 } }],
      { className: 'Amazon' }
    );
    expect(fromCharm.teleport + fromRelic.teleport).toBe(19);
  });

  it('skips on-tree generic skill grants for oSkill collection', () => {
    const lines = ['+15 to Dream Eater'];
    expect(collectOSkillGrantsFromModifierLines(lines, { className: 'Necromancer' })).toEqual({});
    expect(collectOSkillGrantsFromModifierLines(lines, { className: 'Amazon' })).toEqual({
      dream_eater: 15,
    });
  });

  it('skips Class Only lines for oSkill grants', () => {
    const grants = collectOSkillGrantsFromModifierLines(
      ['+7 to Dream Eater (Necromancer Only)'],
      { className: 'Amazon' }
    );
    expect(grants).toEqual({});
  });

  it('wraps Teleport with [[teleport]] markers', () => {
    expect(wrapNamedSkillGrantMarkers('+9 to Teleport')).toBe('+9 to [[teleport:9]]');
    const html = formatItemModifierLineHtml('+9 to Teleport');
    expect(html).toContain(SCALING_DISPLAY_HTML_CLASSES.skill);
    expect(html).toContain('data-tooltip-skill-id=');
    expect(html).toContain('data-tooltip-skill-level="9"');
    expect(html).toContain('Teleport');
    expect(html).not.toContain('[[');
    // Space before the skill span must survive (flex parents collapse bare trailing spaces).
    expect(html).toMatch(/to <span class="/);
  });

  it('wraps chance-to-cast skill names in green markers', () => {
    const marked = wrapNamedSkillGrantMarkers('5% Chance to cast level 9 Bloodlust on Kill');
    expect(marked).toMatch(/level 9 \[\[.+:9:proc\]\] on Kill/i);
    const html = formatItemModifierLineHtml('5% Chance to cast level 9 Bloodlust on Kill');
    expect(html).toContain(SCALING_DISPLAY_HTML_CLASSES.skill);
    expect(html).toContain('data-tooltip-skill-id=');
    expect(html).toContain('data-tooltip-skill-level="9"');
    expect(html).toContain('data-tooltip-skill-as-proc="1"');
    expect(html).toContain('Bloodlust');
    expect(html).toMatch(/level 9 <span class="/);
    expect(html).not.toContain('[[');
  });

  it('keeps space before Summon Edyrem skill span', () => {
    const html = formatItemModifierLineHtml('+1 to Summon Edyrem');
    expect(html).toMatch(/to <span class="/);
    expect(html).toContain('Summon Edyrem');
  });

  it('colors roll range suffixes with a desaturated info class', () => {
    const html = formatItemModifierLineHtml('+15 to Lightning Shield [10-20]');
    expect(html).toContain(SCALING_DISPLAY_HTML_CLASSES.skill);
    expect(html).toContain('Lightning Shield');
    expect(html).toContain('<span class="item-mod-roll-range">[10-20]</span>');
  });

  it('annotates roll display parts with skill kind', () => {
    const parts = annotateAffixDisplayPartsWithSkills([
      { kind: 'text', text: '+' },
      { kind: 'value', text: '9' },
      { kind: 'text', text: ' to Teleport' },
    ]);
    const skill = parts.find((p) => p.kind === 'skill' && p.text === 'Teleport');
    expect(skill).toMatchObject({ skillId: 'teleport', skillLevel: 9 });
  });

  it('annotates chance-to-cast affix parts with skill kind', () => {
    const parts = annotateAffixDisplayPartsWithSkills([
      { kind: 'value', text: '5' },
      { kind: 'text', text: '% Chance to cast level 9 Bloodlust on Kill' },
    ]);
    const skill = parts.find((p) => p.kind === 'skill' && /bloodlust/i.test(p.text));
    expect(skill?.skillId).toBeTruthy();
    expect(skill?.skillLevel).toBe(9);
    expect(skill?.skillAsProc).toBe(true);
  });

  it('enabled relic grants stay separate from the merged charm+relic collector', () => {
    expect(collectEnabledRelicOSkillGrants()).toEqual({});
    expect(collectEnabledCharmOSkillGrants()).toEqual({});
    expect(collectEnabledItemOSkillGrants()).toEqual({});
  });
});
