# MedianXL Skills Database Project

## Project Overview
This is a web-based skills database editor and interactive skill tree calculator for MedianXL (Diablo 2 mod). It allows users to manage skills, stats, classes, tags, and skill scaling data through a SQLite database interface, while also providing a fully functional skill tree with character build planning capabilities.

## Current Architecture

### Core Files
- **`index.html`** - Skills listing page with DataTable integration
- **`edit.html`** - Main database editor interface
- **`tree.html`** - Interactive skills tree with character build planning
- **`script.js`** - Skills viewer with detail display
- **`utils.js`** - Utility functions for placeholder expansion and icon handling
- **`character-state.js`** - Character build state management (skill points, level, prerequisites)
- **`character-config.js`** - Character configuration constants
- **`skill-calculations.js`** - Dynamic skill calculations (max levels, modifiers)
- **`tag-constants.js`** - Centralized skill tag group definitions
- **`style.css`** - Main styling
- **`skills.sqlite`** - SQLite database containing all skills data

### Modular Structure
The project is organized into modular JavaScript files for better maintainability:

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
- **`validate_skill_placeholders.py`** - Validates skill description placeholders against database
- **`extract_placeholder_skills.py`** - Extracts skills with placeholder format
- **`extract_skills_without_placeholders.py`** - Finds skills missing placeholders
- **`extract_non_placeholder_lines.py`** - Extracts non-placeholder text for analysis

### Database Schema
```sql
-- Core tables
classes (id, name, image_prefix)
classTabs (id, class_id, tab_index, name)
skills (id, name, display_name, class_id, tab_index, row, col, image, restriction, description)
skilltags (id, name)
skill_skilltags (skill_id, tag_id) -- Many-to-many relationship

-- Stats and scaling system
stats (id, key, name, description, unit, format)
skill_scaling (skill_id, level, stat_id, value0, value1, value2, value3)
skill_max_levels (skill_id, base_max_level, affected_by_specialization, can_add_points)
skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, description)
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
- **Warning system**: Visual indicators for unmet prerequisites
- **Quest tracking**: Den of Evil, Radament, Izual, and Inquisitor of the Triune

**Character Management**:
- Level selector (1-120) with automatic skill point calculation
- Quest completion toggles for bonus skill points
- Class-specific trees with tab navigation
- Import/export build functionality

### 2. Skills Viewer
**Location**: `script.js`

**Features**:
- **Level selector**: Dropdown below description for easy access
- **Smart back navigation**: Preserves filter state and tree navigation state
- **URL state management**: Remembers filter settings when navigating back
- **Placeholder expansion**: Automatically displays scaled values at selected level

### 3. Advanced Autocomplete System
**Location**: `edit/edit-autocomplete.js`

**Features**:
- **Immediate activation**: Starts after typing `{{` or `[[`without needing closing braces
- **Fuzzy filtering**: Finds stats or skills even with partial or out-of-order characters
- **Usage-based ordering**: Stats ordered by frequency of use in descriptions
- **Smart completion**: Completes names in `{{stat}}` or `[[skill]]` format with automatic parameter expansion
- **Custom styling**: Dark theme integration with usage count display
- **Keyboard navigation**: Arrow keys, Tab completion, Escape to close
- **Line-aware replacement**: Limits replacement to current line to prevent text loss

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

**Improvements**:
- **Modular architecture**: Separated into focused JavaScript modules
- **DropdownList integration**: Searchable dropdowns throughout the interface
- **Scroll-to-top**: Edit buttons scroll to top of page for better UX
- **Dynamic form fields**: Fields show/hide based on context
- **Multiple prerequisites**: Support for multiple requirement types per skill
- **Auto-loading**: Automatically loads data when selections change
- **Level indicators**: Visual tags showing existing scaling levels
- **Template validation**: Real-time syntax checking

### 6. Automatic Parameter Expansion System
**Location**: `utils.js`

**Problem Solved**: Users no longer need to manually specify parameter counts - they simply type `{{mana_cost}}` and the system handles the rest.

**Solution**: 
- `getStatParameterCount()` - Analyzes stat format to determine required parameters
- `autoExpandStatToken()` - Automatically generates parameter placeholders
- Updated `expandPlaceholders()` and `expandPlaceholdersWithScaling()` to support auto-expansion

**Usage**: Users simply type `{{mana_cost}}` and the system automatically expands it to the correct format based on the stat's parameter requirements

### 7. Tag System
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

### 8. Character State Management
**Location**: `character-state.js`, `character-config.js`

**Features**:
- **Skill point allocation**: Track points spent in each skill
- **Level management**: Character level affects skill points and max levels
- **Quest tracking**: Toggle quest completions for bonus points
- **Max level caching**: Efficient calculation of dynamic max levels
- **Prerequisite validation**: Real-time checking of skill/level/tree requirements
- **oSkills management**: Add skills from other classes to your build
- **OR logic support**: Some skills require only ONE of multiple prerequisites
- **State persistence**: Saves to localStorage

### 9. Dynamic Skill Calculations
**Location**: `skill-calculations.js`

**Max Level Modifiers**:
- **Specialization**: +1 max level per 2 points for active skills
- **Barkskin**: +1 max level per 5 character levels (self-scaling)
- **Noxious Mastery**: +1 Curare max level per 2 points
- **Lemures**: +1 Hunting Banshee max level per 2 points
- **Mimic**: +1 Bloodstar/Bloodstorm max level per 1 point

**Devotion Checking**:
- Validates Melee Devotion restrictions
- Prevents allocation of groups of skills when devotion is active
- Real-time checking as skills are allocated

### 10. Python Data Validation Suite
**Location**: `py/` folder

**Scripts**:
1. **`validate_skill_placeholders.py`**: 
   - Validates all skill placeholders against scaling data
   - Finds missing stats, invalid references
   - Generates detailed error reports

2. **`extract_placeholder_skills.py`**:
   - Extracts all skills using `{{placeholder}}` format
   - Shows usage statistics for stat keys
   - Groups by class for analysis

3. **`extract_skills_without_placeholders.py`**:
   - Finds skills with descriptions but no placeholders
   - Useful for finding incomplete skill data

4. **`extract_non_placeholder_lines.py`**:
   - Extracts non-placeholder text from descriptions
   - Outputs to stdout for piping
   - Useful for finding common restriction text

**Usage**:
```bash
python py/validate_skill_placeholders.py
python py/extract_placeholder_skills.py
python py/extract_skills_without_placeholders.py
python py/extract_non_placeholder_lines.py
```

## Technical Implementation Details

### Character Build System
```javascript
// State management and validation flow
initializeCharacter() → allocateSkillPoint() → checkPrerequisites() → updateUI()
calculateMaxLevel() → applyMaxLevelModifiers() → cache result
```

### Skills Tree Architecture
```javascript
// Rendering and interaction
initializeTreePage() → loadSkillsFromSQLite() → renderSkills() → createSkillCard()
allocateSkillPoint() → validateAllocation() → updateSkillCard() → saveState()
```

### Tooltip System
```javascript
// Interactive tooltips with scaling
showTooltip() → getSkillCategoryTags() → buildTooltipContent() → expandPlaceholders()
// Shows Skill Category, Summon, and Teleport tags
```

### Autocomplete System
```javascript
// Fuzzy filtering with scoring and usage ordering
fuzzyFilter(stats, query) → scoring algorithm → usage ordering → top 20 results
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

## Development Environment

### Dependencies
- **SQL.js**: Client-side SQLite database
- **Bulma CSS**: UI framework
- **DataTables**: Skills listing table
- **Font Awesome**: Icons for navigation
- **Python 3.9+**: For data extraction and validation scripts

### File Structure
```
medianxl-db/
├── index.html              # Skills listing page
├── edit.html               # Database editor interface
├── tree.html               # Interactive skill tree & build planner
├── script.js               # Skills viewer
├── utils.js                # Utility functions
├── character-state.js      # Character build state management
├── character-config.js     # Character configuration
├── skill-calculations.js   # Dynamic skill calculations
├── tag-constants.js        # Tag group definitions
├── style.css               # Main styling
├── skills.sqlite           # Database file
├── edit/                   # Editor modules
│   ├── edit-core.js        # Core functionality
│   ├── edit-skills.js      # Skills management
│   ├── edit-tags.js        # Tags management
│   ├── edit-classes.js     # Classes/tabs management
│   ├── edit-stats.js       # Stats management
│   ├── edit-scaling.js     # Scaling management
│   ├── edit-max-levels.js  # Max levels management
│   ├── edit-prerequisites.js # Prerequisites management
│   ├── edit-autocomplete.js # Autocomplete functionality
│   ├── edit-validation.js  # Template syntax validation
│   ├── DropdownList.js     # Custom dropdown component
│   └── dropdown-style.css  # Dropdown styling
├── tree/                   # Tree viewer modules
│   ├── tree-core.js        # Core tree functionality & skill allocation
│   ├── tree-data.js        # Data loading
│   ├── tree-render.js      # Tree rendering
│   ├── tree-card-renderer.js # Skill card creation
│   ├── tree-arrows.js      # Prerequisite arrows
│   ├── tree-tooltip.js     # Interactive tooltips
│   ├── tree-styles.css     # Tree styling
│   └── ToastManager.js     # Toast notifications
├── py/                     # Python scripts
│   ├── validate_skill_placeholders.py
│   ├── extract_placeholder_skills.py
│   ├── extract_skills_without_placeholders.py
│   └── extract_non_placeholder_lines.py
└── icons/                  # Skill icons organized by class
```

## Key Functions to Understand

### Character Build System
- `initializeCharacter()` - Initialize character state for a class
- `allocateSkillPoint()` - Add point to a skill with validation
- `removeSkillPoint()` - Remove point from a skill
- `checkPrerequisites()` - Validate all prerequisites for a skill
- `calculateMaxLevel()` - Calculate dynamic max level with modifiers
- `getAvailableSkillPoints()` - Calculate remaining skill points
- `saveCharacterState()` / `loadCharacterState()` - Persistence

### Skills Viewer
- `displaySkillDetail()` - Main skill detail display with Wikipedia layout
- `initializeFilterState()` - Reads and applies filter state from URL
- `updateFilterState()` - Updates URL with current filter state

### Tree Visualization
- `initializeTreePage()` - Sets up tree page and reads URL state
- `renderSkills()` - Renders skills grid with tabs and navigation
- `createSkillCard()` - Creates individual skill cards with allocation controls
- `updateUrlState()` - Updates URL with class/tab state
- `showTooltip()` - Display skill tooltip with scaling values

### Autocomplete System
- `fuzzyFilter()` - Advanced autocomplete filtering with scoring
- `showAutocomplete()` - Displays autocomplete dropdown
- `completeStat()` - Handles stat completion and insertion

### Validation System
- `validateTemplateSyntax()` - Check for template syntax errors
- `validateDescriptionBeforeSave()` - Validate before database save
- `checkBraceMatching()` - Verify matching braces

### Database Operations
- `expandPlaceholdersWithScaling()` - Core placeholder expansion logic
- `renderScalingRows()` - Dynamic table generation
- `updateLevelIndicator()` - Level status display
- `populatePrerequisiteSelectors()` - Dropdown initialization

## Getting Started

1. **Usage**: 
   - Open `index.html` for skills listing
   - Open `tree.html` for interactive skill tree and build planning
   - Open `edit.html` for database editing (only enabled on localhost)

2. **Database**: Ensure `skills.sqlite` is present and accessible
