import { describe, expect, it, vi } from 'vitest';
import {
  buildDependencyGraph,
  createCharacterBucket,
  createContribution,
  createSource,
  createStatRegistry,
  evaluateStat,
  expandDependents,
  ignoredReport,
  normalizeStatDef,
  unsupportedReport,
} from '@/character/bucket/index.js';

const classSource = createSource({ kind: 'class', id: 'class', label: 'Class & level' });
const itemSource = createSource({
  kind: 'item',
  id: '12',
  label: 'Silks of the Victor',
  slot: 'tors',
});

/**
 * @param {string} stat
 * @param {number} value
 * @param {object} [options]
 */
function contribution(stat, value, options = {}) {
  return createContribution({
    stat,
    value,
    source: options.source || classSource,
    op: options.op || 'base',
    stage: options.stage || 'pre',
    conditions: options.conditions,
    id: options.id,
  });
}

function registry() {
  return createStatRegistry([
    { key: 'strength', label: 'Strength', allowNegative: false },
    { key: 'vitality', label: 'Vitality', allowNegative: false },
    { key: 'life', label: 'Life', allowNegative: false, round: 'floor' },
    { key: 'maximum_life', label: 'Maximum Life', allowNegative: true },
  ]);
}

describe('character bucket registry', () => {
  it('normalizes defaults and explicit metadata', () => {
    const def = normalizeStatDef({ key: 'Life', label: 'Life', allowNegative: false });
    expect(def.key).toBe('life');
    expect(def.round).toBe('floor');
    expect(def.isPool).toBe(true);
    expect(def.allowNegative).toBe(false);

    const custom = normalizeStatDef({
      key: 'vitality',
      dependsOn: ['strength'],
      round: 'round',
      isPool: true,
    });
    expect(custom.dependsOn).toEqual(['strength']);
    expect(custom.round).toBe('round');
    expect(custom.isPool).toBe(true);
  });
});

describe('character bucket evaluator', () => {
  it('evaluates the vitality example: base + items, increased, post-%', () => {
    const result = evaluateStat({
      registry: registry(),
      stat: 'vitality',
      contributions: [
        contribution('vitality', 40),
        contribution('vitality', 10, { source: itemSource }),
        contribution('vitality', 50, { source: itemSource, op: 'inc' }),
        contribution('vitality', 25, { source: itemSource, stage: 'post' }),
      ],
      selectedConditions: [],
    });

    expect(result.value).toBe(100);
    expect(result.raw).toEqual({ pre: 50, inc: 50, more: 1, post: 25, override: null });
    expect(result.formula).toContain('= 100');
    expect(result.groups.map((group) => group.title)).toEqual([
      'Class & level',
      'Items',
      'Increased',
      'Post-%',
    ]);
    expect(result.rows).toHaveLength(4);
  });

  it('multiplies multiple more sources', () => {
    const result = evaluateStat({
      registry: registry(),
      stat: 'life',
      contributions: [
        contribution('life', 100),
        contribution('life', 50, { op: 'inc' }),
        contribution('life', 20, { op: 'more' }),
      ],
    });
    expect(result.value).toBe(180);
    expect(result.formula).toContain('× 1.2 (more)');
  });

  it('lets an override replace the computed value', () => {
    const result = evaluateStat({
      registry: registry(),
      stat: 'life',
      contributions: [contribution('life', 10), contribution('life', 42, { op: 'override' })],
    });
    expect(result.value).toBe(42);
    expect(result.formula).toContain('override');
  });

  it('applies rounding, caps and negative floor', () => {
    const capped = evaluateStat({
      registry: createStatRegistry([{ key: 'life', max: 100 }]),
      stat: 'life',
      contributions: [contribution('life', 150.9)],
    });
    expect(capped.value).toBe(100);

    const floored = evaluateStat({
      registry: createStatRegistry([{ key: 'life', allowNegative: false }]),
      stat: 'life',
      contributions: [contribution('life', -5.2)],
    });
    expect(floored.value).toBe(0);
  });

  it('keeps inactive conditional rows visible but excluded', () => {
    const list = [
      contribution('vitality', 10),
      contribution('vitality', 50, {
        source: itemSource,
        conditions: ['while_in_heroic_duncraig'],
      }),
    ];
    const off = evaluateStat({
      registry: registry(),
      stat: 'vitality',
      contributions: list,
      selectedConditions: [],
    });
    expect(off.value).toBe(10);
    expect(off.inactiveCount).toBe(1);
    expect(off.rows.find((row) => row.active === false)).toBeTruthy();

    const on = evaluateStat({
      registry: registry(),
      stat: 'vitality',
      contributions: list,
      selectedConditions: ['while_in_heroic_duncraig'],
    });
    expect(on.value).toBe(60);
  });

  it('is independent of contribution order', () => {
    const list = [
      contribution('vitality', 40),
      contribution('vitality', 10, { source: itemSource }),
      contribution('vitality', 50, { source: itemSource, op: 'inc' }),
      contribution('vitality', 25, { source: itemSource, stage: 'post' }),
    ];
    const forward = evaluateStat({ registry: registry(), stat: 'vitality', contributions: list });
    const reverse = evaluateStat({
      registry: registry(),
      stat: 'vitality',
      contributions: [...list].reverse(),
    });
    expect(reverse.value).toBe(forward.value);
  });
});

describe('character bucket', () => {
  it('replaces a source instead of accumulating it', () => {
    const bucket = createCharacterBucket({ registry: registry() });
    bucket.setSource('items', '12', [contribution('life', 10, { source: itemSource })]);
    expect(bucket.commit().getValue('life')).toBe(10);

    bucket.setSource('items', '12', [contribution('life', 20, { source: itemSource })]);
    expect(bucket.commit().getValue('life')).toBe(20);

    bucket.removeSource('items', '12');
    expect(bucket.commit().getValue('life')).toBe(0);
  });

  it('exposes unsupported and ignored reports without counting them', () => {
    const bucket = createCharacterBucket({ registry: registry() });
    bucket.setSource('items', '12', {
      contributions: [contribution('life', 50, { source: itemSource })],
      reports: [
        unsupportedReport({
          text: 'Miasma: Haunt Duration Increased by 4 seconds',
          source: itemSource,
          reason: 'unique-mechanic',
          unique: true,
        }),
        ignoredReport({ text: 'Socketed (2)', source: itemSource }),
      ],
    });
    const snap = bucket.commit();
    expect(snap.getValue('life')).toBe(50);
    expect(snap.unsupported).toHaveLength(1);
    expect(snap.unsupported[0].reason).toBe('unique-mechanic');
    expect(snap.ignored).toHaveLength(1);
    expect(bucket.getUnsupported()).toHaveLength(1);
  });

  it('stores unique item modifiers in a separate compartment', () => {
    const bucket = createCharacterBucket({ registry: registry() });
    bucket.setUniqueMods('12', [
      unsupportedReport({
        text: 'Miasma: Haunt Duration Increased by 4 seconds',
        source: itemSource,
        reason: 'unique-mechanic',
        unique: true,
      }),
    ]);
    const snap = bucket.commit();
    expect(snap.getValue('life')).toBe(0);
    expect(snap.uniqueMods).toHaveLength(1);
    expect(snap.unsupported).toHaveLength(1);
    expect(snap.unsupported[0].unique).toBe(true);
  });

  it('notifies once per commit and stops after unsubscribe', () => {
    const bucket = createCharacterBucket({ registry: registry() });
    const listener = vi.fn();
    const unsubscribe = bucket.subscribe(listener);

    bucket.setSource('base', 'class', [contribution('life', 10)]);
    bucket.commit();
    expect(listener).toHaveBeenCalledTimes(1);
    bucket.commit();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    bucket.setSource('base', 'class', [contribution('life', 20)]);
    bucket.commit();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates when conditions change', () => {
    const bucket = createCharacterBucket({ registry: registry() });
    bucket.setSource('items', '12', [
      contribution('vitality', 50, {
        source: itemSource,
        conditions: ['while_in_heroic_duncraig'],
      }),
    ]);
    expect(bucket.commit().getValue('vitality')).toBe(0);
    bucket.setConditions(['while_in_heroic_duncraig']);
    expect(bucket.commit().getValue('vitality')).toBe(50);
  });

  it('returns a frozen values map and immutable snapshot lists', () => {
    const bucket = createCharacterBucket({ registry: registry() });
    bucket.setSource('base', 'class', [contribution('life', 10)]);
    const snap = bucket.commit();
    expect(Object.isFrozen(snap.values)).toBe(true);
    expect(Object.isFrozen(snap.unsupported)).toBe(true);
    expect(Object.isFrozen(snap.uniqueMods)).toBe(true);
  });
});

describe('character bucket dependencies', () => {
  it('orders dependencies before dependents', () => {
    const graph = buildDependencyGraph(
      ['life', 'vitality', 'strength'],
      new Map([
        ['life', ['vitality', 'strength']],
        ['vitality', []],
        ['strength', []],
      ])
    );
    expect(graph.order.indexOf('vitality')).toBeLessThan(graph.order.indexOf('life'));
    expect(graph.order.indexOf('strength')).toBeLessThan(graph.order.indexOf('life'));
    expect(graph.cycles).toEqual([]);
  });

  it('reports cycles instead of hiding them', () => {
    const graph = buildDependencyGraph(
      ['a', 'b'],
      new Map([
        ['a', ['b']],
        ['b', ['a']],
      ])
    );
    expect(graph.cycles.length).toBeGreaterThan(0);
  });

  it('expands dirty stats to dependents', () => {
    const graph = buildDependencyGraph(
      ['life', 'vitality', 'mana'],
      new Map([
        ['life', ['vitality']],
        ['vitality', []],
        ['mana', []],
      ])
    );
    const dirty = expandDependents(['vitality'], graph);
    expect(dirty.has('vitality')).toBe(true);
    expect(dirty.has('life')).toBe(true);
    expect(dirty.has('mana')).toBe(false);
  });
});
