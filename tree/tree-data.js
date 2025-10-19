// Data loading and SQLite operations for the skills tree
import Skill from '../skills/Skill.js';
import { showDatabaseError } from '../utils.js';

// Store database instance globally for use in calculations
let dbInstance = null;

// Load skills data from SQLite
export async function loadSkillsFromSQLite() {
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
        const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}` });
        const db = new SQL.Database(new Uint8Array(buffer));
        
        // Store database instance
        dbInstance = db;

        // Query skills with correct tab join
        const stmt = db.prepare(`
            SELECT s.*,
                ct.name AS tab_name,
                c.name AS class_name,
                s.description,
                GROUP_CONCAT(t.name, ', ') AS tags,
                sml.base_max_level,
                sml.affected_by_specialization,
                sml.can_add_points,
                (SELECT GROUP_CONCAT(sp2.requirement_type || ':' || sp2.requirement_value || ':' || COALESCE(ts2.display_name, ct3.name, ''), '; ')
                 FROM skill_prerequisites sp2
                 LEFT JOIN skills ts2 ON sp2.target_skill_id = ts2.id
                 LEFT JOIN classTabs ct3 ON sp2.target_tab_id = ct3.id
                 WHERE sp2.skill_id = s.id) AS prerequisites
            FROM skills s
            LEFT JOIN classTabs ct
                ON s.tab_index = ct.id
            LEFT JOIN classes c
                ON s.class_id = c.id
            LEFT JOIN skill_skilltags st
                ON s.id = st.skill_id
            LEFT JOIN skilltags t
                ON st.tag_id = t.id
            LEFT JOIN skill_max_levels sml
                ON s.id = sml.skill_id
            WHERE s.class_id != 1
            GROUP BY s.id
            ORDER BY s.class_id, s.tab_index, s.row, s.col;
        `);

        const loadedSkills = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            // Use Skill class factory method to create instances
            loadedSkills.push(Skill.fromDatabaseRow(row));
        }
        stmt.free();

        // Generalize Mastery tab replication: copy any tab named "Mastery" to classes missing it
        const masteryByClass = new Map();
        loadedSkills.forEach(s => {
            if (s.tabName === 'Mastery') {
                masteryByClass.set(s.class, true);
            }
        });

        const masterySkills = loadedSkills.filter(s => s.tabName === 'Mastery');
        const allClasses = [...new Set(loadedSkills.map(s => s.class))];
        const prototypeClass = masterySkills.length > 0 ? masterySkills[0].class : null;
        if (prototypeClass) {
            allClasses.forEach(cls => {
                if (!masteryByClass.get(cls)) {
                    masterySkills.forEach(skill => {
                        // Clone the skill and update the class
                        const clonedSkill = skill.clone();
                        clonedSkill.class = cls;
                        loadedSkills.push(clonedSkill);
                    });
                }
            });
        }

        // Generalize Paragon of Fate replication: copy to all classes
        const paragonSkills = loadedSkills.filter(s => s.id === 'paragon_of_fate');
        if (paragonSkills.length > 0) {
            const paragonByClass = new Map();
            paragonSkills.forEach(s => {
                paragonByClass.set(s.class, true);
            });

            allClasses.forEach(cls => {
                if (!paragonByClass.get(cls)) {
                    paragonSkills.forEach(skill => {
                        // Clone the skill and update the class
                        const clonedSkill = skill.clone();
                        clonedSkill.class = cls;
                        loadedSkills.push(clonedSkill);
                    });
                }
            });
        }

        return loadedSkills;
    } catch (error) {
        console.error('Error loading skills from SQLite:', error);
        // Show error message to user
        showDatabaseError(error.message, document.querySelector('.container'));
        return [];
    }
}


// Export database instance getter
export function getDatabase() {
    return dbInstance;
}
