// Stats management functionality
import { SkillDB } from './edit-core.js';

export function initializeStats() {
  refreshStatsTable();
  
  // Stats form button click handler
  const statForm = document.getElementById('stat-form');
  if (!statForm.hasAttribute('data-initialized')) {
    statForm.setAttribute('data-initialized', 'true');
    statForm.addEventListener('click', (e) => {
      if (e.target.type === 'submit') {
        e.preventDefault();
        saveStat();
      }
    });
  }

}

function refreshStatsTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector("#stats-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const res = SkillDB.db.exec(`SELECT id, key, name, format FROM stats ORDER BY id`);
  if (res.length > 0) {
    res[0].values.forEach(row => {
      const tr = document.createElement("tr");
      row.forEach(val => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });

      const actionTd = document.createElement("td");
      const divWrapper = document.createElement("div");
      divWrapper.className = "buttons are-small";

      const editBtn = document.createElement("button");
      editBtn.className = "button is-warning is-outlined is-small";
      editBtn.textContent = "Edit";
      editBtn.onclick = () => {
        editStat(row[0]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };

      const delBtn = document.createElement("button");
      delBtn.className = "button is-danger is-outlined is-small";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => deleteStat(row[0]);

      divWrapper.appendChild(editBtn);
      divWrapper.appendChild(delBtn);
      actionTd.appendChild(divWrapper);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
  }
}

function editStat(id) {
  const stmt = SkillDB.db.prepare("SELECT id, key, name, format, description FROM stats WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) {
    const [sid, key, name, format, description] = stmt.get();

    window.editingStatId = sid;
    document.getElementById("stat-key").value = key;
    document.getElementById("stat-name").value = name;
    document.getElementById("stat-description").value = description || "";
    document.getElementById("stat-format").value = format || "";

    document.querySelector("#stat-form button[type=submit]").textContent = "Save Stat";
    document.getElementById("stat-cancel").style.display = 'inline-block';
  }
  stmt.free();
}

function deleteStat(id) {
  if (!confirm("Delete this stat?")) return;
  SkillDB.db.run("DELETE FROM stats WHERE id = ?", [id]);
  refreshStatsTable();
}

function saveStat() {
  const key = document.getElementById("stat-key").value.trim();
  const name = document.getElementById("stat-name").value.trim();
  const format = document.getElementById("stat-format").value.trim();
  const description = document.getElementById("stat-description").value.trim();

  // Validate required fields
  if (!key || key === '') {
    alert('Error: Stat key cannot be empty');
    return;
  }
  if (!name || name === '') {
    alert('Error: Stat name cannot be empty');
    return;
  }

  if (window.editingStatId) {
    SkillDB.db.run(`
      UPDATE stats
      SET key=?, name=?, format=?, description=?
      WHERE id=?
    `, [key, name, format, description, window.editingStatId]);

    window.editingStatId = null;
    document.getElementById("stat-cancel").style.display = 'none';
    document.querySelector("#stat-form button[type=submit]").textContent = "Insert Stat";
  } else {
    // Check if stat key already exists
    const checkStmt = SkillDB.db.prepare('SELECT id FROM stats WHERE key = ?');
    checkStmt.bind([key]);
    if (checkStmt.step()) {
      alert('Error: A stat with this key already exists');
      checkStmt.free();
      return;
    }
    checkStmt.free();
    
    SkillDB.db.run(`
      INSERT INTO stats (key, name, format, description)
      VALUES (?, ?, ?, ?)
    `, [key, name, format, description]);
  }

  // Clear form and refresh table
  document.getElementById('stat-form').reset();
  refreshStatsTable();
}

function renderStatPlaceholder(key, values = []) {
  if (values.length > 3){
    console.error("Array of values for stats supports only up to 4 variable stats")
  }
  const stmt = SkillDB.db.prepare("SELECT name, format FROM stats WHERE LOWER(key) = ?");
  stmt.bind([key.toLowerCase()]);
  let output = `[Unknown stat: ${key}]`;

  if (stmt.step()) {
    const [name, format] = stmt.get();
    const v0 = values[0] || '';
    const v1 = values[1] || '';
    const v2 = values[2] || '';
    const v3 = values[3] || '';
    const w0 = `<span class="has-text-primary">${v0}</span>`;
    const w1 = `<span class="has-text-primary">${v1}</span>`;
    const w2 = `<span class="has-text-primary">${v2}</span>`;
    const w3 = `<span class="has-text-primary">${v3}</span>`;
    output = (format || '{name}: {value}')
      .replace('{name}', name)
      .replace('{value0}', w0)
      .replace('{value1}', w1)
      .replace('{value2}', w2)
      .replace('{value3}', w3);
  }
  stmt.free();
  return output;
}

// Cancel handler
document.getElementById('stat-cancel').addEventListener('click', () => {
  window.editingStatId = null;
  document.getElementById('stat-form').reset();
  document.querySelector('#stat-form button[type=submit]').textContent = 'Insert Stat';
  document.getElementById('stat-cancel').style.display = 'none';
});
