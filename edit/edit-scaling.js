// Scaling management functionality
import { SkillDB } from './edit-core.js';
import { DropdownList } from './DropdownList.js';
import { ToastManager } from '../tree/ToastManager.js';
import { formulaEvaluator } from '../skills/formula-evaluator.js';

// Initialize ToastManager
const toastManager = new ToastManager();


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
  
  // Don't read from DOM - this causes stale data issues
  // Instead, get fresh data from the database for the current skill and level
  const currentSkillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  
  const current = [];
  if (!Number.isNaN(currentSkillId) && !Number.isNaN(level)) {
    // Get fresh scaling data from database
    statOrder.forEach(({ statKey, occurrenceIndex }) => {
      const statInfo = map.get(statKey);
      if (statInfo) {
        const scalingStmt = SkillDB.db.prepare(`
          SELECT value0, value1, value2, value3
          FROM skill_scaling
          WHERE skill_id = ? AND level = ? AND stat_id = ? AND occurrence_index = ?
        `);
        scalingStmt.bind([currentSkillId, level, statInfo.id, occurrenceIndex]);
        
        let v0 = null, v1 = null, v2 = null, v3 = null;
        if (scalingStmt.step()) {
          [v0, v1, v2, v3] = scalingStmt.get();
        }
        scalingStmt.free();
        
        current.push({
          stat_id: statInfo.id,
          key: statInfo.key,
          name: statInfo.name,
          occurrence_index: occurrenceIndex,
          value0: v0, value1: v1, value2: v2, value3: v3
        });
      }
    });
  }
  
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
    
    
    // Value columns - determine which ones are used based on format
    const formatStr = format.toLowerCase();
    const hasValue0 = formatStr.includes('{value0}') || formatStr.includes('{value}');
    const hasValue1 = formatStr.includes('{value1}');
    const hasValue2 = formatStr.includes('{value2}');
    const hasValue3 = formatStr.includes('{value3}');
    
    // Check if this stat has constant values
    const constantData = constants.get(`${row.stat_id}:${row.occurrence_index || 0}`);
    
    for (let i = 0; i < 4; i++) {
      const valueTd = document.createElement('td');
      
      // Create container for input + checkbox
      const container = document.createElement('div');
      container.className = 'field has-addons mb-0';
      
      const inputControl = document.createElement('div');
      inputControl.className = 'control is-expanded';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input is-small';
      input.placeholder = `Value${i} or formula`;
      input.title = 'Enter number or formula. Click "List Functions" for help.';
      input.setAttribute('data-value-index', i);
      
      // Check if this specific value is marked as constant
      if (constantData && constantData[`value${i}_constant`]) {
        input.value = constantData[`value${i}`] || '';
        input.classList.add('is-warning'); // Visual indicator
        input.setAttribute('data-is-constant', 'true');
      } else {
        input.value = row[`value${i}`] || '';
        input.step = 'any';
      }
        
        // Disable inputs that aren't used in the format
        if ((i === 0 && !hasValue0) || 
            (i === 1 && !hasValue1) || 
            (i === 2 && !hasValue2) || 
            (i === 3 && !hasValue3)) {
          input.disabled = true;
          input.placeholder = 'N/A';
        }
        
      inputControl.appendChild(input);
      
      // Create checkbox for constant marking
      const checkboxControl = document.createElement('div');
      checkboxControl.className = 'control';
      checkboxControl.style.display = 'flex';
      checkboxControl.style.alignItems = 'center';
      checkboxControl.style.marginLeft = '0.25rem';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox';
      checkbox.setAttribute('data-constant-checkbox', i);
      checkbox.title = 'Lock as constant (same value for all levels)';
      
      // Set checked state if constant
      if (constantData && constantData[`value${i}_constant`]) {
        checkbox.checked = true;
      }
      
      // Disable checkbox for unused fields
      if ((i === 0 && !hasValue0) || 
          (i === 1 && !hasValue1) || 
          (i === 2 && !hasValue2) || 
          (i === 3 && !hasValue3)) {
        checkbox.disabled = true;
      } else {
        // Add event listener for checkbox toggle
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            input.classList.add('is-warning');
            input.setAttribute('data-is-constant', 'true');
          } else {
            input.classList.remove('is-warning');
            input.removeAttribute('data-is-constant');
          }
        });
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
    deleteBtn.className = 'button is-danger is-outlined is-small';
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

  document.getElementById('scaling-status').textContent =
    rows.length > 0
      ? `Loaded ${rows.length} stats for level ${level}`
      : 'No stats saved for this level yet';
}


function saveScaling() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  
  if (Number.isNaN(skillId) || skillId <= 0) {
    toastManager.showToast('Please select a skill before saving', true, 'error');
    return;
  }
  
  if (Number.isNaN(level) || level <= 0) {
    toastManager.showToast('Please select a level before saving', true, 'error');
    return;
  }
  
  // Validate all formulas
  const validationErrors = validateAllFormulas();
  if (validationErrors.length > 0) {
    toastManager.showToast(`Formula validation failed: ${validationErrors.join(', ')}`, true, 'error');
    return;
  }
  
  const rows = Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => {
    const statId = parseInt(tr.getAttribute('data-stat-id'), 10);
    const occurrenceIndex = parseInt(tr.getAttribute('data-occurrence-index') || '0', 10);
    const inputs = tr.querySelectorAll('input[data-value-index]');
    const checkboxes = tr.querySelectorAll('input[data-constant-checkbox]');
    
    const rowData = {
      stat_id: statId,
      occurrence_index: occurrenceIndex,
      scalingValues: {},
      constantValues: {},
      constantFlags: {}
    };
    
    // Collect values and constant flags
    for (let i = 0; i < 4; i++) {
      const input = inputs[i];
      const checkbox = checkboxes[i];
      const value = input?.value || '';
      const isConstant = checkbox?.checked || false;
      
      rowData.constantFlags[`value${i}_constant`] = isConstant ? 1 : 0;
      
      if (isConstant) {
        // Save to constants
        rowData.constantValues[`value${i}`] = value;
        rowData.scalingValues[`value${i}`] = null; // Don't save to scaling
      } else {
        // Save to scaling
        rowData.scalingValues[`value${i}`] = value;
      }
    }
    
    return rowData;
  });
  
  // Save scaling values
  rows.forEach(r => {
    const hasScalingData = Object.values(r.scalingValues).some(v => v !== null && v !== '');
    
    if (hasScalingData) {
      SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=? AND stat_id=? AND occurrence_index=?', 
                     [skillId, level, r.stat_id, r.occurrence_index]);
      SkillDB.db.run('INSERT INTO skill_scaling (skill_id, level, stat_id, occurrence_index, value0, value1, value2, value3) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
                     [skillId, level, r.stat_id, r.occurrence_index, 
                      r.scalingValues.value0 || null, r.scalingValues.value1 || null, 
                      r.scalingValues.value2 || null, r.scalingValues.value3 || null]);
    } else {
      // No scaling data, remove if exists
      SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=? AND stat_id=? AND occurrence_index=?', 
                     [skillId, level, r.stat_id, r.occurrence_index]);
    }
  });
  
  // Save constants
  rows.forEach(r => {
    const hasConstantData = Object.values(r.constantFlags).some(v => v === 1);
    
    // Delete existing constant entry
    SkillDB.db.run('DELETE FROM skill_scaling_constants WHERE skill_id=? AND stat_id=? AND occurrence_index=?', 
                   [skillId, r.stat_id, r.occurrence_index]);
    
    if (hasConstantData) {
      SkillDB.db.run(`INSERT INTO skill_scaling_constants 
                     (skill_id, stat_id, occurrence_index, value0, value1, value2, value3, 
                      value0_constant, value1_constant, value2_constant, value3_constant)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                     [skillId, r.stat_id, r.occurrence_index,
                      r.constantValues.value0 || '', r.constantValues.value1 || '',
                      r.constantValues.value2 || '', r.constantValues.value3 || '',
                      r.constantFlags.value0_constant, r.constantFlags.value1_constant,
                      r.constantFlags.value2_constant, r.constantFlags.value3_constant]);
    }
  });
  
  document.getElementById('scaling-status').textContent = `Saved ${rows.length} rows for level ${level}`;
  updateLevelIndicator();
  toastManager.showToast('Skill was saved', true, 'success');
}

function clearScaling() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  
  // Validate that a skill is selected
  if (Number.isNaN(skillId) || skillId <= 0) {
    toastManager.showToast('Please select a skill before clearing scaling values', true, 'error');
    return;
  }
  
  // Validate that a level is selected
  if (Number.isNaN(level) || level <= 0) {
    toastManager.showToast('Please select a level before clearing scaling values', true, 'error');
    return;
  }
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
  
  let constantCount = 0;
  while (stmt.step()) {
    const [stat_id, occurrence_index, value0, value1, value2, value3, 
           value0_constant, value1_constant, value2_constant, value3_constant] = stmt.get();
    const key = `${stat_id}:${occurrence_index}`;
    const constantData = {
      value0, value1, value2, value3,
      value0_constant, value1_constant, value2_constant, value3_constant
    };
    constants.set(key, constantData);
    constantCount++;
  }
  stmt.free();
  return constants;
}





// Formulas work automatically - no mode toggle needed


// Note: Formulas are now saved directly in the value fields, no separate table needed

function validateAllFormulas() {
  const errors = [];
  const rows = document.querySelectorAll('#scaling-table tbody tr');
  
  rows.forEach((row, rowIndex) => {
    const inputs = row.querySelectorAll('input[data-value-index]:not([disabled])');
    
    inputs.forEach((input) => {
      const value = input.value.trim();
      const valueIndex = input.getAttribute('data-value-index');
      
      if (value) {
        // Check if it's a number (valid)
        if (isNaN(value)) {
          // It's not a number, so it should be a formula
          const parseResult = formulaEvaluator.parseFormula(value);
          if (!parseResult.success) {
            const statName = row.querySelector('td:first-child').textContent;
            errors.push(`${statName}, Value${valueIndex}: ${parseResult.error}`);
          }
        }
      }
    });
  });
  
  return errors;
}

// Functions and Variables Modal functionality
async function initializeFunctionsModal() {
  const listFunctionsBtn = document.getElementById('list-functions-btn');
  const functionsModal = document.getElementById('functionsModal');
  const closeFunctionsModalBtn = document.getElementById('closeFunctionsModalBtn');
  const functionsTab = document.getElementById('functionsTab');
  const variablesTab = document.getElementById('variablesTab');
  const functionsContent = document.getElementById('functionsContent');
  const variablesContent = document.getElementById('variablesContent');
  
  if (!listFunctionsBtn || !functionsModal) {
    console.warn('Functions modal elements not found');
    return;
  }
  
  // Import and initialize formula evaluator
  const { FormulaEvaluator } = await import('../skills/formula-evaluator.js');
  const evaluator = new FormulaEvaluator();
  
  // Populate functions table
  function populateFunctionsTable() {
    const functionsTableBody = document.getElementById('functionsTableBody');
    if (!functionsTableBody) return;
    
    functionsTableBody.innerHTML = '';
    const functions = evaluator.getFunctionInfo();
    
    functions.forEach(func => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><code>${func.name}()</code></td>
        <td>${func.description}</td>
        <td><code>${func.example}</code></td>
      `;
      functionsTableBody.appendChild(row);
    });
  }
  
  // Populate variables table
  function populateVariablesTable() {
    const variablesTableBody = document.getElementById('variablesTableBody');
    if (!variablesTableBody) return;
    
    variablesTableBody.innerHTML = '';
    const variables = evaluator.getVariableInfo();
    const skillReferences = evaluator.getSkillReferenceInfo();
    
    // Add regular variables
    variables.forEach(variable => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><code>${variable.name}</code></td>
        <td>${variable.description}</td>
        <td><code>${variable.example}</code></td>
      `;
      variablesTableBody.appendChild(row);
    });
    
    // Add skill references
    skillReferences.forEach(skillRef => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><code>${skillRef.name}</code></td>
        <td>${skillRef.description}</td>
        <td><code>${skillRef.example}</code></td>
      `;
      variablesTableBody.appendChild(row);
    });
  }
  
  // Tab switching functionality
  functionsTab.addEventListener('click', () => {
    functionsTab.classList.add('is-active');
    variablesTab.classList.remove('is-active');
    functionsContent.style.display = 'block';
    variablesContent.style.display = 'none';
  });
  
  variablesTab.addEventListener('click', () => {
    variablesTab.classList.add('is-active');
    functionsTab.classList.remove('is-active');
    variablesContent.style.display = 'block';
    functionsContent.style.display = 'none';
  });
  
  // Modal open/close functionality
  listFunctionsBtn.addEventListener('click', () => {
    populateFunctionsTable();
    populateVariablesTable();
    functionsModal.classList.add('is-active');
  });
  
  const closeModal = () => {
    functionsModal.classList.remove('is-active');
  };
  
  closeFunctionsModalBtn.addEventListener('click', closeModal);
  
  // Close modal when clicking background
  functionsModal.addEventListener('click', (e) => {
    // Check if click is on the modal background (not the modal card)
    if (e.target === functionsModal || e.target.classList.contains('modal-background')) {
      closeModal();
    }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && functionsModal.classList.contains('is-active')) {
      closeModal();
    }
  });
}

// Initialize the modal when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeFunctionsModal().catch(console.error);
});

