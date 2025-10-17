/**
 * Proficiency Skill class
 * Represents exclusive Proficiency skills with restriction checking
 */
import Skill from './Skill.js';
import { getSkillPoints } from '../character/character-state.js';

export default class Proficiency extends Skill {
    static MAX_DIFFERENT_SKILLS = 2;
    static EXCLUSIVE_SKILLS = ['mighty_vigor', 'aptitude', 'pillage', 'warder', 'unyielding'];

    /**
     * Creates a new Proficiency skill instance
     * @param {Object} data - Skill data object
     */
    constructor(data) {
        super(data);
    }

    /**
     * Check if a skill is a Proficiency skill
     * @param {Skill} skill - Skill to check
     * @returns {boolean} True if the skill is a Proficiency skill
     */
    static isProficiencySkill(skill) {
        return Proficiency.EXCLUSIVE_SKILLS.includes(skill.id);
    }

    /**
     * Check if this Proficiency skill can be allocated based on restrictions
     * @param {Array} allSkills - Array of all skills
     * @returns {Object} { allowed: boolean, reason: string }
     */
    checkRestriction(allSkills) {
        // Check if this skill is one of the exclusive Proficiency skills
        const isExclusiveProficiency = Proficiency.isProficiencySkill(this);

        if (!isExclusiveProficiency) {
            return { allowed: true, reason: '' };
        }

        // Count how many different exclusive Proficiency skills have points
        const exclusiveProficiencySkillsWithPoints = allSkills.filter(skill => 
            Proficiency.isProficiencySkill(skill) && getSkillPoints(skill.id) > 0
        );

        // Check if we've reached the limit
        if (exclusiveProficiencySkillsWithPoints.length >= Proficiency.MAX_DIFFERENT_SKILLS) {
            return { 
                allowed: false, 
                reason: `Cannot allocate points to more than ${Proficiency.MAX_DIFFERENT_SKILLS} of these Proficiency skills:\n- Mighty Vigor\n- Aptitude\n- Pillage\n- Warder\n- Unyielding` 
            };
        }

        return { allowed: true, reason: '' };
    }
}
