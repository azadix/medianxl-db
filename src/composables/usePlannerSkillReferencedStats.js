import { computed } from 'vue';
import { getPlannerStatDef } from '@/character/planner-stats-config.js';
import { getPairedStatRouting } from '@/character/planner-stat-modifiers.js';
import { getAllOSkills, getCharacterInstance } from '@/character/planner-core.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';

/**
 * Stat registry keys referenced by allocated skills (skillEffect + scalingConstants formulas).
 * Depends on non-reactive globals; pass a ref to bump when skill store / allocations change.
 *
 * @param {import('vue').Ref<number>} refreshTick
 */
export function usePlannerSkillReferencedStats(refreshTick) {
  const skillReferencedStatKeys = computed(() => {
    refreshTick.value;

    const ch = getCharacterInstance();
    if (!ch) return new Set();

    const store = getFileSkillStore();
    const skillLevels = typeof ch.getAllSkillPoints === 'function' ? ch.getAllSkillPoints() : {};
    const rawOSkills = getAllOSkills();
    const oSkillLevels =
      rawOSkills && typeof rawOSkills === 'object' && !Array.isArray(rawOSkills) ? rawOSkills : {};

    /** @type {Set<string>} */
    const out = new Set();
    const tokenRe = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

    /**
     * @param {string} tokenKeyLower
     * @returns {string|null}
     */
    function resolveCharacterRegistryKey(tokenKeyLower) {
      const k = String(tokenKeyLower || '').toLowerCase();
      if (!k) return null;
      if (getPlannerStatDef(k)) return k;
      if (!store) return null;

      const byKey = store.characterStatByKeyLower;
      if (byKey?.size) {
        const row = byKey.get(k);
        const rk = row?.key != null ? String(row.key).trim().toLowerCase() : '';
        if (rk && getPlannerStatDef(rk)) return rk;
      }

      const byStatsKey = store.characterStatByStatsKeyLower;
      if (byStatsKey?.size) {
        const row = byStatsKey.get(k);
        const rk = row?.key != null ? String(row.key).trim().toLowerCase() : '';
        if (rk && getPlannerStatDef(rk)) return rk;
      }

      return null;
    }

    /** @param {string} k */
    function normalizeSkillNameToInternalId(k) {
      return String(k || '')
        .trim()
        .toLowerCase()
        .replace(/'/g, '')
        .replace(/\s+/g, '_');
    }

    /** @param {string} skillKey */
    function resolveSkillCatalogRow(skillKey) {
      if (!store) return null;
      const rawKey = String(skillKey || '').trim();
      if (!rawKey) return null;

      let row = store.catalogByInternalId?.get?.(rawKey) ?? null;
      if (row) return row;

      const norm = normalizeSkillNameToInternalId(rawKey);
      if (norm && norm !== rawKey) {
        row = store.catalogByInternalId?.get?.(norm) ?? null;
        if (row) return row;
      }

      if (Array.isArray(store.catalog) && store.catalog.length) {
        const hit = store.catalog.find((r) => String(r?.displayName || '').trim().toLowerCase() === rawKey.toLowerCase());
        if (hit?.id) {
          return hit;
        }
      }

      return null;
    }

    /**
     * @param {string} skillKey
     * @param {unknown} points
     */
    function accumulateReferencedStatsForAllocatedSkill(skillKey, points) {
      const n = Number(points);
      if (!Number.isFinite(n) || n <= 0) return;
      const row = resolveSkillCatalogRow(skillKey);
      if (!row) return;

      /** @type {string[]} */
      const tokenSources = [];
      const se = row.skillEffect ?? row.skill_effect;
      if (typeof se === 'string' && se) tokenSources.push(se);
      else if (Array.isArray(se) && se.length)
        tokenSources.push(se.map((x) => (x == null ? '' : String(x))).join('\n'));

      if (Array.isArray(row.scalingConstants) && row.scalingConstants.length) {
        for (const sc of row.scalingConstants) {
          const skRaw = sc?.statKey;
          if (skRaw != null && String(skRaw).trim() !== '') {
            const sk = String(skRaw).trim().toLowerCase();
            const direct = resolveCharacterRegistryKey(sk);
            if (direct) out.add(direct);
            if (store) {
              for (const { plannerKey } of getPairedStatRouting(store, sk)) {
                if (plannerKey && getPlannerStatDef(plannerKey)) out.add(plannerKey);
              }
            }
          }
          for (const field of ['value0', 'value1', 'value2', 'value3']) {
            const v = sc?.[field];
            if (typeof v === 'string' && v.includes('{{')) tokenSources.push(v);
          }
        }
      }

      for (const raw of tokenSources) {
        tokenRe.lastIndex = 0;
        let match;
        while ((match = tokenRe.exec(raw)) != null) {
          const key = String(match[1] || '').toLowerCase();
          if (!key) continue;
          const regKey = resolveCharacterRegistryKey(key);
          if (regKey) out.add(regKey);
        }
      }
    }

    for (const [skillName, points] of Object.entries(skillLevels || {})) {
      accumulateReferencedStatsForAllocatedSkill(skillName, points);
    }
    for (const [skillKey, points] of Object.entries(
      oSkillLevels && typeof oSkillLevels === 'object' ? oSkillLevels : {}
    )) {
      accumulateReferencedStatsForAllocatedSkill(skillKey, points);
    }
    return out;
  });

  return { skillReferencedStatKeys };
}
