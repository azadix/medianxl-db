const Classes = {
    OTHER: -1,
    AMAZON: 0,
    SORCERESS: 1,
    NECROMANCER: 2,
    PALADIN: 3,
    BARBARIAN: 4,
    DRUID: 5,
    ASSASSIN: 6,
    
    // Reverse lookup to get class name from index
    getName: function(index) {
        const entries = Object.entries(this);
        for (const [key, value] of entries) {
            if (value === index && key !== 'getName') {
                return key.charAt(0) + key.substring(1).toLowerCase().replaceAll("_", "");
            }
        }
        return 'Unknown';
    }
};

const ClassTabs = {
    [Classes.OTHER]: [
        { index: 0, name: "oSkill" },
        { index: 1, name: "Proc" },
        { index: 2, name: "Orange text"},
        { index: 3, name: "Passive"}
    ],
    [Classes.AMAZON]: [
        { index: 1, name: "Divine" },
        { index: 2, name: "Bow" },
        { index: 3, name: "Javelin" },
        { index: 4, name: "Spear" },
        { index: 5, name: "Storm" },
        { index: 6, name: "Blood" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Reward" },
        { index: 99, name: "Innate" }
    ],
    [Classes.SORCERESS]: [
        { index: 1, name: "Arcane" },
        { index: 2, name: "Fire" },
        { index: 3, name: "Lightning" },
        { index: 4, name: "Cold" },
        { index: 5, name: "Poison" },
        { index: 6, name: "Melee" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Coven" },
        { index: 9, name: "Reward" },
        { index: 99, name: "Innate" }
    ],
    [Classes.NECROMANCER]: [
        { index: 1, name: "Deathspeaker" },
        { index: 2, name: "Summon" },
        { index: 3, name: "Melee" },
        { index: 4, name: "Crossbow" },
        { index: 5, name: "Malice" },
        { index: 6, name: "Totem" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Reward" },
        { index: 99, name: "Innate" }
    ],
    [Classes.PALADIN]: [
        { index: 1, name: "Aspects" },
        { index: 2, name: "Templar" },
        { index: 3, name: "Incarnation" },
        { index: 4, name: "Nephalem" },
        { index: 5, name: "Ritualist" },
        { index: 6, name: "Warlock" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Reward" },
        { index: 99, name: "Innate" }
    ],
    [Classes.BARBARIAN]: [
        { index: 1, name: "Nomad" },
        { index: 2, name: "Earthshaker" },
        { index: 3, name: "Windcarver" },
        { index: 4, name: "Elementalist" },
        { index: 5, name: "Warmonger" },
        { index: 6, name: "Shaman" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Reward" },
        { index: 99, name: "Innate" }
    ],
    [Classes.DRUID]: [
        { index: 1, name: "Nature" },
        { index: 2, name: "Werebear" },
        { index: 3, name: "Werewolf" },
        { index: 4, name: "Wereowl" },
        { index: 5, name: "Hunter" },
        { index: 6, name: "Seer" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Reward" },
        { index: 99, name: "Innate" }
    ],
    [Classes.ASSASSIN]: [
        { index: 1, name: "Ninja" },
        { index: 2, name: "Throwing" },
        { index: 3, name: "Claw" },
        { index: 4, name: "Naginata" },
        { index: 5, name: "Traps" },
        { index: 6, name: "Psionic" },
        { index: 7, name: "Mastery" },
        { index: 8, name: "Reward" },
        { index: 99, name: "Innate" }
    ],

    getTabName: function(classIndex, tabIndex) {
        // Get the tabs array for this class
        const classTabs = this[classIndex];
        
        // If the class exists and has tabs, find the specific tab
        if (classTabs && Array.isArray(classTabs)) {
            const tab = classTabs.find(t => t.index === tabIndex);
            if (tab) {
                return tab.name;
            }
        }
        
        return 'Unknown';
    },
    
    getClassTabs: function(classIndex) {
        return this[classIndex] || [];
    },
    
    // Get all available tab indices for a class
    getTabIndices: function(classIndex) {
        const classTabs = this[classIndex];
        return classTabs ? classTabs.map(tab => tab.index) : [];
    }
};