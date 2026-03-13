# MedianXL Skills Database Project

## Project Overview
This is a web-based skills database, editor and interactive skill tree calculator/planner for MedianXL (Diablo 2 mod).
Editor allows users to manage skill parameters like classes, tags, max level and scaling data through a SQLite database interface.
Planner provides a fully functional skill tree with character build planning capabilities for different versions of modification (current version: 2.12).

## Getting Started

1. **Database**: Ensure `.sqlite` file for a relevant version is present
2. **Usage**: 
   - Open `index.html` for skills listing
   - Open `planner.html` for interactive skill tree and build planning
   - Open `edit.html` for database editing (only enabled on localhost)
   - Open `status.html` for current progress display

### Project Structure
```
medianxl-db/
├── index.html              # Skills listing page
├── edit.html               # Database editor interface
├── planner.html            # Interactive skill tree
├── status.html             # Progress status page
├── script.js               # Skills viewer functionality
├── utils.js                # Utility functions
├── style.css               # Main styling
├── skills.sqlite     	    # SQLite database
├── character/              # Character management
├── skills/                 # Skills management/classes
├── edit/                   # Edit panel modules
├── tree/                   # Skill tree modules
├── py/                     # Python utilities
├── spellcheck/             # Python spellchecker
└── icons/                  # Skill icons and portraits
```

### Python Scripts (`py/` folder)
- **`validate_skill_placeholders.py`** - Validates skill description placeholders against the database
- **`extract_placeholder_skills.py`** - Lists skills that use placeholders in their descriptions
- **`extract_skills_without_placeholders.py`** - Lists skills missing any placeholder usage
- **`extract_non_placeholder_lines.py`** - Extracts plain text (non-placeholder) lines from descriptions
- **`db_to_json.py`** - Extracts database to json files
- **`calculate_mana_params.py`** - Calculates 3 mana cost params based on level:mana_cost input

### Database Schema
```sql
-- Core tables
classes (id, name, image_prefix) -- image_prefix stores just the prefix (ama, bar, shared, etc.)
classTabs (id, class_id, tab_index, name)
skills (id, name, display_name, class_id, tab_index, row, col, image, restriction, description, skill_effect, version_id)
skilltags (id, name)
skill_skilltags (skill_id, tag_id) -- Many-to-many relationship
versions (id, major, minor, name, is_active)

-- Stats and scaling system
stats (id, key, name, description, format)
skill_scaling (skill_id, level, stat_id, occurrence_index, value0, value1, value2, value3, version_id)
skill_scaling_constants (skill_id, stat_id, occurrence_index, value0, value1, value2, value3, value0_constant, value1_constant, value2_constant, value3_constant, version_id)
skill_max_levels (skill_id, base_max_level, affected_by_specialization, can_add_points, version_id)
skill_prerequisites (id, skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, version_id)
```

## Skill Editor Features

### 1. Autocomplete System
**Location**: `edit/edit-autocomplete.js`

**Features**:
- **Immediate activation**: Starts after typing `{{` or `[[`
- **Fuzzy filtering**: Finds stats or skills even with partial or out-of-order characters
- **Score-based ordering**: Stats ordered by score
- **Smart completion**: Completes names in `{{stat}}` or `[[skill]]` format with automatic parameter expansion
- **Custom styling**: Dark theme integration with usage count display
- **Keyboard navigation**: Arrow keys, Tab completion, Escape to close

**Scoring System**:
- Exact match: 1000 points
- Starts with query: 500+ points  
- Contains query: 200+ points
- Name contains query: 100+ points
- Fuzzy match: 50+ points

### 2. Template Validation System
**Location**: `edit/edit-validation.js`

**Features**:
- **Syntax checking**: Detects mismatched braces, triple braces, unclosed placeholders
- **Real-time validation**: Checks descriptions and restrictions before saving
- **Error prevention**: Blocks saves with syntax errors
- **User feedback**: Clear error messages with context

**Validation Rules**:
- No triple braces `{{{`, `}}}`, `[[[` or `]]]`
- Matching pairs of `{{` and `}}` or `[[[` and `]]]`
- No unclosed placeholders
- Warns about single braces that look like typos

### 3. Multi-Instance Scaling System
**Location**: `edit/edit-scaling.js`, `utils.js`, `skills/Skill.js`

**Implementation Details**:
- **Stat Order Extraction**: Parses `skill_effect` to find stats in appearance order with occurrence tracking
- **Placeholder Expansion**: Each `{{stat}}` placeholder gets its correct scaling values based on occurrence index
- **Constants Support**: Constants can be set for specific occurrences of duplicate stats
- **Occurrence Tracking**: Each stat instance gets a unique `occurrence_index` (0, 1, 2, etc.)
- **Separate Scaling Values**: Each instance can have completely different scaling values
- **Visual Indicators**: Duplicate stats display as "Damage #2", "Damage #3" etc.
- **Order Preservation**: Stats appear in scaling section in the exact order they appear in skill descriptions

**Example Usage**:
```
Skill Effect:
{{range}}
Some text/Subskill
{{range}}

Scaling Section will show:
- Range: X yards (first instance)
- Some text/Subskill
- Range: X yards (second instance)

Each can have completely different scaling values.
```

### 4. Tag System
**Location**: `utils.js`

**Tag Groups**:
- Skill Category
- Damage
- Summon
- Teleport
- Custom

**Features**:
- Centralized tag definitions shared across the application
- Used for filtering, tooltips, and skill categorization
- Displayed in tree tooltips for quick skill type identification

### 5. Character State Management
**Location**: `Character.js`, `character-state.js`

**Architecture**:
- **Instance-based design**: Character class holds all state and behavior
- **Singleton pattern**: Single character instance managed by character-state.js
- **Backward compatibility**: Wrapper functions maintain existing API
- **Modular validation**: Specialized skill classes handle restriction logic

**Character Class Features**:
- **Instance properties**: level, className, skillPoints, maxLevels, questsCompleted, oSkills
- **Quest management**: Calculate quest points based on character level and completion status
- **Skill point calculations**: Available, spent, and remaining points
- **State management**: Export/import for build saving and loading
- **oSkills management**: Add skills from other classes to your build

**Validation System**:
- **Prerequisite validation**: Real-time checking of skill/level/tree requirements
- **Class-specific restrictions**: Coven, Proficiency, Mastery, and Ultimate skill limits
- **OR logic support**: Some skills require only ONE of multiple prerequisites
- **Dynamic max levels**: Efficient calculation with caching and dependency tracking

**Class-Specific Restrictions**:
- **Coven (Sorceress)**: Pick 2 of 4 exclusive skills (Living Flame, Warp Armor, Snow Queen, Vengeful Power)
- **Proficiency (Barbarian)**: Pick 2 of 5 exclusive skills (Mighty Vigor, Aptitude, Pillage, Warder, Unyielding)
- **Mastery**: Maximum 3 different Mastery skills across all classes
- **Ultimate**: Only one Ultimate skill per class allowed
- Tooltips display restriction messages when attempting to allocate beyond limits

### 6. Dynamic Skill Calculations
**Location**: `skill-calculations.js`

**Example Max Level Modifiers**:
- **Specialization**: +1 max level per 2 points for active skills
- **Barkskin**: +1 max level per 5 character levels (self-scaling)
- **Noxious Mastery**: +1 Curare max level per 2 points
- **Lioness**: +1 max level per 3 points in Spear tree (self-scaling based on points spent)

**Devotion Checking**:
- Validates Devotion restrictions (Paladin, Amazon)
- Prevents allocation of groups of skills when devotion is active
- Real-time checking as skills are allocated

### 7. Python Data Validation Suite
**Location**: `py/` folder

**Scripts**:

1. **`validate_skill_placeholders.py`**
   - Checks all skill placeholders against scaling/stat data
   - Finds missing stats, invalid keys, bad references
   - Outputs error and summary reports

2. **`extract_placeholder_skills.py`**
   - Extracts skills with `{{stat}}` or `[[skill]]` in descriptions/restrictions
   - Counts placeholder and stat usages
   - Groups output by class and category

3. **`extract_skills_without_placeholders.py`**
   - Lists skills with text but no `{{placeholder}}`
   - Helps identify legacy or incomplete skill info

4. **`extract_non_placeholder_lines.py`**
   - Extracts all non-placeholder description/restriction text lines
   - Useful for finding standard phrases, warnings, or static lines

5. **`db_to_json.py`**
   - Extracts all data from database and saves it as json format

6. **`calculate_mana_params.py`**
   - Calculates the 3 required parameters for `{{mana_cost}}` stat based on in game level and cost mapping
   - Requires the data to be passed in one of 2 different ways:
	- Command line parameter in this format `"[level1: cost1], [level2: cost2], [level3: cost3]"` eg. "[1: 10], [2: 12], [3: 14]"
	- CSV file with name `mana_cost_input.csv`, columns: 'lvl' and 'cost', columns separated with "," and rows with "\n" 
   - Output are 3 values per potential solution: "min_mana", "lvl_mana" and "shift"

## Technical Implementation Details

### Tooltip System
```javascript
// Interactive tooltips with scaling
showTooltip() → getSkillCategoryTags() → buildTooltipContent() → expandPlaceholders()
// Shows Skill Category, Summon, and Teleport tags
```

### Placeholder Expansion Logic
```javascript
// Stat placeholder auto-expansion examples
{{mana_cost}} → {{mana_cost:%value0%}} (if format is "{name}: {value0}")
{{cold_damage}} → {{cold_damage:%value0%,%value1%}} (if format is "{name}: {value0}-{value1}")

// Skill placeholder examples
[[fireball]] → Displays skill's  name (e.g., "Fireball") with a class `has-text-success`
// Skill placeholders reference other skills by their internal name
```

### Database Integration
- Uses SQL.js for client-side SQLite operations
- Supports import/export of database files
- Real-time validation of stat references

### Dependencies
- **SQL.js 1.13.0**: Client-side SQLite database
- **Bulma CSS 1.0.1**: UI framework
- **jQuery 3.7.1**: DataTables prerequisite
- **DataTables 2.3.3**: Skills listing table
- **Font Awesome 6.0.0**: Icons for navigation
- **Python 3.9+**: For data extraction and validation scripts