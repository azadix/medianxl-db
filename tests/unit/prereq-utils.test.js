import { describe, expect, it } from 'vitest';
import { parsePrereqTriple } from '@/character/prereq-utils.js';

describe('parsePrereqTriple', () => {
  it('splits type:value:target', () => {
    expect(parsePrereqTriple('skill_level:1:fire_bolt')).toEqual({
      type: 'skill_level',
      value: '1',
      target: 'fire_bolt',
    });
  });

  it('keeps extra colons in the target', () => {
    expect(parsePrereqTriple('skill_level:2:mod:skill_id')).toEqual({
      type: 'skill_level',
      value: '2',
      target: 'mod:skill_id',
    });
    expect(parsePrereqTriple('skill_level_any:15:a:1|b:2')).toEqual({
      type: 'skill_level_any',
      value: '15',
      target: 'a:1|b:2',
    });
  });

  it('handles missing target or value', () => {
    expect(parsePrereqTriple('character_level:90:')).toEqual({
      type: 'character_level',
      value: '90',
      target: '',
    });
    expect(parsePrereqTriple('character_level:90')).toEqual({
      type: 'character_level',
      value: '90',
      target: '',
    });
    expect(parsePrereqTriple('skill_level')).toEqual({
      type: 'skill_level',
      value: '',
      target: '',
    });
  });
});
