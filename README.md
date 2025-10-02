# MedianXL Skills Database Project - Development Summary

## Project Overview
This is a web-based skills database editor for MedianXL (Diablo 2 mod) that allows users to manage skills, stats, classes, tags, and skill scaling data through a SQLite database interface. The project includes both a database editor and a skills viewer with advanced features like scaling graphs and autocomplete.

## Current Architecture

### Core Files
- **`db.html`** - Main database editor interface (1,977 lines)
- **`script.js`** - Skills viewer with scaling graphs and detail display (602 lines)
- **`utils.js`** - Utility functions for placeholder expansion and icon handling (286 lines)
- **`DropdownList.js`** - Custom dropdown component (238 lines)
- **`dropdown-style.css`** - Styling for dropdown components (72 lines)
- **`skills.sqlite`** - SQLite database containing all skills data
- **`index.html`** - Skills listing page with DataTable integration and Chart.js
- **`tree.html`** - Skills tree visualization
- **`style.css`** - Additional styling for skill details and graphs

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
```

## Recent Major Features Implemented

### 1. Skills Viewer with Scaling Graphs
**Location**: `script.js` (lines 158-433)

**Features**:
- **Wikipedia-style layout**: Skill image positioned in top-right corner
- **Level selector**: Dropdown below description for easy access
- **Individual scaling graphs**: Separate charts for each stat in 2-column layout
- **Collapsible graphs**: Graphs section starts collapsed to reduce visual noise
- **Chart.js integration**: Interactive line charts showing scaling progression
- **Minimum level validation**: Only shows graphs when skill has 2+ levels of data

**Key Functions**:
- `createScalingGraphs()` - Generates individual graph containers
- `initializeScalingCharts()` - Creates Chart.js instances for each stat
- `fuzzyFilter()` - Advanced filtering for stat autocomplete

### 2. Advanced Autocomplete System
**Location**: `db.html` (lines 1672-1947)

**Features**:
- **Immediate activation**: Starts after typing `{{` without needing closing braces
- **Fuzzy filtering**: Finds stats even with partial or out-of-order characters
- **Smart completion**: Completes stat names in `{{stat}}` format with automatic parameter expansion
- **Dark theme integration**: Uses dropdown-style.css for consistent theming
- **Keyboard navigation**: Arrow keys, Tab completion, Escape to close
- **Auto-scrolling**: Selected items scroll into view automatically

**Scoring System**:
- Exact match: 1000 points
- Starts with query: 500+ points  
- Contains query: 200+ points
- Name contains query: 100+ points
- Fuzzy match: 50+ points

### 3. Enhanced Database Editor
**Location**: `db.html` (lines 1349-1378)

**Improvements**:
- **DropdownList integration**: Skill select in scaling section uses searchable dropdown
- **Auto-loading**: Automatically loads scaling data when skill is selected
- **Scroll-to-top**: Edit skill button scrolls to top of page
- **Removed preview/validation**: Cleaned up unused preview system
- **Better button styling**: Updated to use outlined buttons for better visual hierarchy

### 4. Automatic Parameter Expansion System
**Location**: `utils.js` (lines 101-125, 130-174, 180-237)

**Problem Solved**: Users no longer need to manually specify parameter counts - they simply type `{{mana_cost}}` and the system handles the rest.

**Solution**: 
- `getStatParameterCount()` - Analyzes stat format to determine required parameters
- `autoExpandStatToken()` - Automatically generates parameter placeholders
- Updated `expandPlaceholders()` and `expandPlaceholdersWithScaling()` to support auto-expansion

**Usage**: Users simply type `{{mana_cost}}` and the system automatically expands it to the correct format based on the stat's parameter requirements

### 5. Enhanced Skill Scaling Interface
**Location**: `db.html` (lines 1319-1384, 1520-1560)

**Features**:
- **Dynamic input fields**: Only shows value inputs needed based on stat format
- **Auto-loading**: Automatically loads level 1 when skill is selected
- **Level change auto-load**: No need to click "Load" button when changing levels
- **Level indicator**: Shows which levels already exist in database as colored tags
- **Consistent table layout**: Always shows 4 value columns but disables unused ones

**Key Functions**:
- `renderScalingRows()` - Dynamically renders table based on stat formats
- `updateLevelIndicator()` - Shows existing levels for current skill
- Auto-load event listeners for skill select and level input

### 6. Data Extraction Tools
**File**: `extract_placeholder_skills.py`

**Purpose**: Extracts skills that use `{{*}}` placeholder format from database
**Output**: Lists all skills with placeholders, grouped by class, with usage statistics

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
// Fuzzy filtering with scoring
fuzzyFilter(stats, query) → scoring algorithm → top 10 results
```

### Placeholder Expansion Logic
```javascript
// Auto-expansion example
{{mana_cost}} → {{mana_cost:%value0%}} (if format is "{name}: {value0}")
{{cold_damage}} → {{cold_damage:%value0%,%value1%}} (if format is "{name}: {value0}-{value1}")
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
- **Python 3.9+**: For data extraction scripts

### File Structure
```
medianxl-db/
├── db.html              # Main editor interface
├── script.js            # Skills viewer
├── utils.js             # Utility functions
├── DropdownList.js      # Custom dropdown
├── dropdown-style.css   # Dropdown styling
├── skills.sqlite        # Database file
├── extract_placeholder_skills.py  # Data extraction
├── skill_data/          # JSON skill files (200 files)
├── icons/               # Skill icons organized by class
└── details.md           # This file
```

## Known Issues & Future Improvements

### Current Limitations
1. **Icon system**: Uses atlas-based icons with manual positioning calculations
2. **Skill data**: Some skills may not have complete scaling data
3. **Validation**: Limited validation of stat key references
4. **Performance**: Large skill lists might need pagination

### Potential Enhancements
1. **Bulk operations**: Import/export multiple skills at once
2. **Advanced filtering**: Filter skills by multiple criteria
3. **Skill relationships**: Define skill prerequisites or synergies
4. **Version control**: Track changes to skill data over time
5. **API integration**: Connect to MedianXL game data for validation

## Development Notes

### Code Style
- Uses ES6 modules and modern JavaScript
- Bulma CSS framework for consistent styling
- SQL.js for database operations
- Event-driven architecture for UI interactions

### Key Functions to Understand
- `displaySkillDetail()` - Main skill detail display with Wikipedia layout
- `createScalingGraphs()` - Generates individual stat graph containers
- `initializeScalingCharts()` - Creates Chart.js instances for scaling visualization
- `fuzzyFilter()` - Advanced autocomplete filtering with scoring
- `expandPlaceholders()` - Core placeholder expansion logic
- `renderScalingRows()` - Dynamic table generation
- `updateLevelIndicator()` - Level status display
- `populateScalingSelectors()` - Dropdown initialization

### Testing
- Test skills viewer with different skills to see scaling graphs
- Test autocomplete in description field with various stat names
- Test scaling interface with different stat formats
- Verify auto-expansion works with various placeholder patterns

## Getting Started for New Developers

1. **Setup**: Open `index.html` for skills viewer or `db.html` for database editor in a web server
2. **Database**: Ensure `skills.sqlite` is present and accessible
3. **Testing**: 
   - Test skills viewer with different skills to see scaling graphs
   - Test autocomplete in description field with various stat names
   - Test scaling interface with different stat formats
4. **Development**: 
   - `script.js` for skills viewer and graph functionality
   - `db.html` for database editor and autocomplete
   - `utils.js` for core placeholder expansion logic

---
*Last updated: Current session - Skills viewer with graphs, autocomplete system, and cleaned up preview/validation*
