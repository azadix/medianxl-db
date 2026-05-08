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
        if (!skill) return false;
        if (String(skill.tabName || '').toLowerCase() === 'innate') {
            return true;
        }
        const internal =
            typeof skill.id === 'string' && skill.id.trim() !== ''
                ? skill.id
                : typeof skill.name === 'string'
                  ? skill.name
                  : '';
        return internal.toLowerCase().includes('innate');
    }

}
