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

      // Use skills.sqlite as the export filename
      const dbFileName = 'skills.sqlite';

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
  const importDbBtn = document.getElementById("import-db-btn");
  const importDbInput = document.getElementById("import-db");
  
  importDbBtn.addEventListener("click", () => {
    importDbInput.click();
  });

  importDbInput.addEventListener("change", async () => {
    if (!importDbInput.files.length) return;

    try {
      const file = importDbInput.files[0];
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
      await import('./edit-versions.js').then(m => m.initializeVersions());
      
      importDbInput.value = "";
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
