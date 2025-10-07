// Prerequisites management functionality
import { SkillDB } from './edit-core.js';
import { DropdownList } from './DropdownList.js';

// Store dropdown references for updating
let prerequisiteSkillDropdown = null;
let prerequisiteTargetSkillDropdown = null;
let prerequisiteBlockedSkillDropdown = null;
let prerequisiteTargetTabDropdown = null;

export async function initializePrerequisites() {
  await populatePrerequisiteSelectors();
  refreshPrerequisitesTable();
  
  // Prerequisites form submission
  document.getElementById('prerequisite-form').addEventListener('submit', (e) => {
    e.preventDefault();
    savePrerequisite();
  });
  
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

function loadPrerequisitesForSkill(skillId) {
  if (!SkillDB.db || !skillId) return;
  
  // Query all prerequisites for this skill
  const stmt = SkillDB.db.prepare(`
    SELECT requirement_type, requirement_value, target_skill_id, target_tab_id, description
    FROM skill_prerequisites
    WHERE skill_id = ?
  `);
  stmt.bind([skillId]);
  
  // Reset all requirement value fields
  document.getElementById('prerequisite-skill-level').value = '';
  document.getElementById('prerequisite-skill-blocked-by').value = '0';
  document.getElementById('prerequisite-tree-points').value = '';
  document.getElementById('prerequisite-character-level').value = '';
  document.getElementById('prerequisite-target-skill-hidden').value = '';
  document.getElementById('prerequisite-blocked-skill-hidden').value = '';
  document.getElementById('prerequisite-target-tab-hidden').value = '';
  document.getElementById('prerequisite-description').value = '';
  
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
  
  let targetSkillId = null;
  let blockedSkillId = null;
  let targetTabId = null;
  let description = '';
  let hasExistingPrerequisites = false;
  
  // Process all prerequisites for this skill
  while (stmt.step()) {
    hasExistingPrerequisites = true;
    const [requirementType, requirementValue, reqTargetSkillId, reqTargetTabId, reqDescription] = stmt.get();
    
    // Set values based on requirement type
    switch (requirementType) {
      case 'skill_level':
        document.getElementById('prerequisite-skill-level').value = requirementValue;
        if (reqTargetSkillId) targetSkillId = reqTargetSkillId;
        break;
      case 'skill_blocked_by':
        document.getElementById('prerequisite-skill-blocked-by').value = requirementValue;
        if (reqTargetSkillId) blockedSkillId = reqTargetSkillId;
        break;
      case 'tree_points':
        document.getElementById('prerequisite-tree-points').value = requirementValue;
        if (reqTargetTabId) targetTabId = reqTargetTabId;
        break;
      case 'character_level':
        document.getElementById('prerequisite-character-level').value = requirementValue;
        break;
    }
    
    // Use the first description found
    if (reqDescription && !description) {
      description = reqDescription;
    }
  }
  stmt.free();
  
  // Set target skill and tab values
  if (targetSkillId) {
    document.getElementById('prerequisite-target-skill-hidden').value = targetSkillId;
    if (prerequisiteTargetSkillDropdown) {
      prerequisiteTargetSkillDropdown.value = targetSkillId;
    }
  }
  
  if (blockedSkillId) {
    document.getElementById('prerequisite-blocked-skill-hidden').value = blockedSkillId;
    if (prerequisiteBlockedSkillDropdown) {
      prerequisiteBlockedSkillDropdown.value = blockedSkillId;
    }
  }
  
  if (targetTabId) {
    document.getElementById('prerequisite-target-tab-hidden').value = targetTabId;
    if (prerequisiteTargetTabDropdown) {
      prerequisiteTargetTabDropdown.value = targetTabId;
    }
  }
  
  // Set the description
  if (description) {
    document.getElementById('prerequisite-description').value = description;
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
      placeholder: 'Select target skill...',
      emptyListText: 'No skills found',
      defaultHeaderText: 'Target Skills',
      
      onSelect: (item) => {
        targetSkillHiddenInput.value = item?.value || '';
      }
    });
    prerequisiteTargetSkillDropdown.setItems(skillItems);
  }

  // Blocked skill dropdown for skill_blocked_by requirements
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
        blockedSkillHiddenInput.value = item?.value || '';
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
    SELECT sp.id, s.display_name, sp.requirement_type, sp.requirement_value,
           sp.target_skill_id, sp.target_tab_id, sp.description,
           ts.display_name as target_skill_name, ct.name as target_tab_name
    FROM skill_prerequisites sp
    JOIN skills s ON sp.skill_id = s.id
    LEFT JOIN skills ts ON sp.target_skill_id = ts.id
    LEFT JOIN classTabs ct ON sp.target_tab_id = ct.id
    ORDER BY s.display_name, sp.requirement_type
  `);
  
  if (res.length > 0) {
    res[0].values.forEach(([prerequisiteId, skillName, prerequisiteType, prerequisiteValue, targetSkillId, targetTabId, description, targetSkillName, targetTabName]) => {
      const tr = document.createElement('tr');
      
      // Format prerequisite type for display
      const typeDisplay = prerequisiteType
        .replace('_', ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      // Determine target display based on requirement type
      let targetDisplay = '';
      if (prerequisiteType === 'skill_level' && targetSkillName) {
        targetDisplay = targetSkillName;
      } else if (prerequisiteType === 'skill_blocked_by' && targetSkillName) {
        targetDisplay = targetSkillName;
      } else if (prerequisiteType === 'tree_points' && targetTabName) {
        targetDisplay = targetTabName;
      } else if (prerequisiteType === 'character_level') {
        targetDisplay = 'Character Level';
      }
      
      tr.innerHTML = `
        <td>${skillName || 'Unknown'}</td>
        <td>${typeDisplay}</td>
        <td>${prerequisiteValue}</td>
        <td>${targetDisplay}</td>
        <td>${description || ''}</td>
        <td>
          <div class="buttons are-small">
            <button class="button is-warning" data-edit-prerequisite="${prerequisiteId}">Edit</button>
            <button class="button is-danger" data-del-prerequisite="${prerequisiteId}">Delete</button>
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

  tbody.querySelectorAll('[data-del-prerequisite]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prerequisiteId = parseInt(btn.getAttribute('data-del-prerequisite'), 10);
      deletePrerequisite(prerequisiteId);
    });
  });
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
      SELECT requirement_type, requirement_value, target_skill_id, target_tab_id, description
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
    document.getElementById('prerequisite-tree-points').value = '';
    document.getElementById('prerequisite-character-level').value = '';
    
    let targetSkillId = null;
    let targetTabId = null;
    let description = '';
    
    // Process all prerequisites for this skill
    while (allStmt.step()) {
      const [requirementType, requirementValue, reqTargetSkillId, reqTargetTabId, reqDescription] = allStmt.get();
      
      // Set values based on requirement type
      switch (requirementType) {
        case 'skill_level':
          document.getElementById('prerequisite-skill-level').value = requirementValue;
          if (reqTargetSkillId) targetSkillId = reqTargetSkillId;
          break;
        case 'tree_points':
          document.getElementById('prerequisite-tree-points').value = requirementValue;
          if (reqTargetTabId) targetTabId = reqTargetTabId;
          break;
        case 'character_level':
          document.getElementById('prerequisite-character-level').value = requirementValue;
          break;
      }
      
      // Use the first description found (they should all be the same for a skill)
      if (reqDescription && !description) {
        description = reqDescription;
      }
    }
    allStmt.free();
    
    // Set target skill and tab values
    const targetSkillField = document.getElementById('prerequisite-target-skill-hidden');
    if (targetSkillField && targetSkillId) {
      targetSkillField.value = targetSkillId;
      if (prerequisiteTargetSkillDropdown) {
        prerequisiteTargetSkillDropdown.value = targetSkillId;
      }
    }
    
    const targetTabField = document.getElementById('prerequisite-target-tab-hidden');
    if (targetTabField && targetTabId) {
      targetTabField.value = targetTabId;
      if (prerequisiteTargetTabDropdown) {
        prerequisiteTargetTabDropdown.value = targetTabId;
      }
    }
    
    // Set the description
    const descriptionField = document.getElementById('prerequisite-description');
    if (descriptionField) {
      descriptionField.value = description;
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
  const characterLevelValue = parseInt(document.getElementById('prerequisite-character-level').value || 0, 10);
  const targetSkillId = parseInt(document.getElementById('prerequisite-target-skill-hidden')?.value || 0, 10);
  const blockedSkillId = parseInt(document.getElementById('prerequisite-blocked-skill-hidden')?.value || 0, 10);
  const targetTabId = parseInt(document.getElementById('prerequisite-target-tab-hidden')?.value || 0, 10);
  const description = document.getElementById('prerequisite-description')?.value.trim() || '';
  
  if (Number.isNaN(skillId)) {
    alert('Please select a skill');
    return;
  }
  
  // Validate that at least one requirement type is specified
  const hasBlockedBy = !Number.isNaN(skillBlockedByValue) && skillBlockedByValue >= 0 && blockedSkillId > 0;
  if (skillLevelValue < 1 && !hasBlockedBy && treePointsValue < 1 && characterLevelValue < 1) {
    alert('Please specify at least one requirement (skill level, blocked by, tree points, or character level)');
    return;
  }
  
  // Validate required fields for each requirement type
  if (skillLevelValue >= 1 && (Number.isNaN(targetSkillId) || targetSkillId === 0)) {
    alert('Please select a target skill for skill level prerequisite');
    return;
  }
  
  if (!Number.isNaN(skillBlockedByValue) && skillBlockedByValue >= 0 && (Number.isNaN(blockedSkillId) || blockedSkillId === 0)) {
    alert('Please select a target skill for blocked by prerequisite');
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
  if (skillLevelValue >= 1) {
    SkillDB.db.run(`
      INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, description)
      VALUES (?, 'skill_level', ?, ?, ?, ?)
    `, [skillId, skillLevelValue, targetSkillId, null, description]);
  }
  
  if (!Number.isNaN(skillBlockedByValue) && skillBlockedByValue >= 0 && blockedSkillId > 0) {
    SkillDB.db.run(`
      INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, description)
      VALUES (?, 'skill_blocked_by', ?, ?, ?, ?)
    `, [skillId, skillBlockedByValue, blockedSkillId, null, description]);
  }
  
  if (treePointsValue >= 1) {
    SkillDB.db.run(`
      INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, description)
      VALUES (?, 'tree_points', ?, ?, ?, ?)
    `, [skillId, treePointsValue, null, targetTabId, description]);
  }
  
  if (characterLevelValue >= 1) {
    SkillDB.db.run(`
      INSERT INTO skill_prerequisites (skill_id, requirement_type, requirement_value, target_skill_id, target_tab_id, description)
      VALUES (?, 'character_level', ?, ?, ?, ?)
    `, [skillId, characterLevelValue, null, null, description]);
  }
  
  // Reset form
  document.getElementById('prerequisite-form').reset();
  document.getElementById('prerequisite-skill-hidden').value = '';
  
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
});
