// Version management interface
import { SkillDB } from './edit-core.js';
import { getAllVersions, getCurrentVersionId, setActiveVersion, createVersion, deleteVersion, versionToString } from '../version-config.js';
import { ToastManager } from '../tree/ToastManager.js';

let toastManager;

export function initializeVersions() {
  toastManager = window.toastManager || new ToastManager();
  
  const form = document.getElementById('version-form');
  const cancelBtn = document.getElementById('version-cancel');
  
  form?.addEventListener('submit', handleSubmit);
  cancelBtn?.addEventListener('click', handleCancel);
  
  loadVersions();
}

function handleSubmit(e) {
  e.preventDefault();
  
  const major = parseInt(document.getElementById('version-major').value, 10);
  const minor = parseInt(document.getElementById('version-minor').value, 10);
  
  if (isNaN(major) || isNaN(minor) || major < 0 || minor < 0) {
    toastManager.showToast('Please enter valid version numbers', true, 'error');
    return;
  }
  
  try {
    createVersion(SkillDB.db, major, minor);
    toastManager.showToast(`Version ${versionToString({ major, minor })} created successfully`, true, 'success');
    loadVersions();
    document.getElementById('version-form').reset();
  } catch (error) {
    toastManager.showToast(error.message, true, 'error');
  }
}

function handleCancel() {
  document.getElementById('version-form').reset();
  document.getElementById('version-cancel').style.display = 'none';
}

function loadVersions() {
  const tbody = document.querySelector('#versions-table tbody');
  if (!tbody) return;
  
  const versions = getAllVersions(SkillDB.db);
  const currentVersionId = getCurrentVersionId(SkillDB.db);
  
  tbody.innerHTML = '';
  
  versions.forEach(version => {
    const tr = document.createElement('tr');
    
    // ID
    const idTd = document.createElement('td');
    idTd.textContent = version.id;
    tr.appendChild(idTd);
    
    // Version number
    const versionTd = document.createElement('td');
    versionTd.textContent = `${version.major}.${version.minor}`;
    tr.appendChild(versionTd);
    
    // Name
    const nameTd = document.createElement('td');
    nameTd.textContent = version.name;
    tr.appendChild(nameTd);
    
    // Active status
    const activeTd = document.createElement('td');
    if (version.is_active) {
      activeTd.innerHTML = '<span class="tag is-success">Active</span>';
    } else {
      activeTd.innerHTML = '<span class="tag is-danger">Inactive</span>';
    }
    tr.appendChild(activeTd);
    
    // Actions
    const actionsTd = document.createElement('td');
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'buttons';
    
    // Set active button
    if (!version.is_active) {
      const setActiveBtn = document.createElement('button');
      setActiveBtn.className = 'button is-small is-success is-outlined';
      setActiveBtn.textContent = 'Set Active';
      setActiveBtn.addEventListener('click', () => {
        try {
          setActiveVersion(SkillDB.db, version.id);
          toastManager.showToast(`Version ${version.name} set as active`, true, 'success');
          loadVersions();
        } catch (error) {
          toastManager.showToast(error.message, true, 'error');
        }
      });
      buttonGroup.appendChild(setActiveBtn);
    }
    
    // Delete button
    if (!version.is_active) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'button is-small is-danger is-outlined';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete version ${version.name}? This will also delete all skills, scaling, prerequisites, and max levels associated with this version.`)) {
          try {
            deleteVersion(SkillDB.db, version.id);
            toastManager.showToast(`Version ${version.name} deleted`, true, 'success');
            loadVersions();
          } catch (error) {
            toastManager.showToast(error.message, true, 'error');
          }
        }
      });
      buttonGroup.appendChild(deleteBtn);
    }
    
    actionsTd.appendChild(buttonGroup);
    tr.appendChild(actionsTd);
    
    tbody.appendChild(tr);
  });
  
  if (versions.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'has-text-centered has-text-grey';
    td.textContent = 'No versions found';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

