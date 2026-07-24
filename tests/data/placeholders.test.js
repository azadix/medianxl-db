import { describe, expect, it } from 'vitest';
import { asText, loadActiveTreeData } from '../helpers/tree-data.js';

const data = loadActiveTreeData();
const { mergedSkills, statsMap } = data;

function findUnknownStatKeys(text, statsMap) {
  const issues = [];
  if (!text) return issues;
  const placeholders = String(text).match(/\{\{([^}]+)\}\}/g) || [];
  for (const full of placeholders) {
    const inner = full.slice(2, -2);
    const statKey = inner.split(':')[0].trim().toLowerCase();
    if (!statKey) continue;
    if (!statsMap.has(statKey)) {
      issues.push(`Unknown stat key: '${inner.split(':')[0].trim()}' in placeholder ${full}`);
    }
  }
  return issues;
}

describe('skill placeholders', () => {
  it('rejects unknown {{stat}} keys in skill text', () => {
    const failures = [];
    for (const row of mergedSkills) {
      const name = row.display_name || row.name || '?';
      for (const field of ['description', 'skill_effect', 'restriction']) {
        const text = asText(row[field]);
        if (!text.trim()) continue;
        for (const issue of findUnknownStatKeys(text, statsMap)) {
          failures.push(`${name} [${field}]: ${issue}`);
        }
      }
    }
    expect(
      failures,
      failures.slice(0, 40).join('\n') +
        (failures.length > 40 ? `\n... and ${failures.length - 40} more` : '')
    ).toEqual([]);
  });
});
