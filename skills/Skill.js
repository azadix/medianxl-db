
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
    hasScalingData(db) {
        if (!db || !this.skillId) return false;
        
        try {
            const stmt = db.prepare('SELECT COUNT(*) FROM skill_scaling WHERE skill_id = ?');
            stmt.bind([this.skillId]);
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
    getAvailableLevels(db) {
        if (!db || !this.skillId) return [];
        
        try {
            const stmt = db.prepare('SELECT DISTINCT level FROM skill_scaling WHERE skill_id = ? ORDER BY level');
            stmt.bind([this.skillId]);
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
     * Get scaling values for a specific stat at a given level
     * @param {Object} db - Database instance
     * @param {number} level - Skill level
     * @param {string} statKey - Stat key to get values for
     * @param {number} occurrenceIndex - Occurrence index for duplicate stats (default: 0)
     * @returns {Object|null} Scaling values object or null if not found
     */
    async getScalingValues(db, level, statKey, occurrenceIndex = 0, characterState = null, characterLevel = null) {
        if (!db || !this.skillId || !statKey) return null;
        
        // Import formula evaluator once for the entire function
        const { formulaEvaluator } = await import('./formula-evaluator.js');
        
        try {
            // Get level-specific values first
            const scalingStmt = db.prepare(`
                SELECT ss.value0, ss.value1, ss.value2, ss.value3, s.name as stat_name, s.format
                FROM skill_scaling ss
                JOIN stats s ON s.id = ss.stat_id
                WHERE ss.skill_id = ? AND ss.level = ? AND LOWER(s.key) = ? AND ss.occurrence_index = ?
            `);
            scalingStmt.bind([this.skillId, level, statKey.toLowerCase(), occurrenceIndex]);
            
            let result = null;
            if (scalingStmt.step()) {
                const [value0, value1, value2, value3, statName, format] = scalingStmt.get();
                result = { 
                    value0, value1, value2, value3, statName, format,
                    value0_constant: false, value1_constant: false, value2_constant: false, value3_constant: false
                };
            }
            scalingStmt.free();
            
            // Check if any values are formulas and evaluate them
            if (result && characterState) {
                const variables = {
                    blvl: characterState.blvl?.[this.id] || 0,
                    lvl: characterState.lvl?.[this.id] || 0,
                    clvl: characterLevel || 1
                };
                
                // Check each value to see if it's a formula
                ['value0', 'value1', 'value2', 'value3'].forEach(valueKey => {
                    const value = result[valueKey];
                    if (value && typeof value === 'string' && isNaN(value)) {
                        // This looks like a formula (not a number), try to evaluate it
                        const evalResult = formulaEvaluator.evaluate(value, variables);
                        if (evalResult.success) {
                            result[valueKey] = evalResult.value;
                            result[`${valueKey}_formula`] = true;
                        }
                    }
                });
            }
            
            // Then get constant values
            const constantStmt = db.prepare(`
                SELECT value0, value1, value2, value3, 
                       value0_constant, value1_constant, value2_constant, value3_constant,
                       s.name as stat_name, s.format
                FROM skill_scaling_constants ssc
                JOIN stats s ON s.id = ssc.stat_id
                WHERE ssc.skill_id = ? AND LOWER(s.key) = ? AND ssc.occurrence_index = ?
            `);
            constantStmt.bind([this.skillId, statKey.toLowerCase(), occurrenceIndex]);
            
            let constantValues = null;
            if (constantStmt.step()) {
                const [value0, value1, value2, value3, 
                       value0_constant, value1_constant, value2_constant, value3_constant,
                       statName, format] = constantStmt.get();
                constantValues = {
                    value0, value1, value2, value3,
                    value0_constant, value1_constant, value2_constant, value3_constant,
                    statName, format
                };
            }
            constantStmt.free();
            
            
            // Merge: use constant values where marked, level-specific otherwise
            if (constantValues) {
                if (!result) {
                    result = { 
                        statName: constantValues.statName, 
                        format: constantValues.format,
                        value0: '???', value1: '???', value2: '???', value3: '???',
                        value0_constant: false, value1_constant: false, value2_constant: false, value3_constant: false
                    };
                }
                
                // Evaluate constant formulas if character state is available
                if (constantValues.value0_constant) {
                    let value0 = constantValues.value0 || 0;
                    let wasFormula = false;
                    if (characterState && typeof value0 === 'string' && isNaN(value0)) {
                        // This looks like a formula, try to evaluate it
                        const variables = {
                            blvl: characterState.blvl?.[this.id] || 0,
                            lvl: characterState.lvl?.[this.id] || 0,
                            clvl: characterLevel || 1
                        };
                        const evalResult = formulaEvaluator.evaluate(value0, variables);
                        if (evalResult.success) {
                            value0 = evalResult.value;
                            wasFormula = true;
                        }
                    }
                    result.value0 = value0;
                    result.value0_constant = true;
                    result.value0_formula = wasFormula;
                }
                if (constantValues.value1_constant) {
                    let value1 = constantValues.value1 || 0;
                    let wasFormula = false;
                    if (characterState && typeof value1 === 'string' && isNaN(value1)) {
                        // This looks like a formula, try to evaluate it
                        const variables = {
                            blvl: characterState.blvl?.[this.id] || 0,
                            lvl: characterState.lvl?.[this.id] || 0,
                            clvl: characterLevel || 1
                        };
                        const evalResult = formulaEvaluator.evaluate(value1, variables);
                        if (evalResult.success) {
                            value1 = evalResult.value;
                            wasFormula = true;
                        }
                    }
                    result.value1 = value1;
                    result.value1_constant = true;
                    result.value1_formula = wasFormula;
                }
                if (constantValues.value2_constant) {
                    let value2 = constantValues.value2 || 0;
                    let wasFormula = false;
                    if (characterState && typeof value2 === 'string' && isNaN(value2)) {
                        // This looks like a formula, try to evaluate it
                        const variables = {
                            blvl: characterState.blvl?.[this.id] || 0,
                            lvl: characterState.lvl?.[this.id] || 0,
                            clvl: characterLevel || 1
                        };
                        const evalResult = formulaEvaluator.evaluate(value2, variables);
                        if (evalResult.success) {
                            value2 = evalResult.value;
                            wasFormula = true;
                        }
                    }
                    result.value2 = value2;
                    result.value2_constant = true;
                    result.value2_formula = wasFormula;
                }
                if (constantValues.value3_constant) {
                    let value3 = constantValues.value3 || 0;
                    let wasFormula = false;
                    if (characterState && typeof value3 === 'string' && isNaN(value3)) {
                        // This looks like a formula, try to evaluate it
                        const variables = {
                            blvl: characterState.blvl?.[this.id] || 0,
                            lvl: characterState.lvl?.[this.id] || 0,
                            clvl: characterLevel || 1
                        };
                        const evalResult = formulaEvaluator.evaluate(value3, variables);
                        if (evalResult.success) {
                            value3 = evalResult.value;
                            wasFormula = true;
                        }
                    }
                    result.value3 = value3;
                    result.value3_constant = true;
                    result.value3_formula = wasFormula;
                }
            }
            
            return result;
        } catch (error) {
            console.warn('Error getting scaling values for skill:', this.name, error);
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
