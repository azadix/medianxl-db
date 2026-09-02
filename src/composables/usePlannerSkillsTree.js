import { computed, watch } from 'vue';
import { usePlannerStore } from '@/stores/planner.js';
import {
  buildPlannerSkillCardData,
  updateTabColors,
  getSkillIcon
} from '@/tree/tree-render.js';
import { listSkillVariants } from '@/tree/skill-variants.js';
import { addOverlayArrows } from '@/tree/tree-arrows.js';
import { isInnateSkill } from '@/skills/domain/skill-skill-types.js';
import {
  changeOSkillPoints,
  getSkillPoints,
  getOSkillRowsForPlanner,
  hasAnyOSkillAllocations
} from '@/character/planner-core.js';
import { enrichOskillForDisplay } from '@/tree/tree-render.js';

const OSKILL_COLS = 3;

/**
 * @param {object} opts
 * @param {import('vue').Ref<object|null>} opts.payload planner render payload
 * @param {import('vue').ComputedRef<Array>} opts.classSkills skills for selected class
 * @param {import('vue').Ref<string>} opts.activeTab
 * @param {(tabName: string) => { minRow: number, maxRow: number, minCol: number, maxCol: number }} opts.gridRange
 */
export function usePlannerSkillsTree({ payload, classSkills, activeTab, gridRange }) {
  const store = usePlannerStore();

  function cardDataForSkill(skill) {
    store.revision;
    const list = payload.value?.skillsList || [];
    let variants = [];
    try {
      variants = skill.id ? listSkillVariants(skill.id) : [];
    } catch (e) {
      console.warn('[PlannerSkillsTree] listSkillVariants', skill?.id, e);
    }
    try {
      if (isInnateSkill(skill)) {
        return {
          skillId: skill.id,
          classId: skill.classId,
          displayName: skill.name,
          iconHTML: getSkillIcon(skill.image, skill.class),
          hasDescription: skill.hasDetails || false,
          currentPoints: 1,
          maxPoints: 1,
          canAllocate: false,
          restrictions: [],
          isInnate: true,
          variants: []
        };
      }
      const data = buildPlannerSkillCardData(skill, {
        skillType: 'regular',
        allSkills: list,
        getIconFn: getSkillIcon
      });
      data.variants = variants;
      return data;
    } catch (e) {
      console.warn('[PlannerSkillsTree] cardDataForSkill', skill?.id, e);
      return {
        skillId: skill.id,
        classId: skill.classId,
        displayName: skill.name || String(skill.id),
        iconHTML: '',
        hasDescription: false,
        currentPoints: 0,
        maxPoints: 1,
        canAllocate: false,
        restrictions: [],
        isInnate: false,
        variants: []
      };
    }
  }

  const oskillCardRows = computed(() => {
    store.revision;
    const out = [];
    const rows = getOSkillRowsForPlanner();
    for (const rawRow of rows) {
      const enriched = enrichOskillForDisplay(rawRow);
      out.push(
        buildPlannerSkillCardData(enriched, {
          skillType: 'oskill',
          allSkills: [],
          getIconFn: getSkillIcon
        })
      );
    }
    return out;
  });

  const oskillGridStyle = computed(() => {
    const n = oskillCardRows.value.length;
    if (n === 0) return {};
    const rows = Math.ceil(n / OSKILL_COLS);
    return {
      gridTemplateRows: `repeat(${rows}, auto)`,
      gridTemplateColumns: `repeat(${OSKILL_COLS}, 1fr)`
    };
  });

  function oskillGridArea(index) {
    const row = Math.floor(index / OSKILL_COLS) + 1;
    const col = (index % OSKILL_COLS) + 1;
    return {
      gridRow: row,
      gridColumn: col
    };
  }

  function oskillIdentifier(cardData) {
    return cardData.variantStateKey ?? cardData.skillId;
  }

  function onOskillPlus(cardData, delta) {
    changeOSkillPoints(oskillIdentifier(cardData), delta);
  }

  function onOskillMinus(cardData, delta) {
    changeOSkillPoints(oskillIdentifier(cardData), delta);
  }

  function scheduleArrows() {
    if (!payload.value) return;
    const tab = activeTab.value;
    if (!tab || tab === 'oSkills') return;
    const grid = document.getElementById(`tab-${tab}`);
    if (!grid) return;
    const tabSkills = classSkills.value.filter((s) => s.tabName === tab);
    if (!tabSkills.length) return;
    const g = gridRange(tab);
    grid.querySelectorAll('.overlay-arrow').forEach((a) => a.remove());
    setTimeout(() => {
      try {
        const rect = grid.getBoundingClientRect();
        // Tree pane may be display:none (Items/Other); skip until layout exists.
        if (rect.width < 1 || rect.height < 1) return;
        addOverlayArrows(grid, tabSkills, g.minRow, g.minCol);
      } catch (e) {
        console.warn('[PlannerSkillsTree] addOverlayArrows', e);
      }
    }, 80);
  }

  const tabsWithPoints = computed(() => {
    store.revision;
    const s = new Set();
    if (!payload.value) return s;
    const list = payload.value.skillsList;
    const sel = payload.value.selectedClass;
    for (const skill of list) {
      if (skill.class !== sel) continue;
      if (getSkillPoints(skill.id) > 0 && skill.tabName) {
        s.add(skill.tabName);
      }
    }
    if (hasAnyOSkillAllocations()) s.add('oSkills');
    return s;
  });

  watch(
    tabsWithPoints,
    (set) => {
      try {
        updateTabColors(set);
      } catch (e) {
        console.warn('[PlannerSkillsTree] updateTabColors', e);
      }
    },
    { flush: 'post' }
  );

  return {
    cardDataForSkill,
    oskillCardRows,
    oskillGridStyle,
    oskillGridArea,
    oskillIdentifier,
    onOskillPlus,
    onOskillMinus,
    scheduleArrows
  };
}
