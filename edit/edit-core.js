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

    // Initialize all sections
    await import('./edit-skills.js').then(m => m.initializeSkills());
    await import('./edit-tags.js').then(m => m.initializeTags());
    await import('./edit-classes.js').then(m => m.initializeClasses());
    await import('./edit-stats.js').then(m => m.initializeStats());
    await import('./edit-scaling.js').then(m => m.initializeScaling());
    await import('./edit-max-levels.js').then(m => m.initializeMaxLevels());
    await import('./edit-prerequisites.js').then(m => m.initializePrerequisites());
    await import('./edit-autocomplete.js').then(m => m.initializeAutocomplete());
    
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
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
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
      value0 REAL NOT NULL,
      value1 REAL NOT NULL,
      value2 REAL NOT NULL,
      value3 REAL NOT NULL,
      PRIMARY KEY (skill_id, level, stat_id, occurrence_index),
      FOREIGN KEY (skill_id) REFERENCES skills(id),
      FOREIGN KEY (stat_id) REFERENCES stats(id)
    );
    CREATE TABLE skill_scaling_constants (
      skill_id INTEGER NOT NULL,
      stat_id INTEGER NOT NULL,
      occurrence_index INTEGER NOT NULL DEFAULT 0,
      value0 REAL DEFAULT 0,
      value1 REAL DEFAULT 0,
      value2 REAL DEFAULT 0,
      value3 REAL DEFAULT 0,
      value0_constant BOOLEAN DEFAULT 0,
      value1_constant BOOLEAN DEFAULT 0,
      value2_constant BOOLEAN DEFAULT 0,
      value3_constant BOOLEAN DEFAULT 0,
      PRIMARY KEY (skill_id, stat_id, occurrence_index),
      FOREIGN KEY (skill_id) REFERENCES skills(id),
      FOREIGN KEY (stat_id) REFERENCES stats(id)
    );
    CREATE TABLE skill_max_levels (
      skill_id INTEGER NOT NULL,
      base_max_level INTEGER NOT NULL DEFAULT 1,
      affected_by_specialization BOOLEAN NOT NULL DEFAULT 0,
      can_add_points BOOLEAN NOT NULL DEFAULT 1,
      PRIMARY KEY (skill_id),
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );
    CREATE TABLE skill_prerequisites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL,
      requirement_type TEXT NOT NULL,
      requirement_value INTEGER NOT NULL,
      target_skill_id INTEGER,
      target_tab_id INTEGER,
      description TEXT NOT NULL,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (target_skill_id) REFERENCES skills(id) ON DELETE CASCADE,
      FOREIGN KEY (target_tab_id) REFERENCES classTabs(id) ON DELETE CASCADE
    );
  `);

  // Initialize with some basic data
  SkillDB.db.run(`INSERT INTO classes (name, image_prefix) VALUES ('Amazon', 'ama'), ('Assassin', 'ass'), ('Barbarian', 'bar'), ('Druid', 'dru'), ('Necromancer', 'nec'), ('Paladin', 'pal'), ('Sorceress', 'sor'), ('Other', 'shared')`);
  
  // Initialize sections
  await import('./edit-skills.js').then(m => m.initializeSkills());
  await import('./edit-tags.js').then(m => m.initializeTags());
  await import('./edit-classes.js').then(m => m.initializeClasses());
  await import('./edit-stats.js').then(m => m.initializeStats());
  await import('./edit-scaling.js').then(m => m.initializeScaling());
  await import('./edit-max-levels.js').then(m => m.initializeMaxLevels());
  await import('./edit-prerequisites.js').then(m => m.initializePrerequisites());
  await import('./edit-autocomplete.js').then(m => m.initializeAutocomplete());
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
        b.className = 'button is-light';
      });
      btn.className = 'button is-primary';
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

      // Reinitialize all sections
      await import('./edit-skills.js').then(m => m.initializeSkills());
      await import('./edit-tags.js').then(m => m.initializeTags());
      await import('./edit-classes.js').then(m => m.initializeClasses());
      await import('./edit-stats.js').then(m => m.initializeStats());
      await import('./edit-scaling.js').then(m => m.initializeScaling());
      await import('./edit-max-levels.js').then(m => m.initializeMaxLevels());
      await import('./edit-prerequisites.js').then(m => m.initializePrerequisites());
      await import('./edit-autocomplete.js').then(m => m.initializeAutocomplete());
      
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
