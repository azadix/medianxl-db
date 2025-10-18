# MedianXL Skills Database Project

## Project Overview
This is a web-based skills database editor and interactive skill tree calculator for MedianXL (Diablo 2 mod). It allows users to manage skills, stats, classes, tags, and skill scaling data through a SQLite database interface, while also providing a fully functional skill tree with character build planning capabilities.

## Getting Started

1. **Database**: Ensure `.sqlite` file for a relevant version is present
2. **Usage**: 
   - Open `index.html` for skills listing
   - Open `tree.html` for interactive skill tree and build planning
   - Open `edit.html` for database editing (only enabled on localhost)

### Project Structure
The project is organized into logical folders for better maintainability:

```
medianxl-db/
├── index.html              # Skills listing page
├── edit.html               # Database editor interface
├── tree.html               # Interactive skill tree
├── script.js               # Skills viewer functionality
├── utils.js                # Utility functions
├── style.css               # Main styling
├── skills.sqlite           # SQLite database
├── character/              # Character management
│   ├── Character.js        # Character class and state management
│   └── character-state.js  # Character state wrapper functions
├── skills/                 # Skills system
│   ├── Skill.js            # Base skill class
│   ├── Coven.js            # Coven skill class
│   ├── Mastery.js          # Mastery skill class
│   ├── Proficiency.js      # Proficiency skill class
│   ├── Ultimate.js         # Ultimate skill class
│   ├── Innate.js           # Innate skill class
│   ├── OSkill.js           # oSkill class
│   └── skill-calculations.js # Dynamic skill calculations
├── edit/                   # Edit panel modules
├── tree/                   # Skill tree modules
├── py/                     # Python utilities
└── icons/                  # Skill icons and portraits
```

### File Details

#### Core Files
- **`index.html`** - Skills listing page with DataTable integration
- **`edit.html`** - Main database editor interface
- **`tree.html`** - Interactive skills tree with character build planning
- **`script.js`** - Skills viewer with detail display
- **`utils.js`** - Utility functions for placeholder expansion and icon handling
- **`style.css`** - Main styling
- **`skills-%VERSION%.sqlite`** - SQLite database containing all skills data

#### Character Management (`character/` folder)
- **`Character.js`** - Character class with instance-based state management
- **`character-state.js`** - Character state wrapper functions and validation logic

#### Skills System (`skills/` folder)
- **`Skill.js`** - Base skill class with common functionality
- **`Coven.js`** - Coven skill class with restriction checking
- **`Mastery.js`** - Mastery skill class with restriction checking
- **`Proficiency.js`** - Proficiency skill class with restriction checking
- **`Ultimate.js`** - Ultimate skill class with restriction checking
- **`Innate.js`** - Innate skill class (skills that cannot have points added)
- **`OSkill.js`** - oSkill class for skills from other classes
- **`skill-calculations.js`** - Dynamic skill calculations (max levels, modifiers)


#### Edit Panel (`edit/` folder)
- **`edit-core.js`** - Core database functionality and initialization
- **`edit-skills.js`** - Skills management (CRUD operations)
- **`edit-tags.js`** - Tags management
- **`edit-classes.js`** - Classes and tabs management
- **`edit-stats.js`** - Stats management
- **`edit-scaling.js`** - Skill scaling data management
- **`edit-max-levels.js`** - Maximum levels management
- **`edit-prerequisites.js`** - Skill prerequisites management
- **`edit-autocomplete.js`** - Advanced autocomplete functionality
- **`edit-validation.js`** - Template syntax validation
- **`DropdownList.js`** - Custom dropdown component
- **`dropdown-style.css`** - Styling for dropdown components

#### Tree Viewer (`tree/` folder)
- **`tree-core.js`** - Core tree functionality, state management, and skill point allocation
- **`tree-data.js`** - Data loading from SQLite
- **`tree-render.js`** - Tree rendering and UI management
- **`tree-card-renderer.js`** - Skill card rendering with allocation controls
- **`tree-arrows.js`** - Prerequisite arrows rendering
- **`tree-tooltip.js`** - Interactive skill tooltips with level-based scaling
- **`tree-styles.css`** - Tree-specific styling
- **`ToastManager.js`** - Toast notification system

#### Python Scripts (`py/` folder)
- **`validate_skill_placeholders.py`** - Validates skill description placeholders against the database
- **`extract_placeholder_skills.py`** - Lists skills that use placeholders in their descriptions
- **`extract_skills_without_placeholders.py`** - Lists skills missing any placeholder usage
- **`extract_non_placeholder_lines.py`** - Extracts plain text (non-placeholder) lines from descriptions
- **`skill_status_analyzer.py`** - Analyzes the completion status of skill data from missingskills.md

### Database Schema
```sql
-- Core tables
classes (id, name, image_prefix)
classTabs (id, class_id, tab_index, name)
skills (id, name, display_name, class_id, tab_index, row, col, image, restriction, description, skill_effect)
skilltags (id, name)
skill_skilltags (skill_id, tag_id) -- Many-to-many relationship

-- Stats and scaling system
stats (id, key, name, description, format)
skill_scaling (skill_id, level, stat_id, value0, value1, value2, value3)
skill_scaling_constants (skill_id, stat_id, value0, value1, value2, value3, value0_constant, value1_constant, value2_constant, value3_constant)
skill_max_levels (skill_id, base_max_level, affected_by_specialization, can_add_points)
skill_prerequisites (id, skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, description)
```

## Major Features

### 1. Interactive Skill Tree & Build Planner
**Location**: `tree/` folder

**Features**:
- **Character build planning**: Allocate and remove skill points with +/- buttons
- **Real-time validation**: Prerequisite checking (character level, skill level, tree points)
- **Dynamic max levels**: Skills affected by Specialization and other modifiers
- **Skill point pool**: Tracks base points, quest rewards, and remaining points
- **oSkills tab**: Add and manage oskills (skills from other classes)
- **Interactive tooltips**: Hover over skills to see descriptions with current level values
- **Visual prerequisites**: Arrow connections showing skill dependencies
- **State persistence**: Builds saved to localStorage
- **Quest tracking**: Den of Evil, Radament, Izual, and Inquisitor of the Triune

**Character Management**:
- Quest completion toggles for bonus skill points
- Class-specific trees with tab navigation
- Import/export build functionality

### 2. Skills Viewer
**Location**: `script.js`

**Features**:
- **Level selector**: Dropdown below description for easy access
- **Placeholder expansion**: Automatically displays scaled values at selected level

### 3. Advanced Autocomplete System
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

### 4. Template Validation System
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

### 5. Enhanced Database Editor
**Location**: `edit/` folder

**Features**:
- **Modular architecture**: Separated into focused JavaScript modules
- **DropdownList integration**: Searchable dropdowns throughout the interface
- **Scroll-to-top**: Edit buttons scroll to top of page for better UX
- **Dynamic form fields**: Fields show/hide based on context
- **Multiple prerequisites**: Support for multiple requirement types per skill
- **Auto-loading**: Automatically loads data when selections change
- **Level indicators**: Visual tags showing existing scaling levels
- **Template validation**: Real-time syntax checking

### 6. Tag System
**Location**: `tag-constants.js`

**Tag Groups**:
- **Skill Category**: 17 tags
- **Damage**: 9 tags
- **Summon**: 3 tags
- **Teleport**: 3 tags
- **Modifier**: 2 tags

**Features**:
- Centralized tag definitions shared across the application
- Used for filtering, tooltips, and skill categorization
- Displayed in tree tooltips for quick skill type identification

### 7. Character State Management
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

### 8. Dynamic Skill Calculations
**Location**: `skill-calculations.js`

**Max Level Modifiers**:
- **Specialization**: +1 max level per 2 points for active skills
- **Barkskin**: +1 max level per 5 character levels (self-scaling)
- **Noxious Mastery**: +1 Curare max level per 2 points

**Devotion Checking**:
- Validates Melee Devotion restrictions
- Prevents allocation of groups of skills when devotion is active
- Real-time checking as skills are allocated

### 9. Python Data Validation Suite
**Location**: `py/` folder

**Scripts**:

1. **`validate_skill_placeholders.py`**
   - Checks all skill placeholders against scaling/stat data
   - Finds missing stats, invalid keys, bad references
   - Outputs error and summary reports

2. **`extract_placeholder_skills.py`**
   - Extracts skills using `{{placeholder}}` in descriptions/restrictions
   - Counts placeholder and stat usages
   - Groups output by class and category

3. **`extract_skills_without_placeholders.py`**
   - Lists skills with text but no `{{placeholder}}`
   - Helps identify legacy or incomplete skill info

4. **`extract_non_placeholder_lines.py`**
   - Extracts all non-placeholder description/restriction text lines
   - Useful for finding standard phrases, warnings, or static lines

5. **`validate_effect_csv.py`**
   - Checks `effect.csv` for placeholder/scaling correctness
   - Validates icon, formula, and parameter fields
   - Finds references to missing or deprecated stat keys

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

### Dynamic Table Generation
The scaling table dynamically adjusts based on stat formats:
- Analyzes format strings to count required parameters
- Shows only needed input fields
- Disables unused fields with "N/A" placeholder
- Maintains consistent 4-column layout for button positioning


### Database Integration
- Uses SQL.js for client-side SQLite operations
- Supports import/export of database files
- Real-time validation of stat references
- Efficient caching of frequently accessed data

### Dependencies
- **SQL.js**: Client-side SQLite database
- **Bulma CSS**: UI framework
- **DataTables**: Skills listing table
- **Font Awesome**: Icons for navigation
- **Python 3.9+**: For data extraction and validation scripts
