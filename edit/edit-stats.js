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

      const usageBtn = document.createElement("button");
      usageBtn.className = "button is-info is-outlined is-small";
      usageBtn.textContent = "Usage";
      usageBtn.onclick = () => showStatUsage(row[0], row[1], row[2]);

      const delBtn = document.createElement("button");
      delBtn.className = "button is-danger is-outlined is-small";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => deleteStat(row[0]);

      divWrapper.appendChild(editBtn);
      divWrapper.appendChild(usageBtn);
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
  
  // Check if this stat is used in constants or scaling
  const constantsCheck = SkillDB.db.prepare('SELECT COUNT(*) FROM skill_scaling_constants WHERE stat_id = ?');
  constantsCheck.bind([id]);
  const constantsCount = constantsCheck.step() ? constantsCheck.get()[0] : 0;
  constantsCheck.free();
  
  const scalingCheck = SkillDB.db.prepare('SELECT COUNT(*) FROM skill_scaling WHERE stat_id = ?');
  scalingCheck.bind([id]);
  const scalingCount = scalingCheck.step() ? scalingCheck.get()[0] : 0;
  scalingCheck.free();
  
  if (constantsCount > 0 || scalingCount > 0) {
    alert(`Cannot delete stat: It is used in ${constantsCount} constants and ${scalingCount} scaling entries. Please remove these references first.`);
    return;
  }
  
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

function showStatUsage(statId, statKey, statName) {
  // Query skills that use this stat
  const skillsUsingStat = [];
  
  // Check skills that use this stat in text fields (skill_effect, restriction, description)
  const textStmt = SkillDB.db.prepare(`
    SELECT DISTINCT s.id, s.name, s.display_name, c.name as class_name, ct.name as tab_name
    FROM skills s
    JOIN classes c ON s.class_id = c.id
    LEFT JOIN classTabs ct ON s.tab_index = ct.id
    WHERE s.skill_effect LIKE '%{{' || ? || '}}%'
       OR s.restriction LIKE '%{{' || ? || '}}%'
       OR s.description LIKE '%{{' || ? || '}}%'
    ORDER BY c.name, s.display_name
  `);
  textStmt.bind([statKey, statKey, statKey]);
  
  while (textStmt.step()) {
    const [skillId, skillName, displayName, className, tabName] = textStmt.get();
    
    // Get tags for this skill
    const tagsStmt = SkillDB.db.prepare(`
      SELECT st.name 
      FROM skill_skilltags sst
      JOIN skilltags st ON sst.tag_id = st.id
      WHERE sst.skill_id = ?
      ORDER BY st.name
    `);
    tagsStmt.bind([skillId]);
    const tags = [];
    while (tagsStmt.step()) {
      tags.push(tagsStmt.get()[0]);
    }
    tagsStmt.free();
    
    skillsUsingStat.push({
      id: skillId,
      name: skillName,
      displayName: displayName,
      class: className,
      tab: tabName || 'Unknown',
      tags: tags
    });
  }
  textStmt.free();
  
  // Create and show modal
  createStatUsageModal(statName, statKey, skillsUsingStat);
}

function createStatUsageModal(statName, statKey, skills) {
  // Remove existing modal if it exists
  const existingModal = document.getElementById('stat-usage-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal HTML
  const modalHTML = `
    <div class="modal is-active" id="stat-usage-modal">
      <div class="modal-background" onclick="closeStatUsageModal()"></div>
      <div class="modal-card" style="width: 80%; max-width: 1000px;">
        <header class="modal-card-head px-4">
          <p class="modal-card-title">Skills using "${statName}"</p>
        </header>
        <section class="modal-card-body p-4">
          ${skills.length === 0 ? 
            '<p class="has-text-grey">No skills currently use this stat.</p>' :
            `
            <div class="table-container">
              <table class="table is-striped is-fullwidth">
                <thead>
                  <tr>
                    <th style="width:25%">Skill</th>
                    <th style="width:15%">Class</th>
                    <th style="width:15%">Tab</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  ${skills.map(skill => `
                    <tr>
                      <td><strong>${skill.displayName}</strong></td>
                      <td>${skill.class}</td>
                      <td>${skill.tab}</td>
                      <td>${skill.tags && skill.tags.length > 0 ? 
                        `<div class="tags">${skill.tags.map(tag => `<span class="tag is-small">${tag}</span>`).join('')}</div>` : 
                        '<span class="has-text-grey">None</span>'
                      }</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            `
          }
        </section>
        <footer class="modal-card-foot p-4">
          <button class="button is-white is-outlined" onclick="closeStatUsageModal()">Close</button>
        </footer>
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Global function to close modal
window.closeStatUsageModal = function() {
  const modal = document.getElementById('stat-usage-modal');
  if (modal) {
    modal.remove();
  }
};

// Cancel handler
document.getElementById('stat-cancel').addEventListener('click', () => {
  window.editingStatId = null;
  document.getElementById('stat-form').reset();
  document.querySelector('#stat-form button[type=submit]').textContent = 'Insert Stat';
  document.getElementById('stat-cancel').style.display = 'none';
});
