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
        return !skill.canAddPoints || skill.name.toLowerCase().includes('innate');
    }

}
