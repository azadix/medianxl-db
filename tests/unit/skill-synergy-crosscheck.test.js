import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { initSkillDataStore, resetSkillDataStoreForTests, getFileSkillStore } from '@/shared/skill-data-store.js';
import { resolveEngineFormula } from '@/skills/domain/skill-synergy.js';
import { formulaEvaluator } from '@/skills/domain/formula-evaluator.js';
import Skill from '@/skills/domain/Skill.js';
import { installTreeDataFetchMock } from '../helpers/mock-fetch-tree-data.js';

const SKILLS = ['apocalypse', 'blizzard', 'discharge', 'catapult_shot', 'abyss',
  'arcane_torrent', 'earth_talons', 'bloodstar', 'disintegrate', 'solar_flare',
  'amatoxin', 'curare', 'miasma', 'pestilence',
  'arachnomancy', 'death_star', 'hyena_strike', 'lorenado', 'veil_king_plague_grasp',
  'venomcloud_totem', 'venomous_spirit', 'vine_companion', 'virulence'];
const LEVELS = [[1, 0], [20, 0], [1, 19], [20, 20]];
const ULVL = 120;
// Per-frame damage keys; poison's per-frame raw*syn path is the same (edmn/edmx). The
// display total additionally multiplies by ELen, which this per-frame crosscheck does not cover.
const ELEMENTAL_KEYS = ['fire_damage', 'cold_damage', 'lightning_damage', 'magic_damage', 'poison_dot'];

function evalNum(formula, vars) {
  const r = formulaEvaluator.evaluate(formula, vars);
  return r && r.success && Number.isFinite(r.value) ? r.value : 0;
}

describe('skill-synergy crosscheck', () => {
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

  it('manual raw+synergy path matches getScalingValues', async () => {
    const store = getFileSkillStore();
    /** @type {string[]} */
    const mismatches = [];
    for (const id of SKILLS) {
      const row = store.catalogByInternalId.get(id);
      if (!row) {
        mismatches.push(`${id}: NOT FOUND`);
        continue;
      }
      const byKey = {};
      for (const c of row.scalingConstants || []) byKey[c.statKey] = c;
      let ekey = null;
      for (const k of ELEMENTAL_KEYS) if (byKey[k]) { ekey = k; break; }
      if (!ekey) continue;
      const skill = new Skill({ id, name: row.displayName || id });
      for (const [blvl, slvl] of LEVELS) {
        const lvl = blvl + slvl;
        const charState = { blvl: { [id]: blvl }, lvl: { [id]: slvl }, stats: {} };
        let synPct = 0;
        const syn = row.synergy?.elemental;
        if (syn) {
          const resolved = resolveEngineFormula(id, syn, charState, store);
          const r = formulaEvaluator.evaluate(resolved, { blvl, slvl, lvl, ulvl: ULVL, characterState: charState });
          if (r?.success && Number.isFinite(r.value)) synPct = r.value;
        }
        const hs = byKey[ekey].hitShift ?? 8;
        const raw0 = evalNum(byKey[ekey].rawValue0 || '0', { blvl, slvl, lvl, ulvl: ULVL, characterState: charState });
        const raw1 = evalNum(byKey[ekey].rawValue1 || '0', { blvl, slvl, lvl, ulvl: ULVL, characterState: charState });
        const full0 = Math.trunc(Math.trunc(raw0 * (100 + synPct) / 100) * Math.pow(2, hs - 8));
        const full1 = Math.trunc(Math.trunc(raw1 * (100 + synPct) / 100) * Math.pow(2, hs - 8));
        const av = await skill.getScalingValues(lvl, ekey, 0, charState, ULVL);
        const got0 = Number(av?.value0);
        const got1 = Number(av?.value1);
        if (ekey === 'poison_dot') {
          // Poison displays the total (per-frame * ELen); getScalingValues returns that total,
          // so it is not equal to the per-frame. Report only (verified separately vs game edmn).
          console.log(
            `poison ${id} blvl=${blvl} slvl=${slvl}: per-frame ${full0}-${full1} (syn ${synPct}) -> display total ${got0}-${got1}`
          );
          continue;
        }
        if (got0 !== full0 || got1 !== full1) {
          mismatches.push(
            `${id} blvl=${blvl} slvl=${slvl}: manual ${full0}-${full1} (syn ${synPct}) vs getScalingValues ${got0}-${got1}`
          );
        }
      }
    }
    if (mismatches.length) console.log(mismatches.join('\n'));
    expect(mismatches).toEqual([]);
  });

  it('getScalingValues applies synergy with raw+HitShift ordering', async () => {
    // Apocalypse: fire, HitShift=4, EMin=936 -> raw base 936, syn 612 -> (936*712/100)<<4>>8 = 416
    const apoc = new Skill({ id: 'apocalypse', name: 'Apocalypse' });
    const av = await apoc.getScalingValues(1, 'fire_damage', 0,
      { blvl: { apocalypse: 1 }, lvl: { apocalypse: 0 }, stats: {} }, 120);
    expect(Number(av?.value0)).toBe(416);

    // Solar Flare: fire, HitShift=3, EMin=40 -> syn 1226 -> 16 (was 13 before the fix)
    const sf = new Skill({ id: 'solar_flare', name: 'Solar Flare' });
    const sv = await sf.getScalingValues(1, 'fire_damage', 0,
      { blvl: { solar_flare: 1 }, lvl: { solar_flare: 0 }, stats: {} }, 120);
    expect(Number(sv?.value0)).toBe(16);
  });
});
