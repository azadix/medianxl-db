// Prerequisites management functionality
import { SkillDB } from './edit-core.js';
import { DropdownList } from './DropdownList.js';

// Store dropdown references for updating
let prerequisiteSkillDropdown = null;
let prerequisiteTargetSkillDropdown = null;
let prerequisiteBlockedSkillDropdown = null;
let prerequisiteTargetTabDropdown = null;

// Store multiple required and blocked skills
let selectedRequiredSkills = [];
let selectedBlockedSkills = [];

export async function initializePrerequisites() {
  await populatePrerequisiteSelectors();
  refreshPrerequisitesTable();
  
  // Prerequisites form button click handler
  const prerequisiteForm = document.getElementById('prerequisite-form');
  if (!prerequisiteForm.hasAttribute('data-initialized')) {
    prerequisiteForm.setAttribute('data-initialized', 'true');
    prerequisiteForm.addEventListener('click', (e) => {
      if (e.target.type === 'submit') {
        e.preventDefault();
        savePrerequisite();
      }
    });
  }
  
  // Initialize skills displays
  updateRequiredSkillsDisplay();
  updateBlockedSkillsDisplay();
  
  // Show all fields by default since we now support multiple requirement types
  updatePrerequisiteFields();
}

function updatePrerequisiteFields() {
  // Show all dropdown containers and enable them by default
  // since we now support multiple requirement types at once
  
  if (prerequisiteTargetSkillDropdown && prerequisiteTargetSkillDropdown.container) {
    prerequisiteTargetSkillDropdown.container.style.display = 'block';
    prerequisiteTargetSkillDropdown.input.disabled = false;
    prerequisiteTargetSkillDropdown.container.style.pointerEvents = 'auto';
    prerequisiteTargetSkillDropdown.container.style.opacity = '1';
  }
  
  if (prerequisiteBlockedSkillDropdown && prerequisiteBlockedSkillDropdown.container) {
    prerequisiteBlockedSkillDropdown.container.style.display = 'block';
    prerequisiteBlockedSkillDropdown.input.disabled = false;
    prerequisiteBlockedSkillDropdown.container.style.pointerEvents = 'auto';
    prerequisiteBlockedSkillDropdown.container.style.opacity = '1';
  }
  
  if (prerequisiteTargetTabDropdown && prerequisiteTargetTabDropdown.container) {
    prerequisiteTargetTabDropdown.container.style.display = 'block';
    prerequisiteTargetTabDropdown.input.disabled = false;
    prerequisiteTargetTabDropdown.container.style.pointerEvents = 'auto';
    prerequisiteTargetTabDropdown.container.style.opacity = '1';
  }
}

// Add a required skill to the list
function addRequiredSkill(skillId, skillName, level = null) {
  // Check if already added
  if (selectedRequiredSkills.some(s => s.id === skillId)) {
    alert('This skill is already in the required skills list');
    return;
  }
  
  // Use provided level or get from input
  const skillLevel = level !== null ? level : (parseInt(document.getElementById('prerequisite-skill-level').value) || 1);
  
  selectedRequiredSkills.push({ id: skillId, name: skillName, level: skillLevel });
  updateRequiredSkillsDisplay();
  
  // Update hidden field with comma-separated IDs
  document.getElementById('prerequisite-target-skill-hidden').value = 
    selectedRequiredSkills.map(s => s.id).join(',');
  
  // Clear dropdown selection so user can select another skill
  if (prerequisiteTargetSkillDropdown) {
    prerequisiteTargetSkillDropdown.value = null;
  }
}

// Remove a required skill from the list
function removeRequiredSkill(skillId) {
  selectedRequiredSkills = selectedRequiredSkills.filter(s => s.id !== skillId);
  updateRequiredSkillsDisplay();
  
  // Update hidden field
  document.getElementById('prerequisite-target-skill-hidden').value = 
    selectedRequiredSkills.map(s => s.id).join(',');
}

// Update the display of selected required skills
function updateRequiredSkillsDisplay() {
  const container = document.getElementById('required-skills-list');
  if (!container) {
    console.warn('required-skills-list container not found');
    return;
  }
  
  if (selectedRequiredSkills.length === 0) {
    container.innerHTML = '<p class="help has-text-grey-light">No required skills selected</p>';
    return;
  }
  
  const html = selectedRequiredSkills.map(skill => `
<div class="tags has-addons" style="display: inline-flex; margin: 0.25rem;">
  <span class="tag is-success">${skill.name} (${skill.level})</span>
  <a class="tag is-delete" onclick="window.removeRequiredSkillFromUI(${skill.id})"></a>
</div>
  `).join('');

  container.innerHTML = html;
}

// Export function to window for onclick handlers
window.removeRequiredSkillFromUI = function(skillId) {
  removeRequiredSkill(skillId);
};

// Add a blocked skill to the list
function addBlockedSkill(skillId, skillName) {
  // Check if already added
  if (selectedBlockedSkills.some(s => s.id === skillId)) {
    alert('This skill is already in the blocked skills list');
    return;
  }
  
  selectedBlockedSkills.push({ id: skillId, name: skillName });
  updateBlockedSkillsDisplay();
  
  // Update hidden field with comma-separated IDs
  document.getElementById('prerequisite-blocked-skill-hidden').value = 
    selectedBlockedSkills.map(s => s.id).join(',');
  
  // Clear dropdown selection so user can select another skill
  if (prerequisiteBlockedSkillDropdown) {
    prerequisiteBlockedSkillDropdown.value = null;
  }
}

// Remove a blocked skill from the list
function removeBlockedSkill(skillId) {
  selectedBlockedSkills = selectedBlockedSkills.filter(s => s.id !== skillId);
  updateBlockedSkillsDisplay();
  
  // Update hidden field
  document.getElementById('prerequisite-blocked-skill-hidden').value = 
    selectedBlockedSkills.map(s => s.id).join(',');
}

// Update the display of selected blocked skills
function updateBlockedSkillsDisplay() {
  const container = document.getElementById('blocked-skills-list');
  if (!container) {
    console.warn('blocked-skills-list container not found');
    return;
  }
  
  if (selectedBlockedSkills.length === 0) {
    container.innerHTML = '<p class="help has-text-grey-light">No blocked skills selected</p>';
    return;
  }
  
  const html = selectedBlockedSkills.map(skill => `
<div class="tags has-addons" style="display: inline-flex; margin: 0.25rem;">
  <span class="tag is-info">${skill.name}</span>
  <a class="tag is-delete" onclick="window.removeBlockedSkillFromUI(${skill.id})"></a>
</div>
  `).join('');

  container.innerHTML = html;
}

// Export function to window for onclick handlers
window.removeBlockedSkillFromUI = function(skillId) {
  removeBlockedSkill(skillId);
};

function loadPrerequisitesForSkill(skillId) {
  if (!SkillDB.db || !skillId) return;
  
  // Query all prerequisites for this skill
  const stmt = SkillDB.db.prepare(`
    SELECT requirement_type, requirement_value, target_skill_id, target_tab_id
    FROM skill_prerequisites
    WHERE skill_id = ?
  `);
  stmt.bind([skillId]);
  
  // Reset all requirement value fields
  document.getElementById('prerequisite-skill-level').value = '';
  document.getElementById('prerequisite-skill-blocked-by').value = '0';
  document.getElementById('prerequisite-tree-points').value = '';
  document.getElementById('prerequisite-target-skill-hidden').value = '';
  document.getElementById('prerequisite-blocked-skill-hidden').value = '';
  document.getElementById('prerequisite-target-tab-hidden').value = '';
  
  // Reset dropdown displays
  if (prerequisiteTargetSkillDropdown) {
    prerequisiteTargetSkillDropdown.value = null;
  }
  if (prerequisiteBlockedSkillDropdown) {
    prerequisiteBlockedSkillDropdown.value = null;
  }
  if (prerequisiteTargetTabDropdown) {
    prerequisiteTargetTabDropdown.value = null;
  }
  
  // Reset skills arrays
  selectedRequiredSkills = [];
  selectedBlockedSkills = [];
  
  let skillLevelValue = null;
  let targetTabId = null;
  let hasExistingPrerequisites = false;
  let skillBlockedByValue = null;
  
  // Process all prerequisites for this skill
  while (stmt.step()) {
    hasExistingPrerequisites = true;
    const [requirementType, requirementValue, reqTargetSkillId, reqTargetTabId] = stmt.get();
    
    // Set values based on requirement type
    switch (requirementType) {
      case 'skill_level':
        // Store the level value (should be same for all required skills)
        if (skillLevelValue === null) {
          skillLevelValue = requirementValue;
          document.getElementById('prerequisite-skill-level').value = requirementValue;
        }
        // Add to required skills array
        if (reqTargetSkillId) {
          // Get skill name
          const nameStmt = SkillDB.db.prepare('SELECT display_name FROM skills WHERE id = ?');
          nameStmt.bind([reqTargetSkillId]);
          if (nameStmt.step()) {
            const skillName = nameStmt.get()[0];
            selectedRequiredSkills.push({ id: reqTargetSkillId, name: skillName, level: requirementValue });
          }
          nameStmt.free();
        }
        break;
      case 'skill_blocked_by':
        // Store the max points value (should be same for all blocked skills)
        if (skillBlockedByValue === null) {
          skillBlockedByValue = requirementValue;
          document.getElementById('prerequisite-skill-blocked-by').value = requirementValue;
        }
        // Add to blocked skills array
        if (reqTargetSkillId) {
          // Get skill name
          const nameStmt = SkillDB.db.prepare('SELECT display_name FROM skills WHERE id = ?');
          nameStmt.bind([reqTargetSkillId]);
          if (nameStmt.step()) {
            const skillName = nameStmt.get()[0];
            selectedBlockedSkills.push({ id: reqTargetSkillId, name: skillName });
          }
          nameStmt.free();
        }
        break;
      case 'tree_points':
        document.getElementById('prerequisite-tree-points').value = requirementValue;
        if (reqTargetTabId) targetTabId = reqTargetTabId;
        break;
    }
  }
  stmt.free();
  
  // Update required skills display
  if (selectedRequiredSkills.length > 0) {
    document.getElementById('prerequisite-target-skill-hidden').value = 
      selectedRequiredSkills.map(s => s.id).join(',');
    updateRequiredSkillsDisplay();
  }
  
  // Update blocked skills display
  if (selectedBlockedSkills.length > 0) {
    document.getElementById('prerequisite-blocked-skill-hidden').value = 
      selectedBlockedSkills.map(s => s.id).join(',');
    updateBlockedSkillsDisplay();
  }
  
  if (targetTabId) {
    document.getElementById('prerequisite-target-tab-hidden').value = targetTabId;
    if (prerequisiteTargetTabDropdown) {
      prerequisiteTargetTabDropdown.value = targetTabId;
    }
  }
  
  // Update form state if we found existing prerequisites
  if (hasExistingPrerequisites) {
    window.editingPrerequisiteId = skillId;
    document.querySelector('#prerequisite-form button[type="submit"]').textContent = 'Save Prerequisite';
    document.getElementById('prerequisite-cancel').style.display = 'inline-block';
  } else {
    window.editingPrerequisiteId = null;
    document.querySelector('#prerequisite-form button[type="submit"]').textContent = 'Insert Prerequisite';
    document.getElementById('prerequisite-cancel').style.display = 'none';
  }
}

async function populatePrerequisiteSelectors() {
  // Skills dropdown using DropdownList
  const skillDdContainer = document.getElementById('prerequisite-skill-dd');
  const skillHiddenInput = document.getElementById('prerequisite-skill-hidden');

  if (skillDdContainer && skillHiddenInput) {
    const res = SkillDB.db.exec("SELECT id, display_name FROM skills ORDER BY display_name");
    const skillItems = res[0] ? res[0].values.map(([id, name]) => ({
      value: id,
      name: name,
      desc: `Skill ID: ${id}`
    })) : [];
    
    prerequisiteSkillDropdown = new DropdownList(skillDdContainer, {
      placeholder: 'Select skill...',
      emptyListText: 'No skills found',
      defaultHeaderText: 'Skills',
      
      onSelect: (item) => {
        skillHiddenInput.value = item?.value || '';
        // Automatically load existing prerequisites for this skill
        if (item?.value) {
          loadPrerequisitesForSkill(item.value);
        }
      }
    });
    prerequisiteSkillDropdown.setItems(skillItems);
  }

  // Target skill dropdown for skill_level requirements
  const targetSkillDdContainer = document.getElementById('prerequisite-target-skill-dd');
  const targetSkillHiddenInput = document.getElementById('prerequisite-target-skill-hidden');

  if (targetSkillDdContainer && targetSkillHiddenInput) {
    const res = SkillDB.db.exec(`
      SELECT s.id, s.display_name, c.name as class_name, ct.name as tab_name
      FROM skills s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN classTabs ct ON s.tab_index = ct.id
      ORDER BY c.name, ct.tab_index, s.display_name
    `);
    const skillItems = res[0] ? res[0].values.map(([id, name, className, tabName]) => ({
      value: id,
      name: name,
      desc: `${className || 'No Class'} - ${tabName || 'No Tab'} (ID: ${id})`
    })) : [];
    
    prerequisiteTargetSkillDropdown = new DropdownList(targetSkillDdContainer, {
      placeholder: 'Select required skill...',
      emptyListText: 'No skills found',
      defaultHeaderText: 'Required Skills',
      
      onSelect: (item) => {
        if (item) {
          addRequiredSkill(item.value, item.name);
        }
      }
    });
    prerequisiteTargetSkillDropdown.setItems(skillItems);
  }

  // Blocked skills management (supports multiple)
  const blockedSkillDdContainer = document.getElementById('prerequisite-blocked-skill-dd');
  const blockedSkillHiddenInput = document.getElementById('prerequisite-blocked-skill-hidden');

  if (blockedSkillDdContainer && blockedSkillHiddenInput) {
    const res = SkillDB.db.exec(`
      SELECT s.id, s.display_name, c.name as class_name, ct.name as tab_name
      FROM skills s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN classTabs ct ON s.tab_index = ct.id
      ORDER BY c.name, ct.tab_index, s.display_name
    `);
    const skillItems = res[0] ? res[0].values.map(([id, name, className, tabName]) => ({
      value: id,
      name: name,
      desc: `${className || 'No Class'} - ${tabName || 'No Tab'} (ID: ${id})`
    })) : [];
    
    prerequisiteBlockedSkillDropdown = new DropdownList(blockedSkillDdContainer, {
      placeholder: 'Select blocked skill...',
      emptyListText: 'No skills found',
      defaultHeaderText: 'Blocked Skills',
      
      onSelect: (item) => {
        if (item) {
          addBlockedSkill(item.value, item.name);
        }
      }
    });
    prerequisiteBlockedSkillDropdown.setItems(skillItems);
  }

  // Target tab dropdown for tree_points requirements
  const targetTabDdContainer = document.getElementById('prerequisite-target-tab-dd');
  const targetTabHiddenInput = document.getElementById('prerequisite-target-tab-hidden');

  if (targetTabDdContainer && targetTabHiddenInput) {
    const res = SkillDB.db.exec(`
      SELECT ct.id, ct.name, c.name as class_name
      FROM classTabs ct
      JOIN classes c ON ct.class_id = c.id
      ORDER BY c.name, ct.tab_index
    `);
    const tabItems = res[0] ? res[0].values.map(([id, name, className]) => ({
      value: id,
      name: `${className} - ${name}`,
      desc: `Tab ID: ${id}`
    })) : [];
    
    prerequisiteTargetTabDropdown = new DropdownList(targetTabDdContainer, {
      placeholder: 'Select target tab...',
      emptyListText: 'No tabs found',
      defaultHeaderText: 'Target Tabs',
      
      onSelect: (item) => {
        targetTabHiddenInput.value = item?.value || '';
      }
    });
    prerequisiteTargetTabDropdown.setItems(tabItems);
  }
}

function refreshPrerequisitesTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector('#prerequisites-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const res = SkillDB.db.exec(`
    SELECT sp.id, s.id as skill_id, s.display_name, sp.requirement_type, sp.requirement_value,
           sp.target_skill_id, sp.target_tab_id,
           ts.display_name as target_skill_name, ct.name as target_tab_name
    FROM skill_prerequisites sp
    JOIN skills s ON sp.skill_id = s.id
    LEFT JOIN skills ts ON sp.target_skill_id = ts.id
    LEFT JOIN classTabs ct ON sp.target_tab_id = ct.id
    ORDER BY s.display_name, sp.requirement_type
  `);
  
  if (res.length > 0) {
    // Group prerequisites by skill and type
    const grouped = {};
    res[0].values.forEach(([prerequisiteId, skillId, skillName, prerequisiteType, prerequisiteValue, targetSkillId, targetTabId, targetSkillName, targetTabName]) => {
      const key = `${skillId}_${prerequisiteType}`;
      if (!grouped[key]) {
        grouped[key] = {
          skillId,
          skillName,
          prerequisiteType,
          prerequisiteValue,
          targets: [],
          ids: []
        };
      }
      grouped[key].ids.push(prerequisiteId);
      if (prerequisiteType === 'skill_blocked_by' && targetSkillName) {
        grouped[key].targets.push(targetSkillName);
      } else if (prerequisiteType === 'skill_level' && targetSkillName) {
        // For skill_level, include the level requirement with each skill
        grouped[key].targets.push(`${targetSkillName} (${prerequisiteValue})`);
      } else if (prerequisiteType === 'tree_points' && targetTabName) {
        grouped[key].targets.push(targetTabName);
      }
    });
    
    // Display grouped prerequisites
    Object.values(grouped).forEach(group => {
      const tr = document.createElement('tr');
      
      // Format prerequisite type for display
      const typeDisplay = group.prerequisiteType
        .replace('_', ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      // Join targets with commas if multiple
      const targetDisplay = group.targets.join(', ');
      
      // For skill_level type, don't show value column since it's in the target
      const valueDisplay = group.prerequisiteType === 'skill_level' ? '-' : group.prerequisiteValue;
      
      tr.innerHTML = `
        <td>${group.skillName || 'Unknown'}</td>
        <td>${typeDisplay}</td>
        <td>${valueDisplay}</td>
        <td>${targetDisplay}</td>
        <td>
          <div class="buttons are-small">
            <button class="button is-warning is-outlined" data-edit-prerequisite="${group.ids[0]}">Edit</button>
            <button class="button is-danger is-outlined" data-del-skill-prereqs="${group.skillId}" data-prereq-type="${group.prerequisiteType}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Bind actions
  tbody.querySelectorAll('[data-edit-prerequisite]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prerequisiteId = parseInt(btn.getAttribute('data-edit-prerequisite'), 10);
      editPrerequisite(prerequisiteId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-del-skill-prereqs]').forEach(btn => {
    btn.addEventListener('click', () => {
      const skillId = parseInt(btn.getAttribute('data-del-skill-prereqs'), 10);
      const prereqType = btn.getAttribute('data-prereq-type');
      deleteSkillPrerequisitesByType(skillId, prereqType);
    });
  });
}

// Delete all prerequisites of a specific type for a skill
function deleteSkillPrerequisitesByType(skillId, prereqType) {
  if (!confirm(`Delete all ${prereqType.replace('_', ' ')} prerequisites for this skill?`)) return;
  SkillDB.db.run('DELETE FROM skill_prerequisites WHERE skill_id = ? AND requirement_type = ?', [skillId, prereqType]);
  refreshPrerequisitesTable();
}

function editPrerequisite(prerequisiteId) {
  // Get the skill ID from the clicked prerequisite
  const stmt = SkillDB.db.prepare(`
    SELECT skill_id FROM skill_prerequisites WHERE id = ?
  `);
  stmt.bind([prerequisiteId]);
  
  if (stmt.step()) {
    const skillId = stmt.get()[0];
    stmt.free();
    
    // Load all prerequisites for this skill
    const allStmt = SkillDB.db.prepare(`
      SELECT requirement_type, requirement_value, target_skill_id, target_tab_id
      FROM skill_prerequisites
      WHERE skill_id = ?
    `);
    allStmt.bind([skillId]);
    
    // Initialize form fields
    document.getElementById('prerequisite-skill-hidden').value = skillId;
    
    // Update the main skill dropdown display
    if (prerequisiteSkillDropdown) {
      prerequisiteSkillDropdown.value = skillId;
    }
    
    // Reset all requirement value fields
    document.getElementById('prerequisite-skill-level').value = '';
    document.getElementById('prerequisite-skill-blocked-by').value = '0';
    document.getElementById('prerequisite-tree-points').value = '';
    document.getElementById('prerequisite-target-skill-hidden').value = '';
    document.getElementById('prerequisite-blocked-skill-hidden').value = '';
    document.getElementById('prerequisite-target-tab-hidden').value = '';
    
    // Reset dropdown displays
    if (prerequisiteTargetSkillDropdown) {
      prerequisiteTargetSkillDropdown.value = null;
    }
    if (prerequisiteBlockedSkillDropdown) {
      prerequisiteBlockedSkillDropdown.value = null;
    }
    if (prerequisiteTargetTabDropdown) {
      prerequisiteTargetTabDropdown.value = null;
    }
    
    // Reset skills arrays
    selectedRequiredSkills = [];
    selectedBlockedSkills = [];
    
    let skillLevelValue = null;
    let targetTabId = null;
    let skillBlockedByValue = null;
    
    // Process all prerequisites for this skill
    while (allStmt.step()) {
      const [requirementType, requirementValue, reqTargetSkillId, reqTargetTabId] = allStmt.get();
      
      // Set values based on requirement type
      switch (requirementType) {
        case 'skill_level':
          // Store the level value (should be same for all required skills)
          if (skillLevelValue === null) {
            skillLevelValue = requirementValue;
            document.getElementById('prerequisite-skill-level').value = requirementValue;
          }
          // Add to required skills array
          if (reqTargetSkillId) {
            // Get skill name
            const nameStmt = SkillDB.db.prepare('SELECT display_name FROM skills WHERE id = ?');
            nameStmt.bind([reqTargetSkillId]);
            if (nameStmt.step()) {
              const skillName = nameStmt.get()[0];
              selectedRequiredSkills.push({ id: reqTargetSkillId, name: skillName, level: requirementValue });
            }
            nameStmt.free();
          }
          break;
        case 'skill_blocked_by':
          // Store the max points value (should be same for all blocked skills)
          if (skillBlockedByValue === null) {
            skillBlockedByValue = requirementValue;
            document.getElementById('prerequisite-skill-blocked-by').value = requirementValue;
          }
          // Add to blocked skills array
          if (reqTargetSkillId) {
            // Get skill name
            const nameStmt = SkillDB.db.prepare('SELECT display_name FROM skills WHERE id = ?');
            nameStmt.bind([reqTargetSkillId]);
            if (nameStmt.step()) {
              const skillName = nameStmt.get()[0];
              selectedBlockedSkills.push({ id: reqTargetSkillId, name: skillName });
            }
            nameStmt.free();
          }
          break;
        case 'tree_points':
          document.getElementById('prerequisite-tree-points').value = requirementValue;
          if (reqTargetTabId) targetTabId = reqTargetTabId;
          break;
      }
    }
    allStmt.free();
    
    // Update required skills display
    if (selectedRequiredSkills.length > 0) {
      document.getElementById('prerequisite-target-skill-hidden').value = 
        selectedRequiredSkills.map(s => s.id).join(',');
      updateRequiredSkillsDisplay();
    }
    
    // Update blocked skills display
    if (selectedBlockedSkills.length > 0) {
      document.getElementById('prerequisite-blocked-skill-hidden').value = 
        selectedBlockedSkills.map(s => s.id).join(',');
      updateBlockedSkillsDisplay();
    }
    
    if (targetTabId) {
      document.getElementById('prerequisite-target-tab-hidden').value = targetTabId;
      if (prerequisiteTargetTabDropdown) {
        prerequisiteTargetTabDropdown.value = targetTabId;
      }
    }
    
    
    // Update form state
    document.querySelector('#prerequisite-form button[type="submit"]').textContent = 'Save Prerequisite';
    document.getElementById('prerequisite-cancel').style.display = 'inline-block';
    
    window.editingPrerequisiteId = skillId; // Store skill ID instead of prerequisite ID
  }
}

function deletePrerequisite(prerequisiteId) {
  if (!confirm('Delete this prerequisite?')) return;
  SkillDB.db.run('DELETE FROM skill_prerequisites WHERE id = ?', [prerequisiteId]);
  refreshPrerequisitesTable();
}

function savePrerequisite() {
  const skillId = parseInt(document.getElementById('prerequisite-skill-hidden').value, 10);
  const skillLevelValue = parseInt(document.getElementById('prerequisite-skill-level').value || 0, 10);
  const skillBlockedByValue = parseInt(document.getElementById('prerequisite-skill-blocked-by').value, 10);
  const treePointsValue = parseInt(document.getElementById('prerequisite-tree-points').value || 0, 10);
  const targetTabId = parseInt(document.getElementById('prerequisite-target-tab-hidden')?.value || 0, 10);
  
  if (Number.isNaN(skillId)) {
    alert('Please select a skill');
    return;
  }
  
  // Validate that at least one requirement type is specified
  const hasRequiredSkills = selectedRequiredSkills.length > 0;
  const hasBlockedBy = !Number.isNaN(skillBlockedByValue) && skillBlockedByValue >= 0 && selectedBlockedSkills.length > 0;
  if (!hasRequiredSkills && !hasBlockedBy && treePointsValue < 1) {
    alert('Please specify at least one requirement (skill level, blocked by, or tree points)');
    return;
  }
  
  if (treePointsValue >= 1 && (Number.isNaN(targetTabId) || targetTabId === 0)) {
    alert('Please select a target tab for tree points prerequisite');
    return;
  }
  
  if (window.editingPrerequisiteId) {
    // For editing, we'll delete existing prerequisites for this skill and recreate them
    // This ensures clean state when editing
    SkillDB.db.run('DELETE FROM skill_prerequisites WHERE skill_id = ?', [skillId]);
  }
  
  // Insert prerequisites for each requirement type that has a value
  if (selectedRequiredSkills.length > 0) {
    // Insert a prerequisite for each required skill with its own level
    selectedRequiredSkills.forEach(skill => {
      SkillDB.db.run(`
        INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id)
        VALUES (?, 'skill_level', ?, ?, ?)
      `, [skillId, skill.level, skill.id, null]);
    });
  }
  
  // Insert a separate prerequisite entry for each blocked skill
  if (!Number.isNaN(skillBlockedByValue) && skillBlockedByValue >= 0 && selectedBlockedSkills.length > 0) {
    selectedBlockedSkills.forEach(blockedSkill => {
      SkillDB.db.run(`
        INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id)
        VALUES (?, 'skill_blocked_by', ?, ?, ?)
      `, [skillId, skillBlockedByValue, blockedSkill.id, null]);
    });
  }
  
  if (treePointsValue >= 1) {
    SkillDB.db.run(`
      INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id)
      VALUES (?, 'tree_points', ?, ?, ?)
    `, [skillId, treePointsValue, null, targetTabId]);
  }
  
  
  // Reset form
  document.getElementById('prerequisite-form').reset();
  document.getElementById('prerequisite-skill-hidden').value = '';
  selectedRequiredSkills = [];
  selectedBlockedSkills = [];
  updateRequiredSkillsDisplay();
  updateBlockedSkillsDisplay();
  
  if (window.editingPrerequisiteId) {
    window.editingPrerequisiteId = null;
    document.querySelector('#prerequisite-form button[type="submit"]').textContent = 'Insert Prerequisite';
    document.getElementById('prerequisite-cancel').style.display = 'none';
  }
  
  refreshPrerequisitesTable();
}

// Cancel handler
document.getElementById('prerequisite-cancel').addEventListener('click', () => {
  window.editingPrerequisiteId = null;
  document.getElementById('prerequisite-form').reset();
  document.querySelector('#prerequisite-form button[type="submit"]').textContent = 'Insert Prerequisite';
  document.getElementById('prerequisite-cancel').style.display = 'none';
  document.getElementById('prerequisite-skill-hidden').value = '';
  selectedRequiredSkills = [];
  selectedBlockedSkills = [];
  updateRequiredSkillsDisplay();
  updateBlockedSkillsDisplay();
});
