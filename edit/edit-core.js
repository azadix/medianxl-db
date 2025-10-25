// Core database functionality and initialization
import { showDatabaseError } from '../utils.js';

export const SkillDB = {
  db: null,
  SQL: null
};

// Initialize the database and populate all sections
export async function initializePage() {
  try {
    // Get version-aware database file
    const { getDatabaseFile } = await import('../version-config.js');
    const dbFile = getDatabaseFile();
    
    // Fetch SQLite file
    const response = await fetch(dbFile);
    if (!response.ok) {
      throw new Error(`Failed to load database file: ${dbFile}`);
    }

    const buffer = await response.arrayBuffer();

    // Initialize SQL.js
    SkillDB.SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}` });
    SkillDB.db = new SkillDB.SQL.Database(new Uint8Array(buffer));

    // Run migration if needed
    await migrateDatabaseToVersions();

    // Initialize all sections
    await import('./edit-skills.js').then(m => m.initializeSkills());
    await import('./edit-tags.js').then(m => m.initializeTags());
    await import('./edit-classes.js').then(m => m.initializeClasses());
    await import('./edit-stats.js').then(m => m.initializeStats());
    await import('./edit-scaling.js').then(m => m.initializeScaling());
    await import('./edit-max-levels.js').then(m => m.initializeMaxLevels());
    await import('./edit-prerequisites.js').then(m => m.initializePrerequisites());
    await import('./edit-autocomplete.js').then(m => m.initializeAutocomplete());
    await import('./edit-versions.js').then(m => m.initializeVersions());
    
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    
    // Show error toast and disable the interface
    showDatabaseStatusToast(`Failed to load database: ${err.message}`, 'error');
    showDatabaseError(err.message);
    
    // Don't try to fall back to empty database - if we can't load the real one, 
    // the app shouldn't run with empty data
    throw err;
  }
}

// Show toast notification for database status
function showDatabaseStatusToast(message, type) {
  // Try to use ToastManager if available
  if (window.toastManager) {
    window.toastManager.showToast(message, true, type);
  } else {
    // Fallback to alert if ToastManager not available
    alert(message);
  }
}


// Initialize empty database with schema
export async function initDatabase() {
  SkillDB.db = new SkillDB.SQL.Database();

  SkillDB.db.run(`
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      major INTEGER NOT NULL,
      minor INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      UNIQUE(major, minor)
    );
    CREATE TABLE classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      image_prefix TEXT
    );
    CREATE TABLE classTabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      tab_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      UNIQUE(class_id, tab_index)
    );
    CREATE TABLE skilltags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
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
      skill_effect TEXT,
      version_id INTEGER NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
      FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
    );
    CREATE TABLE skill_skilltags (
      skill_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (skill_id, tag_id),
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES skilltags(id) ON DELETE CASCADE
    );
    CREATE TABLE stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      description TEXT,
      unit TEXT,
      format TEXT DEFAULT "{name}: {value}"
    );
    CREATE TABLE skill_scaling (
      skill_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      stat_id INTEGER NOT NULL,
      occurrence_index INTEGER NOT NULL DEFAULT 0,
      value0 TEXT NOT NULL,
      value1 TEXT NOT NULL,
      value2 TEXT NOT NULL,
      value3 TEXT NOT NULL,
      version_id INTEGER NOT NULL,
      PRIMARY KEY (skill_id, level, stat_id, occurrence_index, version_id),
      FOREIGN KEY (skill_id) REFERENCES skills(id),
      FOREIGN KEY (stat_id) REFERENCES stats(id),
      FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
    );
    CREATE TABLE skill_scaling_constants (
      skill_id INTEGER NOT NULL,
      stat_id INTEGER NOT NULL,
      occurrence_index INTEGER NOT NULL DEFAULT 0,
      value0 TEXT DEFAULT '',
      value1 TEXT DEFAULT '',
      value2 TEXT DEFAULT '',
      value3 TEXT DEFAULT '',
      value0_constant BOOLEAN DEFAULT 0,
      value1_constant BOOLEAN DEFAULT 0,
      value2_constant BOOLEAN DEFAULT 0,
      value3_constant BOOLEAN DEFAULT 0,
      version_id INTEGER NOT NULL,
      PRIMARY KEY (skill_id, stat_id, occurrence_index, version_id),
      FOREIGN KEY (skill_id) REFERENCES skills(id),
      FOREIGN KEY (stat_id) REFERENCES stats(id),
      FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
    );
    CREATE TABLE skill_max_levels (
      skill_id INTEGER NOT NULL,
      base_max_level INTEGER NOT NULL DEFAULT 1,
      affected_by_specialization BOOLEAN NOT NULL DEFAULT 0,
      can_add_points BOOLEAN NOT NULL DEFAULT 1,
      version_id INTEGER NOT NULL,
      PRIMARY KEY (skill_id, version_id),
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
    );
    CREATE TABLE skill_prerequisites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL,
      requirement_type TEXT NOT NULL,
      requirement_value INTEGER NOT NULL,
      target_skill_id INTEGER,
      target_tab_id INTEGER,
      version_id INTEGER NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (target_skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (target_tab_id) REFERENCES classTabs(id) ON DELETE CASCADE,
      FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
    );
  `);

  // Initialize with some basic data
  SkillDB.db.run(`INSERT INTO classes (name, image_prefix) VALUES ('Amazon', 'ama'), ('Assassin', 'ass'), ('Barbarian', 'bar'), ('Druid', 'dru'), ('Necromancer', 'nec'), ('Paladin', 'pal'), ('Sorceress', 'sor'), ('Other', 'shared')`);
  
  // Create default version
  // Note: Database is empty at this point (no versions table yet), so use DEFAULT_VERSION
  const { getCurrentVersion, versionToString } = await import('../version-config.js');
  const defaultVersion = getCurrentVersion(null); // Pass null since database doesn't have versions table yet
  SkillDB.db.run(`INSERT INTO versions (major, minor, name, is_active) VALUES (?, ?, ?, 1)`, 
    [defaultVersion.major, defaultVersion.minor, versionToString(defaultVersion)]);
  
  // Initialize sections
  await import('./edit-skills.js').then(m => m.initializeSkills());
  await import('./edit-tags.js').then(m => m.initializeTags());
  await import('./edit-classes.js').then(m => m.initializeClasses());
  await import('./edit-stats.js').then(m => m.initializeStats());
  await import('./edit-scaling.js').then(m => m.initializeScaling());
  await import('./edit-max-levels.js').then(m => m.initializeMaxLevels());
  await import('./edit-prerequisites.js').then(m => m.initializePrerequisites());
  await import('./edit-autocomplete.js').then(m => m.initializeAutocomplete());
  await import('./edit-versions.js').then(m => m.initializeVersions());
}

/**
 * Migrate existing database to add version support
 * Run this once to upgrade databases created before versioning system
 */
export async function migrateDatabaseToVersions() {
  if (!SkillDB.db) {
    throw new Error('Database not initialized');
  }

  try {
    // Check if versions table exists
    const checkStmt = SkillDB.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='versions'`);
    const hasVersions = checkStmt.step();
    checkStmt.free();

    if (hasVersions) {
      console.log('Database already has version support');
      return;
    }

    console.log('Migrating database to version support...');

    // Start transaction
    SkillDB.db.run('BEGIN TRANSACTION');

    // Create versions table
    SkillDB.db.run(`
      CREATE TABLE versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        major INTEGER NOT NULL,
        minor INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        UNIQUE(major, minor)
      )
    `);

    // Create default version from current version config
    const { getCurrentVersion, versionToString } = await import('../version-config.js');
    // Use database version if available, otherwise fall back to default
    const defaultVersion = getCurrentVersion(SkillDB.db);
    SkillDB.db.run(`INSERT INTO versions (major, minor, name, is_active) VALUES (?, ?, ?, 1)`, 
      [defaultVersion.major, defaultVersion.minor, versionToString(defaultVersion)]);
    
    const versionIdStmt = SkillDB.db.prepare('SELECT id FROM versions WHERE major = ? AND minor = ?');
    versionIdStmt.bind([defaultVersion.major, defaultVersion.minor]);
    const defaultVersionId = versionIdStmt.step() ? versionIdStmt.get()[0] : null;
    versionIdStmt.free();

    if (!defaultVersionId) {
      throw new Error('Failed to create default version');
    }

    // Alter tables to add version_id
    // SQLite doesn't support ALTER TABLE ADD COLUMN with NOT NULL and DEFAULT in one step
    // So we'll create new tables and copy data
    
    // 1. Skills table
    SkillDB.db.run(`
      CREATE TABLE skills_new (
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
        skill_effect TEXT,
        version_id INTEGER NOT NULL DEFAULT ?,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
        FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
      )
    `, [defaultVersionId]);
    
    SkillDB.db.run(`INSERT INTO skills_new SELECT *, ? FROM skills`, [defaultVersionId]);
    SkillDB.db.run('DROP TABLE skills');
    SkillDB.db.run('ALTER TABLE skills_new RENAME TO skills');

    // 2. skill_scaling table - change value columns to TEXT and add version_id
    SkillDB.db.run(`
      CREATE TABLE skill_scaling_new (
        skill_id INTEGER NOT NULL,
        level INTEGER NOT NULL,
        stat_id INTEGER NOT NULL,
        occurrence_index INTEGER NOT NULL DEFAULT 0,
        value0 TEXT NOT NULL,
        value1 TEXT NOT NULL,
        value2 TEXT NOT NULL,
        value3 TEXT NOT NULL,
        version_id INTEGER NOT NULL DEFAULT ?,
        PRIMARY KEY (skill_id, level, stat_id, occurrence_index, version_id),
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        FOREIGN KEY (stat_id) REFERENCES stats(id),
        FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
      )
    `, [defaultVersionId]);
    
    SkillDB.db.run(`INSERT INTO skill_scaling_new SELECT *, ? FROM skill_scaling`, [defaultVersionId]);
    SkillDB.db.run('DROP TABLE skill_scaling');
    SkillDB.db.run('ALTER TABLE skill_scaling_new RENAME TO skill_scaling');

    // 3. skill_scaling_constants table
    SkillDB.db.run(`
      CREATE TABLE skill_scaling_constants_new (
        skill_id INTEGER NOT NULL,
        stat_id INTEGER NOT NULL,
        occurrence_index INTEGER NOT NULL DEFAULT 0,
        value0 TEXT DEFAULT '',
        value1 TEXT DEFAULT '',
        value2 TEXT DEFAULT '',
        value3 TEXT DEFAULT '',
        value0_constant BOOLEAN DEFAULT 0,
        value1_constant BOOLEAN DEFAULT 0,
        value2_constant BOOLEAN DEFAULT 0,
        value3_constant BOOLEAN DEFAULT 0,
        version_id INTEGER NOT NULL DEFAULT ?,
        PRIMARY KEY (skill_id, stat_id, occurrence_index, version_id),
        FOREIGN KEY (skill_id) REFERENCES skills(id),
        FOREIGN KEY (stat_id) REFERENCES stats(id),
        FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
      )
    `, [defaultVersionId]);
    
    SkillDB.db.run(`INSERT INTO skill_scaling_constants_new SELECT *, ? FROM skill_scaling_constants`, [defaultVersionId]);
    SkillDB.db.run('DROP TABLE skill_scaling_constants');
    SkillDB.db.run('ALTER TABLE skill_scaling_constants_new RENAME TO skill_scaling_constants');

    // 4. skill_max_levels table
    SkillDB.db.run(`
      CREATE TABLE skill_max_levels_new (
        skill_id INTEGER NOT NULL,
        base_max_level INTEGER NOT NULL DEFAULT 1,
        affected_by_specialization BOOLEAN NOT NULL DEFAULT 0,
        can_add_points BOOLEAN NOT NULL DEFAULT 1,
        version_id INTEGER NOT NULL DEFAULT ?,
        PRIMARY KEY (skill_id, version_id),
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
      )
    `, [defaultVersionId]);
    
    SkillDB.db.run(`INSERT INTO skill_max_levels_new SELECT *, ? FROM skill_max_levels`, [defaultVersionId]);
    SkillDB.db.run('DROP TABLE skill_max_levels');
    SkillDB.db.run('ALTER TABLE skill_max_levels_new RENAME TO skill_max_levels');

    // 5. skill_prerequisites table
    SkillDB.db.run(`
      CREATE TABLE skill_prerequisites_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id INTEGER NOT NULL,
        requirement_type TEXT NOT NULL,
        requirement_value INTEGER NOT NULL,
        target_skill_id INTEGER,
        target_tab_id INTEGER,
        version_id INTEGER NOT NULL DEFAULT ?,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (target_skill_id) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (target_tab_id) REFERENCES classTabs(id) ON DELETE CASCADE,
        FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
      )
    `, [defaultVersionId]);
    
    SkillDB.db.run(`INSERT INTO skill_prerequisites_new SELECT *, ? FROM skill_prerequisites`, [defaultVersionId]);
    SkillDB.db.run('DROP TABLE skill_prerequisites');
    SkillDB.db.run('ALTER TABLE skill_prerequisites_new RENAME TO skill_prerequisites');

    // Commit transaction
    SkillDB.db.run('COMMIT');
    
    console.log('Database migration completed successfully');
  } catch (error) {
    SkillDB.db.run('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  }
}

// Initialize navigation and UI controls
export function initializeNavigation() {
  // Section navigation
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSection = btn.getAttribute('data-section');
      
      // Hide all sections
      document.querySelectorAll('.box').forEach(section => {
        section.style.display = 'none';
      });
      
      // Show target section
      document.getElementById(targetSection).style.display = 'block';
      
      // Update button states
      document.querySelectorAll('[data-section]').forEach(b => {
        b.className = 'button is-light is-outlined';
      });
      btn.className = 'button is-primary is-outlined';
    });
  });

  // Export database
  document.getElementById('export-db-btn').addEventListener('click', async () => {
    if (!SkillDB.db) return;

    try {
      const binaryArray = SkillDB.db.export();
      const blob = new Blob([binaryArray], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);

      // Get the version-aware database filename for export
      const { getDatabaseFile } = await import('../version-config.js');
      const dbFileName = getDatabaseFile().split('/').pop(); // Get just the filename from the path

      const a = document.createElement("a");
      a.href = url;
      a.download = dbFileName;
      a.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting DB:", err);
    }
  });

  // Import database
  document.getElementById("import-db-btn").addEventListener("click", () => {
    const fileInput = document.getElementById("import-db");
    fileInput.click();
  });

    document.getElementById("import-db").addEventListener("change", async () => {
    const fileInput = document.getElementById("import-db");
    if (!fileInput.files.length) return;

    try {
      const file = fileInput.files[0];
      const buffer = await file.arrayBuffer();
      SkillDB.db = new SkillDB.SQL.Database(new Uint8Array(buffer));

      // Run migration if needed
      await migrateDatabaseToVersions();

      // Reinitialize all sections
      await import('./edit-skills.js').then(m => m.initializeSkills());
      await import('./edit-tags.js').then(m => m.initializeTags());
      await import('./edit-classes.js').then(m => m.initializeClasses());
      await import('./edit-stats.js').then(m => m.initializeStats());
      await import('./edit-scaling.js').then(m => m.initializeScaling());
      await import('./edit-max-levels.js').then(m => m.initializeMaxLevels());
      await import('./edit-prerequisites.js').then(m => m.initializePrerequisites());
      await import('./edit-autocomplete.js').then(m => m.initializeAutocomplete());
      await import('./edit-versions.js').then(m => m.initializeVersions());
      
      fileInput.value = "";
    } catch (err) {
      console.error("Error importing DB:", err);
    }
  });
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializePage();
  initializeNavigation();
});
