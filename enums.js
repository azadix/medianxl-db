//TODO remove since the data is already present in db
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

// Define tag groupings by their IDs
const tagGroups = {
    "Skill Category": [8, 9, 11, 12, 13, 14, 15, 16, 17, 22, 25, 26, 27, 28],
    "Damage": [1, 2, 3, 4, 5, 6, 7, 21, 23],
    "Teleport": [10, 20, 24],
    "Modifier": [19, 18]
};
