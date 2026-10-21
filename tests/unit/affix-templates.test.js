import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatAffixIdLine,
  formatAffixLabel,
  listAffixCategories,
  listAffixTemplates,
  loadAffixTemplates,
} from '@/items/affix-templates.js';

loadAffixTemplates(JSON.parse(readFileSync(resolve('public/items/2_14/affix-templates.json'), 'utf8')));

describe('affix-templates', () => {
  it('loads categories and formats x placeholders', () => {
    expect(listAffixTemplates().length).toBeGreaterThan(100);
    expect(listAffixCategories()).toContain('offense');
    expect(formatAffixLabel('+x% Enhanced Damage', 20)).toBe('+20% Enhanced Damage');
    expect(formatAffixIdLine('edmg', 15)).toBe('+15% Enhanced Damage');
  });
});
