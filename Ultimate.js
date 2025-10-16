/**
 * Ultimate Skill class
 * Represents Ultimate skills with restriction checking
 */
import Skill from './Skill.js';
import { getSkillPoints } from './character-state.js';

export default class Ultimate extends Skill {
    /**
     * Creates a new Ultimate skill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is an Ultimate skill
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is an Ultimate skill
     */
    static isUltimateSkill(skill) {
        return skill.hasTag('Ultimate');
    }

    /**
     * Check if this Ultimate skill can be allocated based on restrictions
     * @param {Array} allSkills - Array of all skills
     * @returns {Object} { blocked: boolean, reason: string }
     */
    checkRestriction(allSkills) {
        // Check if this skill has the Ultimate tag
        const isUltimate = Ultimate.isUltimateSkill(this);
        
        if (!isUltimate) {
            return { blocked: false, reason: '' };
        }

        // Find all Ultimate skills from the same class
        const classUltimateSkills = allSkills.filter(skill => 
            skill.class === this.class && Ultimate.isUltimateSkill(skill)
        );
        
        // Check if any other Ultimate skill from this class has points
        for (const ultimateSkill of classUltimateSkills) {
            if (ultimateSkill.id !== this.id && getSkillPoints(ultimateSkill.id) > 0) {
                return { 
                    blocked: true, 
                    reason: `${ultimateSkill.name} already has points. Only one Ultimate skill per class is allowed.` 
                };
            }
        }

        return { blocked: false, reason: '' };
    }
}
