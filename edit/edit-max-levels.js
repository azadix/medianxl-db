// Max levels management functionality
import { SkillDB } from './edit-core.js';
import { DropdownList } from './DropdownList.js';
import { getCurrentVersionId } from '../version-config.js';

export async function initializeMaxLevels() {
  await populateMaxLevelSelectors();
  refreshMaxLevelsTable();
  
  // Max levels form button click handler
  const maxLevelForm = document.getElementById('max-level-form');
  if (!maxLevelForm.hasAttribute('data-initialized')) {
    maxLevelForm.setAttribute('data-initialized', 'true');
    maxLevelForm.addEventListener('click', (e) => {
      if (e.target.type === 'submit') {
        e.preventDefault();
        saveMaxLevel();
      }
    });
  }
}

// Store dropdown reference for updating
let maxLevelSkillDropdown = null;

async function populateMaxLevelSelectors() {
  // Skills dropdown using DropdownList
  const skillDdContainer = document.getElementById('max-level-skill-dd');
  const skillHiddenInput = document.getElementById('max-level-skill-hidden');

  if (skillDdContainer && skillHiddenInput) {
    // Get current version ID
    const versionId = getCurrentVersionId(SkillDB.db);
    if (!versionId) {
      console.warn('No active version found, cannot populate skill selector');
      return;
    }
    
    const res = SkillDB.db.exec("SELECT id, display_name FROM skills WHERE version_id = ? ORDER BY display_name", [versionId]);
    const skillItems = res[0] ? res[0].values.map(([id, name]) => ({
      value: id,
      name: name,
      desc: `Skill ID: ${id}`
    })) : [];
    
    maxLevelSkillDropdown = new DropdownList(skillDdContainer, {
      placeholder: 'Select skill...',
      emptyListText: 'No skills found',
      defaultHeaderText: 'Skills',
      
      onSelect: (item) => {
        skillHiddenInput.value = item?.value || '';
        if (item?.value) {
          loadMaxLevelData(parseInt(item.value, 10));
        }
      }
    });
    maxLevelSkillDropdown.setItems(skillItems);
  }
}

function loadMaxLevelData(skillId) {
  if (!SkillDB.db) return;
  const versionId = getCurrentVersionId(SkillDB.db);
  if (!versionId) return;
  
  const stmt = SkillDB.db.prepare(`
    SELECT base_max_level, affected_by_specialization, can_add_points
    FROM skill_max_levels
    WHERE skill_id = ? AND version_id = ?
  `);
  stmt.bind([skillId, versionId]);
  
  if (stmt.step()) {
    const [baseMaxLevel, affectedBySpecialization, canAddPoints] = stmt.get();
    document.getElementById('max-level-base').value = baseMaxLevel;
    document.getElementById('max-level-enhanced').checked = affectedBySpecialization;
    document.getElementById('max-level-add-points').checked = canAddPoints;
  } else {
    // Set defaults
    document.getElementById('max-level-base').value = 1;
    document.getElementById('max-level-enhanced').checked = false;
    document.getElementById('max-level-add-points').checked = true;
  }
  stmt.free();
}

function refreshMaxLevelsTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector('#max-levels-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  // Get current version ID
  const versionId = getCurrentVersionId(SkillDB.db);
  if (!versionId) {
    tbody.innerHTML = '<tr><td colspan="6">No active version found</td></tr>';
    return;
  }
  
  const res = SkillDB.db.exec(`
    SELECT s.id, s.display_name, c.name as class_name,
           sml.base_max_level, sml.affected_by_specialization, sml.can_add_points
    FROM skills s
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN skill_max_levels sml ON s.id = sml.skill_id AND sml.version_id = ?
    WHERE s.version_id = ?
    ORDER BY c.name, s.display_name
  `, [versionId, versionId]);
  
  if (res.length > 0) {
    res[0].values.forEach(([skillId, skillName, className, baseMaxLevel, affectedBySpecialization, canAddPoints]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${skillName || 'Unknown'}</td>
        <td>${className || 'Unknown'}</td>
        <td>${baseMaxLevel ?? 1}</td>
        <td>${affectedBySpecialization ? 'Yes' : 'No'}</td>
        <td>${canAddPoints ? 'Yes' : 'No'}</td>
        <td>
          <div class="buttons are-small">
            <button class="button is-warning is-outlined" data-edit-max-level="${skillId}">Edit</button>
            <button class="button is-danger is-outlined" data-del-max-level="${skillId}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Bind actions
  tbody.querySelectorAll('[data-edit-max-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      const skillId = parseInt(btn.getAttribute('data-edit-max-level'), 10);
      editMaxLevel(skillId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-del-max-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      const skillId = parseInt(btn.getAttribute('data-del-max-level'), 10);
      deleteMaxLevel(skillId);
    });
  });
}

function editMaxLevel(skillId) {
  // Get current version ID
  const versionId = getCurrentVersionId(SkillDB.db);
  if (!versionId) {
    alert('No active version found. Please select a version first.');
    return;
  }
  
  // Get skill info
  const skillStmt = SkillDB.db.prepare('SELECT display_name FROM skills WHERE id = ? AND version_id = ?');
  skillStmt.bind([skillId, versionId]);
  
  if (skillStmt.step()) {
    const [skillName] = skillStmt.get();
    
    // Set the skill in the dropdown
    document.getElementById('max-level-skill-hidden').value = skillId;
    
    // Update the dropdown display to show the selected skill
    if (maxLevelSkillDropdown) {
      maxLevelSkillDropdown.value = skillId;
    }
    
    // Load the max level data
    loadMaxLevelData(skillId);
    
    // Update form state
    document.querySelector('#max-level-form button[type="submit"]').textContent = 'Save Max Level';
    document.getElementById('max-level-cancel').style.display = 'inline-block';
    
    window.editingMaxLevelId = skillId;
  }
  skillStmt.free();
}

function deleteMaxLevel(skillId) {
  if (!confirm('Delete max level data for this skill?')) return;
  const versionId = getCurrentVersionId(SkillDB.db);
  if (!versionId) {
    alert('No active version found. Please select a version first.');
    return;
  }
  SkillDB.db.run('DELETE FROM skill_max_levels WHERE skill_id = ? AND version_id = ?', [skillId, versionId]);
  refreshMaxLevelsTable();
}

function saveMaxLevel() {
  const skillId = parseInt(document.getElementById('max-level-skill-hidden').value, 10);
  const baseMaxLevel = parseInt(document.getElementById('max-level-base').value, 10);
  const affectedBySpecialization = document.getElementById('max-level-enhanced').checked;
  const canAddPoints = document.getElementById('max-level-add-points').checked;
  
  if (Number.isNaN(skillId)) {
    alert('Please select a skill');
    return;
  }
  
  if (Number.isNaN(baseMaxLevel) || baseMaxLevel < 0) {
    alert('Base max level must be at least 0');
    return;
  }
  
  if (baseMaxLevel > 150) {
    alert('Base max level cannot exceed 150 (hard cap for all skills)');
    return;
  }
  
  // Get current version ID
  const versionId = getCurrentVersionId(SkillDB.db);
  if (!versionId) {
    alert('No active version found. Please select a version first.');
    return;
  }
  
  // Upsert the max level data
  SkillDB.db.run('DELETE FROM skill_max_levels WHERE skill_id = ? AND version_id = ?', [skillId, versionId]);
  SkillDB.db.run(`
    INSERT INTO skill_max_levels (skill_id, base_max_level, affected_by_specialization, can_add_points, version_id)
    VALUES (?, ?, ?, ?, ?)
  `, [skillId, baseMaxLevel, affectedBySpecialization ? 1 : 0, canAddPoints ? 1 : 0, versionId]);
  
  // Reset form
  document.getElementById('max-level-form').reset();
  document.querySelector('#max-level-form button[type="submit"]').textContent = 'Insert Max Level';
  document.getElementById('max-level-cancel').style.display = 'none';
  document.getElementById('max-level-skill-hidden').value = '';
  window.editingMaxLevelId = null;
  
  refreshMaxLevelsTable();
}

// Cancel handler
document.getElementById('max-level-cancel').addEventListener('click', () => {
  window.editingMaxLevelId = null;
  document.getElementById('max-level-form').reset();
  document.querySelector('#max-level-form button[type="submit"]').textContent = 'Insert Max Level';
  document.getElementById('max-level-cancel').style.display = 'none';
  document.getElementById('max-level-skill-hidden').value = '';
});
