// Scaling management functionality
import { SkillDB } from './edit-core.js';
import { DropdownList } from './DropdownList.js';

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
  
  const stmt = SkillDB.db.prepare('SELECT description FROM skills WHERE id = ?');
  stmt.bind([skillId]);
  let desc = '';
  if (stmt.step()) desc = stmt.get()[0] || '';
  stmt.free();
  
  const keys = new Set();
  desc.replace(/\{\{(.*?)\}\}/g, (m, token) => {
    const [k] = token.split(':');
    if (k) keys.add(k.trim().toLowerCase());
  });
  
  if (keys.size === 0) return;
  
  // Fetch stat metadata
  const all = SkillDB.db.exec('SELECT id, key, name FROM stats');
  const map = new Map();
  if (all[0]) all[0].values.forEach(([id, key, name]) => map.set(key.toLowerCase(), { id, key, name }));
  
  // Existing rows - get the stat ID from the data attribute
  const existingStatIds = new Set(Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => parseInt(tr.getAttribute('data-stat-id'), 10)));
  
  const rows = [];
  keys.forEach(k => {
    if (map.has(k)) {
      const s = map.get(k);
      if (!existingStatIds.has(s.id)) {
        rows.push({ stat_id: s.id, key: s.key, name: s.name, value0: '', value1: '', value2: '', value3: '' });
      }
    }
  });
  
  const current = Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => {
    const inputs = tr.querySelectorAll('input[type="number"]:not([disabled])');
    const statId = parseInt(tr.getAttribute('data-stat-id'), 10);
    // Get the stat info from the map using the stat ID
    const statInfo = Array.from(map.values()).find(s => s.id === statId);
    return {
      stat_id: statId,
      key: statInfo?.key || '',
      name: statInfo?.name || '',
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
    
    // Name column
    const nameTd = document.createElement('td');
    nameTd.textContent = row.name;
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
    
    for (let i = 0; i < 4; i++) {
      const valueTd = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'input is-small';
      input.value = row[`value${i}`] || '';
      input.step = 'any';
      
      // Disable inputs that aren't used in the format
      if ((i === 0 && !hasValue0) || 
          (i === 1 && !hasValue1) || 
          (i === 2 && !hasValue2) || 
          (i === 3 && !hasValue3)) {
        input.disabled = true;
        input.placeholder = 'N/A';
      }
      
      valueTd.appendChild(input);
      tr.appendChild(valueTd);
    }
    
    // Actions column
    const actionsTd = document.createElement('td');
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

  // First, get the skill description to find which stats are used
  const skillStmt = SkillDB.db.prepare('SELECT description FROM skills WHERE id = ?');
  skillStmt.bind([skillId]);
  let description = '';
  if (skillStmt.step()) {
    description = skillStmt.get()[0] || '';
  }
  skillStmt.free();

  // Extract stat keys from description
  const usedStatKeys = new Set();
  description.replace(/\{\{(.*?)\}\}/g, (m, token) => {
    const [key] = token.split(':');
    if (key) usedStatKeys.add(key.trim().toLowerCase());
  });

  // If no stats are used in description, show empty table
  if (usedStatKeys.size === 0) {
    renderScalingTable([]);
    document.getElementById('scaling-status').textContent = 'No stats found in skill description';
    return;
  }

  // Get stats that are used in the description and their scaling values
  const statKeysArray = Array.from(usedStatKeys);
  const placeholders = statKeysArray.map(() => '?').join(',');
  
  const stmt = SkillDB.db.prepare(`
    SELECT s.id AS stat_id, s.key, s.name,
          ss.value0, ss.value1, ss.value2, ss.value3
    FROM stats s
    LEFT JOIN skill_scaling ss
      ON ss.stat_id = s.id
      AND ss.skill_id = ?
      AND ss.level = ?
    WHERE LOWER(s.key) IN (${placeholders})
    ORDER BY s.name
  `);
  stmt.bind([skillId, level, ...statKeysArray]);
  const res = [];
  while (stmt.step()) {
    res.push(stmt.get());
  }
  stmt.free();

  const rows = res.length > 0
    ? res.map(([stat_id, key, name, v0, v1, v2, v3]) => ({
        stat_id, key, name, value0: v0, value1: v1, value2: v2, value3: v3
      }))
    : [];

  renderScalingTable(rows);

  document.getElementById('scaling-status').textContent =
    rows.length > 0
      ? `Loaded ${rows.length} stats for level ${level}`
      : 'No stats saved for this level yet';
}


function saveScaling() {
  const skillId = parseInt(document.getElementById('scaling-skill-hidden').value, 10);
  const level = parseInt(document.getElementById('scaling-level').value, 10);
  if (Number.isNaN(skillId) || Number.isNaN(level)) return;
  
  const rows = Array.from(document.querySelectorAll('#scaling-table tbody tr')).map(tr => {
    const statId = parseInt(tr.getAttribute('data-stat-id'), 10);
    const inputs = tr.querySelectorAll('input[type="number"]:not([disabled])');
    const values = {
      stat_id: statId,
      value0: inputs[0]?.value || '',
      value1: inputs[1]?.value || '',
      value2: inputs[2]?.value || '',
      value3: inputs[3]?.value || '',
    };
    return values;
  });
  // Upsert by delete+insert to keep logic simple
  rows.forEach(r => {
    // Skip empty rows (no values)
    if ((r.value0 === '' || r.value0 == null) && (r.value1 === '' || r.value1 == null) && (r.value2 === '' || r.value2 == null) && (r.value3 === '' || r.value3 == null)) {
      SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=? AND stat_id=?', [skillId, level, r.stat_id]);
      return;
    }
    SkillDB.db.run('DELETE FROM skill_scaling WHERE skill_id=? AND level=? AND stat_id=?', [skillId, level, r.stat_id]);
    SkillDB.db.run('INSERT INTO skill_scaling (skill_id, level, stat_id, value0, value1, value2, value3) VALUES (?, ?, ?, ?, ?, ?, ?)', [skillId, level, r.stat_id, r.value0 || null, r.value1 || null, r.value2 || null, r.value3 || null]);
  });
  document.getElementById('scaling-status').textContent = `Saved ${rows.length} rows for level ${level}`;
  updateLevelIndicator();
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
