# MedianXL Skills Database Project

## Project Overview
This is a web-based skills database editor for MedianXL (Diablo 2 mod) that allows users to manage skills, stats, classes, tags, and skill scaling data through a SQLite database interface. The project includes both a database editor and a skills viewer with advanced features like scaling graphs, autocomplete, and tree visualization.

## Current Architecture

### Core Files
- **`index.html`** - Skills listing page with DataTable integration and Chart.js
- **`edit.html`** - Main database editor interface
- **`tree.html`** - Skills tree visualization with class/tab navigation
- **`script.js`** - Skills viewer with scaling graphs and detail display (761 lines)
- **`utils.js`** - Utility functions for placeholder expansion and icon handling (294 lines)
- **`DropdownList.js`** - Custom dropdown component (238 lines)
- **`dropdown-style.css`** - Styling for dropdown components (72 lines)
- **`style.css`** - Additional styling for skill details and graphs
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

#### Tree Viewer (`tree/` folder)
- **`tree-core.js`** - Core tree functionality and state management
- **`tree-data.js`** - Data loading from SQLite
- **`tree-render.js`** - Skills rendering and grid layout
- **`tree-arrows.js`** - Prerequisite arrows rendering
- **`tree-styles.css`** - Tree-specific styling

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

### 1. Skills Viewer with Scaling Graphs
**Location**: `script.js`

**Features**:
- **Wikipedia-style layout**: Skill image positioned in top-right corner
- **Level selector**: Dropdown below description for easy access
- **Individual scaling graphs**: Separate charts for each stat in 2-column layout
- **Collapsible graphs**: Graphs section starts collapsed to reduce visual noise
- **Chart.js integration**: Interactive line charts showing scaling progression
- **Smart back navigation**: Preserves filter state and tree navigation state
- **URL state management**: Remembers filter settings when navigating back

### 2. Advanced Autocomplete System
**Location**: `edit/edit-autocomplete.js`

**Features**:
- **Immediate activation**: Starts after typing `{{` without needing closing braces
- **Fuzzy filtering**: Finds stats even with partial or out-of-order characters
- **Usage-based ordering**: Stats ordered by frequency of use in descriptions
- **Smart completion**: Completes stat names in `{{stat}}` format with automatic parameter expansion
- **Custom styling**: Dark theme integration with usage count display
- **Keyboard navigation**: Arrow keys, Tab completion, Escape to close
- **Line-aware replacement**: Limits replacement to current line to prevent text loss

**Scoring System**:
- Exact match: 1000 points
- Starts with query: 500+ points  
- Contains query: 200+ points
- Name contains query: 100+ points
- Fuzzy match: 50+ points

### 3. Skills Tree Visualization
**Location**: `tree/` folder

**Features**:
- **Class-based navigation**: Dropdown to select different character classes
- **Tab-based organization**: Skills organized by class tabs (e.g., Combat, Magic)
- **Grid layout**: Skills displayed in a grid matching game layout
- **Prerequisite arrows**: Visual connections between prerequisite skills
- **State preservation**: Remembers selected class and tab when navigating
- **URL parameters**: Clean URLs with class and tab information
- **Skill links**: Direct navigation to skill details with preserved state

### 4. Enhanced Database Editor
**Location**: `edit/` folder

**Improvements**:
- **Modular architecture**: Separated into focused JavaScript modules
- **DropdownList integration**: Searchable dropdowns throughout the interface
- **Scroll-to-top**: Edit buttons scroll to top of page for better UX
- **Dynamic form fields**: Fields show/hide based on context
- **Multiple prerequisites**: Support for multiple requirement types per skill
- **Auto-loading**: Automatically loads data when selections change
- **Level indicators**: Visual tags showing existing scaling levels

### 5. Automatic Parameter Expansion System
**Location**: `utils.js`

**Problem Solved**: Users no longer need to manually specify parameter counts - they simply type `{{mana_cost}}` and the system handles the rest.

**Solution**: 
- `getStatParameterCount()` - Analyzes stat format to determine required parameters
- `autoExpandStatToken()` - Automatically generates parameter placeholders
- Updated `expandPlaceholders()` and `expandPlaceholdersWithScaling()` to support auto-expansion

**Usage**: Users simply type `{{mana_cost}}` and the system automatically expands it to the correct format based on the stat's parameter requirements

### 6. URL State Management
**Features**:
- **Filter state preservation**: Skills list remembers filter settings (Show all, Show only with details, Show only without details)
- **Tree state preservation**: Tree page remembers class and tab selection
- **Smart back navigation**: Back buttons preserve appropriate state
- **Clean URLs**: Simple parameter structure (`?class=Paladin&tab=Aspects`)
- **Browser navigation**: Back/forward buttons work correctly with preserved state

### 7. Enhanced Prerequisites System
**Location**: `edit/edit-prerequisites.js`

**Features**:
- **Multiple requirement types**: Support for character level, skill level, and tree points simultaneously
- **Dynamic field management**: Fields enable/disable based on requirement type
- **Target validation**: Ensures proper target skills/tabs are selected
- **Flexible form layout**: Separate rows for different requirement types
- **Edit functionality**: Loads all prerequisites for a skill when editing

## Technical Implementation Details

### Skills Viewer Architecture
```javascript
// Wikipedia-style layout with scaling graphs
displaySkillDetail() → createScalingGraphs() → initializeScalingCharts()
```

### Chart.js Integration
- **Individual stat graphs**: Each stat gets its own chart in 2-column layout
- **Interactive features**: Hover tooltips, legend toggles, smooth animations
- **Data processing**: Groups scaling data by stat and sorts by level
- **Color coding**: Each stat gets a unique color from predefined palette

### Autocomplete System
```javascript
// Fuzzy filtering with scoring and usage ordering
fuzzyFilter(stats, query) → scoring algorithm → usage ordering → top 10 results
```

### Placeholder Expansion Logic
```javascript
// Auto-expansion example
{{mana_cost}} → {{mana_cost:%value0%}} (if format is "{name}: {value0}")
{{cold_damage}} → {{cold_damage:%value0%,%value1%}} (if format is "{name}: {value0}-{value1}")
```

### Tree Visualization
```javascript
// State management and rendering
initializeTreePage() → loadSkillsFromSQLite() → renderSkills() → createSkillCard()
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
- Chart.js for interactive data visualization

## Development Environment

### Dependencies
- **SQL.js**: Client-side SQLite database
- **Bulma CSS**: UI framework
- **DataTables**: Skills listing table
- **Chart.js**: Interactive charts for scaling graphs
- **Font Awesome**: Icons for navigation
- **Python 3.9+**: For data extraction scripts

### File Structure
```
medianxl-db/
├── index.html              # Skills listing page
├── edit.html               # Database editor interface
├── tree.html               # Skills tree visualization
├── script.js               # Skills viewer (761 lines)
├── utils.js                # Utility functions (294 lines)
├── DropdownList.js         # Custom dropdown component
├── dropdown-style.css      # Dropdown styling
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
│   └── edit-autocomplete.js # Autocomplete functionality
├── tree/                   # Tree viewer modules
│   ├── tree-core.js        # Core tree functionality
│   ├── tree-data.js        # Data loading
│   ├── tree-render.js      # Skills rendering
│   ├── tree-arrows.js      # Prerequisite arrows
│   └── tree-styles.css     # Tree styling
├── icons/                  # Skill icons organized by class
└── extract_*.py           # Data extraction scripts
```

## Key Functions to Understand

### Skills Viewer
- `displaySkillDetail()` - Main skill detail display with Wikipedia layout
- `createScalingGraphs()` - Generates individual stat graph containers
- `initializeScalingCharts()` - Creates Chart.js instances for scaling visualization
- `initializeFilterState()` - Reads and applies filter state from URL
- `updateFilterState()` - Updates URL with current filter state

### Tree Visualization
- `initializeTreePage()` - Sets up tree page and reads URL state
- `renderSkills()` - Renders skills grid with tabs and navigation
- `createSkillCard()` - Creates individual skill cards with links
- `updateUrlState()` - Updates URL with class/tab state

### Autocomplete System
- `fuzzyFilter()` - Advanced autocomplete filtering with scoring
- `showAutocomplete()` - Displays autocomplete dropdown
- `completeStat()` - Handles stat completion and insertion

### Database Operations
- `expandPlaceholders()` - Core placeholder expansion logic
- `renderScalingRows()` - Dynamic table generation
- `updateLevelIndicator()` - Level status display
- `populatePrerequisiteSelectors()` - Dropdown initialization

## Getting Started

1. **Setup**: Open `index.html` for skills viewer, `edit.html` for database editor, or `tree.html` for tree visualization
2. **Database**: Ensure `skills.sqlite` is present and accessible
3. **Testing**: 
   - Test skills viewer with different skills to see scaling graphs
   - Test autocomplete in description field with various stat names
   - Test tree navigation and state preservation
   - Test filter functionality and URL state management

## Recent Updates

- **Modular Architecture**: Extracted JavaScript into organized modules for better maintainability
- **Tree Visualization**: Added complete skills tree with class/tab navigation
- **URL State Management**: Implemented state preservation across navigation
- **Enhanced Autocomplete**: Restored original styling and usage-based ordering
- **Multiple Prerequisites**: Support for multiple requirement types per skill
- **Smart Back Navigation**: Context-aware back buttons with state preservation

---
*Last updated: 07.10.2025 18:36 - Complete modular architecture with tree visualization and URL state management*