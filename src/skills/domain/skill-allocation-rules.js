/**
 * @file First-point allocation rule subclasses (Mastery, Ultimate, Paragon, Coven, Proficiency, SoulchainTotem).
 * @module skills/domain/skill-allocation-rules
 * @see skill-restrictions.js
 */

import Skill from './Skill.js';
import { getSkillPoints } from '@/character/planner-core.js';

export class Mastery extends Skill {
    static MAX_DIFFERENT_SKILLS = 3;

    static isMasterySkill(skill) {
        return skill.tabName === 'Mastery';
    }

    checkRestriction(allSkills) {
        if (!Mastery.isMasterySkill(this)) {
            return { allowed: true, reason: '' };
        }
        if (getSkillPoints(this.id) > 0) {
            return { allowed: true, reason: '' };
        }

        const masterySkillsWithPoints = allSkills.filter(skill => {
            return Mastery.isMasterySkill(skill) &&
                   skill.class === this.class &&
                   getSkillPoints(skill.id) > 0;
        });

        if (masterySkillsWithPoints.length >= Mastery.MAX_DIFFERENT_SKILLS) {
            return {
                allowed: false,
                reason: `Cannot allocate points to more than ${Mastery.MAX_DIFFERENT_SKILLS} different Mastery skills.`
            };
        }

        return { allowed: true, reason: '' };
    }
}

export class Proficiency extends Skill {
    static MAX_DIFFERENT_SKILLS = 2;
    static EXCLUSIVE_SKILLS = ['mighty_vigor', 'aptitude', 'pillage', 'warder', 'unyielding'];

    static isProficiencySkill(skill) {
        return Proficiency.EXCLUSIVE_SKILLS.includes(skill.id);
    }

    checkRestriction(allSkills) {
        if (!Proficiency.isProficiencySkill(this)) {
            return { allowed: true, reason: '' };
        }
        if (getSkillPoints(this.id) > 0) {
            return { allowed: true, reason: '' };
        }

        const exclusiveProficiencySkillsWithPoints = allSkills.filter(skill =>
            Proficiency.isProficiencySkill(skill) && getSkillPoints(skill.id) > 0
        );

        if (exclusiveProficiencySkillsWithPoints.length >= Proficiency.MAX_DIFFERENT_SKILLS) {
            return {
                allowed: false,
                reason: `Cannot allocate points to more than ${Proficiency.MAX_DIFFERENT_SKILLS} of these Proficiency skills:\n- Mighty Vigor\n- Aptitude\n- Pillage\n- Warder\n- Unyielding`
            };
        }

        return { allowed: true, reason: '' };
    }
}

export class Ultimate extends Skill {
    static isUltimateSkill(skill) {
        return skill.hasTag('Ultimate');
    }

    checkRestriction(allSkills) {
        if (!Ultimate.isUltimateSkill(this)) {
            return { allowed: true, reason: '' };
        }

        const classUltimateSkills = allSkills.filter(skill =>
            skill.class === this.class && Ultimate.isUltimateSkill(skill)
        );

        for (const ultimateSkill of classUltimateSkills) {
            if (ultimateSkill.id !== this.id && getSkillPoints(ultimateSkill.id) > 0) {
                return {
                    allowed: false,
                    reason: `${ultimateSkill.name} already has points. Only one Ultimate skill per class is allowed.`
                };
            }
        }

        return { allowed: true, reason: '' };
    }
}

export class Paragon extends Skill {
    static isParagonSkill(skill) {
        return skill.hasTag('Paragon');
    }

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

export class Coven extends Skill {
    static MAX_DIFFERENT_SKILLS = 2;
    static EXCLUSIVE_SKILLS = ['living_flame', 'warp_armor', 'snow_queen', 'vengeful_power'];

    static isCovenSkill(skill) {
        return Coven.EXCLUSIVE_SKILLS.includes(skill.id);
    }

    checkRestriction(allSkills) {
        if (!Coven.isCovenSkill(this)) {
            return { allowed: true, reason: '' };
        }
        if (getSkillPoints(this.id) > 0) {
            return { allowed: true, reason: '' };
        }

        const exclusiveCovenSkillsWithPoints = allSkills.filter(skill =>
            Coven.isCovenSkill(skill) && getSkillPoints(skill.id) > 0
        );

        if (exclusiveCovenSkillsWithPoints.length >= Coven.MAX_DIFFERENT_SKILLS) {
            return {
                allowed: false,
                reason: `Cannot allocate points to more than ${Coven.MAX_DIFFERENT_SKILLS} of these Coven skills:\n- Living Flame\n- Warp Armor\n- Snow Queen\n- Vengeful Power`
            };
        }

        return { allowed: true, reason: '' };
    }
}

export class SoulchainTotem extends Skill {
    static ELEMENTAL_TOTEMS = ['fireheart_totem', 'stormeye_totem', 'frostclaw_totem'];
    static SOULCHAIN_ID = 'soulchain';

    static isElementalTotemSkill(skill) {
        return SoulchainTotem.ELEMENTAL_TOTEMS.includes(skill.id);
    }

    static isSoulchainSkill(skill) {
        return skill.id === SoulchainTotem.SOULCHAIN_ID;
    }

    static countElementalTotemsWithPoints(allSkills) {
        return allSkills.filter(skill =>
            SoulchainTotem.isElementalTotemSkill(skill) && getSkillPoints(skill.id) > 0
        ).length;
    }

    checkRestriction(allSkills) {
        if (getSkillPoints(this.id) > 0) {
            return { allowed: true, reason: '' };
        }

        const totemCount = SoulchainTotem.countElementalTotemsWithPoints(allSkills);
        const soulchainPoints = getSkillPoints(SoulchainTotem.SOULCHAIN_ID);

        if (SoulchainTotem.isSoulchainSkill(this)) {
            if (totemCount > 1) {
                return {
                    allowed: false,
                    reason: 'Cannot allocate Soulchain while more than one elemental totem skill has points.'
                };
            }
            return { allowed: true, reason: '' };
        }

        if (SoulchainTotem.isElementalTotemSkill(this)) {
            if (soulchainPoints > 0 && totemCount >= 1) {
                return {
                    allowed: false,
                    reason: 'Cannot allocate a second elemental totem while Soulchain has points.'
                };
            }
        }

        return { allowed: true, reason: '' };
    }
}
