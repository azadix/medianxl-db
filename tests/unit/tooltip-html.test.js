import { afterEach, describe, expect, it } from 'vitest';
import {
  toTooltipLineHtml,
  buildSkillTooltipHeaderHtml,
  buildSkillTooltipDescriptionBlock,
  buildSkillTooltipRestrictionBlock,
  buildSkillTooltipScalingBlockHtml,
  buildSkillBonusSourcesTableHtml,
  wrapSkillTooltipContent,
  wrapNestedSkillTooltipHtml,
  parseNestedSkillMarker,
  buildSkillTooltipDisabledBannerHtml,
  buildSkillTooltipPrerequisiteWarningHtml,
} from '@/shared/tooltip-html.js';
import { resetSkillPreviewCatalogForTests, setSkillPreviewIdsForTests } from '@/skills/skill-preview-catalog.js';

describe('toTooltipLineHtml', () => {
  it('wraps non-empty lines in the given class', () => {
    expect(toTooltipLineHtml('a\nb', 'row')).toBe(
      '<div class="row">a</div><div class="row">b</div>'
    );
  });

  it('drops blank lines by default', () => {
    expect(toTooltipLineHtml('a\n\nb', 'row')).toBe(
      '<div class="row">a</div><div class="row">b</div>'
    );
  });

  it('preserves blank lines as nbsp rows when requested', () => {
    expect(toTooltipLineHtml('a\n\nb', 'row', { preserveBlankLines: true })).toBe(
      '<div class="row">a</div><div>&nbsp;</div><div class="row">b</div>'
    );
  });

  it('handles empty input', () => {
    expect(toTooltipLineHtml('', 'row')).toBe('');
    expect(toTooltipLineHtml(null, 'row')).toBe('');
  });
});

describe('buildSkillTooltipHeaderHtml', () => {
  it('assembles icon, name, tags, subskill, and level sections', () => {
    const html = buildSkillTooltipHeaderHtml({
      iconHtml: '<img>',
      nameInnerHtml: 'Fireball',
      tagsHtml: '<span>Spell</span>',
      subskillHtml: '<span>of Parent</span>',
      levelSectionHtml: 'Lv 5',
    });
    expect(html).toContain('tooltip-header');
    expect(html).toContain('<img>');
    expect(html).toContain('Fireball');
    expect(html).toContain('<span>Spell</span>');
    expect(html).toContain('<span>of Parent</span>');
    expect(html).toContain('Lv 5');
  });

  it('omits the icon column when iconHtml is empty', () => {
    const html = buildSkillTooltipHeaderHtml({
      nameInnerHtml: 'Sword',
      levelSectionHtml: '',
    });
    expect(html).not.toContain('tooltip-icon');
    expect(html).toContain('Sword');
  });

  it('adds a Play button when the skill has a preview gif', () => {
    setSkillPreviewIdsForTests(['frozen_crown']);
    const html = buildSkillTooltipHeaderHtml({
      iconHtml: '<img>',
      nameInnerHtml: 'Frozen Crown',
      levelSectionHtml: 'Lv 30',
      previewSkillId: 'frozen_crown',
    });
    expect(html).toContain('js-skill-preview-play');
    expect(html).toContain('data-skill-preview-id="frozen_crown"');
    expect(html).toContain('tooltip-icon');
  });

  it('still adds Play when there is no icon', () => {
    setSkillPreviewIdsForTests(['frozen_crown']);
    const html = buildSkillTooltipHeaderHtml({
      nameInnerHtml: 'Frozen Crown',
      levelSectionHtml: '',
      previewSkillId: 'frozen_crown',
    });
    expect(html).toContain('js-skill-preview-play');
    expect(html).not.toContain('tooltip-icon');
  });

  it('omits Play when the skill has no preview gif', () => {
    setSkillPreviewIdsForTests(['other_skill']);
    const html = buildSkillTooltipHeaderHtml({
      iconHtml: '<img>',
      nameInnerHtml: 'Frozen Crown',
      levelSectionHtml: '',
      previewSkillId: 'frozen_crown',
    });
    expect(html).not.toContain('js-skill-preview-play');
  });
});

afterEach(() => {
  resetSkillPreviewCatalogForTests();
});

describe('buildSkillTooltipDescriptionBlock', () => {
  it('returns empty string when nothing to show', () => {
    expect(buildSkillTooltipDescriptionBlock({})).toBe('');
  });

  it('includes main description when present', () => {
    const html = buildSkillTooltipDescriptionBlock({ mainDescHtml: 'Hits hard' });
    expect(html).toContain('tooltip-description');
    expect(html).toContain('Hits hard');
  });

  it('includes effect lines and level indicator', () => {
    const html = buildSkillTooltipDescriptionBlock({
      levelIndicatorHtml: '<div>Level 3 values:</div>',
      effectExpanded: 'line1\nline2',
    });
    expect(html).toContain('Level 3 values:');
    expect(html).toContain('tooltip-effect');
    expect(html).toContain('line1');
    expect(html).toContain('line2');
  });

  it('omits level indicator when there is no effect content', () => {
    const html = buildSkillTooltipDescriptionBlock({
      mainDescHtml: 'Walk to target location',
      levelIndicatorHtml: '<div class="tooltip-level-indicator">Level 0 values:</div>',
      effectExpanded: '',
    });
    expect(html).toContain('Walk to target location');
    expect(html).not.toContain('Level 0 values:');
  });
});

describe('buildSkillTooltipRestrictionBlock', () => {
  it('returns empty for blank input', () => {
    expect(buildSkillTooltipRestrictionBlock('')).toBe('');
    expect(buildSkillTooltipRestrictionBlock('   ')).toBe('');
  });

  it('wraps restriction text in warning block', () => {
    const html = buildSkillTooltipRestrictionBlock('Requires level 90');
    expect(html).toContain('tooltip-warning');
    expect(html).toContain('has-text-warning');
    expect(html).toContain('Requires level 90');
  });
});

describe('buildSkillTooltipScalingBlockHtml', () => {
  it('returns empty for empty list', () => {
    expect(buildSkillTooltipScalingBlockHtml([])).toBe('');
    expect(buildSkillTooltipScalingBlockHtml(null)).toBe('');
  });

  it('escapes HTML in scaling lines', () => {
    const html = buildSkillTooltipScalingBlockHtml(['a <b> & "c"']);
    expect(html).toContain('tooltip-scaling');
    expect(html).toContain('a &lt;b&gt; &amp; &quot;c&quot;');
    expect(html).not.toContain('<b>');
  });
});

describe('wrapNestedSkillTooltipHtml', () => {
  it('wraps skill id and optional fixed level', () => {
    const html = wrapNestedSkillTooltipHtml('amatoxin', 'Amatoxin', 'has-text-success', 23);
    expect(html).toContain('data-tooltip-skill-id="amatoxin"');
    expect(html).toContain('data-tooltip-skill-level="23"');
    expect(html).not.toContain('data-tooltip-skill-as-proc');
    expect(html).toContain('Amatoxin');
  });

  it('marks proc nested skills', () => {
    const html = wrapNestedSkillTooltipHtml('doom', 'Doom', '', 60, true);
    expect(html).toContain('data-tooltip-skill-level="60"');
    expect(html).toContain('data-tooltip-skill-as-proc="1"');
  });

  it('omits level attr when level is missing', () => {
    const html = wrapNestedSkillTooltipHtml('amatoxin', 'Amatoxin');
    expect(html).toContain('data-tooltip-skill-id="amatoxin"');
    expect(html).not.toContain('data-tooltip-skill-level');
  });
});

describe('parseNestedSkillMarker', () => {
  it('parses id and level', () => {
    expect(parseNestedSkillMarker('teleport:9')).toEqual({
      skillId: 'teleport',
      level: 9,
      asProc: false,
    });
    expect(parseNestedSkillMarker('teleport')).toEqual({
      skillId: 'teleport',
      level: null,
      asProc: false,
    });
    expect(parseNestedSkillMarker('doom:60:proc')).toEqual({
      skillId: 'doom',
      level: 60,
      asProc: true,
    });
  });
});

describe('wrapSkillTooltipContent and banners', () => {
  it('wraps content', () => {
    expect(wrapSkillTooltipContent('inner')).toBe('<div class="tooltip-content">inner</div>');
  });

  it('wraps content with sources panel', () => {
    const sources = buildSkillBonusSourcesTableHtml([
      { label: 'Base', valueHtml: '<span>1</span>' },
      { label: 'Relic', valueHtml: '<span class="skill-bonus-relic">+3</span>' },
    ]);
    const html = wrapSkillTooltipContent('inner', sources);
    expect(html).toContain('skill-tooltip-panels');
    expect(html).toContain('tooltip-content');
    expect(html).toContain('SOURCES');
    expect(html).toContain('skill-bonus-relic');
    expect(html).toContain('Base');
    expect(html).toContain('Relic');
  });

  it('builds empty sources table for empty rows', () => {
    expect(buildSkillBonusSourcesTableHtml([])).toBe('');
    expect(buildSkillBonusSourcesTableHtml(null)).toBe('');
  });

  it('builds disabled banner', () => {
    expect(buildSkillTooltipDisabledBannerHtml(true)).toContain('Disabled');
    expect(buildSkillTooltipDisabledBannerHtml(false)).toBe('');
  });

  it('builds prerequisite warning', () => {
    const html = buildSkillTooltipPrerequisiteWarningHtml('Need prereq');
    expect(html).toContain('tooltip-restriction');
    expect(html).toContain('Need prereq');
    expect(buildSkillTooltipPrerequisiteWarningHtml('')).toBe('');
  });
});
