/**
 * @file Stat dependency graph for evaluation order and incremental invalidation.
 * @module character/bucket/dependencies
 */

/**
 * @typedef {object} DependencyGraph
 * @property {Map<string, Set<string>>} dependencies stat -> stats it reads
 * @property {Map<string, Set<string>>} dependents dependency -> stats that read it
 * @property {string[]} order topological order (dependencies first)
 * @property {string[][]} cycles groups of stats that participate in cycles
 */

/**
 * @param {string[]} keys
 * @param {Map<string, string[]>} dependencies
 * @returns {DependencyGraph}
 */
export function buildDependencyGraph(keys, dependencies) {
  /** @type {Map<string, Set<string>>} */
  const deps = new Map();
  /** @type {Map<string, Set<string>>} */
  const dependents = new Map();
  const all = new Set(keys);
  for (const key of all) {
    deps.set(key, new Set());
    dependents.set(key, new Set());
  }
  for (const [key, list] of dependencies || []) {
    if (!all.has(key)) continue;
    for (const dep of list || []) {
      if (!all.has(dep) || dep === key) continue;
      deps.get(key)?.add(dep);
      dependents.get(dep)?.add(key);
    }
  }

  /** @type {string[]} */
  const order = [];
  /** @type {string[][]} */
  const cycles = [];
  const state = new Map(); // 0 unvisited, 1 visiting, 2 done
  /** @type {string[]} */
  const stack = [];

  /**
   * @param {string} key
   */
  function visit(key) {
    const current = state.get(key) || 0;
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(key);
      if (start >= 0) cycles.push(stack.slice(start).concat(key));
      return;
    }
    state.set(key, 1);
    stack.push(key);
    for (const dep of deps.get(key) || []) visit(dep);
    stack.pop();
    state.set(key, 2);
    order.push(key);
  }

  for (const key of all) visit(key);
  return { dependencies: deps, dependents, order, cycles };
}

/**
 * Expand a set of changed stats to every stat that depends on them.
 * @param {Iterable<string>} dirtyKeys
 * @param {DependencyGraph} graph
 * @returns {Set<string>}
 */
export function expandDependents(dirtyKeys, graph) {
  const out = new Set();
  /** @type {string[]} */
  const queue = [];
  for (const key of dirtyKeys) {
    const normalized = String(key ?? '').trim().toLowerCase();
    if (!normalized || out.has(normalized)) continue;
    out.add(normalized);
    queue.push(normalized);
  }
  while (queue.length) {
    const key = queue.shift();
    for (const dependent of graph.dependents.get(key) || []) {
      if (out.has(dependent)) continue;
      out.add(dependent);
      queue.push(dependent);
    }
  }
  return out;
}
