import { describe, expect, it } from 'vitest';
import {
  toTooltipLineHtml,
  buildSkillTooltipHeaderHtml,
  buildSkillTooltipDescriptionBlock,
  buildSkillTooltipRestrictionBlock,
  buildSkillTooltipScalingBlockHtml,
  buildSkillBonusSourcesTableHtml,
  wrapSkillTooltipContent,
  buildSkillTooltipDisabledBannerHtml,
  buildSkillTooltipPrerequisiteWarningHtml,
} from '@/shared/tooltip-html.js';

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
    expect(buildSkillTooltipDisabledBannerHtml()).toContain('DISABLED');
  });

  it('builds prerequisite warning', () => {
    const html = buildSkillTooltipPrerequisiteWarningHtml('Need prereq');
    expect(html).toContain('tooltip-restriction');
    expect(html).toContain('Need prereq');
    expect(buildSkillTooltipPrerequisiteWarningHtml('')).toBe('');
  });
});
