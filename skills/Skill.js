
/**
 * Skill class represents a skill in the Median XL database
 * 
 * This class encapsulates skill data and provides helper methods for common operations.
 * It focuses on data representation and business logic, keeping database operations 
 * and rendering separate.
 * 
 * @example
 * // Create from database row
 * const skill = Skill.fromDatabaseRow(dbRow);
 * 
 * // Create from plain object
 * const skill = Skill.fromPlainObject(skillData);
 */

// Import version config functions - will be dynamically imported when needed
// to avoid circular dependencies
let getCurrentVersionIdCache = null;
let importPromise = null;

// Async version for cases where we need to ensure the import has completed
async function getVersionIdFnAsync(db) {
    if (!getCurrentVersionIdCache) {
        if (!importPromise) {
            importPromise = import('../version-config.js').then(versionConfig => {
                getCurrentVersionIdCache = versionConfig.getCurrentVersionId;
                return versionConfig.getCurrentVersionId;
            });
        }
        await importPromise;
    }
    if (!getCurrentVersionIdCache) {
        console.error('Failed to load getCurrentVersionId from version-config.js');
        return null;
    }
    return getCurrentVersionIdCache(db);
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
     * @param {Object} data - Skill data object
     * @param {string} data.id - Skill name (internal key)
     * @param {number} data.skillId - Numeric database ID
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
     * @param {boolean} data.canAddPoints - Whether points can be added to this skill
     * @param {Array} data.prerequisites - Array of prerequisite objects
     */
    constructor(data) {
        // Required fields
        if (!data.id) throw new Error('Skill ID is required');
        if (!data.name) throw new Error('Skill name is required');
        
        // Core identification
        this.id = data.id;                           // skill name (internal key)
        this.skillId = data.skillId || data.dbId;    // numeric database ID
        this.dbId = this.skillId;                    // alias for backward compatibility
        this.name = data.name;                       // display name shown to users
        
        // Class and tab information
        this.class = data.class || data.class_name || '';    // class name
        this.classId = data.classId || data.class_id;        // numeric class ID
        this.tab = data.tab || data.tab_index;               // numeric tab index
        this.tabName = data.tabName || data.tab_name || '';  // human-readable tab name
        
        // Metadata
        this.tags = data.tags || [];                 // array of tag strings
        this.row = data.row || 0;                    // grid row position
        this.col = data.col || 0;                    // grid column position
        this.image = data.image || 'icons-shared_missing.png'; // icon filename
        
        // Text content
        this.description = data.description || null;     // skill description with placeholders
        this.skillEffect = data.skillEffect || data.skill_effect || null; // skill effect text
        this.restriction = data.restriction || null;     // restriction text with placeholders
        
        // State flags
        this.hasDetails = data.hasDetails || false;      // whether skill has description/effect
        
        // Level and scaling information
        this.baseMaxLevel = data.baseMaxLevel || data.base_max_level || 0;
        this.affectedBySpecialization = data.affectedBySpecialization || data.can_be_enhanced || false;
        this.canAddPoints = data.canAddPoints || data.can_add_points !== false; // default true
        
        // Prerequisites
        this.prerequisites = data.prerequisites || [];
    }

    /**
     * Check if this skill has scaling data in the database
     * @param {Object} db - Database instance
     * @returns {boolean} True if scaling data exists
     */
    async hasScalingData(db) {
        if (!db || !this.skillId) return false;
        
        try {
            const versionId = await getVersionIdFnAsync(db);
            if (!versionId) return false;
            
            const stmt = db.prepare('SELECT COUNT(*) FROM skill_scaling WHERE skill_id = ? AND version_id = ?');
            stmt.bind([this.skillId, versionId]);
            const count = stmt.step() ? stmt.get()[0] : 0;
            stmt.free();
            return count > 0;
        } catch (error) {
            console.warn('Error checking scaling data for skill:', this.name, error);
            return false;
        }
    }

    /**
     * Get array of levels that have scaling data
     * @param {Object} db - Database instance
     * @returns {number[]} Array of levels with scaling data
     */
    async getAvailableLevels(db) {
        if (!db || !this.skillId) return [];
        
        try {
            const versionId = await getVersionIdFnAsync(db);
            if (!versionId) return [];
            
            const stmt = db.prepare('SELECT DISTINCT level FROM skill_scaling WHERE skill_id = ? AND version_id = ? ORDER BY level');
            stmt.bind([this.skillId, versionId]);
            const levels = [];
            while (stmt.step()) {
                levels.push(stmt.get()[0]);
            }
            stmt.free();
            return levels;
        } catch (error) {
            console.warn('Error getting available levels for skill:', this.name, error);
            return [];
        }
    }

    /**
     * Check if skill prerequisites are met for given character state
     * @param {Object} characterState - Character state object
     * @param {Object} characterState.skillLevels - Object mapping skill names to current levels
     * @param {Array} characterState.allSkills - Array of all skills for validation
     * @returns {boolean} True if prerequisites are met
     */
    meetsPrerequisites(characterState) {
        if (!this.prerequisites || this.prerequisites.length === 0) {
            return true;
        }
        
        // Basic prerequisite checking - for full validation, use the existing checkPrerequisites function
        // This is a simplified version that just checks if prerequisites exist
        const { skillLevels = {}, allSkills = [] } = characterState;
        
        // Check if any prerequisites exist that would block the skill
        for (const prereq of this.prerequisites) {
            const [type, value, target] = prereq.split(':');
            
            if (type === 'skill_level') {
                const requiredLevel = parseInt(value, 10);
                const currentLevel = skillLevels[target] || 0;
                if (currentLevel < requiredLevel) {
                    return false;
                }
            } else if (type === 'skill_blocked_by') {
                const maxAllowedPoints = parseInt(value, 10);
                const currentPoints = skillLevels[target] || 0;
                if (currentPoints > maxAllowedPoints) {
                    return false;
                }
            }
            // Note: For full validation including tree_points, character_level, etc.,
            // use the existing checkPrerequisites function from character-state.js
        }
        
        return true;
    }

    /**
     * Build variables object for formula evaluation
     * @param {Object} characterState - Character state object
     * @param {number} characterLevel - Character level
     * @returns {Object} Variables object for formula evaluation
     */
    _buildFormulaVariables(characterState, characterLevel) {
        if (!characterState) return null;
        
        const blvl = characterState.blvl?.[this.id] || 0;
        const slvl = characterState.lvl?.[this.id] || 0; // All skills bonus
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
            _lvl: characterState.lvl,   // Full lvl object for skill references (All Skills bonus)
            // Pass full character state for tree() function
            characterState: characterState
        };
        
        // Note: Character stats are handled via {statName} syntax in formulas
        // They are replaced in FormulaEvaluator.replaceStatReferences()
        
        return variables;
    }

    /**
     * Evaluate a single value if it's a formula
     * @param {*} value - Value to evaluate
     * @param {Object} formulaEvaluator - Formula evaluator instance
     * @param {Object} variables - Variables for formula evaluation
     * @returns {Object} Result with evaluated value and formula flag
     */
    _evaluateValue(value, formulaEvaluator, variables) {
        // Convert value to string for processing
        const stringValue = value != null ? String(value).trim() : '';
        
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
        
        // Try to evaluate as formula
        const evalResult = formulaEvaluator.evaluate(stringValue, variables);
        if (evalResult.success) {
            // Format number: remove trailing zeros for whole numbers, preserve decimals otherwise
            const numValue = evalResult.value;
            const formattedValue = Number.isInteger(numValue) ? String(numValue) : String(numValue).replace(/\.?0+$/, '');
            return { value: formattedValue, wasFormula: true };
        }
        
        // Formula evaluation failed, return original value
        // Only warn if it's not an "undefined variables" error for what looks like a skill name
        // (skill names typically start with capital letters and aren't valid formula variables)
        if (evalResult.error) {
            const isUndefinedVarError = evalResult.error.includes('undefined variables');
            const looksLikeSkillName = /^[A-Z][a-zA-Z0-9_]*$/.test(stringValue.trim());
            
            // Suppress warnings for skill names that aren't properly formatted as [[skill_name]]
            if (!(isUndefinedVarError && looksLikeSkillName)) {
                console.warn(`Formula evaluation failed for "${stringValue}":`, evalResult.error);
            }
        }
        return { value: stringValue, wasFormula: false };
    }

    /**
     * Process all 4 values (value0-3) for formulas
     * @param {Object} result - Result object to modify
     * @param {Object} formulaEvaluator - Formula evaluator instance
     * @param {Object} variables - Variables for formula evaluation
     */
    _processValuesForFormulas(result, formulaEvaluator, variables, showFormulas = false) {
        if (!variables || !result) return;
        
        ['value0', 'value1', 'value2', 'value3'].forEach(valueKey => {
            const originalValue = result[valueKey];
            // Convert to string if needed, handle null/undefined
            const stringValue = originalValue != null ? String(originalValue).trim() : '';
            
            // Skip if empty
            if (!stringValue) {
                return;
            }
            
            // Store original formula string before evaluation (for Alt-key display)
            const isPureNumber = /^-?\d+(\.\d+)?$/.test(stringValue);
            if (!isPureNumber && showFormulas) {
                // Store original formula string
                result[`${valueKey}_original`] = stringValue;
            }
            
            const { value, wasFormula } = this._evaluateValue(
                stringValue, 
                formulaEvaluator, 
                variables
            );
            
            if (showFormulas && wasFormula) {
                // Show original formula instead of evaluated value
                result[valueKey] = stringValue;
            } else {
                result[valueKey] = value;
            }
            
            if (wasFormula) {
                result[`${valueKey}_formula`] = true;
            }
        });
    }

    /**
     * Query scaling table for level-specific values
     * @param {Object} db - Database instance
     * @param {number} level - Skill level
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats
     * @returns {Object|null} Scaling values object or null if not found
     */
    async _getScalingRow(db, level, statKey, occurrenceIndex) {
        const versionId = await getVersionIdFnAsync(db);
        if (!versionId) {
            console.warn(`_getScalingRow: No version ID found for skill ${this.skillId}, level ${level}, stat ${statKey}`);
            return null;
        }
        
        const scalingStmt = db.prepare(`
            SELECT ss.value0, ss.value1, ss.value2, ss.value3, s.name as stat_name, s.format
            FROM skill_scaling ss
            JOIN stats s ON s.id = ss.stat_id
            WHERE ss.skill_id = ? AND ss.level = ? AND LOWER(s.key) = ? AND ss.occurrence_index = ? AND ss.version_id = ?
        `);
        scalingStmt.bind([this.skillId, level, statKey.toLowerCase(), occurrenceIndex, versionId]);
        
        let result = null;
        if (scalingStmt.step()) {
            const [value0, value1, value2, value3, statName, format] = scalingStmt.get();
            result = { 
                value0: value0 != null ? String(value0) : null, 
                value1: value1 != null ? String(value1) : null, 
                value2: value2 != null ? String(value2) : null, 
                value3: value3 != null ? String(value3) : null, 
                statName, 
                format,
                value0_constant: false, value1_constant: false, value2_constant: false, value3_constant: false
            };
        } else {
            // Debug: check if row exists without version filter
            const debugStmt = db.prepare(`
                SELECT COUNT(*) FROM skill_scaling 
                WHERE skill_id = ? AND level = ? AND stat_id IN (
                    SELECT id FROM stats WHERE LOWER(key) = ?
                ) AND occurrence_index = ?
            `);
            const statIdStmt = db.prepare('SELECT id FROM stats WHERE LOWER(key) = ?');
            statIdStmt.bind([statKey.toLowerCase()]);
            if (statIdStmt.step()) {
                const statId = statIdStmt.get()[0];
                statIdStmt.free();
                debugStmt.bind([this.skillId, level, statId, occurrenceIndex]);
                if (debugStmt.step()) {
                    const count = debugStmt.get()[0];
                    if (count > 0) {
                        console.warn(`_getScalingRow: Found ${count} row(s) without version filter, but none with version_id=${versionId} for skill ${this.skillId}, level ${level}, stat ${statKey}`);
                    }
                }
                debugStmt.free();
            } else {
                statIdStmt.free();
            }
        }
        scalingStmt.free();
        
        return result;
    }

    /**
     * Query constants table for constant values
     * @param {Object} db - Database instance
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats
     * @returns {Object|null} Constant values object or null if not found
     */
    async _getConstantsRow(db, statKey, occurrenceIndex) {
        const versionId = await getVersionIdFnAsync(db);
        if (!versionId) {
            console.warn(`_getConstantsRow: No version ID found for skill ${this.skillId}`);
            return null;
        }
        
        // First check if stat exists
        const statCheckStmt = db.prepare('SELECT id FROM stats WHERE LOWER(key) = ?');
        statCheckStmt.bind([statKey.toLowerCase()]);
        let statId = null;
        if (statCheckStmt.step()) {
            statId = statCheckStmt.get()[0];
        }
        statCheckStmt.free();
        
        if (!statId) {
            return null;
        }
        
        const constantStmt = db.prepare(`
            SELECT value0, value1, value2, value3, 
                   value0_constant, value1_constant, value2_constant, value3_constant,
                   s.name as stat_name, s.format
            FROM skill_scaling_constants ssc
            JOIN stats s ON s.id = ssc.stat_id
            WHERE ssc.skill_id = ? AND LOWER(s.key) = ? AND ssc.occurrence_index = ? AND ssc.version_id = ?
        `);
        constantStmt.bind([this.skillId, statKey.toLowerCase(), occurrenceIndex, versionId]);
        
        let constantValues = null;
        if (constantStmt.step()) {
            const [value0, value1, value2, value3, 
                   value0_constant, value1_constant, value2_constant, value3_constant,
                   statName, format] = constantStmt.get();
            constantValues = {
                value0: value0 != null ? String(value0) : '', 
                value1: value1 != null ? String(value1) : '', 
                value2: value2 != null ? String(value2) : '', 
                value3: value3 != null ? String(value3) : '',
                value0_constant: Boolean(value0_constant), 
                value1_constant: Boolean(value1_constant), 
                value2_constant: Boolean(value2_constant), 
                value3_constant: Boolean(value3_constant),
                statName, format
            };
        }
        constantStmt.free();
        
        return constantValues;
    }

    /**
     * Merge constant values with scaling values
     * @param {Object} result - Current result object
     * @param {Object} constantValues - Constant values from database
     * @param {Object} formulaEvaluator - Formula evaluator instance
     * @param {Object} variables - Variables for formula evaluation
     * @returns {Object} Merged result object
     */
    _mergeConstants(result, constantValues, formulaEvaluator, variables, showFormulas = false) {
        if (!constantValues) return result;
        
        if (!result) {
            // Create new result with empty values, not '???' - let constants populate them
            result = { 
                statName: constantValues.statName, 
                format: constantValues.format,
                value0: null, value1: null, value2: null, value3: null,
                value0_constant: false, value1_constant: false, value2_constant: false, value3_constant: false
            };
        }
        
        // Process each constant value
        // If valueX_constant flag is 1, use constant value and evaluate formulas
        // If flag is 0 but value exists and looks like a formula, still evaluate it
        ['value0', 'value1', 'value2', 'value3'].forEach(valueKey => {
            const constantKey = `${valueKey}_constant`;
            const constantValue = constantValues[valueKey];
            const isConstantFlag = constantValues[constantKey];
            
            // Convert to string if needed, handle null/undefined
            const stringValue = constantValue != null ? String(constantValue).trim() : '';
            
            // If constant flag is set, process this value
            if (isConstantFlag) {
                if (stringValue) {
                    const { value, wasFormula } = this._evaluateValue(
                        stringValue,
                        formulaEvaluator,
                        variables
                    );
                    
                    if (showFormulas && wasFormula) {
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
                    // Check if it looks like a formula and evaluate it
                    const looksLikeFormula = /[a-zA-Z_]+|\+|\-|\*|\//.test(stringValue);
                    if (looksLikeFormula && variables) {
                        const { value, wasFormula } = this._evaluateValue(
                            stringValue,
                            formulaEvaluator,
                            variables
                        );
                        
                        if (wasFormula || (!isNaN(stringValue) && stringValue !== '')) {
                            if (showFormulas && wasFormula) {
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
        });
        
        return result;
    }

    /**
     * Get scaling values for a specific stat at a given level
     * @param {Object} db - Database instance
     * @param {number} level - Skill level
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats (default: 0)
     * @returns {Object|null} Scaling values object or null if not found
     */
    async getScalingValues(db, level, statKey, occurrenceIndex = 0, characterState = null, characterLevel = null, showFormulas = false) {
        if (!db || !this.skillId || !statKey) {
            return null;
        }
        
        const { formulaEvaluator } = await import('./formula-evaluator.js');
        
        try {
            // Build variables for formula evaluation
            const variables = this._buildFormulaVariables(characterState, characterLevel);
            
            // Get level-specific values
            let result = await this._getScalingRow(db, level, statKey, occurrenceIndex);
            
            // Get and merge constant values (constants might have formulas too)
            const constantValues = await this._getConstantsRow(db, statKey, occurrenceIndex);
            
            if (constantValues) {
                result = this._mergeConstants(result, constantValues, formulaEvaluator, variables, showFormulas);
            }
            
            // Evaluate formulas in ALL values (scaling + constants) if character state available
            // Do this AFTER merging constants so we evaluate all formulas, including those in constants
            if (result && variables) {
                this._processValuesForFormulas(result, formulaEvaluator, variables, showFormulas);
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
            skillId: this.skillId,
            name: this.name,
            class: this.class,
            classId: this.classId,
            tab: this.tab,
            tabName: this.tabName,
            tags: [...this.tags],
            row: this.row,
            col: this.col,
            image: this.image,
            description: this.description,
            skillEffect: this.skillEffect,
            restriction: this.restriction,
            hasDetails: this.hasDetails,
            baseMaxLevel: this.baseMaxLevel,
            affectedBySpecialization: this.affectedBySpecialization,
            canAddPoints: this.canAddPoints,
            prerequisites: [...this.prerequisites]
        });
    }

    /**
     * Factory method to create Skill from database row
     * @param {Object} row - Database row object
     * @returns {Skill} New Skill instance
     */
    static fromDatabaseRow(row) {
        return new Skill({
            id: row.name,
            skillId: row.id,
            name: row.display_name,
            class: row.class_name || '',
            classId: row.class_id,
            tab: row.tab_index,
            tabName: row.tab_name || '',
            tags: row.tags ? row.tags.split(', ') : [],
            row: row.row,
            col: row.col,
            image: row.image || 'icons-shared_missing.png',
            description: row.description || null,
            skillEffect: row.skill_effect || null,
            restriction: row.restriction || null,
            hasDetails: (row.description && row.description.trim().length > 0) || 
                       (row.skill_effect && row.skill_effect.trim().length > 0),
            baseMaxLevel: row.base_max_level || 0,
            affectedBySpecialization: row.affected_by_specialization === 1,
            canAddPoints: row.can_add_points !== 0,
            prerequisites: row.prerequisites ? row.prerequisites.split('; ').filter(p => p.trim()) : []
        });
    }

}
