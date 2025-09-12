// DOM elements
const contentElement = document.getElementById('content');
const pageTitleElement = document.getElementById('page-title');

// Global variable for DataTable instance
let skillsDataTable = null;

// Global skills list
let skillsList = [];

// Function to get URL parameters
function getUrlParams() {
    const params = {};
    const queryString = window.location.search.substring(1);
    const regex = /([^&=]+)=([^&]*)/g;
    let m;
    
    while (m = regex.exec(queryString)) {
        params[decodeURIComponent(m[1])] = decodeURIComponent(m[2]);
    }
    
    return params;
}

// Function to update URL without reloading the page
function updateUrl(skillId = null) {
    const baseUrl = window.location.origin + window.location.pathname;
    let newUrl = baseUrl;
    
    if (skillId) {
        newUrl += `?skill=${encodeURIComponent(skillId)}`;
    }
    
    window.history.pushState({ skillId }, '', newUrl);
}

// Function to load skills list from JSON file
async function loadSkillsList() {
    try {
        const response = await fetch('skills.json');
        if (!response.ok) {
            throw new Error('Failed to load skills list');
        }
        const data = await response.json();
        skillsList = data.skills;
        return skillsList;
    } catch (error) {
        console.error('Error loading skills list:', error);
        contentElement.innerHTML = '<p>Error loading skills. Please try again later.</p>';
        return [];
    }
}

// Function to get skill info from the global skills list
function getSkillInfo(skillId) {
    return skillsList.find(skill => skill.id === skillId);
}

function checkSkillDetailPage(skillId) {
    return skillsWithDetails[skillId] || false;
}

// Updated initializeDataTable function - no file checking
async function initializeDataTable(skillsData) {
    // Destroy existing DataTable if it exists
    if (skillsDataTable) {
        skillsDataTable.destroy();
        $('#skills-table').empty();
    }
    
    const table = $('#skills-table');
    
    // Add table structure
    table.html(`
        <thead>
            <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Class</th>
                <th>Tab</th>
            </tr>
        </thead>
        <tbody></tbody>
    `);
    
    // Populate table data - create links for all skills
    const tbody = table.find('tbody');
    
    skillsData.forEach(skill => {
        const hasDetailPage = checkSkillDetailPage(skill);

        const imagePath = skill.image || "-1/icons-shared_missing.png";
        
        const nameCell = hasDetailPage 
            ? `<a href="./?skill=${skill.id}" class="view-skill-btn" data-skill-id="${skill.id}">${skill.name}</a>`
            : skill.name;
        
        tbody.append(`
            <tr data-skill-id="${skill.id}" data-has-page="${hasDetailPage}">
                <td><img src="icons/${imagePath}" alt="${skill.name}" class="image is-48x48"></td>
                <td>${nameCell}</td>
                <td>${(skill.tag && skill.tag.length > 0) ? skill.tag.join(", ") : ''}</td>
                <td>${Classes.getName(skill.class) || ''}</td>
                <td>${skill.tabName ? skill.tabName : ClassTabs.getTabName(skill.class, skill.tab) || ''}</td>
            </tr>
        `);
    });
    
    // Initialize DataTable with basic configuration
    skillsDataTable = new DataTable('#skills-table',({
        paging: false,
        responsive: true,
        autoWidth: true,
        compact: true,
        order: [[1, 'asc']],
        columnDefs: [
            {
                targets: 0, orderable: false
            }
        ],
        layout: {
            topStart: () => {
                return `<div class="field">
                    <input id="toggle-filter" type="checkbox">
                    <label for="toggle-filter">Show skills with details</label>
                </div>`
            },
            bottomStart: "",
            bottomEnd: ""
        }
    }));
        
    return skillsDataTable;
}

$(document).on('change', '#toggle-filter', function() {
    showDetailedOnly = this.checked;
    skillsDataTable.draw();
});

// Function to load a specific skill's data
async function loadSkillData(skillId) {
    try {
        const response = await fetch(`skill_data/${skillId}.json`);
        if (!response.ok) {
            throw new Error('Failed to load skill data');
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading skill data:', error);
        contentElement.innerHTML = `<p>There was an error while loading skill data (of there isn't any data to load)</p>`;
        return null;
    }
}

// Updated displayAllSkills function
async function displayAllSkills() {
    pageTitleElement.textContent = 'All Skills';
    if (skillsList.length === 0) {
        await loadSkillsList();
    }
    
    if (skillsList.length === 0) {
        contentElement.innerHTML = '<p>No skills found.</p>';
        return;
    }

    let html = `
        <div class="skills-table-container">
            <table id="skills-table" class="table is-hoverable is-fullwidth"></table>
        </div>
    `;
    
    contentElement.innerHTML = html;
    
    // Initialize DataTable
    initializeDataTable(skillsList);
}

// Function to display a specific skill's details
async function displaySkillDetail(skillId) {
    const skillInfo = getSkillInfo(skillId);
    const skillData = await loadSkillData(skillId);
    
    if (!skillInfo || !skillData) return;
    
    pageTitleElement.textContent = skillInfo.name;
    
    // Add skill image if available
    const skillImage = skillInfo.image 
        ? `<img src="icons/${skillInfo.image}" alt="${skillInfo.name}" class="skill-image">` 
        : '';

    let skillCategory = skillData.category
        ? `<p class="is-size-5"><strong>Category:</strong></p><p>${skillData.category}</p><br>`
        : '';
    
    let skillDamageType = skillData.damage_type
        ? `<p class="is-size-5"><strong>Damage type:</strong></p><p>${skillData.damage_type}</p><br>`
        : '';
    
    // Convert description to paragraphs if it's an array
    let descriptionHtml = '';
    const isOrangeText = (skillInfo.class == Classes.OTHER && skillInfo.tab == 2)
    if (Array.isArray(skillData.description)) {
        descriptionHtml = `<p class="is-size-5"><strong>Description:</strong></p>`;
        descriptionHtml += skillData.description.map(paragraph => 
            `<p class="${isOrangeText ? 'has-text-warning' : ''}">${paragraph}</p>`
        ).join('');
        descriptionHtml += `<br>`;
    }

    // Only show restriction if it exists
    let restrictionHtml = '';
    if (skillData.restriction) {
        if (Array.isArray(skillData.restriction)) {
            restrictionHtml = `
                <p class="is-size-5"><strong>Restriction:</strong></p>
                ${skillData.restriction.map(item => `<p><span class="has-text-danger">${item}</span></p>`).join('')}
                <br>
            `;
        }
    }

    // Convert description to paragraphs if it's an array
    let synergiesHtml = '';
    if (Array.isArray(skillData.synergies)) {
        synergiesHtml = `<p class="is-size-5"><strong>Synergies:</strong></p>`;
        synergiesHtml += skillData.synergies.map(paragraph => 
            `<p>${paragraph}</p>`
        ).join('');
        synergiesHtml += `<br>`;
    }

    // Create scaling table
    let scalingTable = `
        <p class="is-size-4"><strong>Skill Scaling (only soft points):</strong>
        <button class="button is-primary is-outlined" id="toggle-scaling">
            Show
        </button>
        </p>
        <div id="scaling-container" class="is-hidden">
    `;

    if (skillInfo.class == Classes.OTHER && skillInfo.tab == 2) {
        // Orange text skills - show "Skill doesn't scale" message
        scalingTable += `
            <p class="has-text-danger">Skills coming from Orange text do not scale with skill levels :(</p>
        `;
    } else if (!skillData.scaling || skillData.scaling.length == 0) {
        // Empty scaling array
        scalingTable += `
            <p class="has-text-danger">This skill does not scale with skill levels</p>
        `;
    } else {
        // Regular skills with scaling data
        // Get the stat names from the first scaling entry
        const statNames = Object.keys(skillData.scaling[0]).filter(key => key !== 'level');
        
        scalingTable += `
            <table class="table is-hoverable is-fullwidth">
                <thead>
                    <tr>
                        <th>Level</th>
                        ${statNames.map(stat => `<th>${formatStatName(stat)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${skillData.scaling.map(level => `
                        <tr>
                            <td>${level.level}</td>
                            ${statNames.map(stat => `<td>${level[stat]}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    contentElement.innerHTML = `
        <div class="skill-detail">
            <div class="skill-info">
                ${skillImage}
                ${skillCategory}
                ${skillDamageType}
                ${restrictionHtml}
                ${descriptionHtml}
                ${synergiesHtml}
            </div>
            ${scalingTable}
            <div>
        </div>
    `;
    
    // Update URL with skill parameter
    updateUrl(skillId);

    const toggleBtn = document.getElementById('toggle-scaling');
    const scalingContainer = document.getElementById('scaling-container');
    if (toggleBtn && scalingContainer) {
        toggleBtn.addEventListener('click', () => {
            scalingContainer.classList.toggle('is-hidden');
            toggleBtn.textContent = scalingContainer.classList.contains('is-hidden')
                ? 'Show'
                : 'Hide';
        });
    }
}

// Helper function to format stat names for display
function formatStatName(stat) {
    return stat.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Event listeners
function attachViewSkillListeners() {
    $(document).on('click', '.view-skill-btn', function(e) {
        e.preventDefault();
        const skillId = $(this).data('skill-id');
        displaySkillDetail(skillId);
    });
}

// Handle browser back/forward navigation
window.addEventListener('popstate', function(event) {
    const params = getUrlParams();
    if (params.skill) {
        displaySkillDetail(params.skill);
    } else {
        displayAllSkills();
    }
});

// Initialize the page based on URL parameters
async function initializePage() {
    // Load skills list first
    await loadSkillsList();
    
    // Check URL for skill parameter
    const params = getUrlParams();
    if (params.skill) {
        // Check if the skill exists
        const skillInfo = getSkillInfo(params.skill);
        if (skillInfo) {
            displaySkillDetail(params.skill);
        } else {
            // Fall back to all skills if skill not found
            displayAllSkills();
        }
    } else {
        displayAllSkills();
    }
    
    // Attach event listeners
    attachViewSkillListeners();
}

// Add buttons for JSON/SQLite loading
const buttonContainer = document.createElement('div');
buttonContainer.classList.add('buttons', 'mb-4');

const jsonBtn = document.createElement('button');
jsonBtn.textContent = 'Load from JSON';
jsonBtn.classList.add('button', 'is-link');
buttonContainer.appendChild(jsonBtn);

const sqliteBtn = document.createElement('button');
sqliteBtn.textContent = 'Load from SQLite';
sqliteBtn.classList.add('button', 'is-primary');
buttonContainer.appendChild(sqliteBtn);

contentElement.parentNode.insertBefore(buttonContainer, contentElement);

// Global variables for SQLite
let sqlDb = null;
let SQL = null;

// Load SQLite database
async function loadSQLite(fileUrl) {
    if (!SQL) {
        SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}` });
    }
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Failed to fetch SQLite file');
    const buffer = await response.arrayBuffer();
    sqlDb = new SQL.Database(new Uint8Array(buffer));
    console.log('SQLite database loaded');
}

async function loadSkillsFromSQLite() {
    try {
        // Fetch SQLite file
        const response = await fetch('skills.sqlite');
        if (!response.ok) throw new Error('Failed to load SQLite file');

        const buffer = await response.arrayBuffer();

        // Initialize SQL.js
        const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}` });
        const db = new SQL.Database(new Uint8Array(buffer));

        // Query skills with tab names
        const stmt = db.prepare(`
            SELECT s.*,
                   ct.name AS tab_name
            FROM skills s
            LEFT JOIN classTabs ct
            ON s.tab_index = ct.id
            ORDER BY s.class_id, ct.tab_index, s.row, s.col;
        `);

        const loadedSkills = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            loadedSkills.push({
                id: row.name,
                name: row.display_name,
                class: row.class_id - 2,         // adjust DB class id
                tab: row.tab_index,              // tab id from DB
                tabName: row.tab_name || '',     // proper tab name
                row: row.row,
                col: row.col,
                image: row.image || '-1/icons-shared_missing.png'
            });
        }
        stmt.free();

        skillsList = loadedSkills; // update global list
    } catch (error) {
        console.error('Error loading skills from SQLite:', error);
        contentElement.innerHTML = `<p>Error loading skills from SQLite: ${error.message}</p>`;
    }
}

// Button click handlers
jsonBtn.addEventListener('click', async () => {
    await loadSkillsList();
    displayAllSkills();
});

sqliteBtn.addEventListener('click', async () => {
    await loadSkillsFromSQLite();
    displayAllSkills();
});

// Override getSkillInfo for SQLite mode
function getSkillInfo(skillId) {
    return skillsList.find(skill => skill.id == skillId);
}

function checkSkillDetailPage(skill) {
    // skill can be full object
    return skillsWithDetails[skill.id] || false;
}



// Call initialize on page load
initializePage();