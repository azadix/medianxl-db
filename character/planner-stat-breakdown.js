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
  normalizePlannerStatValue,
  getPlannerStatLabel
} from './planner-stats-config.js';
import { getCharacterInstance, getEffectivePlannerLevel } from './character-state.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatQuestIdLabel(questId) {
  return String(questId)
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  return Math.abs(x - Math.round(x)) < 1e-6 ? String(Math.round(x)) : x.toFixed(2);
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
  const ch = getCharacterInstance();
  if (!ch) {
    return `<p class="planner-stat-tooltip-empty">${escapeHtml('No character loaded.')}</p>`;
  }

  if (!isPlannerBaseStatKey(key)) {
    return `<div class="planner-stat-tooltip-body">
      <p class="mb-1"><strong>${escapeHtml(key)}</strong></p>
      <p class="planner-stat-tooltip-meta mb-0">Unknown stat (not in character_stats registry).</p>
    </div>`;
  }

  const level = getEffectivePlannerLevel();
  const row = getClassPlannerStatDefaults(ch.className);
  const rawStat = ch.getStat(key);
  const displayedNum = (() => {
    const n = Number(rawStat);
    return Number.isFinite(n) ? n : 0;
  })();
  const title = getPlannerStatLabel(key);

  const sections = [];

  if ((key === 'life' || key === 'mana') && row) {
    const vit = Number(ch.getStat('vitality')) || 0;
    const ene = Number(ch.getStat('energy')) || 0;
    const b = computeClassDerivedLifeManaBreakdown(level, vit, ene, row);

    if (key === 'life') {
      const classRows = [
        { label: 'Class base life', value: `+${fmt(b.baseLife)}` },
        {
          label: `Life per level (${fmt(b.lifePerLevel)} × ${b.levelsAbove1} level(s) above 1)`,
          value: `+${fmt(b.lifeFromLevel)}`
        },
        {
          label: `From vitality above class baseline (${fmt(b.vitalityAboveBaseline)} vit × ${fmt(b.lifePerVitality)})`,
          value: `+${fmt(b.lifeFromVitality)}`
        }
      ];
      sections.push({ title: 'Class & level scaling', rows: classRows });

      const questParts = getFlatLifeQuestParts(ch);
      const questRows = questParts.map((q) => ({
        label: q.label,
        value: `+${fmt(q.total)}`,
        detail: q.perDifficulty.map((p) => `${p.diff}: +${fmt(p.amount)}`).join(', ')
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
            detail: m.kind ? String(m.kind) : undefined
          }))
        });
      }

      const questFlatTotal = ch.getTotalQuestLifeBonus();
      const rawTotal = b.lifeFromClassFormula + questFlatTotal;
      const totalRounded = normalizePlannerStatValue('life', rawTotal);
      sections.push({
        title: 'Total',
        rows: [{ label: fmt(totalRounded), value: undefined }]
      });
    } else {
      const classRows = [
        { label: 'Class base mana', value: `+${fmt(b.baseMana)}` },
        {
          label: `Mana per level (${fmt(b.manaPerLevel)} × ${b.levelsAbove1} level(s) above 1)`,
          value: `+${fmt(b.manaFromLevel)}`
        },
        {
          label: `From energy above class baseline (${fmt(b.energyAboveBaseline)} energy × ${fmt(b.manaPerEnergy)})`,
          value: `+${fmt(b.manaFromEnergy)}`
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
            detail: m.kind ? String(m.kind) : undefined
          }))
        });
      }

      const totalRounded = normalizePlannerStatValue('mana', b.manaFromClassFormula);
      sections.push({
        title: 'Total',
        rows: [{ label: fmt(totalRounded), value: undefined }]
      });
    }
  } else if (['strength', 'dexterity', 'vitality', 'energy'].includes(key) && row) {
    const baseline = Math.floor(Number(row[key]) || 0);
    const current = Math.floor(displayedNum);
    const above = Math.max(0, current - baseline);
    const alloc = Math.max(0, Math.floor(Number(ch.statAllocation?.[key]) || 0));

    const attrRows = [{ label: 'Class baseline', value: fmt(baseline) }];
    if (above > 0) {
      attrRows.push({
        label: 'Points above baseline (manual edits & future skill bonuses)',
        value: `+${fmt(above)}`
      });
    }
    if (alloc > 0) {
      attrRows.push({ label: 'Recorded in stat allocation (build save)', value: `+${fmt(alloc)}` });
    }
    sections.push({ title: 'Attributes', rows: attrRows });

    const mods = getPlannerStatSkillModifiers(key);
    if (mods.length > 0) {
      sections.push({
        title: 'Skills',
        rows: mods.map((m) => ({ label: m.displayName, value: m.description }))
      });
    }
  } else if (isPlannerNegativeAllowedBaseStat(key)) {
    sections.push({
      title: 'Resistance',
      rows: [
        {
          label: 'Value (can be negative)',
          value: fmt(displayedNum)
        }
      ]
    });
    const mods = getPlannerStatSkillModifiers(key);
    if (mods.length > 0) {
      sections.push({
        title: 'Skills (bonuses)',
        rows: mods.map((m) => ({
          label: m.displayName,
          value: m.description
        }))
      });
    }
  } else {
    sections.push({
      title: 'Info',
      rows: [
        {
          label: row ? 'Value' : 'No class row in game_meta',
          value: fmt(displayedNum),
          detail: row ? undefined : 'Select a class for baseline breakdowns.'
        }
      ]
    });
  }

  let html = `<div class="planner-stat-tooltip-body">`;
  html += `<p class="planner-stat-tooltip-title mb-2">${escapeHtml(title)}</p>`;
  if (!isPlannerNegativeAllowedBaseStat(key)) {
    html += `<p class="planner-stat-tooltip-meta mb-2">Effective level for scaling: ${fmt(level)}</p>`;
  }

  for (const sec of sections) {
    html += `<div class="planner-stat-tooltip-section mb-2">`;
    html += `<div class="planner-stat-tooltip-h">${escapeHtml(sec.title)}</div>`;
    html += `<ul class="planner-stat-tooltip-list">`;
    for (const r of sec.rows) {
      html += `<li>`;
      if (r.value === undefined && r.label !== undefined && r.label !== '') {
        html += `<span class="planner-stat-tooltip-v planner-stat-tooltip-total-num">${escapeHtml(r.label)}</span>`;
      } else {
        html += `<span class="planner-stat-tooltip-k">${escapeHtml(r.label)}</span>`;
        if (r.value !== undefined && r.value !== '') {
          html += ` <span class="planner-stat-tooltip-v">${escapeHtml(r.value)}</span>`;
        }
      }
      if (r.detail) {
        html += `<div class="planner-stat-tooltip-d">${escapeHtml(r.detail)}</div>`;
      }
      html += `</li>`;
    }
    html += `</ul></div>`;
  }
  html += `</div>`;
  return html;
}
