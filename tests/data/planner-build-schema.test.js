import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readJson } from '../helpers/tree-data.js';

const ROOT = resolve(import.meta.dirname, '../..');
const SCHEMA_PATH = resolve(ROOT, 'schemas/planner-build-full.schema.json');
const EXAMPLE_PATH = resolve(ROOT, 'schemas/examples/Miss_Peeled.json');

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
    errors.push(`${path}: expected ${JSON.stringify(sch.type)}, got ${jsonType(data)}`);
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
  ok: true,
  api_version: 1,
  meta: { realm: 'TSW' },
  build: {
    name: 'Example',
    version: '2.14',
    class: 'Amazon',
    level: 120,
    skillPoints: { 'Fury Funnel': 20 },
    oSkills: { 'Fast Attack': 5 },
    allSkillsBonus: 8,
    stats: '{{life}}=1000\n{{mana}}=200',
    questsCompleted: { den_of_evil: { normal: true, nightmare: true, hell: true } },
    savedAt: '2026-10-08T17:00:00.000Z',
  },
  items: [
    {
      item: "Andariel's Visage",
      display_name: "Andariel's Visage",
      quality: 'Unique',
      display_quality: 'SU',
      location: 'Gear',
      slot: 'Head',
      description_lines: [[["Andariel's Visage", 4]], [['Already Upgraded', 2]]],
      socketables: [],
      mystic_orbs: [],
      stat_ranges: [],
      charm_ranges: [],
    },
  ],
};

describe('planner build full schema', () => {
  const schema = readJson(SCHEMA_PATH);

  it('is the TSW envelope schema', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('https://github.com/azadix/medianxl-db/schemas/planner-build-full.schema.json');
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['build', 'items']);
    expect(schema.properties.build.$ref).toBe('#/$defs/TswBuild');
    expect(schema.$defs.TswBuild.required).toEqual(['name', 'class', 'level', 'skillPoints', 'oSkills']);
    expect(schema.$defs.TswBuild.properties.stats.type).toBe('string');
    expect(schema.properties.items.type).toBe('array');
    expect(schema.$defs).toHaveProperty('TswItem');
    expect(schema.$defs).toHaveProperty('DescriptionLines');
    expect(schema.$defs).not.toHaveProperty('ItemsSnapshot');
  });

  it('accepts a TSW envelope fixture', () => {
    const errors = validate(schema, schema, FIXTURE);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('accepts the Miss_Peeled TSW export', () => {
    const example = readJson(EXAMPLE_PATH);
    const errors = validate(schema, schema, example);
    expect(errors, errors.join('\n')).toEqual([]);
    expect(example.build.name).toBe('Miss_Peeled');
    expect(typeof example.build.stats).toBe('string');
    expect(Array.isArray(example.items)).toBe(true);
  });

  it('rejects missing envelope fields and invalid build data', () => {
    const noBuild = { ...FIXTURE };
    delete noBuild.build;
    expect(validate(schema, schema, noBuild).some((e) => e.includes('build'))).toBe(true);

    const noItems = { ...FIXTURE };
    delete noItems.items;
    expect(validate(schema, schema, noItems).some((e) => e.includes('items'))).toBe(true);

    const noClass = structuredClone(FIXTURE);
    delete noClass.build.class;
    expect(validate(schema, schema, noClass).some((e) => e.includes('class'))).toBe(true);

    const noOSkills = structuredClone(FIXTURE);
    delete noOSkills.build.oSkills;
    expect(validate(schema, schema, noOSkills).some((e) => e.includes('oSkills'))).toBe(true);

    expect(validate(schema, schema, { ...FIXTURE, items: {} }).length).toBeGreaterThan(0);
    expect(
      validate(schema, schema, {
        ...FIXTURE,
        build: { ...FIXTURE.build, level: 0 },
      }).length
    ).toBeGreaterThan(0);
    expect(
      validate(schema, schema, {
        ...FIXTURE,
        build: { ...FIXTURE.build, stats: { life: 1 } },
      }).length
    ).toBeGreaterThan(0);
  });
});
