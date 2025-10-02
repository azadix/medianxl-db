-- MedianXL Skills Database - Initial Schema
-- This file creates the complete database structure for the MedianXL skills database
-- Version: 1.0
-- Created: 2025-10-02

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Classes table - stores character classes (Amazon, Sorceress, etc.)
CREATE TABLE classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    image_prefix TEXT
);

-- Class tabs table - stores skill tree tabs for each class
CREATE TABLE classTabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    tab_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    UNIQUE(class_id, tab_index)
);

-- Skill tags table - stores categorization tags for skills
CREATE TABLE skilltags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- Skills table - main skills data
CREATE TABLE skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    class_id INTEGER,
    tab_index INTEGER,
    row INTEGER,
    col INTEGER,
    image TEXT,
    restriction TEXT,
    description TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- Many-to-many relationship between skills and tags
CREATE TABLE skill_skilltags (
    skill_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (skill_id, tag_id),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES skilltags(id) ON DELETE CASCADE
);

-- ============================================================================
-- STATS AND SCALING SYSTEM
-- ============================================================================

-- Stats table - defines stat types and their formatting
CREATE TABLE stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT,
    format TEXT DEFAULT '{name}: {value0}'
);

-- Skill scaling table - stores stat values per skill level
CREATE TABLE skill_scaling (
    skill_id INTEGER NOT NULL,
    level INTEGER NOT NULL,
    stat_id INTEGER NOT NULL,
    value0 REAL NOT NULL,
    value1 REAL NOT NULL,
    value2 REAL NOT NULL,
    value3 REAL NOT NULL,
    PRIMARY KEY (skill_id, level, stat_id),
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
    FOREIGN KEY (stat_id) REFERENCES stats(id) ON DELETE CASCADE
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for skill lookups by class and position
CREATE INDEX idx_skills_class_position ON skills(class_id, tab_index, row, col);

-- Index for skill scaling lookups
CREATE INDEX idx_skill_scaling_skill_level ON skill_scaling(skill_id, level);

-- Index for stat key lookups (case-insensitive)
CREATE INDEX idx_stats_key ON stats(key COLLATE NOCASE);

-- Index for skill tags relationships
CREATE INDEX idx_skill_skilltags_skill ON skill_skilltags(skill_id);
CREATE INDEX idx_skill_skilltags_tag ON skill_skilltags(tag_id);

-- ============================================================================
-- INITIAL DATA (Optional - can be populated separately)
-- ============================================================================

-- Default classes (uncomment if you want to pre-populate)
/*
INSERT INTO classes (name, image_prefix) VALUES
    ('Amazon', 'ama'),
    ('Sorceress', 'sor'),
    ('Necromancer', 'nec'),
    ('Paladin', 'pal'),
    ('Barbarian', 'bar'),
    ('Druid', 'dru'),
    ('Assassin', 'ass'),
    ('Other', 'shared');
*/

-- Common skill tags (uncomment if you want to pre-populate)
/*
INSERT INTO skilltags (name) VALUES
    ('Fire'),
    ('Cold'),
    ('Lightning'),
    ('Physical'),
    ('Poison'),
    ('Magic'),
    ('Necromancy'),
    ('Passive'),
    ('Active'),
    ('Teleport'),
    ('Aura'),
    ('Curse'),
    ('Summon'),
    ('Melee'),
    ('Ranged'),
    ('Spell'),
    ('Buff'),
    ('Debuff'),
    ('Utility'),
    ('Movement');
*/

-- ============================================================================
-- VIEWS FOR COMMON QUERIES (Optional)
-- ============================================================================

-- View for skills with their class and tab information
CREATE VIEW v_skills_detailed AS
SELECT 
    s.id,
    s.name,
    s.display_name,
    s.row,
    s.col,
    s.image,
    s.restriction,
    s.description,
    c.name AS class_name,
    c.image_prefix AS class_prefix,
    ct.name AS tab_name,
    ct.tab_index,
    GROUP_CONCAT(st.name, ', ') AS tags
FROM skills s
LEFT JOIN classes c ON s.class_id = c.id
LEFT JOIN classTabs ct ON s.tab_index = ct.id
LEFT JOIN skill_skilltags sst ON s.id = sst.skill_id
LEFT JOIN skilltags st ON sst.tag_id = st.id
GROUP BY s.id;

-- View for skill scaling with stat information
CREATE VIEW v_skill_scaling_detailed AS
SELECT 
    ss.skill_id,
    s.display_name AS skill_name,
    ss.level,
    st.key AS stat_key,
    st.name AS stat_name,
    st.format AS stat_format,
    ss.value0,
    ss.value1,
    ss.value2,
    ss.value3
FROM skill_scaling ss
JOIN skills s ON ss.skill_id = s.id
JOIN stats st ON ss.stat_id = st.id
ORDER BY ss.skill_id, ss.level, st.name;

-- ============================================================================
-- TRIGGERS FOR DATA INTEGRITY (Optional)
-- ============================================================================

-- Trigger to ensure skill positions are valid
CREATE TRIGGER tr_skills_position_check
BEFORE INSERT ON skills
FOR EACH ROW
WHEN NEW.row < 0 OR NEW.col < 0
BEGIN
    SELECT RAISE(ABORT, 'Skill position (row, col) must be non-negative');
END;

-- Trigger to ensure skill levels are positive
CREATE TRIGGER tr_skill_scaling_level_check
BEFORE INSERT ON skill_scaling
FOR EACH ROW
WHEN NEW.level <= 0
BEGIN
    SELECT RAISE(ABORT, 'Skill level must be positive');
END;

-- ============================================================================
-- SCHEMA VERSION TRACKING
-- ============================================================================

-- Table to track schema version for future migrations
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- Insert initial version
INSERT INTO schema_version (version, description) VALUES 
    (1, 'Initial database schema with classes, skills, stats, and scaling system');
