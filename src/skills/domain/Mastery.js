/**
 * Mastery Skill class
 * Represents skills from Mastery tabs with restriction checking
 */
import Skill from './Skill.js';
import { getSkillPoints } from '../../../character/character-state.js';

export default class Mastery extends Skill {
    static MAX_DIFFERENT_SKILLS = 3;

    /**
     * Creates a new Mastery skill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is a Mastery skill
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is a Mastery skill
     */
    static isMasterySkill(skill) {
        return skill.tabName === 'Mastery';
    }

    /**
     * Check if this Mastery skill can be allocated based on restrictions
     * @param {Array} allSkills - Array of all skills
     * @returns {Object} { allowed: boolean, reason: string }
     */
    checkRestriction(allSkills) {
        if (!Mastery.isMasterySkill(this)) {
            return { allowed: true, reason: '' };
        }
        if (getSkillPoints(this.id) > 0) {
            return { allowed: true, reason: '' };
        }

        // Find all Mastery skills from the same class with points allocated
        const masterySkillsWithPoints = allSkills.filter(skill => {
            return Mastery.isMasterySkill(skill) && 
                   skill.class === this.class && 
                   getSkillPoints(skill.id) > 0;
        });

        // Check if we've reached the limit
        if (masterySkillsWithPoints.length >= Mastery.MAX_DIFFERENT_SKILLS) {
            return { 
                allowed: false, 
                reason: `Cannot allocate points to more than ${Mastery.MAX_DIFFERENT_SKILLS} different Mastery skills.` 
            };
        }

        return { allowed: true, reason: '' };
    }
}
