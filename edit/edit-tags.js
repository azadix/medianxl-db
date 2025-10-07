// Tags management functionality
import { SkillDB } from './edit-core.js';

export function initializeTags() {
  refreshTagsTable();
  
  // Add tag button
  document.getElementById("add-tag-btn").addEventListener("click", () => {
    const name = document.getElementById("tag-name").value.trim();
    if (!name) return;
    
    try {
      SkillDB.db.run("INSERT INTO skilltags (name) VALUES (?)", [name]);
      document.getElementById("tag-name").value = "";
      refreshTagsTable();
    } catch (err) {
      if (err.message.includes("UNIQUE constraint failed")) {
        alert("Tag with this name already exists!");
      } else {
        console.error("Error adding tag:", err);
      }
    }
  });

  // Tag cancel button
  document.getElementById('tag-cancel').addEventListener('click', () => {
    window.editingTagId = null;
    document.getElementById('tag-name').value = '';
    document.getElementById('add-tag-btn').textContent = 'Add Tag';
    document.getElementById('tag-cancel').style.display = 'none';
  });
}

function refreshTagsTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector('#tags-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const res = SkillDB.db.exec('SELECT id, name FROM skilltags ORDER BY name');
  if (res[0]) {
    res[0].values.forEach(([id, name]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${id}</td>
        <td>${name}</td>
        <td>
          <div class="buttons are-small">
            <button class="button is-warning" data-edit-tag="${id}">Edit</button>
            <button class="button is-danger" data-del-tag="${id}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Bind edit and delete actions
  tbody.querySelectorAll('[data-edit-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-edit-tag'), 10);
      editTag(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-del-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-del-tag'), 10);
      deleteTag(id);
    });
  });
}

function editTag(id) {
  const stmt = SkillDB.db.prepare('SELECT name FROM skilltags WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const [name] = stmt.get();
    document.getElementById('tag-name').value = name;
    document.getElementById('add-tag-btn').textContent = 'Save Tag';
    document.getElementById('tag-cancel').style.display = 'inline-block';
    window.editingTagId = id;
  }
  stmt.free();
}

function deleteTag(id) {
  if (!confirm('Delete this tag? This will remove it from all skills.')) return;
  SkillDB.db.run('DELETE FROM skilltags WHERE id = ?', [id]);
  refreshTagsTable();
}
