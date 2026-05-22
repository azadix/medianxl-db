/**
 * Skill UI variants (stance, class-specific preview, etc.): selection state + tree_data helpers.
 */
import { getFileSkillStore } from './skill-data-store.js';

const selectedVariantBySkillName = new Map();

export function getSkillVariantKey(skillName) {
    return selectedVariantBySkillName.get(skillName) ?? null;
}

export function setSkillVariantKey(skillName, variantKey) {
    if (variantKey == null || variantKey === '') {
        selectedVariantBySkillName.delete(skillName);
    } else {
        selectedVariantBySkillName.set(skillName, variantKey);
    }
}

export function clearSkillVariants() {
    selectedVariantBySkillName.clear();
}

/**
 * Apply default variant keys for the current class from game_meta.skillVariantDefaultsByClass.
 * Shape: { "Necromancer": { "endurance": "necromancer" }, ... } — skill internal id -> variant_key.
 * Call after {@link clearSkillVariants} on class change, or when entering the planner / loading a build.
 * @param {string|null|undefined} className - Must match game_meta.classes[].name (e.g. "Necromancer")
 */
export function applySkillVariantDefaultsForClass(className) {
    if (className == null || String(className).trim() === '') return;
    const store = getFileSkillStore();
    const raw = store?.gameMeta?.skillVariantDefaultsByClass;
    if (!raw || typeof raw !== 'object') return;
    const perClass = raw[String(className)];
    if (!perClass || typeof perClass !== 'object') return;

    for (const [skillId, variantKey] of Object.entries(perClass)) {
        const sid = String(skillId).trim();
        if (!sid) continue;
        if (variantKey == null || String(variantKey).trim() === '') {
            setSkillVariantKey(sid, null);
            continue;
        }
        const vk = String(variantKey).trim();
        const cat = store.catalogByInternalId?.get(sid);
        const numericId = cat?.numericId;
        if (numericId == null) continue;
        const variants = listSkillVariants(numericId);
        if (!variants.some((variant) => variant.variant_key === vk)) continue;
        setSkillVariantKey(sid, vk);
    }
}

/**
 * @param {number} numericId - catalog `numericId` (skills.json id)
 * @returns {Array<{ variant_key: string, label: string, sort_order: number }>}
 */
export function listSkillVariants(numericId) {
    if (numericId == null) return [];
    const store = getFileSkillStore();
    const internal = store?.internalNameByNumericId?.(numericId);
    if (!internal) return [];
    const row = store.catalogByInternalId?.get(String(internal));
    const list = row?.variants;
    if (!Array.isArray(list) || list.length === 0) return [];
    return list.map((v) => ({
        variant_key: v.variant_key,
        label: v.label,
        sort_order: v.sort_order
    }));
}

/**
 * Active variant from DOM dataset or in-memory selection ({@link getSkillVariantKey}).
 * @param {string} skillName - internal skill id for stored variant key
 * @param {HTMLElement|null} skillCardEl - skill card; may carry data-skill-variant
 * @returns {string|null} variant_key for scaling + text overrides
 */
export function resolveVariantKeyForTooltip(skillName, skillCardEl) {
    const dk = skillCardEl?.dataset?.skillVariant;
    if (dk != null && String(dk).trim() !== '') {
        return String(dk).trim();
    }
    const stored = getSkillVariantKey(skillName);
    if (stored) return stored;
    // No implicit first variant: default scaling/text is base skill row (variant_key null in data).
    return null;
}

function escapeHtmlAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Brackets suffix e.g. " [Necromancer]" when a non-default variant is active.
 * Default variant: no suffix (plain skill name only).
 * @param {string|null|undefined} variantKey active key, or null/'' for default
 * @param {Array<{ variant_key: string, label: string }>|null|undefined} variants
 * @returns {string} plain text suffix (may be empty)
 */
export function variantBracketSuffixFromList(variantKey, variants) {
    if (!variants || variants.length === 0) return '';
    if (variantKey == null || variantKey === '') return '';
    const row = variants.find((variant) => variant.variant_key === variantKey);
    const inner = row ? row.label : String(variantKey);
    return ` [${inner}]`;
}

/**
 * Skill name + optional muted bracket suffix for tooltip HTML.
 * @param {string} displayName
 * @param {number} numericId - catalog `numericId` for variant list lookup
 * @param {string|null|undefined} variantKey
 * @returns {string} HTML string
 */
export function formatDisplayNameWithVariantHtml(displayName, numericId, variantKey) {
    const variants = listSkillVariants(numericId);
    const suf = variantBracketSuffixFromList(variantKey, variants);
    const base = escapeHtmlAttr(displayName);
    if (!suf) return base;
    return `${base}<span class="has-text-grey">${escapeHtmlAttr(suf)}</span>`;
}
