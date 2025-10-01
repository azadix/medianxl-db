# MedianXL Skills Database Project - Development Summary

## Project Overview
This is a web-based skills database editor for MedianXL (Diablo 2 mod) that allows users to manage skills, stats, classes, tags, and skill scaling data through a SQLite database interface.

## Current Architecture

### Core Files
- **`db.html`** - Main database editor interface (1,624 lines)
- **`script.js`** - Skills viewer and detail display (400 lines)
- **`utils.js`** - Utility functions for placeholder expansion and icon handling (286 lines)
- **`DropdownList.js`** - Custom dropdown component (238 lines)
- **`dropdown-style.css`** - Styling for dropdown components (72 lines)
- **`skills.sqlite`** - SQLite database containing all skills data
- **`index.html`** - Skills listing page with DataTable integration
- **`tree.html`** - Skills tree visualization

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

### 1. Automatic Parameter Expansion System
**Location**: `utils.js` (lines 101-125, 130-174, 180-237)

**Problem Solved**: Users had to manually specify parameter counts like `{{mana_cost:%value0%}}` instead of just `{{mana_cost}}`.

**Solution**: 
- `getStatParameterCount()` - Analyzes stat format to determine required parameters
- `autoExpandStatToken()` - Automatically generates parameter placeholders
- Updated `expandPlaceholders()` and `expandPlaceholdersWithScaling()` to support auto-expansion

**Usage**: Now supports both `{{mana_cost}}` (auto-expands) and `{{mana_cost:15}}` (explicit values)

### 2. Enhanced Skill Scaling Interface
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

### 3. Improved Navigation System
**Location**: `db.html` (lines 621-646)

**Features**:
- **Visual active state**: Active section button shows with `is-primary` class
- **Prevent re-clicking**: Active section cannot be clicked again (prevents accidental hiding)
- **Proper state management**: Only one section active at a time

### 4. UI/UX Improvements
**Location**: Various sections in `db.html`

**Changes**:
- **Tag form alignment**: Fixed button alignment with input fields using proper Bulma structure
- **Class/Tab forms**: Added proper label spacing and button alignment
- **Scaling level input**: Connected input and load button using `has-addons` field
- **Removed redundant elements**: Eliminated `scaling-add-stat-desc` element
- **Dropdown positioning**: Fixed dropdown centering using `transform: translateY(-50%)`

### 5. Data Extraction Tools
**File**: `extract_placeholder_skills.py`

**Purpose**: Extracts skills that use `{{*}}` placeholder format from database
**Output**: Lists all skills with placeholders, grouped by class, with usage statistics

**Current Results**:
- 6 skills use placeholder format
- 9 unique stat keys used
- Most common: `mana_cost` (4 times), `poison_dot` (2 times)

## Technical Implementation Details

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
- Preview system for testing placeholder expansion

## Development Environment

### Dependencies
- **SQL.js**: Client-side SQLite database
- **Bulma CSS**: UI framework
- **DataTables**: Skills listing table
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
- `expandPlaceholders()` - Core placeholder expansion logic
- `renderScalingRows()` - Dynamic table generation
- `updateLevelIndicator()` - Level status display
- `populateScalingSelectors()` - Dropdown initialization

### Testing
- Use the preview system in Stats section to test placeholder expansion
- Test scaling interface with different stat formats
- Verify auto-expansion works with various placeholder patterns

## Getting Started for New Developers

1. **Setup**: Open `db.html` in a web server (Python `http.server` works)
2. **Database**: Ensure `skills.sqlite` is present and accessible
3. **Testing**: Use the Stats section preview to test placeholder expansion
4. **Development**: Focus on `utils.js` for core logic, `db.html` for UI changes

---
*Last updated: Current session - All major features implemented and tested*
