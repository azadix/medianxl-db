import { describe, expect, it } from 'vitest';
import {
  asText,
  catalogLookups,
  loadActiveTreeData,
  refExists,
} from '../helpers/tree-data.js';

const COMPOUND_REF_RE =
  /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
const SKILL_REF_RE = /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g;
const SUBSKILL_REF_RE = /<<([a-zA-Z_][a-zA-Z0-9_]*)>>/g;
const STANDALONE_STAT_RE = /(?<!\]\]\.)\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
/** Typo form of subskill/skill refs — not a supported delimiter. */
const DOUBLE_PIPE_REF_RE = /\|\|([a-zA-Z_][a-zA-Z0-9_]*)\|\|/g;

const TEXT_FIELDS = ['description', 'skillEffect', 'restriction'];
const VALUE_SLOTS = ['value0', 'value1', 'value2', 'value3'];

const data = loadActiveTreeData();
const { skills, subskills, statsMap, characterStats, stats } = data;
const { internalIds } = catalogLookups(skills, subskills);

function knownCharacterStatTokens() {
  const known = new Set(
    characterStats.filter((r) => r?.key).map((r) => String(r.key).toLowerCase())
  );
  const byKey = new Set(known);
  // Accrued attrs (game stat(N,1)) used in formulas
  for (const [baseKey, attrKey] of Object.entries({
    base_strength: 'strength',
    base_dexterity: 'dexterity',
    base_vitality: 'vitality',
    base_energy: 'energy',
  })) {
    if (byKey.has(attrKey)) known.add(baseKey);
  }
  // stats.json aliases with a single pairedStat plannerKey (e.g. life_steal -> life_stolen_per_hit)
  for (const s of stats || []) {
    if (!s?.key) continue;
    const sk = String(s.key).toLowerCase();
    if (known.has(sk)) continue;
    const paired = Array.isArray(s.pairedStat) ? s.pairedStat : [];
    const plannerKeys = new Set();
    for (const entry of paired) {
      const pk = entry?.plannerKey ?? entry?.stat ?? entry?.key;
      if (pk == null) continue;
      const token = String(pk).trim().toLowerCase();
      if (token && byKey.has(token)) plannerKeys.add(token);
    }
    if (plannerKeys.size === 1) known.add(sk);
  }
  return known;
}

function findAll(re, text) {
  return [...String(text).matchAll(re)].map((m) => m.slice(1));
}

describe('skill references', () => {
  it('requires [[skill]] and <<subskill>> in text to exist', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      const sid = row.id;
      for (const field of TEXT_FIELDS) {
        const text = asText(row[field]);
        if (!text) continue;
        for (const [skillRef] of findAll(COMPOUND_REF_RE, text)) {
          if (!refExists(skillRef, internalIds)) {
            failures.push(`${sid} [${field}]: compound ref to unknown skill '${skillRef}'`);
          }
        }
        const stripped = text.replace(COMPOUND_REF_RE, '');
        for (const [ref] of findAll(SKILL_REF_RE, stripped)) {
          if (!refExists(ref, internalIds)) {
            failures.push(`${sid} [${field}]: [[${ref}]] does not exist`);
          }
        }
        for (const [ref] of findAll(SUBSKILL_REF_RE, text)) {
          if (!refExists(ref, internalIds)) {
            failures.push(`${sid} [${field}]: <<${ref}>> does not exist`);
          }
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('rejects ||id|| in text (use <<subskill>> or [[skill]])', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      const sid = row.id;
      for (const field of TEXT_FIELDS) {
        const text = asText(row[field]);
        if (!text) continue;
        for (const [ref] of findAll(DOUBLE_PIPE_REF_RE, text)) {
          failures.push(
            `${sid} [${field}]: ||${ref}|| is not a valid ref (use <<${ref}>> or [[${ref}]])`
          );
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires compound [[skill]].{{stat}} stats to exist in stats.json', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      const sid = row.id;
      const sources = TEXT_FIELDS.map((f) => [asText(row[f]), f]);
      for (const sc of row.scalingConstants || []) {
        for (const slot of VALUE_SLOTS) {
          sources.push([String(sc[slot] || ''), `scaling:${sc.statKey}.${slot}`]);
        }
      }
      for (const [text, origin] of sources) {
        if (!text) continue;
        for (const [, statKey] of findAll(COMPOUND_REF_RE, text)) {
          if (!statsMap.has(statKey.toLowerCase())) {
            failures.push(`${sid} [${origin}]: compound stat '${statKey}' not in stats.json`);
          }
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires [[skill]] refs in scaling formulas to exist', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      for (const sc of row.scalingConstants || []) {
        for (const slot of VALUE_SLOTS) {
          const value = String(sc[slot] || '');
          if (!value) continue;
          const stripped = value.replace(COMPOUND_REF_RE, '');
          for (const [ref] of findAll(SKILL_REF_RE, stripped)) {
            if (!refExists(ref, internalIds)) {
              failures.push(
                `${row.id} [scaling:${sc.statKey}.${slot}]: [[${ref}]] does not exist`
              );
            }
          }
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires standalone {{stat}} in formulas to be known character stats', () => {
    const known = knownCharacterStatTokens();

    const failures = [];
    for (const row of [...skills, ...subskills]) {
      for (const sc of row.scalingConstants || []) {
        for (const slot of VALUE_SLOTS) {
          const value = String(sc[slot] || '');
          if (!value) continue;
          for (const [statKey] of findAll(STANDALONE_STAT_RE, value)) {
            if (!known.has(statKey.toLowerCase())) {
              failures.push(
                `${row.id} [scaling:${sc.statKey}.${slot}]: {{${statKey}}} not in character_stats.json (will always be 0)`
              );
            }
          }
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });
});
