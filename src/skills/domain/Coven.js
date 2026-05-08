/**
 * Coven Skill class
 * Represents exclusive Coven skills with restriction checking
 */
import Skill from './Skill.js';
import { getSkillPoints } from '../../../character/character-state.js';

export default class Coven extends Skill {
    static MAX_DIFFERENT_SKILLS = 2;
    static EXCLUSIVE_SKILLS = ['living_flame', 'warp_armor', 'snow_queen', 'vengeful_power'];

    /**
     * Creates a new Coven skill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is a Coven skill
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is a Coven skill
     */
    static isCovenSkill(skill) {
        return Coven.EXCLUSIVE_SKILLS.includes(skill.id);
    }

    /**
     * Check if this Coven skill can be allocated based on restrictions
     * @param {Array} allSkills - Array of all skills
     * @returns {Object} { allowed: boolean, reason: string }
     */
    checkRestriction(allSkills) {
        if (!Coven.isCovenSkill(this)) {
            return { allowed: true, reason: '' };
        }
        if (getSkillPoints(this.id) > 0) {
            return { allowed: true, reason: '' };
        }

        // Count how many different exclusive Coven skills have points
        const exclusiveCovenSkillsWithPoints = allSkills.filter(skill => 
            Coven.isCovenSkill(skill) && getSkillPoints(skill.id) > 0
        );

        // Check if we've reached the limit
        if (exclusiveCovenSkillsWithPoints.length >= Coven.MAX_DIFFERENT_SKILLS) {
            return { 
                allowed: false, 
                reason: `Cannot allocate points to more than ${Coven.MAX_DIFFERENT_SKILLS} of these Coven skills:\n- Living Flame\n- Warp Armor\n- Snow Queen\n- Vengeful Power` 
            };
        }

        return { allowed: true, reason: '' };
    }
}
