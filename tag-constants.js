/**
 * Skill Tag Group Constants
 * Shared across the application for consistent tag categorization
 */

export const TAG_GROUPS = {
    "Skill Category": [8, 9, 11, 12, 14, 15, 16, 17, 22, 25, 26, 27, 28, 29, 32, 35, 36],
    "Damage": [1, 2, 3, 4, 5, 6, 7, 21, 23],
    "Summon": [13, 30, 31],
    "Teleport": [10, 20, 24],
    "Modifier": [19, 18]
};

// Export individual groups for convenience
export const SKILL_CATEGORY_TAG_IDS = TAG_GROUPS["Skill Category"];
export const DAMAGE_TAG_IDS = TAG_GROUPS["Damage"];
export const SUMMON_TAG_IDS = TAG_GROUPS["Summon"];
export const TELEPORT_TAG_IDS = TAG_GROUPS["Teleport"];
export const MODIFIER_TAG_IDS = TAG_GROUPS["Modifier"];

