// Scaling management functionality
import { SkillDB } from './edit-core.js';
import { DropdownList } from './DropdownList.js';
import { ToastManager } from '../tree/ToastManager.js';

// Initialize ToastManager
const toastManager = new ToastManager();

// Store locked values: Map<statId, {value0, value1, value2, value3}>
const lockedValues = new Map();

// Extract stats from skill_effect in appearance order with occurrence tracking
function extractStatsInOrder(skillEffect) {
  const statOrder = [];
  const statCounts = new Map();
  
  if (!skillEffect) return statOrder;
  
  skillEffect.replace(/\{\{(.*?)\}\}/g, (match, token) => {
    const [key] = token.split(':').map(s => s.trim());
    if (key) {
      const statKey = key.toLowerCase();
      const occurrenceIndex = statCounts.get(statKey) || 0;
      statOrder.push({ statKey, occurrenceIndex });
      statCounts.set(statKey, occurrenceIndex + 1);
    }
    return match; // Don't replace, just track
  });
  
  return statOrder;
}

export async function initializeScaling() {
  await populateScalingSelectors();
  
  // Scaling load button
  document.getElementById('scaling-load').addEventListener('click', () => {
    loadScaling();
    updateLevelIndicator();
    suggestFromDescription();
  });
  
  // Scaling save button
  document.getElementById('scaling-save').addEventListener('click', saveScaling);
  
  // Scaling clear button
  document.getElementById('scaling-clear').addEventListener('click', clearScaling);
  
  // Remove the add-constant-stat button handler since we're using move buttons instead
  
  // Auto-load and suggest scaling when level changes
  const scalingLevelInput = document.getElementById('scaling-level');
  if (scalingLevelInput) {
    scalingLevelInput.addEventListener('change', () => {
      const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
      if (!Number.isNaN(skillId)) {
        loadScaling();
        updateLevelIndicator();
        suggestFromDescription();
      }
    });
  }
}

function suggestFromDescription() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  if (Number.isNaN(skillId)) return;
  
  const stmt = SkillDB.db.prepare('SELECT description, skill_effect FROM skills WHERE id = ?');
  stmt.bind([skillId]);
  let desc = '';
  let skillEffect = '';
  if (stmt.step()) {
    const [description, effect] = stmt.get();
    desc = (description || '') + ' ' + (effect || '');
    skillEffect = effect || '';
  }
  stmt.free();
  
  // Extract stats in order with occurrence tracking
  const statOrder = extractStatsInOrder(skillEffect);
  
  if (statOrder.length === 0) return;
  
  // Fetch stat metadata
  const all = SkillDB.db.exec('SELECT id, key, name FROM stats');
  const map = new Map();
  if (all[0]) all[0].values.forEach(([id, key, name]) => map.set(key.toLowerCase(), { id, key, name }));
  
  // Existing rows - get the stat ID and occurrence index from the data attribute
  const existingRows = new Set(Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => {
    const statId = parseInt(tr.getAttribute('data-stat-id'), 10);
    const occurrenceIndex = parseInt(tr.getAttribute('data-occurrence-index') || '0', 10);
    return `${statId}:${occurrenceIndex}`;
  }));
  
  const rows = [];
  statOrder.forEach(({ statKey, occurrenceIndex }) => {
    if (map.has(statKey)) {
      const s = map.get(statKey);
      const rowKey = `${s.id}:${occurrenceIndex}`;
      if (!existingRows.has(rowKey)) {
        rows.push({ 
          stat_id: s.id, 
          key: s.key, 
          name: s.name, 
          occurrence_index: occurrenceIndex,
          value0: '', value1: '', value2: '', value3: '' 
        });
      }
    }
  });
  
  const current = Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => {
    const inputs = tr.querySelectorAll('input[type="number"]:not([disabled])');
    const statId = parseInt(tr.getAttribute('data-stat-id'), 10);
    const occurrenceIndex = parseInt(tr.getAttribute('data-occurrence-index') || '0', 10);
    // Get the stat info from the map using the stat ID
    const statInfo = Array.from(map.values()).find(s => s.id === statId);
    return {
      stat_id: statId,
      key: statInfo?.key || '',
      name: statInfo?.name || '',
      occurrence_index: occurrenceIndex,
      value0: inputs[0]?.value || '',
      value1: inputs[1]?.value || '',
      value2: inputs[2]?.value || '',
      value3: inputs[3]?.value || '',
    };
  });
  
  renderScalingTable(current.concat(rows));
}

function renderScalingTable(rows) {
  const tbody = document.querySelector('#scaling-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const constants = loadConstants(skillId);
  
  // Get stat formats for display
  const statFormats = new Map();
  if (rows.length > 0) {
    const statIds = rows.map(r => r.stat_id);
    const stmt = SkillDB.db.prepare(`SELECT id, format FROM stats WHERE id IN (${statIds.map(() => '?').join(',')})`);
    stmt.bind(statIds);
    while (stmt.step()) {
      const [id, format] = stmt.get();
      statFormats.set(id, format || '{name}: {value}');
    }
    stmt.free();
  }
  
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-stat-id', row.stat_id);
    tr.setAttribute('data-occurrence-index', row.occurrence_index || 0);
    
    // Name column - show occurrence indicator for duplicates
    const nameTd = document.createElement('td');
    const displayName = (row.occurrence_index && row.occurrence_index > 0) 
      ? `${row.name} #${row.occurrence_index + 1}` 
      : row.name;
    nameTd.textContent = displayName;
    tr.appendChild(nameTd);
    
    // Format column (displayed as code)
    const formatTd = document.createElement('td');
    const format = statFormats.get(row.stat_id) || '{name}: {value}';
    const formatCode = document.createElement('code');
    formatCode.textContent = format;
    formatTd.appendChild(formatCode);
    tr.appendChild(formatTd);
    
    // Lock checkbox column
    const lockTd = document.createElement('td');
    lockTd.style.textAlign = 'center';
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.className = 'lock-checkbox';
    lockCheckbox.checked = lockedValues.has(row.stat_id);
    lockCheckbox.addEventListener('change', () => {
      if (lockCheckbox.checked) {
        // Save current values when locking
        const inputs = tr.querySelectorAll('input[type="number"]:not([disabled])');
        lockedValues.set(row.stat_id, {
          value0: inputs[0]?.value || '',
          value1: inputs[1]?.value || '',
          value2: inputs[2]?.value || '',
          value3: inputs[3]?.value || ''
        });
      } else {
        // Remove from locked values when unlocking
        lockedValues.delete(row.stat_id);
      }
    });
    lockTd.appendChild(lockCheckbox);
    tr.appendChild(lockTd);
    
    // Value columns - determine which ones are used based on format
    const formatStr = format.toLowerCase();
    const hasValue0 = formatStr.includes('{value0}') || formatStr.includes('{value}');
    const hasValue1 = formatStr.includes('{value1}');
    const hasValue2 = formatStr.includes('{value2}');
    const hasValue3 = formatStr.includes('{value3}');
    
    // Check if this stat has locked values
    const locked = lockedValues.get(row.stat_id);
    const constantData = constants.get(row.stat_id);
    
    for (let i = 0; i < 4; i++) {
      const valueTd = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'input is-small';
      
      // Check if this specific value is marked as constant
      if (constantData && constantData[`value${i}_constant`]) {
        input.value = constantData[`value${i}`] || '';
        input.disabled = true;
        input.className = 'input is-small is-static';
        input.title = 'This value is constant (set below)';
      } else {
        // Use locked value if available, otherwise use row value
        input.value = locked ? (locked[`value${i}`] || '') : (row[`value${i}`] || '');
        input.step = 'any';
        
        // Disable inputs that aren't used in the format
        if ((i === 0 && !hasValue0) || 
            (i === 1 && !hasValue1) || 
            (i === 2 && !hasValue2) || 
            (i === 3 && !hasValue3)) {
          input.disabled = true;
          input.placeholder = 'N/A';
        }
        
        // Update locked values when input changes (if locked)
        input.addEventListener('input', () => {
          if (lockedValues.has(row.stat_id)) {
            const currentLocked = lockedValues.get(row.stat_id);
            currentLocked[`value${i}`] = input.value;
            lockedValues.set(row.stat_id, currentLocked);
          }
        });
      }
      
      valueTd.appendChild(input);
      tr.appendChild(valueTd);
    }
    
    // Actions column
    const actionsTd = document.createElement('td');
    
    // Const button - only show if this stat doesn't already have constants
    if (!constantData) {
      const constBtn = document.createElement('button');
      constBtn.className = 'button is-warning is-small';
      constBtn.textContent = 'Const';
      constBtn.title = 'Move to constants table';
      constBtn.addEventListener('click', () => {
        moveToConstants(row.stat_id, row.name, statFormats.get(row.stat_id));
      });
      actionsTd.appendChild(constBtn);
    }
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'button is-danger is-small';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      tr.remove();
    });
    actionsTd.appendChild(deleteBtn);
    tr.appendChild(actionsTd);
    
    tbody.appendChild(tr);
  });
}

function updateLevelIndicator() {
  const skillHiddenInput = document.getElementById('scaling-skill-hidden');
  const statusEl = document.getElementById('scaling-status');
  
  if (!skillHiddenInput || !statusEl) {
    console.error("Scaling elements not found");
    return;
  }
  
  const skillId = parseInt(skillHiddenInput.value, 10);
  if (Number.isNaN(skillId)) return;
  
  // Get all levels that exist for this skill
  const stmt = SkillDB.db.prepare('SELECT DISTINCT level FROM skill_scaling WHERE skill_id = ? ORDER BY level');
  stmt.bind([skillId]);
  const existingLevels = [];
  while (stmt.step()) {
    existingLevels.push(stmt.get()[0]);
  }
  stmt.free();
  
  if (existingLevels.length > 0) {
    statusEl.innerHTML = `Existing levels: <span class="tag is-info">${existingLevels.join('</span> <span class="tag is-info">')}</span>`;
  } else {
    statusEl.textContent = 'No levels saved for this skill yet';
  }
}

async function populateScalingSelectors() {
  // Skills dropdown using DropdownList
  const skillDdContainer = document.getElementById('scaling-skill-dd');
  const skillHiddenInput = document.getElementById('scaling-skill-hidden');

  if (skillDdContainer && skillHiddenInput) {
    const res = SkillDB.db.exec("SELECT id, display_name FROM skills ORDER BY display_name");
    const skillItems = res[0] ? res[0].values.map(([id, name]) => ({
      value: id,
      name: name,
      desc: `Skill ID: ${id}`
    })) : [];
    
    const skillDropdown = new DropdownList(skillDdContainer, {
      placeholder: 'Select skill...',
      emptyListText: 'No skills found',
      defaultHeaderText: 'Skills',
      
      onSelect: (item) => {
        skillHiddenInput.value = item?.value || '';
        // Auto-load scaling data when skill is selected
        if (item?.value) {
          document.getElementById('scaling-level').value = 1;
          loadScaling();
          updateLevelIndicator();
          // Automatically suggest scaling from description
          suggestFromDescription();
        }
      }
    });
    skillDropdown.setItems(skillItems);
  }
}


function loadScaling() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  if (Number.isNaN(skillId) || Number.isNaN(level)) return;

  // First, get the skill description and skill_effect to find which stats are used
  const skillStmt = SkillDB.db.prepare('SELECT description, skill_effect FROM skills WHERE id = ?');
  skillStmt.bind([skillId]);
  let description = '';
  let skillEffect = '';
  if (skillStmt.step()) {
    const [desc, effect] = skillStmt.get();
    description = (desc || '') + ' ' + (effect || '');
    skillEffect = effect || '';
  }
  skillStmt.free();

  // Extract stats in order with occurrence tracking
  const statOrder = extractStatsInOrder(skillEffect);

  // If no stats are used in description, show empty table
  if (statOrder.length === 0) {
    renderScalingTable([]);
    document.getElementById('scaling-status').textContent = 'No stats found in skill description';
    return;
  }

  // Create a map of stat keys to their info for quick lookup
  const statInfoMap = new Map();
  const statKeysArray = statOrder.map(s => s.statKey);
  const placeholders = statKeysArray.map(() => '?').join(',');
  
  const statStmt = SkillDB.db.prepare(`SELECT id, key, name FROM stats WHERE LOWER(key) IN (${placeholders})`);
  statStmt.bind(statKeysArray);
  while (statStmt.step()) {
    const [id, key, name] = statStmt.get();
    statInfoMap.set(key.toLowerCase(), { id, key, name });
  }
  statStmt.free();

  // Get scaling values for each stat occurrence
  const rows = [];
  statOrder.forEach(({ statKey, occurrenceIndex }) => {
    const statInfo = statInfoMap.get(statKey);
    if (statInfo) {
      const scalingStmt = SkillDB.db.prepare(`
        SELECT value0, value1, value2, value3
        FROM skill_scaling
        WHERE skill_id = ? AND level = ? AND stat_id = ? AND occurrence_index = ?
      `);
      scalingStmt.bind([skillId, level, statInfo.id, occurrenceIndex]);
      
      let v0 = null, v1 = null, v2 = null, v3 = null;
      if (scalingStmt.step()) {
        [v0, v1, v2, v3] = scalingStmt.get();
      }
      scalingStmt.free();
      
      rows.push({
        stat_id: statInfo.id,
        key: statInfo.key,
        name: statInfo.name,
        occurrence_index: occurrenceIndex,
        value0: v0, value1: v1, value2: v2, value3: v3
      });
    }
  });

  renderScalingTable(rows);
  renderConstantsTable();

  document.getElementById('scaling-status').textContent =
    rows.length > 0
      ? `Loaded ${rows.length} stats for level ${level}`
      : 'No stats saved for this level yet';
}


function saveScaling() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  if (Number.isNaN(skillId) || Number.isNaN(level)) return;
  
  const constants = loadConstants(skillId);
  
  const rows = Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => {
    const statId = parseInt(tr.getAttribute('data-stat-id'), 10);
    const occurrenceIndex = parseInt(tr.getAttribute('data-occurrence-index') || '0', 10);
    const inputs = tr.querySelectorAll('input[type="number"]:not([disabled])');
    const constantData = constants.get(`${statId}:${occurrenceIndex}`);
    
    const values = {
      stat_id: statId,
      occurrence_index: occurrenceIndex,
      value0: inputs[0]?.value || '',
      value1: inputs[1]?.value || '',
      value2: inputs[2]?.value || '',
      value3: inputs[3]?.value || '',
    };
    
    // Set constant values to null so they don't get saved to skill_scaling
    if (constantData) {
      if (constantData.value0_constant) values.value0 = null;
      if (constantData.value1_constant) values.value1 = null;
      if (constantData.value2_constant) values.value2 = null;
      if (constantData.value3_constant) values.value3 = null;
    }
    
    return values;
  });
  
  // Upsert by delete+insert to keep logic simple
  rows.forEach(r => {
    // Skip empty rows (no values) or rows where all values are constant
    if ((r.value0 === '' || r.value0 == null) && (r.value1 === '' || r.value1 == null) && (r.value2 === '' || r.value2 == null) && (r.value3 === '' || r.value3 == null)) {
      SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=? AND stat_id=? AND occurrence_index=?', [skillId, level, r.stat_id, r.occurrence_index]);
      return;
    }
    SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=? AND stat_id=? AND occurrence_index=?', [skillId, level, r.stat_id, r.occurrence_index]);
    SkillDB.db.run('INSERT INTO skill_scaling (skill_id, level, stat_id, occurrence_index, value0, value1, value2, value3) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [skillId, level, r.stat_id, r.occurrence_index, r.value0 || null, r.value1 || null, r.value2 || null, r.value3 || null]);
  });
  document.getElementById('scaling-status').textContent = `Saved ${rows.length} rows for level ${level}`;
  updateLevelIndicator();
  toastManager.showToast('Skill was saved', true, 'success');
}

function clearScaling() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  if (Number.isNaN(skillId) || Number.isNaN(level)) return;
  SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=?', [skillId, level]);
  renderScalingTable([]);
  document.getElementById('scaling-status').textContent = `Cleared level ${level}`;
  updateLevelIndicator();
}

// Constants functionality
function loadConstants(skillId) {
  const constants = new Map();
  const stmt = SkillDB.db.prepare(`
    SELECT stat_id, occurrence_index, value0, value1, value2, value3,
           value0_constant, value1_constant, value2_constant, value3_constant
    FROM skill_scaling_constants
    WHERE skill_id = ?
  `);
  stmt.bind([skillId]);
  
  while (stmt.step()) {
    const [stat_id, occurrence_index, value0, value1, value2, value3, 
           value0_constant, value1_constant, value2_constant, value3_constant] = stmt.get();
    constants.set(`${stat_id}:${occurrence_index}`, {
      value0, value1, value2, value3,
      value0_constant, value1_constant, value2_constant, value3_constant
    });
  }
  stmt.free();
  return constants;
}

function renderConstantsTable() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  if (Number.isNaN(skillId)) return;
  
  const tbody = document.getElementById('scaling-constants-table').querySelector('tbody');
  tbody.innerHTML = '';
  
  // Load all constants for this skill
  const stmt = SkillDB.db.prepare(`
    SELECT ssc.*, s.name, s.format
    FROM skill_scaling_constants ssc
    JOIN stats s ON s.id = ssc.stat_id
    WHERE ssc.skill_id = ?
    ORDER BY ssc.stat_id, ssc.occurrence_index
  `);
  stmt.bind([skillId]);
  
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const tr = createConstantRow(row);
    tbody.appendChild(tr);
  }
  stmt.free();
}

function createConstantRow(row) {
  const tr = document.createElement('tr');
  tr.setAttribute('data-stat-id', row.stat_id);
  tr.setAttribute('data-occurrence-index', row.occurrence_index || 0);
  
  // Name column - show occurrence indicator for duplicates
  const nameTd = document.createElement('td');
  const displayName = (row.occurrence_index && row.occurrence_index > 0) 
    ? `${row.name} #${row.occurrence_index + 1}` 
    : row.name;
  nameTd.textContent = displayName;
  tr.appendChild(nameTd);
  
  // Format column
  const formatTd = document.createElement('td');
  const formatCode = document.createElement('code');
  formatCode.textContent = row.format || '{name}: {value}';
  formatTd.appendChild(formatCode);
  tr.appendChild(formatTd);
  
  // Value columns with checkboxes - determine which ones are used based on format
  const formatStr = (row.format || '{name}: {value}').toLowerCase();
  const hasValue0 = formatStr.includes('{value0}') || formatStr.includes('{value}');
  const hasValue1 = formatStr.includes('{value1}');
  const hasValue2 = formatStr.includes('{value2}');
  const hasValue3 = formatStr.includes('{value3}');
  
  for (let i = 0; i < 4; i++) {
    const valueTd = document.createElement('td');
    const container = document.createElement('div');
    container.className = 'field has-addons';
    
    const inputControl = document.createElement('div');
    inputControl.className = 'control';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'input is-small';
    input.value = row[`value${i}`] || '';
    input.step = 'any';
    input.setAttribute('data-value', i);
    
    // Disable inputs that aren't used in the format
    if ((i === 0 && !hasValue0) || 
        (i === 1 && !hasValue1) || 
        (i === 2 && !hasValue2) || 
        (i === 3 && !hasValue3)) {
      input.disabled = true;
      input.placeholder = 'N/A';
    }
    
    inputControl.appendChild(input);
    
    const checkboxControl = document.createElement('div');
    checkboxControl.className = 'control';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox';
    checkbox.checked = row[`value${i}_constant`] == 1;
    checkbox.setAttribute('data-constant', i);
    checkbox.addEventListener('change', saveConstants);
    
    // Disable checkboxes for unused fields
    if ((i === 0 && !hasValue0) || 
        (i === 1 && !hasValue1) || 
        (i === 2 && !hasValue2) || 
        (i === 3 && !hasValue3)) {
      checkbox.disabled = true;
    }
    
    checkboxControl.appendChild(checkbox);
    
    container.appendChild(inputControl);
    container.appendChild(checkboxControl);
    valueTd.appendChild(container);
    tr.appendChild(valueTd);
  }
  
  // Actions column
  const actionsTd = document.createElement('td');
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'button is-danger is-small';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
    const statId = row.stat_id;
    const occurrenceIndex = row.occurrence_index || 0;
    SkillDB.db.run('DELETE FROM skill_scaling_constants WHERE skill_id = ? AND stat_id = ? AND occurrence_index = ?', [skillId, statId, occurrenceIndex]);
    renderConstantsTable();
    loadScaling(); // Refresh main table to remove locks
  });
  actionsTd.appendChild(deleteBtn);
  tr.appendChild(actionsTd);
  
  return tr;
}

function saveConstants() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  if (Number.isNaN(skillId)) return;
  
  // Get all rows from constants table
  const rows = document.querySelectorAll('#scaling-constants-table tbody tr');
  
  rows.forEach(row => {
    const statId = row.getAttribute('data-stat-id');
    const occurrenceIndex = parseInt(row.getAttribute('data-occurrence-index') || '0', 10);
    const values = {
      value0: row.querySelector('[data-value="0"]').value,
      value1: row.querySelector('[data-value="1"]').value,
      value2: row.querySelector('[data-value="2"]').value,
      value3: row.querySelector('[data-value="3"]').value,
      value0_constant: row.querySelector('[data-constant="0"]').checked ? 1 : 0,
      value1_constant: row.querySelector('[data-constant="1"]').checked ? 1 : 0,
      value2_constant: row.querySelector('[data-constant="2"]').checked ? 1 : 0,
      value3_constant: row.querySelector('[data-constant="3"]').checked ? 1 : 0,
    };
    
    // Delete existing constant entry
    SkillDB.db.run('DELETE FROM skill_scaling_constants WHERE skill_id = ? AND stat_id = ? AND occurrence_index = ?', 
                   [skillId, statId, occurrenceIndex]);
    
    // Insert new constant entry (only if at least one value is marked constant)
    if (values.value0_constant || values.value1_constant || 
        values.value2_constant || values.value3_constant) {
      SkillDB.db.run(`
        INSERT INTO skill_scaling_constants 
        (skill_id, stat_id, occurrence_index, value0, value1, value2, value3, 
         value0_constant, value1_constant, value2_constant, value3_constant)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [skillId, statId, occurrenceIndex, values.value0, values.value1, values.value2, values.value3,
          values.value0_constant, values.value1_constant, 
          values.value2_constant, values.value3_constant]);
    }
  });
  
  // Reload the regular scaling table to show locked fields
  loadScaling();
  toastManager.showToast('Constant values were saved', true, 'success');
}

function moveToConstants(statId, statName, statFormat) {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  if (Number.isNaN(skillId)) return;
  
  // Get the occurrence index from the current row
  const currentRow = document.querySelector(`#scaling-table tbody tr[data-stat-id="${statId}"]`);
  const occurrenceIndex = parseInt(currentRow?.getAttribute('data-occurrence-index') || '0', 10);
  
  // Check if already exists in constants for this occurrence
  const checkStmt = SkillDB.db.prepare('SELECT COUNT(*) FROM skill_scaling_constants WHERE skill_id = ? AND stat_id = ? AND occurrence_index = ?');
  checkStmt.bind([skillId, statId, occurrenceIndex]);
  const exists = checkStmt.step() ? checkStmt.get()[0] : 0;
  checkStmt.free();
  
  if (exists > 0) {
    alert('This stat occurrence already has constant values');
    return;
  }
  
  // Save to database first
  SkillDB.db.run(`
    INSERT INTO skill_scaling_constants 
    (skill_id, stat_id, occurrence_index, value0, value1, value2, value3, 
     value0_constant, value1_constant, value2_constant, value3_constant)
    VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
  `, [skillId, statId, occurrenceIndex]);
  
  // Refresh both tables
  loadScaling();
}
