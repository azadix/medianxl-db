/**
 * OSkill class
 * Represents skills available to all classes (class_id = 1)
 */
import Skill from './Skill.js';

export default class OSkill extends Skill {
    /**
     * Creates a new OSkill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is an oskill (available to all classes)
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is an oskill
     */
    static isOSkillType(skill) {
        return skill.classId === 1;
    }
}
