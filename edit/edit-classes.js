// Classes and tabs management functionality
import { SkillDB } from './edit-core.js';

export function initializeClasses() {
  refreshClassesTable();
  refreshTabsClassSelect();
  refreshTabsTable();
  
  // Classes form
  document.getElementById('class-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveClass();
  });

  // Class tabs form
  document.getElementById('tab-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveTab();
  });
}

function refreshClassesTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector('#classes-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  const res = SkillDB.db.exec('SELECT id, name, image_prefix FROM classes ORDER BY id');
  if (res[0]) {
    res[0].values.forEach(([id, name, image_prefix]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${id}</td>
        <td>${name}</td>
        <td>${image_prefix}</td>
        <td>
          <div class="buttons are-small">
            <button class="button is-warning" data-edit-class="${id}">Edit</button>
            <button class="button is-danger" data-del-class="${id}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Bind actions
  tbody.querySelectorAll('[data-edit-class]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-edit-class'), 10);
      editClass(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('[data-del-class]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-del-class'), 10);
      deleteClass(id);
    });
  });
}

function editClass(id) {
  const stmt = SkillDB.db.prepare('SELECT name, image_prefix FROM classes WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const [name, image_prefix] = stmt.get();
    document.getElementById('class-name').value = name;
    document.getElementById('class-image').value = image_prefix || '';
    document.getElementById('class-save').textContent = 'Save Class';
    document.getElementById('class-cancel').style.display = 'inline-block';
    window.editingClassId = id;
  }
  stmt.free();
}

function deleteClass(id) {
  if (!confirm('Delete this class? This will also delete all associated tabs and skills.')) return;
  SkillDB.db.run('DELETE FROM classes WHERE id = ?', [id]);
  refreshClassesTable();
  refreshTabsClassSelect();
}

function saveClass() {
  const name = document.getElementById('class-name').value.trim();
  const img = document.getElementById('class-image').value.trim();
  
  if (window.editingClassId) {
    SkillDB.db.run('UPDATE classes SET name=?, image_prefix=? WHERE id=?', [name, img, window.editingClassId]);
    window.editingClassId = null;
    document.getElementById('class-save').textContent = 'Insert Class';
    document.getElementById('class-cancel').style.display = 'none';
  } else {
    SkillDB.db.run('INSERT INTO classes (name, image_prefix) VALUES (?, ?)', [name, img]);
  }
  document.getElementById('class-form').reset();
  refreshClassesTable();
  refreshTabsClassSelect();
}

function refreshTabsClassSelect() {
  if (!SkillDB.db) return;
  const select = document.getElementById('tab-class');
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
  }
}

function refreshTabsTable() {
  if (!SkillDB.db) return;
  const tbody = document.querySelector('#tabs-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const res = SkillDB.db.exec(`
    SELECT ct.id, c.name as class_name, ct.tab_index, ct.name
    FROM classTabs ct
    JOIN classes c ON c.id = ct.class_id
    ORDER BY c.id, ct.tab_index`);
  if (res[0]) {
    res[0].values.forEach(([id, class_name, tab_index, name]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${id}</td>
        <td>${class_name}</td>
        <td>${tab_index}</td>
        <td>${name}</td>
        <td>
          <div class="buttons are-small">
            <button class="button is-warning" data-edit-tab="${id}">Edit</button>
            <button class="button is-danger" data-del-tab="${id}">Delete</button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // Bind actions
  tbody.querySelectorAll('[data-edit-tab]').forEach(btn => {
    const handleEditTab = () => {
      const id = parseInt(btn.getAttribute('data-edit-tab'), 10);
      const stmt = SkillDB.db.prepare('SELECT id, class_id, tab_index, name FROM classTabs WHERE id = ?');
      stmt.bind([id]);
      if (stmt.step()) {
        const [tid, class_id, tab_index, name] = stmt.get();
        window.editingTabId = tid;
        document.getElementById('tab-class').value = class_id;
        document.getElementById('tab-index').value = tab_index;
        document.getElementById('tab-name').value = name;
        document.getElementById('tab-save').textContent = 'Save Tab';
        document.getElementById('tab-cancel').style.display = 'inline-block';
      }
      stmt.free();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    btn.addEventListener('click', handleEditTab);
    btn._editHandler = handleEditTab;
  });

  tbody.querySelectorAll('[data-del-tab]').forEach(btn => {
    const handleDeleteTab = () => {
      const id = parseInt(btn.getAttribute('data-del-tab'), 10);
      if (!confirm('Delete this tab?')) return;
      SkillDB.db.run('DELETE FROM classTabs WHERE id = ?', [id]);
      refreshTabsTable();
    };
    btn.addEventListener('click', handleDeleteTab);
    btn._deleteHandler = handleDeleteTab;
  });
}

function editTab(id) {
  const stmt = SkillDB.db.prepare('SELECT class_id, tab_index, name FROM classTabs WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const [class_id, tab_index, name] = stmt.get();
    document.getElementById('tab-class').value = class_id;
    document.getElementById('tab-index').value = tab_index;
    document.getElementById('tab-name').value = name;
    document.getElementById('tab-save').textContent = 'Save Tab';
    document.getElementById('tab-cancel').style.display = 'inline-block';
    window.editingTabId = id;
  }
  stmt.free();
}

function deleteTab(id) {
  if (!confirm('Delete this tab?')) return;
  SkillDB.db.run('DELETE FROM classTabs WHERE id = ?', [id]);
  refreshTabsTable();
}

function saveTab() {
  const class_id = parseInt(document.getElementById('tab-class').value);
  const tab_index = parseInt(document.getElementById('tab-index').value);
  const name = document.getElementById('tab-name').value.trim();
  
  if (window.editingTabId) {
    SkillDB.db.run('UPDATE classTabs SET class_id=?, tab_index=?, name=? WHERE id=?', [class_id, tab_index, name, window.editingTabId]);
    window.editingTabId = null;
    document.getElementById('tab-save').textContent = 'Insert Tab';
    document.getElementById('tab-cancel').style.display = 'none';
  } else {
    SkillDB.db.run('INSERT INTO classTabs (class_id, tab_index, name) VALUES (?, ?, ?)', [class_id, tab_index, name]);
  }
  document.getElementById('tab-form').reset();
  refreshTabsTable();
}

// Cancel handlers
document.getElementById('class-cancel').addEventListener('click', () => {
  window.editingClassId = null;
  document.getElementById('class-form').reset();
  document.getElementById('class-save').textContent = 'Insert Class';
  document.getElementById('class-cancel').style.display = 'none';
});

document.getElementById('tab-cancel').addEventListener('click', () => {
  window.editingTabId = null;
  document.getElementById('tab-form').reset();
  document.getElementById('tab-save').textContent = 'Insert Tab';
  document.getElementById('tab-cancel').style.display = 'none';
});
