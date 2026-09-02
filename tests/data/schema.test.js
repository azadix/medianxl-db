import { describe, expect, it } from 'vitest';
import { asText, loadActiveTreeData } from '../helpers/tree-data.js';
import {
  validateSkillCatalogRow,
  validateSubskillCatalogRow,
} from '@/shared/skill-json-validation.js';

const REQUIRED_SKILL_FIELDS = ['id', 'displayName', 'classId'];
const REQUIRED_SUBSKILL_FIELDS = ['id', 'displayName', 'parentSkillId'];
const IMAGE_RE = /^(?:icons|image)-[a-z]+_(?:\d+|missing)$/i;

const data = loadActiveTreeData();
const { skills, subskills, treeStruct, gameMeta, mergedSkills } = data;

describe('skill data schema', () => {
  it('requires core fields on skills and subskills', () => {
    const failures = [];
    for (const row of skills) {
      for (const field of REQUIRED_SKILL_FIELDS) {
        if (row[field] == null || row[field] === '') {
          failures.push(`${row.id ?? '<missing id>'}: missing ${field}`);
        }
      }
    }
    for (const row of subskills) {
      for (const field of REQUIRED_SUBSKILL_FIELDS) {
        if (row[field] == null || row[field] === '') {
          failures.push(`${row.id ?? '<missing id>'}: missing ${field}`);
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('validates skill and subskill catalog row shapes', () => {
    const failures = [];
    for (const row of skills) {
      failures.push(...validateSkillCatalogRow(row));
    }
    for (const row of subskills) {
      failures.push(...validateSubskillCatalogRow(row));
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('keeps string ids unique across skills and subskills', () => {
    const allIds = [...skills, ...subskills].map((r) => r.id);

    const dups = (arr) => {
      const counts = new Map();
      for (const v of arr) {
        if (v == null) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      return [...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k).sort();
    };

    expect(dups(allIds), `duplicate ids: ${dups(allIds).slice(0, 20)}`).toEqual([]);
  });

  it('requires subskill parentSkillId to exist in skills.json', () => {
    const skillIds = new Set(skills.map((r) => r.id));
    const failures = [];
    for (const row of subskills) {
      const parent = row.parentSkillId;
      if (parent == null || String(parent).trim() === '') {
        failures.push(`${row.id}: missing parentSkillId`);
      } else if (!skillIds.has(parent)) {
        failures.push(`${row.id}: parentSkillId '${parent}' not found`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('requires tree_struct layoutParents/prerequisites to reference real skills', () => {
    if (!treeStruct || typeof treeStruct !== 'object') return;
    const skillIds = new Set(skills.map((r) => r.id));
    const failures = [];

    const check = (ref, context) => {
      if (typeof ref !== 'string' || !ref.trim()) return;
      if (!skillIds.has(ref)) failures.push(`${context}: unknown skill id '${ref}'`);
    };

    const isPair = (raw) =>
      Array.isArray(raw) &&
      raw.length >= 2 &&
      typeof raw[0] === 'string' &&
      Number.isFinite(Number(raw[1]));

    const walkSkillLevel = (skillLevel, context) => {
      if (!Array.isArray(skillLevel)) return;
      // Compact single pair: ["id", n]
      if (isPair(skillLevel)) {
        check(skillLevel[0], context);
        return;
      }
      for (const item of skillLevel) {
        if (isPair(item)) {
          check(item[0], context);
        } else if (Array.isArray(item)) {
          // OR group: [["a", n], ["b", n]]
          for (const pair of item) {
            if (isPair(pair)) check(pair[0], context);
          }
        }
      }
    };

    for (const [className, tabs] of Object.entries(treeStruct)) {
      if (!tabs || typeof tabs !== 'object') continue;
      for (const [tabName, tabData] of Object.entries(tabs)) {
        if (!tabData || typeof tabData !== 'object') continue;
        for (const node of tabData.skill_details || []) {
          if (!node || typeof node !== 'object') continue;
          const sid = node.id;
          for (const parent of node.layoutParents || []) {
            check(parent, `${className}/${tabName}/${sid}.layoutParents`);
          }
          walkSkillLevel(
            node.prerequisites?.skill_level,
            `${className}/${tabName}/${sid}.prerequisites.skill_level`
          );
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires every tree_struct skill_details id to exist in skills.json', () => {
    if (!treeStruct || typeof treeStruct !== 'object') return;
    const skillIds = new Set(skills.map((r) => r.id));
    const failures = [];
    for (const [className, tabs] of Object.entries(treeStruct)) {
      if (!tabs || typeof tabs !== 'object') continue;
      for (const [tabName, tabData] of Object.entries(tabs)) {
        if (!tabData || typeof tabData !== 'object') continue;
        for (const node of tabData.skill_details || []) {
          const sid = node?.id;
          if (typeof sid !== 'string' || !sid.trim()) {
            failures.push(`${className}/${tabName}: skill_details entry missing id`);
            continue;
          }
          if (!skillIds.has(sid)) {
            failures.push(`${className}/${tabName}: tree skill '${sid}' not in skills.json`);
          }
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires non-offtree skills.json rows to appear in tree_struct', () => {
    if (!treeStruct || typeof treeStruct !== 'object') return;
    // Shared/catalog rows (oskills, procs, merc skills, etc.) are intentionally off-tree.
    const OFF_TREE_TABS = new Set(['oSkill', 'Proc', 'Mercenary only', 'Passive']);
    const onTree = new Set();
    for (const tabs of Object.values(treeStruct)) {
      if (!tabs || typeof tabs !== 'object') continue;
      for (const tabData of Object.values(tabs)) {
        for (const node of tabData?.skill_details || []) {
          if (typeof node?.id === 'string' && node.id.trim()) onTree.add(node.id);
        }
      }
    }
    const failures = [];
    for (const row of skills) {
      const id = row?.id;
      if (typeof id !== 'string' || !id.trim()) continue;
      if (OFF_TREE_TABS.has(row.tabName)) continue;
      // Shared innate/utility rows under class Other are not tree skills.
      if (row.class === 'Other' || row.classId === 1) continue;
      if (!onTree.has(id)) {
        failures.push(`${id}: in skills.json (${row.class}/${row.tabName}) but missing from tree_struct`);
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('validates image filename shape when set', () => {
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      const image = row.image;
      if (image == null || image === '') continue;
      if (typeof image !== 'string' || !IMAGE_RE.test(image)) {
        failures.push(`${row.id}: invalid image '${image}'`);
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires classId and tab to exist in game_meta', () => {
    const classIds = new Set((gameMeta.classes || []).map((c) => c.id));
    const tabIds = new Set((gameMeta.classTabs || []).map((t) => t.id));
    const failures = [];
    for (const row of skills) {
      if (!classIds.has(row.classId)) {
        failures.push(`${row.id}: classId ${row.classId} not in game_meta classes`);
      }
      if (!tabIds.has(row.tab)) {
        failures.push(`${row.id}: tab ${row.tab} not in game_meta classTabs`);
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires skill tags to exist in game_meta.skilltags', () => {
    const known = new Set((gameMeta.skilltags || []).map((t) => t.name));
    const failures = [];
    for (const row of [...skills, ...subskills]) {
      for (const tag of row.tags || []) {
        if (!known.has(tag)) failures.push(`${row.id}: unknown tag '${tag}'`);
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it('requires paladinDevotionUltimateSkills ids to exist in skills.json', () => {
    const map = gameMeta.paladinDevotionUltimateSkills;
    expect(map && typeof map === 'object', 'missing paladinDevotionUltimateSkills').toBeTruthy();
    const skillIds = new Set(skills.map((r) => r.id));
    const allowed = new Set(['holy', 'neutral', 'unholy']);
    const failures = [];
    for (const [id, devotion] of Object.entries(map)) {
      if (!skillIds.has(id)) {
        failures.push(`paladinDevotionUltimateSkills: unknown skill '${id}'`);
      }
      if (!allowed.has(devotion)) {
        failures.push(`paladinDevotionUltimateSkills['${id}']: invalid devotion '${devotion}'`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('requires balanced {{ }}, [[ ]], and << >> in skill text', () => {
    const failures = [];
    for (const row of mergedSkills) {
      const name = row.display_name || row.name;
      for (const field of ['description', 'skill_effect', 'restriction']) {
        const text = asText(row[field]);
        if ((text.match(/\{\{/g) || []).length !== (text.match(/\}\}/g) || []).length) {
          failures.push(`${name} [${field}]: unbalanced {{ }}`);
        }
        if ((text.match(/\[\[/g) || []).length !== (text.match(/\]\]/g) || []).length) {
          failures.push(`${name} [${field}]: unbalanced [[ ]]`);
        }
        if ((text.match(/<</g) || []).length !== (text.match(/>>/g) || []).length) {
          failures.push(`${name} [${field}]: unbalanced << >>`);
        }
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });
});
