import { describe, expect, it } from 'vitest';
import {
  asText,
  catalogLookups,
  loadActiveTreeData,
  refExists,
} from '../helpers/tree-data.js';

/** Runtime-only formula stats not in character_stats.json; evaluate to 0 unless injected. */
const RUNTIME_ONLY_STAT_KEYS = new Set([
  'base_dexterity',
  'life_steal',
  'mana_regeneration_rate',
  'maximum_spirits',
  'pmsd',
  'skill_duration',
]);

const COMPOUND_REF_RE =
  /\[\[([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
const SKILL_REF_RE = /\[\[([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\]\]/g;
const SUBSKILL_REF_RE = /\|\|([a-zA-Z_][a-zA-Z0-9_]*|id:\d+)\|\|/g;
const STANDALONE_STAT_RE = /(?<!\]\]\.)\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

const TEXT_FIELDS = ['description', 'skillEffect', 'restriction'];
const VALUE_SLOTS = ['value0', 'value1', 'value2', 'value3'];

const data = loadActiveTreeData();
const { skills, subskills, statsMap, characterStats } = data;
const { internalIds, numericIds } = catalogLookups(skills, subskills);

function findAll(re, text) {
  return [...String(text).matchAll(re)].map((m) => m.slice(1));
}

describe('skill references', () => {
  it('requires [[skill]] and ||subskill|| in text to exist', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      const sid = row.id;
      for (const field of TEXT_FIELDS) {
        const text = asText(row[field]);
        if (!text) continue;
        for (const [skillRef] of findAll(COMPOUND_REF_RE, text)) {
          if (!refExists(skillRef, internalIds, numericIds)) {
            failures.push(`${sid} [${field}]: compound ref to unknown skill '${skillRef}'`);
          }
        }
        const stripped = text.replace(COMPOUND_REF_RE, '');
        for (const [ref] of findAll(SKILL_REF_RE, stripped)) {
          if (!refExists(ref, internalIds, numericIds)) {
            failures.push(`${sid} [${field}]: [[${ref}]] does not exist`);
          }
        }
        for (const [ref] of findAll(SUBSKILL_REF_RE, text)) {
          if (!refExists(ref, internalIds, numericIds)) {
            failures.push(`${sid} [${field}]: ||${ref}|| does not exist`);
          }
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
            if (!refExists(ref, internalIds, numericIds)) {
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
    const known = new Set(
      characterStats.filter((r) => r?.key).map((r) => String(r.key).toLowerCase())
    );
    for (const k of RUNTIME_ONLY_STAT_KEYS) known.add(k);

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
