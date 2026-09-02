/**
 * Human-readable breakdown of planner stat values for tooltips.
 */
import Character from './Character.js';
import {
  getClassPlannerStatDefaults,
  computeClassDerivedLifeManaBreakdown
} from './class-baselines.js';
import { getPlannerStatSkillModifiers } from './planner-stat-modifiers.js';
import {
  isPlannerBaseStatKey,
  isPlannerNegativeAllowedBaseStat,
  getPlannerStatLabel
} from './planner-stats-config.js';
import { getCharacterInstance, getEffectivePlannerLevel } from './planner-core.js';
import { escapeHtmlText } from '@/shared/utils.js';

function formatQuestIdLabel(questId) {
  return String(questId)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatStatDisplayValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return Math.abs(num - Math.round(num)) < 1e-6 ? String(Math.round(num)) : num.toFixed(2);
}

/** @param {object} character Character instance with questsCompleted */
function getFlatLifeQuestParts(character) {
  const out = [];
  for (const [questId, def] of Object.entries(Character.QUESTS)) {
    if (def.type !== 'flat_life' || !def.reward) continue;
    const qc = character.questsCompleted[questId] || {};
    const perDifficulty = [];
    let total = 0;
    for (const diff of ['normal', 'nightmare', 'hell']) {
      const slot = def.reward[diff];
      if (!slot || typeof slot.amount !== 'number') continue;
      if (!qc[diff]) continue;
      total += slot.amount;
      perDifficulty.push({ diff, amount: slot.amount });
    }
    if (total > 0) {
      out.push({
        questId,
        label: formatQuestIdLabel(questId),
        total,
        perDifficulty
      });
    }
  }
  return out;
}

/**
 * @param {string} statKey
 * @returns {string} HTML fragment (safe, escaped)
 */
export function buildPlannerStatBreakdownHtml(statKey) {
  const key = String(statKey || '').toLowerCase();
  const character = getCharacterInstance();
  if (!character) {
    return `<p class="planner-stat-tooltip-empty">${escapeHtmlText('No character loaded.')}</p>`;
  }

  if (!isPlannerBaseStatKey(key)) {
    return `<div class="planner-stat-tooltip-body">
      <p class="mb-1"><strong>${escapeHtmlText(key)}</strong></p>
      <p class="planner-stat-tooltip-meta mb-0">Unknown stat (not in character_stats registry).</p>
    </div>`;
  }

  const level = getEffectivePlannerLevel();
  const row = getClassPlannerStatDefaults(character.className);
  const rawStat = character.getStat(key);
  const displayedNum = (() => {
    const n = Number(rawStat);
    return Number.isFinite(n) ? n : 0;
  })();
  const title = getPlannerStatLabel(key);

  const sections = [];

  if ((key === 'life' || key === 'mana') && row) {
    const vit = Number(character.getRawStat('vitality')) || 0;
    const ene = Number(character.getRawStat('energy')) || 0;
    const b = computeClassDerivedLifeManaBreakdown(level, vit, ene, row);

    if (key === 'life') {
      const classRows = [
        { label: 'Class base life', value: `+${formatStatDisplayValue(b.baseLife)}` },
        {
          label: `Life per level (${formatStatDisplayValue(b.lifePerLevel)} × ${b.levelsAbove1} level(s) above 1)`,
          value: `+${formatStatDisplayValue(b.lifeFromLevel)}`
        },
        {
          label: `From vitality above class baseline (${formatStatDisplayValue(b.vitalityAboveBaseline)} vit × ${formatStatDisplayValue(b.lifePerVitality)})`,
          value: `+${formatStatDisplayValue(b.lifeFromVitality)}`
        }
      ];
      sections.push({ title: 'Class & level scaling', rows: classRows });

      const questParts = getFlatLifeQuestParts(character);
      const questRows = questParts.map((q) => ({
        label: q.label,
        value: `+${formatStatDisplayValue(q.total)}`,
        detail: q.perDifficulty.map((p) => `${p.diff}: +${formatStatDisplayValue(p.amount)}`).join(', ')
      }));
      if (questRows.length > 0) {
        sections.push({ title: 'Quests (flat life)', rows: questRows });
      }

      const mods = getPlannerStatSkillModifiers('life');
      if (mods.length > 0) {
        sections.push({
          title: 'Skills (bonuses)',
          rows: mods.map((m) => ({
            label: m.displayName,
            value: m.description,
            detail: m.kind ? String(m.kind) : undefined,
            active: m.active !== false
          }))
        });
      }

      sections.push({
        title: 'Total',
        rows: [{ label: formatStatDisplayValue(displayedNum), value: undefined }]
      });
    } else {
      const classRows = [
        { label: 'Class base mana', value: `+${formatStatDisplayValue(b.baseMana)}` },
        {
          label: `Mana per level (${formatStatDisplayValue(b.manaPerLevel)} × ${b.levelsAbove1} level(s) above 1)`,
          value: `+${formatStatDisplayValue(b.manaFromLevel)}`
        },
        {
          label: `From energy above class baseline (${formatStatDisplayValue(b.energyAboveBaseline)} energy × ${formatStatDisplayValue(b.manaPerEnergy)})`,
          value: `+${formatStatDisplayValue(b.manaFromEnergy)}`
        }
      ];
      sections.push({ title: 'Class & level scaling', rows: classRows });

      const mods = getPlannerStatSkillModifiers('mana');
      if (mods.length > 0) {
        sections.push({
          title: 'Skills (bonuses)',
          rows: mods.map((m) => ({
            label: m.displayName,
            value: m.description,
            detail: m.kind ? String(m.kind) : undefined,
            active: m.active !== false
          }))
        });
      }

      sections.push({
        title: 'Total',
        rows: [{ label: formatStatDisplayValue(displayedNum), value: undefined }]
      });
    }
  } else if (['strength', 'dexterity', 'vitality', 'energy'].includes(key) && row) {
    const baseline = Math.floor(Number(row[key]) || 0);
    const current = Math.floor(character.getRawStat(key));
    const delta = current - baseline;
    const alloc = Math.max(0, Math.floor(Number(character.statAllocation?.[key]) || 0));

    const attrRows = [{ label: 'Class baseline', value: formatStatDisplayValue(baseline) }];
    if (delta !== 0) {
      attrRows.push({
        label: 'Manual delta vs class baseline',
        value: `${delta >= 0 ? '+' : ''}${formatStatDisplayValue(delta)}`
      });
    }
    if (alloc > 0) {
      attrRows.push({ label: 'Recorded in stat allocation (build save)', value: `+${formatStatDisplayValue(alloc)}` });
    }
    sections.push({ title: 'Attributes', rows: attrRows });

    const mods = getPlannerStatSkillModifiers(key);
    if (mods.length > 0) {
      sections.push({
        title: 'Skills',
        rows: mods.map((m) => ({ label: m.displayName, value: m.description, active: m.active !== false }))
      });
    }
  } else if (isPlannerNegativeAllowedBaseStat(key)) {
    const rawOnly = character.getRawStat(key);
    const mods = getPlannerStatSkillModifiers(key);
    sections.push({
      title: 'Manual / saved',
      rows: [{ label: 'Manually edited value: ', value: formatStatDisplayValue(rawOnly) }]
    });
    if (mods.length > 0) {
      sections.push({
        title: 'Skills',
        rows: mods.map((m) => ({
          label: m.displayName,
          value: m.description,
          active: m.active !== false
        }))
      });
    }
    sections.push({
      title: 'Total',
      rows: [{ label: formatStatDisplayValue(displayedNum), value: undefined }]
    });
  } else {
    const rawOnly = character.getRawStat(key);
    const mods = getPlannerStatSkillModifiers(key);
    sections.push({
      title: 'Manual / saved',
      rows: [
        {
          label: row ? 'Manually edited value: ' : 'No class row in game_meta',
          value: formatStatDisplayValue(rawOnly),
          detail: row ? undefined : 'Select a class for baseline breakdowns.'
        }
      ]
    });
    if (mods.length > 0) {
      sections.push({
        title: 'Skills',
        rows: mods.map((m) => ({
          label: m.displayName,
          value: m.description,
          active: m.active !== false
        }))
      });
    }
    sections.push({
      title: 'Total',
      rows: [{ label: formatStatDisplayValue(displayedNum), value: undefined }]
    });
  }

  let html = `<div class="planner-stat-tooltip-body">`;
  html += `<p class="planner-stat-tooltip-title mb-2">${escapeHtmlText(title)}</p>`;
  if (!isPlannerNegativeAllowedBaseStat(key)) {
    html += `<p class="planner-stat-tooltip-meta mb-2">Effective level for scaling: ${formatStatDisplayValue(level)}</p>`;
  }

  for (const sec of sections) {
    html += `<div class="planner-stat-tooltip-section mb-2">`;
    html += `<div class="planner-stat-tooltip-h">${escapeHtmlText(sec.title)}</div>`;
    html += `<ul class="planner-stat-tooltip-list">`;
    for (const row of sec.rows) {
      const inactive = row.active === false;
      html += `<li>`;
      if (row.value === undefined && row.label !== undefined && row.label !== '') {
        html += `<span class="planner-stat-tooltip-v planner-stat-tooltip-total-num${inactive ? ' has-text-grey has-text-weight-semibold' : ''}">${escapeHtmlText(row.label)}</span>`;
      } else {
        html += `<span class="planner-stat-tooltip-k${inactive ? ' has-text-grey has-text-weight-semibold' : ''}">${escapeHtmlText(row.label)}</span>`;
        if (row.value !== undefined && row.value !== '') {
          html += ` <span class="planner-stat-tooltip-v${inactive ? ' has-text-grey' : ''}">${escapeHtmlText(row.value)}</span>`;
        }
      }
      if (row.detail) {
        html += `<div class="planner-stat-tooltip-d">${escapeHtmlText(row.detail)}</div>`;
      }
      html += `</li>`;
    }
    html += `</ul></div>`;
  }
  html += `</div>`;
  return html;
}
