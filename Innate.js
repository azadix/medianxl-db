/**
 * Innate Skill class
 * Represents skills that cannot have points added to them
 */
import Skill from './Skill.js';

export default class Innate extends Skill {
    /**
     * Creates a new Innate skill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is an innate skill
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is innate
     */
    static isInnateSkill(skill) {
        return !skill.canAddPoints || 
               skill.name.toLowerCase().includes('innate') ||
               skill.id.toLowerCase().includes('innate');
    }

    /**
     * Override getMaxLevel to always return 0 for innate skills
     * @param {Object} options - Options object (ignored for innate skills)
     * @returns {number} Always returns 0
     */
    getMaxLevel(options = {}) {
        return 0; // Innate skills cannot have points added
    }
}
