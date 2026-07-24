import { describe, expect, it } from 'vitest';
import { asText, loadActiveTreeData } from '../helpers/tree-data.js';

const REQUIRED_SKILL_FIELDS = ['id', 'numericId', 'displayName', 'classId'];
const REQUIRED_SUBSKILL_FIELDS = ['id', 'numericId', 'displayName', 'parentSkillId'];
const IMAGE_RE = /^.+\.(png|webp)$/i;

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

  it('keeps string ids unique across catalog; numericIds unique in skills.json', () => {
    const allIds = [...skills, ...subskills].map((r) => r.id);
    const skillNumeric = skills.map((r) => r.numericId);
    const subIds = subskills.map((r) => r.id);

    const dups = (arr) => {
      const counts = new Map();
      for (const v of arr) {
        if (v == null) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      return [...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k).sort();
    };

    expect(dups(allIds), `duplicate ids: ${dups(allIds).slice(0, 20)}`).toEqual([]);
    expect(
      dups(skillNumeric),
      `duplicate skills.json numericIds: ${dups(skillNumeric).slice(0, 20)}`
    ).toEqual([]);
    expect(dups(subIds), `duplicate subskill ids: ${dups(subIds).slice(0, 20)}`).toEqual([]);
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
          const skillLevel = node.prerequisites?.skill_level;
          if (Array.isArray(skillLevel)) {
            for (let i = 0; i < skillLevel.length; i += 2) {
              check(skillLevel[i], `${className}/${tabName}/${sid}.prerequisites.skill_level`);
            }
          }
        }
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

  it('requires balanced {{ }} and [[ ]] in skill text', () => {
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
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });
});
