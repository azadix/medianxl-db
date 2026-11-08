/**
 * @file Public entry point for the character bucket.
 * @module character/bucket
 */

export { createCharacterBucket, COMPARTMENTS } from './bucket.js';
export {
  createContribution,
  createSource,
  ignoredReport,
  unsupportedReport,
  supportedReport,
  MOD_OPS,
  MOD_STAGES,
  SUPPORT_STATUSES,
} from './contributions.js';
export {
  createStatRegistry,
  normalizeStatDef,
  fallbackStatDef,
  getRegistryDependencies,
} from './registry.js';
export { evaluateStat } from './evaluator.js';
export { buildDependencyGraph, expandDependents } from './dependencies.js';
export { createCharacterSnapshot } from './snapshot.js';
