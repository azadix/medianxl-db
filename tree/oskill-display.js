import { getFileSkillStore } from './skill-data-store.js';

/**
 * Enrich a raw oSkill row (from character state) for buildOSkillCardData.
 * Mirrors tree-core createOSkillCard lookup logic.
 */
export function enrichOskillForDisplay(oskill) {
  if (oskill.displayName && oskill.image) {
    return oskill;
  }
  const store = getFileSkillStore();
  let det = null;
  let nid = null;
  let internal = null;
  if (oskill.skillId) {
    internal = store?.internalNameByNumericId(oskill.skillId);
    nid = oskill.skillId;
    if (internal) det = store.getSkillDetail(internal);
  } else if (oskill.skillName) {
    internal = oskill.skillName;
    det = store?.getSkillDetail(internal);
    nid = det?.numericId ?? null;
  }
  if (det && internal) {
    return {
      numericId: nid,
      skillId: oskill.skillId ?? nid,
      skillName: oskill.skillName || internal,
      points: oskill.points,
      displayName: det.display_name || internal,
      image: det.image || 'icons-shared_missing.png',
      className: det.className || 'Other',
      hasDetails: true,
      description: det.description,
    };
  }
  return {
    skillId: oskill.skillId,
    skillName: oskill.skillName,
    points: oskill.points,
    displayName: oskill.skillName || `Skill ${oskill.skillId}`,
    image: 'icons-shared_missing.png',
    className: 'Other',
    hasDetails: false,
  };
}
