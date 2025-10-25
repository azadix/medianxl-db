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
     * @returns {Object} { blocked: boolean, reason: string }
     */
    checkRestriction(allSkills) {
        // Check if this skill has the Paragon tag
        const isParagon = Paragon.isParagonSkill(this);
        
        if (!isParagon) {
            return { blocked: false, reason: '' };
        }

        // Find all Paragon skills from the same class
        const classParagonSkills = allSkills.filter(skill => 
            skill.class === this.class && Paragon.isParagonSkill(skill)
        );
        
        // Check if any other Paragon skill from this class has points
        for (const paragonSkill of classParagonSkills) {
            if (paragonSkill.id !== this.id && getSkillPoints(paragonSkill.id) > 0) {
                return { 
                    blocked: true, 
                    reason: `${paragonSkill.name} already has points. Only one Paragon skill per class is allowed.` 
                };
            }
        }

        return { blocked: false, reason: '' };
    }
}
