import { describe, expect, it } from 'vitest';
import { normalizeBuildSkillPointsForImport } from '@/character/planner-build-io.js';

describe('placeholder skill rows', () => {
  it('ignores generated names for game-internal skill rows', () => {
    const { map, skipped } = normalizeBuildSkillPointsForImport({
      'Skill 1542': 1,
      skill_1545: 2,
      'Definitely Not A Skill': 3,
    });
    expect(skipped.map((s) => s.key)).toEqual(['Definitely Not A Skill']);
    expect(map).toEqual({});
  });

  it('still warns about unknown skills that are not placeholders', () => {
    const { skipped } = normalizeBuildSkillPointsForImport({ SomeSkillName: 5 });
    expect(skipped).toEqual([{ key: 'SomeSkillName', wantedLevel: 5 }]);
  });
});
