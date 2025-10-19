// Skills management functionality
import { SkillDB } from './edit-core.js';
import { validateSkillTemplates, displayValidationErrors, removeValidationErrors } from './edit-validation.js';
import { TAG_GROUPS } from '../utils.js';

export function initializeSkills() {
  populateClassSelect();
  populateTagCheckboxes();
  refreshSkillsTable();
  
  // Skills form submission
  document.getElementById('skill-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveSkill();
  });
  
  // Class selection change handler
  document.getElementById('class_id').addEventListener('change', function() {
    populateTabSelect(parseInt(this.value));
  });
  
  // Cancel edit handler
  document.getElementById('skill-cancel').addEventListener('click', () => {
    window.editingSkillId = null;
    document.getElementById('skill-form').reset();
    document.querySelector('#skill-form button[type="submit"]').textContent = 'Insert Skill';
    document.getElementById('skill-cancel').style.display = 'none';
    removeValidationErrors();
  });
}

function populateClassSelect() {
  if (!SkillDB.db) return;
  const select = document.getElementById('class_id');
  if (!select) return;
  select.innerHTML = '';
  const res = SkillDB.db.exec('SELECT id, name FROM classes ORDER BY id');
  if (res[0]) {
    res[0].values.forEach(([id, name]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    });
    
    // Populate tabs for the first class if available
    if (res[0].values.length > 0) {
      populateTabSelect(res[0].values[0][0]);
    }
  }
}

function populateTabSelect(classId) {
  if (!SkillDB.db) return;
  const select = document.getElementById('tab_index');
  if (!select) return;
  select.innerHTML = '';
  const res = SkillDB.db.exec('SELECT id, name FROM classTabs WHERE class_id = ? ORDER BY tab_index', [classId]);
  if (res[0]) {
    res[0].values.forEach(([id, name]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    });
  }
}

function setSkillTagCheckboxes(skillId) {
  if (!SkillDB.db) return;
  
  // Clear all checkboxes first
  document.querySelectorAll('#tag-checkboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });

  // Get tags for this skill
  const stmt = SkillDB.db.prepare("SELECT tag_id FROM skill_skilltags WHERE skill_id = ?");
  stmt.bind([skillId]);

  while (stmt.step()) {
    const tagId = stmt.get()[0];
    const cb = document.querySelector(`#tag-checkboxes input[value='${tagId}']`);
    if (cb) cb.checked = true;
  }
  stmt.free();
}

function populateTagCheckboxes() {
  if (!SkillDB.db) return;
  
  const tags = fetchAllSkillTags();
  if (tags.length === 0) return;
  
  const container = document.getElementById("tag-checkboxes");
  container.innerHTML = "";
  
  const tagMap = createTagMap(tags);
  const usedIds = new Set();
  
  renderTagGroups(container, tagMap, usedIds);
  renderLeftoverTags(container, tagMap, usedIds);
}

function fetchAllSkillTags() {
  const result = SkillDB.db.exec("SELECT id, name FROM skilltags ORDER BY name");
  return result.length > 0 ? result[0].values.map(([id, name]) => ({ id, name })) : [];
}

function createTagMap(tags) {
  const tagMap = new Map();
  tags.forEach(tag => {
    tagMap.set(tag.id, tag);
  });
  return tagMap;
}

function renderTagGroups(container, tagMap, usedIds) {
  Object.entries(TAG_GROUPS).forEach(([groupName, tagIds]) => {
    const groupEl = createGroupElement(groupName, 'has-text-warning mb-0');
    const tags = getTagsForGroup(tagIds, tagMap, usedIds);
    
    if (tags.length > 0) {
      tags.forEach(tag => {
        groupEl.appendChild(createCheckboxLabel(tag.id, tag.name));
        usedIds.add(tag.id);
      });
      container.appendChild(groupEl);
    }
  });
}

function renderLeftoverTags(container, tagMap, usedIds) {
  const leftoverTags = getLeftoverTags(tagMap, usedIds);
  if (leftoverTags.length > 0) {
    const groupEl = createGroupElement('Other', 'has-text-danger mb-0');
    leftoverTags.forEach(tag => {
      groupEl.appendChild(createCheckboxLabel(tag.id, tag.name));
    });
    container.appendChild(groupEl);
  }
}

function createGroupElement(title, titleClass) {
  const groupEl = document.createElement('div');
  groupEl.className = 'field mb-0';
  
  const label = document.createElement('label');
  label.className = `label ${titleClass}`;
  label.textContent = title;
  
  const checkboxContainer = document.createElement('div');
  checkboxContainer.id = `tag-checkboxes-${title.toLowerCase().replace(/\s+/g, '-')}`;
  checkboxContainer.className = 'control';
  
  groupEl.appendChild(label);
  groupEl.appendChild(checkboxContainer);
  
  return groupEl;
}

function getTagsForGroup(tagIds, tagMap, usedIds) {
  return tagIds
    .filter(id => tagMap.has(id) && !usedIds.has(id))
    .map(id => tagMap.get(id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getLeftoverTags(tagMap, usedIds) {
  return Array.from(tagMap.values())
    .filter(tag => !usedIds.has(tag.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createCheckboxLabel(id, name) {
  const label = document.createElement('label');
  label.className = 'checkbox mr-2';
  
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = id;
  
  const span = document.createElement('span');
  span.textContent = ` ${name}`;
  
  label.appendChild(input);
  label.appendChild(span);
  
  return label;
}

function refreshSkillsTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector('#skills-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const query = `
    SELECT s.id, s.name, s.display_name, c.name as class_name,
           ct.name as tab_name, s.row, s.col, s.image,
           GROUP_CONCAT(t.name, ', ') as tags,
           CASE WHEN s.description IS NOT NULL AND s.description != '' THEN 1 ELSE 0 END AS has_desc,
           CASE WHEN s.restriction IS NOT NULL AND s.restriction != '' THEN 1 ELSE 0 END AS has_restr
    FROM skills s
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN skill_skilltags st ON s.id = st.skill_id
    LEFT JOIN skilltags t ON st.tag_id = t.id
    LEFT JOIN classTabs ct ON s.tab_index = ct.id
    GROUP BY s.id
    ORDER BY s.id;
  `;

  const res = SkillDB.db.exec(query);
  if (res.length > 0) {
    res[0].values.forEach(row => {
      const tr = document.createElement("tr");
      row.forEach((val, index) => {
        const td = document.createElement("td");
        if (index === 8 && val) { // Tags column
          // Split tags and create individual tag elements with margin
          const tags = val.split(', ');
          const tagContainer = document.createElement("div");
          tagContainer.style.display = "flex";
          tagContainer.style.flexWrap = "wrap";
          tagContainer.style.gap = "4px";
          
          tags.forEach(tag => {
            if (tag.trim()) {
              const tagElement = document.createElement("span");
              tagElement.className = "tag is-small";
              tagElement.textContent = tag.trim();
              tagContainer.appendChild(tagElement);
            }
          });
          
          td.appendChild(tagContainer);
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });

      // Action buttons
      const actionTd = document.createElement("td");
      const buttonsWrapper = document.createElement("div");
      buttonsWrapper.className = "buttons are-small"
      const editBtn = document.createElement("button");
      editBtn.className = "button is-warning is-outlined";
      editBtn.textContent = "Edit";
      editBtn.onclick = () => {
        editSkill(row[0]);
        window.scrollTo({ top: 0, behavior: 'instant' });
      };

      const delBtn = document.createElement("button");
      delBtn.className = "button is-danger is-outlined";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => deleteSkill(row[0]);

      buttonsWrapper.appendChild(editBtn);
      buttonsWrapper.appendChild(delBtn);
      actionTd.appendChild(buttonsWrapper);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });
  }
}

function editSkill(id) {
  if (!SkillDB.db) return;
  const stmt = SkillDB.db.prepare(`
    SELECT s.id, s.name, s.display_name, s.class_id, s.tab_index,
          s.row, s.col, s.image, s.restriction, s.description, s.skill_effect
    FROM skills s
    WHERE s.id = ?
  `);
  stmt.bind([id]);
  
  if (stmt.step()) {
    const [skillId, name, displayName, classId, tabIndex, row, col, image, restriction, description, skillEffect] = stmt.get();
    
    document.getElementById('name').value = name;
    document.getElementById('display_name').value = displayName;
    document.getElementById('class_id').value = classId;
    populateTabSelect(classId);
    document.getElementById('tab_index').value = tabIndex;
    document.getElementById('row').value = row;
    document.getElementById('col').value = col;
    document.getElementById('image').value = image;
    document.getElementById('restriction').value = restriction || '';
    document.getElementById('description').value = description || '';
    document.getElementById('skill_effect').value = skillEffect || '';
    
    setSkillTagCheckboxes(skillId);
    
    document.querySelector('#skill-form button[type="submit"]').textContent = 'Save Skill';
    document.getElementById('skill-cancel').style.display = 'inline-block';
    
    window.editingSkillId = skillId;
  }
  stmt.free();
}

function deleteSkill(id) {
  if (!confirm('Delete this skill?')) return;
  SkillDB.db.run('DELETE FROM skills WHERE id = ?', [id]);
  refreshSkillsTable();
}

function saveSkill() {
  if (!SkillDB.db) return;
  
  const name = document.getElementById('name').value.trim();
  const displayName = document.getElementById('display_name').value.trim();
  const classId = parseInt(document.getElementById('class_id').value);
  const tabIndex = parseInt(document.getElementById('tab_index').value);
  const row = parseInt(document.getElementById('row').value);
  const col = parseInt(document.getElementById('col').value);
  const image = document.getElementById('image').value.trim();
  const restriction = document.getElementById('restriction').value.trim();
  const description = document.getElementById('description').value.trim();
  const skillEffect = document.getElementById('skill_effect').value.trim();
  
  // Validate empty skill names
  if (!name || name.trim() === '') {
    alert('Error: Skill name cannot be empty');
    return;
  }
  if (!displayName || displayName.trim() === '') {
    alert('Error: Display name cannot be empty');
    return;
  }
  
  // Validate foreign key constraint for class_id
  const classCheck = SkillDB.db.exec('SELECT id FROM classes WHERE id = ?', [classId]);
  if (!classCheck || classCheck.length === 0 || classCheck[0].values.length === 0) {
    alert('Error: Invalid class selected');
    return;
  }
  
  // Validate maximum length
  const maxLengths = {
    name: 100,
    displayName: 100,
    image: 50,
    restriction: 250,
    description: 500,
    skillEffect: 1000
  };

  if (name.length > maxLengths.name) {
    alert(`Error: Skill name too long (max ${maxLengths.name} characters)`);
    return;
  }
  if (displayName.length > maxLengths.displayName) {
    alert(`Error: Display name too long (max ${maxLengths.displayName} characters)`);
    return;
  }
  if (image.length > maxLengths.image) {
    alert(`Error: Image path too long (max ${maxLengths.image} characters)`);
    return;
  }
  if (restriction.length > maxLengths.restriction) {
    alert(`Error: Restriction too long (max ${maxLengths.restriction} characters)`);
    return;
  }
  if (description.length > maxLengths.description) {
    alert(`Error: Description too long (max ${maxLengths.description} characters)`);
    return;
  }
  if (skillEffect.length > maxLengths.skillEffect) {
    alert(`Error: Skill effect too long (max ${maxLengths.skillEffect} characters)`);
    return;
  }
  
  // Validate template syntax
  const validationResult = validateSkillTemplates(description, restriction, skillEffect);
  if (!validationResult.valid) {
    displayValidationErrors(validationResult);
    // Scroll to the first error
    const firstError = document.querySelector('.template-validation-error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return; // Don't save if there are validation errors
  }
  
  // Clear any existing validation errors
  removeValidationErrors();

  if (window.editingSkillId) {
    // Update existing skill
    SkillDB.db.run(`
      UPDATE skills 
      SET name=?, display_name=?, class_id=?, tab_index=?, row=?, col=?, image=?, restriction=?, description=?, skill_effect=?
      WHERE id=?
    `, [name, displayName, classId, tabIndex, row, col, image, restriction, description, skillEffect, window.editingSkillId]);
    
    // Update tags
    SkillDB.db.run('DELETE FROM skill_skilltags WHERE skill_id = ?', [window.editingSkillId]);
    const checkedTags = Array.from(document.querySelectorAll('#tag-checkboxes input[type="checkbox"]:checked'));
    checkedTags.forEach(cb => {
      SkillDB.db.run('INSERT INTO skill_skilltags (skill_id, tag_id) VALUES (?, ?)', [window.editingSkillId, parseInt(cb.value)]);
    });
    
    window.editingSkillId = null;
    document.querySelector('#skill-form button[type="submit"]').textContent = 'Insert Skill';
    document.getElementById('skill-cancel').style.display = 'none';
  } else {
    // Insert new skill
    const stmt = SkillDB.db.prepare(`
      INSERT INTO skills (name, display_name, class_id, tab_index, row, col, image, restriction, description, skill_effect)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([name, displayName, classId, tabIndex, row, col, image, restriction, description, skillEffect]);
    const skillId = SkillDB.db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    stmt.free();
    
    // Add tags
    const checkedTags = Array.from(document.querySelectorAll('#tag-checkboxes input[type="checkbox"]:checked'));
    checkedTags.forEach(cb => {
      SkillDB.db.run('INSERT INTO skill_skilltags (skill_id, tag_id) VALUES (?, ?)', [skillId, parseInt(cb.value)]);
    });
  }
  
  document.getElementById('skill-form').reset();
  refreshSkillsTable();
}

