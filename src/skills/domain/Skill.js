
/**
 * Skill class represents one catalog row (skills.json + detail/balance files).
 *
 * @see skill-restrictions.js — first-point allocation rules (classes in skill-allocation-rules.js).
 */

import { getBalanceVersionIdsForFallback } from '@/shared/version-config.js';
import { getFileSkillStore } from '@/shared/skill-data-store.js';
import { MISSING_IMAGE_NAME } from '@/shared/utils.js';
import { checkPrerequisites } from '@/character/planner-prereqs.js';
import { formulaEvaluator } from './formula-evaluator.js';
import { formatScalingValuesToDescriptionHtml } from './scaling-display-html.js';

/** [[internal_name]].{{stat}} in formulas and descriptions (not plain {{stat}} on current skill). */
const CROSS_SKILL_DOT_STAT_PATTERN =
    /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]\.\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/gi;
const MAX_CROSS_SKILL_DEPTH = 12;

/**
 * True if a scaling value is probably display text (monster names, labels), not a mis-typed formula.
 * Used to avoid console warnings when evaluate() hits "undefined variables" on plaintext.
 */
function looksLikePlainTextScalingConstant(s) {
    const t = s.trim();
    if (!t) return false;
    // Avoid treating common formula variables as labels (e.g. "blvl" is a real variable).
    const lower = t.toLowerCase();
    if (
        lower === 'blvl' ||
        lower === 'slvl' ||
        lower === 'lvl' ||
        lower === 'ulvl'
    ) {
        return false;
    }
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(t)) return true;
    if (!/\s/.test(t)) {
        // Slash-separated labels without spaces (e.g. "Attack/Kill/Death"); reject if digits (e.g. "lvl/3").
        if (!/\d/.test(t) && /^[A-Za-z][A-Za-z/'-]+$/.test(t)) return true;
        return false;
    }
    if (/[[\]{}()]/.test(t)) return false;
    // `/` is common in UI labels ("Kill/Death Blow") but was listed here with *+ and wrongly excluded them.
    if (/[+*=<>!]/.test(t)) return false;
    if (/\s-\s/.test(t)) return false;
    const tokens = t.split(/\s+/);
    if (tokens.some((tok) => /^\d+\.?\d*$/.test(tok))) return false;
    return /^[\w\s'\-.,:/]+$/u.test(t);
}

export default class Skill {
    // Skill level constraints
    static MIN_SKILL_LEVEL = 0;
    static MAX_SKILL_LEVEL = 150;
    
    // Max level constraints
    static MIN_BASE_MAX_LEVEL = 0;
    static DEFAULT_BASE_MAX_LEVEL = 1;
    /**
     * Creates a new Skill instance
     * @param {object} data - Skill data object
     * @param {string} data.id - Skill name (internal key)
     * @param {string} data.name - Display name shown to users
     * @param {string} data.class - Class the skill belongs to
     * @param {number} data.classId - Numeric class ID
     * @param {number} data.tab - Numeric tab index
     * @param {string} data.tabName - Human-readable tab name
     * @param {string[]} data.tags - Array of tag strings
     * @param {number} data.row - Grid row position
     * @param {number} data.col - Grid column position
     * @param {string} data.image - Icon filename
     * @param {string|null} data.description - Skill description with placeholders
     * @param {string|null} data.skillEffect - Skill effect text with placeholders
     * @param {string|null} data.restriction - Restriction text with placeholders
     * @param {boolean} data.hasDetails - Whether skill has description/effect
     * @param {number} data.baseMaxLevel - Base maximum level
     * @param {boolean} data.affectedBySpecialization - Whether affected by specialization
     * @param {Array} data.prerequisites - Array of prerequisite objects
     */
    constructor(data) {
        // Required fields
        if (!data.id) throw new Error('Skill ID is required');
        if (!data.name) throw new Error('Skill name is required');
        
        // Core identification
        this.id = data.id;                           // skill name (internal key)
        this.name = data.name;                       // display name shown to users
        
        // Class and tab information
        this.class = data.class || data.class_name || '';    // class name
        this.classId = data.classId || data.class_id;        // numeric class ID
        this.tab = data.tab ?? data.tab_index ?? 0;          // classTabs.id (FK on skill row)
        this.tabName = data.tabName || data.tab_name || '';  // human-readable tab name
        
        // Metadata
        this.tags = data.tags || [];                 // array of tag strings
        this.row = data.row ?? 0;                    // grid row position (0 is valid)
        this.col = data.col ?? 0;                    // grid column position (0 is valid)
        this.image = data.image || MISSING_IMAGE_NAME; // atlas key

        // Subskill metadata (optional; version-specific in skills.json)
        this.parentSkillId = data.parentSkillId != null && String(data.parentSkillId).trim() !== '' ? String(data.parentSkillId).trim() : null;
        
        // Text content
        this.description = data.description || null;     // skill description with placeholders
        this.skillEffect = data.skillEffect || data.skill_effect || null; // skill effect text
        this.restriction = data.restriction || null;     // restriction text with placeholders
        
        // State flags
        this.hasDetails = data.hasDetails || false;      // whether skill has description/effect
        
        // Level and scaling information
        this.baseMaxLevel = data.baseMaxLevel || data.base_max_level || 0;
        this.affectedBySpecialization = data.affectedBySpecialization || data.can_be_enhanced || false;

        // Prerequisites
        this.prerequisites = data.prerequisites || [];
    }

    /**
     * @param {string} refToken - internal skill id
     * @param {number[]} versionIds - balance patches to try by name
     * @returns {{ internalName: string, displayName: string }|null}
     */
    static _resolveCrossSkillRef(refToken, versionIds) {
        const store = getFileSkillStore();
        if (!store) return null;
        return store.resolveCrossSkillRef(refToken, versionIds);
    }

    /**
     * First numeric slot from evaluated scaling row (for formulas).
     * @param {object | null} scaling
     * @returns {number}
     */
    static _primaryNumericFromScalingValues(scaling) {
        if (!scaling) return 0;
        for (const k of ['value0', 'value1', 'value2', 'value3']) {
            const v = scaling[k];
            if (v === '' || v == null) continue;
            const s = String(v).trim();
            if (!s) continue;
            const n = parseFloat(s.replace(/%$/g, ''));
            if (!Number.isNaN(n) && Number.isFinite(n)) return n;
        }
        return 0;
    }

    /**
     * Replace [[ref]].{{stat}} with numeric literals for formula evaluation.
     */
    static async _resolveCrossSkillStatPlaceholdersInFormula(formula, characterState, characterLevel, crossSkillDepth) {
        if (!formula || typeof formula !== 'string') return formula;
        if (crossSkillDepth > MAX_CROSS_SKILL_DEPTH) {
            CROSS_SKILL_DOT_STAT_PATTERN.lastIndex = 0;
            return formula.replace(CROSS_SKILL_DOT_STAT_PATTERN, '0');
        }
        if (!getFileSkillStore() || !characterState) return formula;

        CROSS_SKILL_DOT_STAT_PATTERN.lastIndex = 0;
        const matches = [...formula.matchAll(CROSS_SKILL_DOT_STAT_PATTERN)];
        if (matches.length === 0) return formula;

        const versionIds = getBalanceVersionIdsForFallback();
        let out = formula;
        for (const m of matches) {
            const full = m[0];
            const refToken = m[1];
            const statKey = m[2].toLowerCase();

            const resolved = Skill._resolveCrossSkillRef(refToken, versionIds);
            if (!resolved) {
                out = out.split(full).join('0');
                continue;
            }
            const { internalName } = resolved;
            const blvl = characterState.blvl?.[internalName] ?? 0;
            const slvl = characterState.lvl?.[internalName] ?? 0;
            const refLvl = blvl + slvl;
            if (refLvl < 1) {
                out = out.split(full).join('0');
                continue;
            }
            const other = new Skill({ id: internalName, name: resolved.displayName });
            const scaling = await other.getScalingValues(
                refLvl,
                statKey,
                0,
                characterState,
                characterLevel,
                false,
                crossSkillDepth + 1
            );
            const num = Skill._primaryNumericFromScalingValues(scaling);
            out = out.split(full).join(String(num));
        }
        return out;
    }

    /**
     * Tooltip/description HTML for one [[ref]].{{stat}} token (matches utils styling).
     */
    static _crossSkillScalingToDescriptionHtml(scaling, statKey) {
        return formatScalingValuesToDescriptionHtml(scaling, statKey);
    }

    /**
     * Expand [[ref]].{{stat}} in description/effect text (call before standalone [[ref]] coloring).
     */
    static async expandCrossSkillCompoundPlaceholdersHtml(
        text,
        characterState,
        characterLevel,
        showFormulas,
        crossSkillDepth = 0
    ) {
        if (!text || !characterState || crossSkillDepth > MAX_CROSS_SKILL_DEPTH) return text;
        if (!getFileSkillStore()) return text;

        CROSS_SKILL_DOT_STAT_PATTERN.lastIndex = 0;
        const matches = [...text.matchAll(CROSS_SKILL_DOT_STAT_PATTERN)];
        if (matches.length === 0) return text;

        const versionIds = getBalanceVersionIdsForFallback();
        let out = text;
        for (const m of matches) {
            const full = m[0];
            const refToken = m[1];
            const statKey = m[2].toLowerCase();

            const resolved = Skill._resolveCrossSkillRef(refToken, versionIds);
            if (!resolved) {
                const label = `${refToken}?`;
                out = out.split(full).join(`<span class="has-text-danger">[${label}]</span>`);
                continue;
            }

            const { internalName, displayName } = resolved;
            const blvl = characterState.blvl?.[internalName] ?? 0;
            const slvl = characterState.lvl?.[internalName] ?? 0;
            const refLvl = blvl + slvl;
            if (refLvl < 1) {
                out = out.split(full).join('<span class="has-text-danger">0</span>');
                continue;
            }

            const skill = new Skill({ id: internalName, name: displayName });
            const scaling = await skill.getScalingValues(
                refLvl,
                statKey,
                0,
                characterState,
                characterLevel,
                showFormulas,
                crossSkillDepth + 1
            );
            const html = Skill._crossSkillScalingToDescriptionHtml(scaling, statKey);
            out = out.split(full).join(html);
        }
        return out;
    }

    /**
     * Load balance JSON for this skill into the file store cache.
     */
    async _ensureFileBalance() {
        const s = getFileSkillStore();
        if (s) await s.loadSkillBalance(this.id);
    }

    async hasScalingData() {
        if (!this.id) return false;
        if (!getFileSkillStore()) return false;

        try {
            await this._ensureFileBalance();
            const versionIds = getBalanceVersionIdsForFallback();
            if (versionIds.length === 0) return false;

            const store = getFileSkillStore();
            return store ? store.hasScalingData(this.id, versionIds) : false;
        } catch (error) {
            console.warn('Error checking scaling data for skill:', this.name, error);
            return false;
        }
    }

    /**
     * Get array of levels that have scaling data
     * @returns {number[]} Array of levels with scaling data
     */
    async getAvailableLevels() {
        if (!this.id) return [];
        if (!getFileSkillStore()) return [];

        try {
            await this._ensureFileBalance();
            const versionIds = getBalanceVersionIdsForFallback();
            if (versionIds.length === 0) {
                return [];
            }
            const store = getFileSkillStore();
            return store ? store.getAvailableLevels(this.id, versionIds) : [];
        } catch (error) {
            console.warn('Error getting available levels for skill:', this.name, error);
            return [];
        }
    }

    /**
     * Check if skill prerequisites are met for given character state
     * @param {object} characterState - Character state object
     * @param {object} characterState.skillLevels - Object mapping skill names to current levels
     * @param {Array} characterState.allSkills - Array of all skills for validation
     * @returns {boolean} True if prerequisites are met
     */
    meetsPrerequisites(characterState) {
        const allSkills = characterState?.allSkills || [];
        return checkPrerequisites(this, allSkills).met;
    }

    /**
     * Build variables object for formula evaluation
     * @param {object} characterState - Character state object
     * @param {number} characterLevel - Character level
     * @returns {object} Variables object for formula evaluation
     */
    _buildFormulaVariables(characterState, characterLevel) {
        if (!characterState) return null;
        
        const blvl = characterState.blvl?.[this.id] || 0;
        const slvl = characterState.lvl?.[this.id] || 0; // Soft levels (class/all skills bonuses)
        const lvl = blvl + slvl; // Total effective skill level
        
        // Build variables object
        const variables = {
            // Individual skill values
            blvl: blvl,
            slvl: slvl,
            lvl: lvl,
            ulvl: characterLevel || 1,
            // Full objects for skill references
            _blvl: characterState.blvl, // Full blvl object for skill references
            _lvl: characterState.lvl,   // Full lvl object for skill references (soft-level bonuses)
            // Pass full character state for tree() function
            characterState: characterState
        };
        
        // Note: Character stats are handled via {statName} syntax in formulas
        // They are replaced in FormulaEvaluator.replaceStatReferences()
        
        return variables;
    }

    /**
     * Evaluate a single value if it's a formula
     * @param {string|number|boolean|null|undefined} value - Value to evaluate
     * @param {object} formulaEvaluator - Formula evaluator instance
     * @param {object} variables - Variables for formula evaluation
     * @param {number} crossSkillDepth - recursion guard for cross-skill stat tokens
     * @param {boolean} silentWarn - if true, omit console.warn on evaluation failure
     * @returns {Promise<object>} Result with evaluated value and formula flag
     */
    async _evaluateValue(value, formulaEvaluator, variables, crossSkillDepth = 0, silentWarn = false) {
        // Convert value to string for processing
        let stringValue = value != null ? String(value).trim() : '';
        
        // If no variables or empty value, return as-is
        if (!variables || !stringValue) {
            return { value: stringValue || value, wasFormula: false };
        }
        
        // Check if it's a pure number (not a formula)
        // Use a regex to check if it's ONLY a number (integer or decimal)
        const isPureNumber = /^-?\d+(\.\d+)?$/.test(stringValue);
        if (isPureNumber) {
            // It's a number, return as-is
            return { value: stringValue, wasFormula: false };
        }

        if (looksLikePlainTextScalingConstant(stringValue)) {
            return { value: stringValue, wasFormula: false };
        }

        CROSS_SKILL_DOT_STAT_PATTERN.lastIndex = 0;
        if (getFileSkillStore() && variables.characterState && CROSS_SKILL_DOT_STAT_PATTERN.test(stringValue)) {
            CROSS_SKILL_DOT_STAT_PATTERN.lastIndex = 0;
            stringValue = await Skill._resolveCrossSkillStatPlaceholdersInFormula(
                stringValue,
                variables.characterState,
                variables.ulvl ?? 1,
                crossSkillDepth
            );
        }
        
        // Try to evaluate as formula
        const evalResult = formulaEvaluator.evaluate(stringValue, variables);
        if (evalResult.success) {
            // Format number: remove trailing zeros for whole numbers, preserve decimals otherwise
            const numValue = evalResult.value;
            const formattedValue = Number.isInteger(numValue) ? String(numValue) : String(numValue).replace(/\.?0+$/, '');
            return { value: formattedValue, wasFormula: true };
        }
        
        // Formula evaluation failed, return original value
        // Only warn if it's not an "undefined variables" error for display text (skill names, monster names, etc.)
        if (evalResult.error) {
            const isUndefinedVarError = evalResult.error.includes('undefined variables');
            const treatAsPlainText =
                isUndefinedVarError && looksLikePlainTextScalingConstant(stringValue);

            if (!silentWarn && !treatAsPlainText) {
                console.warn(`Formula evaluation failed for "${stringValue}":`, evalResult.error);
            }
        }
        return { value: stringValue, wasFormula: false };
    }

    /**
     * Process all 4 values (value0-3) for formulas
     * @param {object} result - Result object to modify
     * @param {object} formulaEvaluator - Formula evaluator instance
     * @param {object} variables - Variables for formula evaluation
     */
    async _processValuesForFormulas(result, formulaEvaluator, variables, showFormulas = false, crossSkillDepth = 0) {
        if (!variables || !result) return;
        
        for (const valueKey of ['value0', 'value1', 'value2', 'value3']) {
            const originalValue = result[valueKey];
            // Convert to string if needed, handle null/undefined
            const stringValue = originalValue != null ? String(originalValue).trim() : '';
            
            // Skip if empty
            if (!stringValue) {
                continue;
            }
            
            // Store original formula string before evaluation (for Alt-key display)
            const isPureNumber = /^-?\d+(\.\d+)?$/.test(stringValue);
            if (!isPureNumber && showFormulas) {
                // Store original formula string
                result[`${valueKey}_original`] = stringValue;
            }
            
            const { value, wasFormula } = await this._evaluateValue(
                stringValue,
                formulaEvaluator,
                variables,
                crossSkillDepth,
                false
            );
            
            if (showFormulas && wasFormula) {
                // Keep evaluated number for special calculators (e.g. minion_mana_cost)
                result[`${valueKey}_evaluated`] = value;
                // Show original formula instead of evaluated value
                result[valueKey] = stringValue;
            } else {
                result[valueKey] = value;
            }
            
            if (wasFormula) {
                result[`${valueKey}_formula`] = true;
            }
        }
    }

    /**
     * Query scaling table for level-specific values
     * @param {number} level - Skill level
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats
     * @returns {object | null} Scaling values object or null if not found
     */
    async _getScalingRow(level, statKey, occurrenceIndex, variantKey = null) {
        await this._ensureFileBalance();
        const versionIds = getBalanceVersionIdsForFallback();
        if (versionIds.length === 0) {
            console.warn(`_getScalingRow: No balance version IDs for skill ${this.id}, level ${level}, stat ${statKey}`);
            return null;
        }

        const store = getFileSkillStore();
        if (!store) return null;
        return store.findScalingRow(
            this.id,
            versionIds,
            level,
            statKey,
            occurrenceIndex,
            variantKey
        );
    }

    /**
     * Query constants table for constant values
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats
     * @returns {object | null} Constant values object or null if not found
     */
    async _getConstantsRow(statKey, occurrenceIndex, variantKey = null) {
        await this._ensureFileBalance();
        const versionIds = getBalanceVersionIdsForFallback();
        if (versionIds.length === 0) {
            console.warn(`_getConstantsRow: No balance version IDs for skill ${this.id}`);
            return null;
        }

        const store = getFileSkillStore();
        if (!store || !store.getStatByKeyLower(statKey)) return null;
        return store.findConstantsRow(this.id, versionIds, statKey, occurrenceIndex, variantKey);
    }

    /**
     * Merge constant values with scaling values
     * @param {object} result - Current result object
     * @param {object} constantValues - Constant values from skill data
     * @param {object} formulaEvaluator - Formula evaluator instance
     * @param {object} variables - Variables for formula evaluation
     * @returns {Promise<object>} Merged result object
     */
    async _mergeConstants(result, constantValues, formulaEvaluator, variables, showFormulas = false, crossSkillDepth = 0) {
        if (!constantValues) return result;
        
        if (!result) {
            // Create new result with empty values, not '???' - let constants populate them
            result = { 
                statName: constantValues.statName, 
                format: constantValues.format,
                signed: constantValues.signed,
                value0: null, value1: null, value2: null, value3: null,
                value0_constant: false, value1_constant: false, value2_constant: false, value3_constant: false
            };
        }

        // Keep optional metadata from scaling/constants rows (used by specialized tooltip calculators).
        for (const key of [
            'minCharacterLevel',
            'signed',
        ]) {
            if (Object.prototype.hasOwnProperty.call(constantValues, key)) {
                result[key] = constantValues[key];
            }
        }
        
        // Process each constant value
        // If valueX_constant flag is 1, use constant value and evaluate formulas
        // If flag is 0 but value exists and looks like a formula, still evaluate it
        for (const valueKey of ['value0', 'value1', 'value2', 'value3']) {
            const constantKey = `${valueKey}_constant`;
            const constantValue = constantValues[valueKey];
            const isConstantFlag = constantValues[constantKey];
            
            // Convert to string if needed, handle null/undefined
            const stringValue = constantValue != null ? String(constantValue).trim() : '';
            
            // If constant flag is set, process this value
            if (isConstantFlag) {
                if (stringValue) {
                    const { value, wasFormula } = await this._evaluateValue(
                        stringValue,
                        formulaEvaluator,
                        variables,
                        crossSkillDepth,
                        false
                    );
                    
                    if (showFormulas && wasFormula) {
                        result[`${valueKey}_evaluated`] = value;
                        // Show original formula instead of evaluated value
                        result[valueKey] = stringValue;
                    } else {
                        // Format numeric values: remove trailing zeros for whole numbers
                        const numValue = Number(value);
                        if (!isNaN(numValue) && isFinite(numValue)) {
                            result[valueKey] = Number.isInteger(numValue) ? String(numValue) : String(numValue).replace(/\.?0+$/, '');
                        } else {
                            result[valueKey] = value;
                        }
                    }
                    result[constantKey] = true;
                    if (wasFormula) {
                        result[`${valueKey}_formula`] = true;
                    }
                } else {
                    // Empty constant value - mark as constant with empty value so it shows as ???
                    // Only set if result doesn't already have a value (don't override scaling values)
                    if (!result[valueKey] || result[valueKey] === null) {
                        result[valueKey] = '';
                    }
                    result[constantKey] = true;
                }
            } else if (stringValue) {
                // Flag is 0, but value exists - check if we should use it
                // Only use if result doesn't have this value yet (don't override scaling values)
                if (!result[valueKey] || result[valueKey] === null) {
                    // Check if it looks like a formula and evaluate it (skip slash-separated labels etc.)
                    const looksLikeFormula =
                        !looksLikePlainTextScalingConstant(stringValue) &&
                        /[a-zA-Z_]+|\+|-|\*|\//.test(stringValue);
                    if (looksLikeFormula && variables) {
                        const { value, wasFormula } = await this._evaluateValue(
                            stringValue,
                            formulaEvaluator,
                            variables,
                            crossSkillDepth,
                            false
                        );
                        
                        if (wasFormula || (!isNaN(stringValue) && stringValue !== '')) {
                            if (showFormulas && wasFormula) {
                                result[`${valueKey}_evaluated`] = value;
                                // Show original formula instead of evaluated value
                                result[valueKey] = stringValue;
                            } else {
                                // Format numeric values: remove trailing zeros for whole numbers
                                const numValue = Number(value);
                                if (!isNaN(numValue) && isFinite(numValue)) {
                                    result[valueKey] = Number.isInteger(numValue) ? String(numValue) : String(numValue).replace(/\.?0+$/, '');
                                } else {
                                    result[valueKey] = value;
                                }
                            }
                            if (wasFormula) {
                                result[`${valueKey}_formula`] = true;
                            }
                        }
                    } else if (!isNaN(stringValue) && stringValue !== '') {
                        // It's a number, use it
                        result[valueKey] = stringValue;
                    } else if (stringValue) {
                        // Even if not a formula, if it's a string value, use it
                        result[valueKey] = stringValue;
                    }
                }
            }
        }
        
        return result;
    }

    /**
     * Get scaling values for a specific stat at a given level
     * @param {number} level - Skill level
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats (default: 0)
     * @returns {object | null} Scaling values object or null if not found
     */
    async getScalingValues(
        level,
        statKey,
        occurrenceIndex = 0,
        characterState = null,
        characterLevel = null,
        showFormulas = false,
        crossSkillDepth = 0,
        variantKey = null
    ) {
        if (!this.id || !statKey) {
            return null;
        }
        if (!getFileSkillStore()) {
            return null;
        }

        try {
            const baseVariables = this._buildFormulaVariables(characterState, characterLevel);
            const variables = baseVariables;
            
            // Get level-specific values
            let result = await this._getScalingRow(level, statKey, occurrenceIndex, variantKey);

            // Get and merge constant values (constants might have formulas too).
            // minCharacterLevel on a row is enforced only in planner stat aggregation
            // (recomputePlannerStatsFromSkillAllocations), not here, so tooltips and formulas always resolve.
            const constantValues = await this._getConstantsRow(statKey, occurrenceIndex, variantKey);

            if (constantValues) {
                result = await this._mergeConstants(
                    result,
                    constantValues,
                    formulaEvaluator,
                    variables,
                    showFormulas,
                    crossSkillDepth
                );
            }
            
            // Evaluate formulas in ALL values (scaling + constants) if character state available
            // Do this AFTER merging constants so we evaluate all formulas, including those in constants
            if (result && variables) {
                await this._processValuesForFormulas(
                    result,
                    formulaEvaluator,
                    variables,
                    showFormulas,
                    crossSkillDepth
                );
            }
            
            return result;
        } catch (error) {
            console.warn('[getScalingValues] Error getting scaling values for skill:', this.name, error);
            console.error(error);
            return null;
        }
    }

    /**
     * Check if skill has a specific tag
     * @param {string} tagName - Tag name to check for
     * @returns {boolean} True if skill has the tag
     */
    hasTag(tagName) {
        return this.tags.includes(tagName);
    }


    /**
     * Validate if a skill level is within valid range
     * @param {number} level - Level to validate
     * @returns {boolean} True if valid
     */
    static isValidSkillLevel(level) {
        return !isNaN(level) && level >= Skill.MIN_SKILL_LEVEL && level <= Skill.MAX_SKILL_LEVEL;
    }

    /**
     * Clamp a skill level to valid range
     * @param {number} level - Level to clamp
     * @returns {number} Clamped level
     */
    static clampSkillLevel(level) {
        if (isNaN(level)) return Skill.MIN_SKILL_LEVEL;
        return Math.max(Skill.MIN_SKILL_LEVEL, Math.min(Skill.MAX_SKILL_LEVEL, level));
    }

    /**
     * Validate if a base max level is within valid range
     * @param {number} level - Level to validate
     * @returns {boolean} True if valid
     */
    static isValidBaseMaxLevel(level) {
        return !isNaN(level) && level >= Skill.MIN_BASE_MAX_LEVEL;
    }

    /**
     * Create a copy of this skill instance
     * @returns {Skill} New Skill instance with same data
     */
    clone() {
        return new Skill({
            id: this.id,
            name: this.name,
            class: this.class,
            classId: this.classId,
            tab: this.tab,
            tabName: this.tabName,
            tags: [...this.tags],
            row: this.row,
            col: this.col,
            image: this.image,
            parentSkillId: this.parentSkillId,
            description: this.description,
            skillEffect: this.skillEffect,
            restriction: this.restriction,
            hasDetails: this.hasDetails,
            baseMaxLevel: this.baseMaxLevel,
            affectedBySpecialization: this.affectedBySpecialization,
            prerequisites: [...this.prerequisites],
        });
    }

    /**
     * Factory method to create Skill from a catalog row shape (legacy SQL row field names).
     * @param {object} row - Row-like object (`name`, `display_name`, etc.)
     * @returns {Skill} New Skill instance
     */
    static fromCatalogRow(row) {
        return new Skill({
            id: row.name,
            name: row.display_name,
            class: row.class_name || '',
            classId: row.class_id,
            tab: row.tab_index,
            tabName: row.tab_name || '',
            tags: row.tags ? row.tags.split(', ') : [],
            row: row.row,
            col: row.col,
            image: row.image || MISSING_IMAGE_NAME,
            parentSkillId: row.parentSkillId ?? row.parent_skill_id ?? null,
            description: row.description || null,
            skillEffect: row.skill_effect || null,
            restriction: row.restriction || null,
            hasDetails: (row.description && row.description.trim().length > 0) || 
                       (row.skill_effect && row.skill_effect.trim().length > 0),
            baseMaxLevel: row.base_max_level || 0,
            affectedBySpecialization: row.affected_by_specialization === 1,
            prerequisites: row.prerequisites ? row.prerequisites.split('; ').filter(p => p.trim()) : []
        });
    }

}
