/**
 * Paragon Skill class
 * Represents Paragon skills with restriction checking
 */
import Skill from './Skill.js';
import { getSkillPoints } from '../character/character-state.js';

export default class Paragon extends Skill {
    /**
     * Creates a new Paragon skill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is a Paragon skill
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is a Paragon skill
     */
    static isParagonSkill(skill) {
        return skill.hasTag('Paragon');
    }

    /**
     * Check if this Paragon skill can be allocated based on restrictions
     * @param {Array} allSkills - Array of all skills
     * @returns {{ allowed: boolean, reason: string }}
     */
    checkRestriction(allSkills) {
        if (!Paragon.isParagonSkill(this)) {
            return { allowed: true, reason: '' };
        }

        const classParagonSkills = allSkills.filter(skill => 
            skill.class === this.class && Paragon.isParagonSkill(skill)
        );
        
        for (const paragonSkill of classParagonSkills) {
            if (paragonSkill.id !== this.id && getSkillPoints(paragonSkill.id) > 0) {
                return { 
                    allowed: false, 
                    reason: `${paragonSkill.name} already has points. Only one Paragon skill per class is allowed.` 
                };
            }
        }

        return { allowed: true, reason: '' };
    }
}
