import { getUrlParams, updateUrl, sanitizeSkillId, getSkillIconHTML, MISSING_IMAGE_NAME, expandPlaceholdersWithScaling } from './utils.js';

// DOM elements
const contentElement = document.getElementById('content');
const pageTitleElement = document.getElementById('page-title');

// Global variable for DataTable instance
let skillsDataTable = null;
let showDetailedOnly = false;

// Global skills list
let skillsList = [];

const SkillDB = {
    db: null,
    SQL: null
}

// Updated initializeDataTable function - no file checking
async function initializeDataTable(skillsData) {
    // Destroy existing DataTable if it exists
    if (skillsDataTable) {
        skillsDataTable.destroy();
        skillsDataTable = null;
    }
    
    const table = $('#skills-table');
    
    // Add table structure
    table.html(`
        <thead>
            <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Tags</th>
                <th>Class</th>
                <th>Tab</th>
            </tr>
        </thead>
        <tbody></tbody>
    `);
    
    // Populate table data - create links for all skills
    const tbody = table.find('tbody');
    
    skillsData.forEach(skill => {
        const nameCell = skill.hasDetails 
            ? `<a href="./?skill=${skill.id}" class="view-skill-btn" data-skill-id="${skill.id}">${skill.name}</a>`
            : skill.name;

        tbody.append(`
            <tr data-skill-id="${skill.id}" data-has-page="${skill.hasDetails}">
                <td>${getSkillIconHTML(skill.image, skill.class, "is-48x48")}</td>
                <td>${nameCell}</td>
                <td>${(skill.tags && skill.tags.length > 0) ? skill.tags.join(", ") : ''}</td>
                <td>${skill.class}</td>
                <td>${skill.tabName}</td>
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
                    <label id="label-toggle-filter" for="toggle-filter">Show skills with details</label>
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
    if (skillsDataTable && typeof skillsDataTable.draw === 'function') skillsDataTable.draw();
});


$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    if (!showDetailedOnly) return true;
    const ao = settings && settings.aoData;
    const rowNode = ao && ao[dataIndex] && ao[dataIndex].nTr;
    if (!rowNode) return true;
    return $(rowNode).attr("data-has-page") === "true";
});

// Function to display a specific skill's details
async function displaySkillDetail(skillId) {
    const safeSkillId = sanitizeSkillId(skillId);
    const skillInfo = getSkillData(safeSkillId);
    
    if (!skillInfo)  {
        contentElement.innerHTML = `<p>There was an error while loading skill data (of there isn't any data to load)</p>`;
        return;
    }

    pageTitleElement.textContent = skillInfo.name;
    // Add skill image if available
    const skillImage = skillInfo.image 
        ? `${getSkillIconHTML(skillInfo.image, skillInfo.class, "skill-image")}` 
        : '';
    
    // Description with scaling expansion
    // Discover available levels for this skill
    let availableLevels = [];
    try {
        const lvlStmt = SkillDB.db.prepare(`SELECT DISTINCT level FROM skill_scaling WHERE skill_id = ? ORDER BY level`);
        lvlStmt.bind([skillInfo.dbId]);
        while (lvlStmt.step()) {
            availableLevels.push(lvlStmt.get()[0]);
        }
        lvlStmt.free();
    } catch (error) {
      console.warn('No scaling data available for this skill:', error.message);
    }

    // Build level control only if there is scaling
    const hasScaling = availableLevels.length > 0;
    const initialLevel = hasScaling ? availableLevels[0] : 1;
    const levelControl = hasScaling ? `
        <div class="field is-grouped is-align-items-center mt-4">
            <div class="control">
                <label class="label">Skill Level:</label>
            </div>
            <div class="control">
                <div class="select">
                    <select id="skill-level">
                        ${availableLevels.map(l => `<option value="${l}">${l}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>
    ` : '';

    function renderDescriptionAtLevel(level) {
        if (!skillInfo.description) return '';
        const expanded = expandPlaceholdersWithScaling(SkillDB.db, skillInfo.dbId, level, skillInfo.description);
        const lines = expanded.split('\n').map(line => `<p>${line}</p>`).join('');
        return `<p class="is-size-5"><strong>Description:</strong></p>${lines}<br>`;
    }

    let descriptionHtml = renderDescriptionAtLevel(initialLevel);

    // Only show restriction if it exists
    let restrictionHtml = '';
    if (skillInfo.restriction) {
        restrictionHtml = `<p class="is-size-5"><strong>Restriction:</strong></p>`;
        restrictionHtml += skillInfo.restriction.split('\n').map(
            line => `<p><span class="has-text-danger">${line}</span></p>`
        ).join('');
        restrictionHtml += `<br>`;
    }
    
    let scalingTable = '';
    contentElement.innerHTML = `
        <div class="skill-detail">
            <div class="columns">
                <div class="column is-two-thirds">
                    <div class="skill-info">
                        ${restrictionHtml}
                        <div class="skill-description">${descriptionHtml}</div>
                        ${levelControl}
                    </div>
                </div>
                <div class="column is-one-third">
                    <div class="skill-image-container">
                        ${skillImage}
                    </div>
                </div>
            </div>
            ${scalingTable}
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

    const levelSelect = document.getElementById('skill-level');
    if (levelSelect) {
        function handleLevelChange(event) {
            // Get the level from the current select element
            const currentSelect = event ? event.target : document.getElementById('skill-level');
            const level = parseInt(currentSelect.value, 10) || initialLevel;
            const newHtml = renderDescriptionAtLevel(level);
            
            // Update only the description part
            const descriptionContainer = document.querySelector('.skill-description');
            if (descriptionContainer) {
                descriptionContainer.innerHTML = newHtml;
            }
        }
        levelSelect.addEventListener('change', handleLevelChange);
    }
}

// Handle browser back/forward navigation
window.addEventListener('popstate', async function(event) {
    const params = getUrlParams();
    if (params.skill) {
        await displaySkillDetail(params.skill);
    } else {
        await loadSkillsFromSQLite();
    }
});

// Initialize the page based on URL parameters
async function initializePage() {
    // Load skills list first
    await loadSkillsFromSQLite();
    
    // Check URL for skill parameter
    const params = getUrlParams();
    if (params.skill) {
        // Check if the skill exists
        const skillInfo = getSkillData(params.skill);
        if (skillInfo) {
            await displaySkillDetail(params.skill);
        } else {
            // Fall back to all skills if skill not found
            await loadSkillsFromSQLite();
        }
    }
    
    $(document).on('click', '.view-skill-btn', async function(e) {
        e.preventDefault();
        const skillId = $(this).data('skill-id');
        await displaySkillDetail(skillId);
    });
}

// Function to display all skills
function displayAllSkills() {
    pageTitleElement.textContent = 'All Skills';

    if (skillsList.length === 0) {
        contentElement.innerHTML = '<p>No skills found.</p>';
        return;
    }

    const skillCount = SkillDB.db.exec(`
        SELECT 
            SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END) AS skills_with_details,
            COUNT(*) AS total_skills,
            ROUND(100.0 * SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END) / COUNT(*), 2) AS percent_with_details
        FROM skills;
    `);

    let [skillsWithDetails, totalSkills, percentWithDetails] =
        skillCount.length > 0 ? skillCount[0].values[0] : [0, 0, 0];
    
    let html = `
        <label for="progress-bar">
            Finished skills: ${skillsWithDetails} / ${totalSkills}
        </label>
        <progress id="progress-bar" class="progress is-normal" value=${percentWithDetails} max="100"></progress>

        <div class="skills-table-container">
            <table id="skills-table" class="table is-hoverable is-fullwidth"></table>
        </div>
    `;

    contentElement.innerHTML = html;

    // Initialize DataTable with the loaded skills
    initializeDataTable(skillsList);
}

async function loadSkillsFromSQLite() {
    try {
        // Fetch SQLite file
        const response = await fetch('skills.sqlite');
        if (!response.ok) throw new Error('Failed to load SQLite file');

        const buffer = await response.arrayBuffer();

        // Initialize SQL.js
        SkillDB.SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}` });
        SkillDB.db = new SkillDB.SQL.Database(new Uint8Array(buffer));

        // Query skills with correct tab join
        const stmt = SkillDB.db.prepare(`
            SELECT s.*,
                ct.name AS tab_name,
                c.name AS class_name,
                c.image_prefix,
                GROUP_CONCAT(t.name, ', ') AS tags
            FROM skills s
            LEFT JOIN classTabs ct
                ON s.tab_index = ct.id
            LEFT JOIN classes c
                ON s.class_id = c.id
            LEFT JOIN skill_skilltags st
                ON s.id = st.skill_id
            LEFT JOIN skilltags t
                ON st.tag_id = t.id
            GROUP BY s.id
            ORDER BY s.class_id, s.tab_index, s.row, s.col;
        `);

        const loadedSkills = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            loadedSkills.push({
                id: row.name,
                dbId: row.id,
                name: row.display_name,
                class: row.class_name || '',
                tab: row.tab_index,        // numeric
                tabName: row.tab_name || '', // proper tab name
                tags: row.tags ? row.tags.split(', ') : [],
                row: row.row,
                col: row.col,
                image: row.image || MISSING_IMAGE_NAME,
                hasDetails: row.description && row.description.trim().length > 0,
                restriction: row.restriction || null,
                description: row.description || null
            });
        }
        stmt.free();

        skillsList = loadedSkills; // update global list

        // Render table if no skill detail page is requested
        displayAllSkills();
    } catch (error) {
        console.error('Error loading skills from SQLite:', error);
        contentElement.innerHTML = `<p>Error loading skills from SQLite: ${error.message}</p>`;
    }
}

function getSkillData(skillId) {
    return skillsList.find(skill => skill.id == skillId);
}

// Call initialize on page load
initializePage();