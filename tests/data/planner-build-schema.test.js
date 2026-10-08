import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readJson } from '../helpers/tree-data.js';

const ROOT = resolve(import.meta.dirname, '../..');
const SCHEMA_PATH = resolve(ROOT, 'schemas/planner-build.schema.json');
const FULL_SCHEMA_PATH = resolve(ROOT, 'schemas/planner-build-full.schema.json');
const EXPECTED_FULL_DEFS = [
  'QuestDifficulties',
  'SkillPointsMap',
  'ItemRolls',
  'ItemEntry',
  'ItemsSnapshot',
];

/**
 * @param {object} root
 * @param {string} ref
 * @returns {object}
 */
function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    throw new Error(`unsupported $ref ${ref}`);
  }
  let cur = root;
  for (const part of ref.slice(2).split('/')) {
    cur = cur?.[part];
  }
  if (cur == null || typeof cur !== 'object') {
    throw new Error(`unresolved $ref ${ref}`);
  }
  return cur;
}

/**
 * @param {object} root
 * @param {object} schema
 * @returns {object}
 */
function deref(root, schema) {
  if (!schema || typeof schema !== 'object' || !schema.$ref) return schema;
  const { $ref, ...rest } = schema;
  return { ...resolveRef(root, $ref), ...rest };
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function jsonType(data) {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  return typeof data;
}

/**
 * @param {unknown} data
 * @param {string|string[]} type
 * @returns {boolean}
 */
function matchesType(data, type) {
  if (Array.isArray(type)) return type.some((t) => matchesType(data, t));
  if (type === 'integer') return typeof data === 'number' && Number.isInteger(data);
  if (type === 'number') return typeof data === 'number' && Number.isFinite(data);
  return jsonType(data) === type;
}

/**
 * Minimal 2020-12 checker for this schema (no Ajv).
 * @param {object} root
 * @param {object} schema
 * @param {unknown} data
 * @param {string} [path]
 * @returns {string[]}
 */
function validate(root, schema, data, path = '$') {
  if (schema === false) return [`${path}: not allowed`];
  if (schema === true) return [];
  const sch = deref(root, schema);
  /** @type {string[]} */
  const errors = [];

  if (sch.type != null && !matchesType(data, sch.type)) {
    errors.push(`${path}: expected ${sch.type}, got ${jsonType(data)}`);
    return errors;
  }
  if (sch.enum && !sch.enum.includes(data)) {
    errors.push(`${path}: expected one of ${JSON.stringify(sch.enum)}`);
  }
  if (typeof data === 'number') {
    if (sch.minimum != null && data < sch.minimum) errors.push(`${path}: below minimum ${sch.minimum}`);
    if (sch.maximum != null && data > sch.maximum) errors.push(`${path}: above maximum ${sch.maximum}`);
  }
  if (typeof data === 'string') {
    if (sch.minLength != null && data.length < sch.minLength) {
      errors.push(`${path}: shorter than minLength ${sch.minLength}`);
    }
    if (sch.pattern && !new RegExp(sch.pattern).test(data)) {
      errors.push(`${path}: does not match ${sch.pattern}`);
    }
  }
  if (Array.isArray(sch.oneOf)) {
    const hits = sch.oneOf.filter((branch) => validate(root, branch, data, path).length === 0);
    if (hits.length !== 1) errors.push(`${path}: oneOf expected 1 match, got ${hits.length}`);
    return errors;
  }
  if (Array.isArray(data)) {
    if (sch.minItems != null && data.length < sch.minItems) {
      errors.push(`${path}: fewer than minItems ${sch.minItems}`);
    }
    if (sch.maxItems != null && data.length > sch.maxItems) {
      errors.push(`${path}: more than maxItems ${sch.maxItems}`);
    }
    const prefix = Array.isArray(sch.prefixItems) ? sch.prefixItems : [];
    for (let i = 0; i < prefix.length && i < data.length; i++) {
      errors.push(...validate(root, prefix[i], data[i], `${path}[${i}]`));
    }
    if (sch.items === false) {
      if (data.length > prefix.length) errors.push(`${path}: extra items not allowed`);
    } else if (sch.items) {
      for (let i = prefix.length; i < data.length; i++) {
        errors.push(...validate(root, sch.items, data[i], `${path}[${i}]`));
      }
    }
    return errors;
  }
  if (data && typeof data === 'object') {
    for (const key of sch.required || []) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push(`${path}: missing required ${key}`);
      }
    }
    const props = sch.properties || {};
    for (const [key, value] of Object.entries(data)) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        errors.push(...validate(root, props[key], value, `${path}.${key}`));
        continue;
      }
      if (sch.additionalProperties === false) {
        errors.push(`${path}: unexpected property ${key}`);
      } else if (sch.additionalProperties && typeof sch.additionalProperties === 'object') {
        errors.push(...validate(root, sch.additionalProperties, value, `${path}.${key}`));
      }
    }
  }
  return errors;
}

const FIXTURE = {
  name: 'Example Build',
  version: '2.14',
  class: 'Amazon',
  level: 120,
  spentPoints: 20,
  skillPoints: { 'Fury Funnel': 20 },
  disabledSkills: [],
  disabledOSkillSlots: [],
  oSkills: { 'Fast Attack': 5 },
  allSkillsBonus: 0,
  classSkillsBonus: 0,
  questsCompleted: { den_of_evil: { normal: true, nightmare: true, hell: true } },
  savedAt: '2026-10-08T17:00:00.000Z',
  items: {
    weaponSet: 0,
    equipment: {
      head: 'unique:andariels-visage',
      neck: null,
      tors: { name: "Tyrael's Might", defId: 'unique:tyraels-might', rolls: { defense: 800 } },
      glov: null,
      feet: null,
      belt: null,
      rrin: null,
      lrin: null,
      rarm: null,
      larm: null,
      rarm2: null,
      larm2: null,
    },
    inventory: [{ slot: 0, defId: 'unique:wizardspike' }],
    charms: [{ name: 'The Sleep', defId: 'charm:the-sleep', rolls: { 'upgrade:0': 1 } }],
    relics: [{ name: 'Relic: Charged Strike', defId: 'relic:charged-strike' }],
  },
};

describe('planner build full schema', () => {
  const schema = readJson(FULL_SCHEMA_PATH);

  it('is JSON Schema 2020-12 with expected required keys and $defs', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('https://github.com/azadix/medianxl-db/schemas/planner-build-full.schema.json');
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(true);
    expect(schema.required).toEqual(['name', 'class', 'level', 'skillPoints', 'oSkills']);
    for (const key of EXPECTED_FULL_DEFS) {
      expect(schema.$defs, `missing $defs.${key}`).toHaveProperty(key);
    }
    expect(schema.properties).toHaveProperty('oSkills');
    expect(schema.properties).toHaveProperty('stats');
    expect(schema.properties).toHaveProperty('allSkillsBonus');
    expect(schema.properties).toHaveProperty('classSkillsBonus');
    expect(schema.$defs.Stats.properties).toHaveProperty('baseStrength');
    expect(schema.$defs.Stats.properties).toHaveProperty('baseDexterity');
    expect(schema.$defs.Stats.properties).toHaveProperty('baseVitality');
    expect(schema.$defs.Stats.properties).toHaveProperty('baseEnergy');
    expect(schema.$defs.Stats.required).toEqual(['baseStrength', 'baseDexterity', 'baseVitality', 'baseEnergy']);
    expect(schema.$defs.Stats.properties).not.toHaveProperty('allSkillsBonus');
    expect(schema.properties).not.toHaveProperty('savedAt');
    expect(schema.$defs.ItemsSnapshot.properties).not.toHaveProperty('inventory');
    expect(schema.$defs.ItemInstance.required).toEqual(['name']);
    expect(schema.$defs.ItemInstance.properties).toHaveProperty('description_lines');
    expect(schema.$defs.ItemInstance.properties).toHaveProperty('quality');
    expect(schema.$defs.ItemInstance.properties).toHaveProperty('name_color');
  });

  it('accepts a snapshot matching current export shape', () => {
    const errors = validate(schema, schema, FIXTURE);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('accepts the Miss_Peeled full example', () => {
    const example = readJson(resolve(ROOT, 'schemas/examples/miss-peeled-full.json'));
    const errors = validate(schema, schema, example);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('accepts optional mapped gap fields other planners may emit', () => {
    const withGaps = {
      ...FIXTURE,
      extraFromOtherPlanner: true,
      signetsEaten: 400,
      allSkillsBonus: 32,
      classSkillsBonus: 10,
      stats: {
        baseStrength: 10,
        baseDexterity: 0,
        baseVitality: 50,
        baseEnergy: 0,
        strength: 70,
        life: 12338,
        fire_resistance: 160,
      },
      difficultyTitle: 'Destroyer',
      items: {
        ...FIXTURE.items,
        equipment: {
          ...FIXTURE.items.equipment,
          head: {
            name: "Andariel's Visage",
            quality: 'Unique',
            defId: 'unique:andariels-visage',
            description_lines: [[['Andariel\'s Visage', 4]], [['Already Upgraded', 1]]],
            stats: ['+2 to All Skills', '15% Life stolen per Hit'],
            eth: true,
            corrupted: false,
            mystic_orbs: [[5, 'Mystic Orb: Life']],
            socketables: [
              {
                type: 'Jewel',
                name: 'Rare Jewel',
                stats: ['+15 to Strength', 'Fire Resist +6%'],
                rolls: { 'to Strength': 15 },
              },
            ],
          },
        },
      },
    };
    const errors = validate(schema, schema, withGaps);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('rejects missing required fields and invalid item slots', () => {
    const noClass = { ...FIXTURE };
    delete noClass.class;
    expect(validate(schema, schema, noClass).some((e) => e.includes('class'))).toBe(true);

    const noOSkills = { ...FIXTURE };
    delete noOSkills.oSkills;
    expect(validate(schema, schema, noOSkills).some((e) => e.includes('oSkills'))).toBe(true);

    expect(validate(schema, schema, { ...FIXTURE, oSkills: {} }).length).toBe(0);
    expect(
      validate(schema, schema, {
        ...FIXTURE,
        items: {
          ...FIXTURE.items,
          equipment: {
            ...FIXTURE.items.equipment,
            head: { name: "Andariel's Visage", defId: 'unique:andariels-visage', socketables: [{ type: 'Jewel', name: 'Jewel', stats: 'nope' }] },
          },
        },
      }).length
    ).toBeGreaterThan(0);
    expect(validate(schema, schema, { ...FIXTURE, level: 0 }).length).toBeGreaterThan(0);
    expect(validate(schema, schema, { ...FIXTURE, skillPoints: [] }).length).toBeGreaterThan(0);
    expect(
      validate(schema, schema, {
        ...FIXTURE,
        items: {
          ...FIXTURE.items,
          relics: [
            { name: 'a' },
            { name: 'b' },
            { name: 'c' },
            { name: 'd' },
          ],
        },
      }).length
    ).toBeGreaterThan(0);
  });
});

describe('planner build schema', () => {
  const schema = readJson(SCHEMA_PATH);
  const example = readJson(resolve(ROOT, 'schemas/examples/miss-peeled.json'));

  it('is the TSW export schema without items and with required skill bonuses', () => {
    expect(schema.$id).toBe('https://github.com/azadix/medianxl-db/schemas/planner-build.schema.json');
    expect(schema.required).toEqual([
      'name',
      'class',
      'level',
      'skillPoints',
      'oSkills',
      'allSkillsBonus',
      'classSkillsBonus',
      'stats',
    ]);
    expect(schema.properties.items).toBe(false);
    expect(schema.properties).not.toHaveProperty('difficultyTitle');
    expect(schema.$defs).not.toHaveProperty('ItemsSnapshot');
    expect(schema.$defs.Stats.required).toEqual(['baseStrength', 'baseDexterity', 'baseVitality', 'baseEnergy']);
    expect(schema.$defs.Stats.additionalProperties).toEqual({ type: 'number' });
  });

  it('accepts the Miss_Peeled example', () => {
    const errors = validate(schema, schema, example);
    expect(errors, errors.join('\n')).toEqual([]);
    expect(example.allSkillsBonus).toBe(32);
    expect(example.classSkillsBonus).toBe(10);
    expect(example).not.toHaveProperty('items');
  });

  it('rejects missing skill bonuses, missing allocation, and an items section', () => {
    const noBonus = structuredClone(example);
    delete noBonus.allSkillsBonus;
    expect(validate(schema, schema, noBonus).some((e) => e.includes('allSkillsBonus'))).toBe(true);

    const noAlloc = { ...example };
    delete noAlloc.stats;
    expect(validate(schema, schema, noAlloc).some((e) => e.includes('stats'))).toBe(true);

    expect(validate(schema, schema, { ...example, items: { equipment: {} } }).some((e) => e.includes('items'))).toBe(
      true
    );

    const withExtras = structuredClone(example);
    withExtras.stats.strength = 70;
    withExtras.stats.life = 12338;
    withExtras.stats.fire_resistance = 160;
    expect(validate(schema, schema, withExtras)).toEqual([]);
  });
});
