# Skill Max Level Calculations

## Overview

The skill max level calculation system allows skills to dynamically modify their own or other skills' maximum levels based on:
- Points invested in the skill
- Character level
- Specialization status

**Key Feature**: Modifiers use skill names (e.g., `'noxious_mastery'`) instead of IDs for better maintainability and readability.

## Architecture

### Core Files

1. **`skill-calculations.js`** - Core calculation logic
   - `calculateMaxLevel()` - Calculate effective max level for a skill
   - `getModifiersForSkill()` - Get all modifiers affecting a skill
   - `formatMaxLevelDisplay()` - Format display string
   - `MAX_LEVEL_MODIFIERS` - Array of modifier rules

2. **`edit/edit-max-levels.js`** - Updated to use new column name
   - Changed all references from `can_be_enhanced` to `affected_by_specialization`

3. **`edit.html`** - Updated UI labels
   - "Can Be Enhanced" → "Affected by Specialization"

## Usage

### Calculate Max Level
```javascript
import { calculateMaxLevel } from './skill-calculations.js';

// Example: Calculate max level for skill ID 286
const skillLevels = {
  specialization: 10,  // Specialization level 10
  noxious_mastery: 5,  // Noxious Mastery level 5
  barkskin: 1          // Barkskin level 1
};
const characterLevel = 50;
const db = SkillDB.db;

const maxLevel = calculateMaxLevel(286, skillLevels, characterLevel, db);
console.log('Max level:', maxLevel);
```

### Get Modifiers for a Skill
```javascript
import { getModifiersForSkill } from './skill-calculations.js';

const modifiers = getModifiersForSkill(286, db);
console.log('Modifiers affecting skill 286:', modifiers);
```

### Add New Modifier
```javascript
import { addMaxLevelModifier } from './skill-calculations.js';

addMaxLevelModifier({
  sourceSkillName: 'my_custom_skill',
  type: 'custom_type',
  targetSkillName: 'target_skill',
  pointsDivisor: 3,
  description: 'Custom modifier description',
  calculateBonus: (sourceSkillLevel, targetSkillData) => {
    // Your custom logic here
    if (targetSkillData.skill_name === 'target_skill') {
      return Math.floor(sourceSkillLevel / 3);
    }
    return 0;
  }
});
```

## Migration

To apply the database column rename, run:
```bash
python rename_column.py
```

This will:
1. Create a new table with the correct column name
2. Copy all data from the old table
3. Drop the old table
4. Rename the new table

## Future Enhancements

Possible additions to the system:
- UI for managing modifiers (currently hardcoded in JS)
- Store modifiers in database (if needed for persistence)
- Support for more complex conditions (e.g., "requires X points in Y tree")
- Multiplicative modifiers (e.g., "+50% max level")
- Conditional modifiers based on equipment or quest completion

