import { getUrlParams, updateUrl, sanitizeSkillId, getSkillIconHTML, MISSING_IMAGE_NAME, expandPlaceholdersWithScaling } from './utils.js';

// DOM elements
const contentElement = document.getElementById('content');
const pageTitleElement = document.getElementById('page-title');

// Global variable for DataTable instance
let skillsDataTable = null;
let filterState = 'all'; // 'all', 'with_details', 'without_details'

// Global skills list
let skillsList = [];

// Initialize filter state from URL
function initializeFilterState() {
    const urlParams = new URLSearchParams(window.location.search);
    const savedFilter = urlParams.get('filter');
    
    if (savedFilter && ['all', 'with_details', 'without_details'].includes(savedFilter)) {
        filterState = savedFilter;
    }
}

// Update URL with current filter state
function updateFilterState(newFilterState) {
    filterState = newFilterState;
    const url = new URL(window.location);
    url.searchParams.set('filter', filterState);
    window.history.replaceState({}, '', url);
}

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
    
    // Get classes from database for filter dropdown
    let classOptions = '<option value="">All Classes</option>';
    try {
        const stmt = SkillDB.db.prepare('SELECT DISTINCT name FROM classes ORDER BY name');
        while (stmt.step()) {
            const className = stmt.get()[0];
            classOptions += `<option value="${className}">${className}</option>`;
        }
        stmt.free();
    } catch (error) {
        console.warn('Could not load classes from database:', error);
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
        let skillLink = '';
        if (skill.hasDetails) {
            // Get current URL parameters to preserve state
            const urlParams = new URLSearchParams(window.location.search);
            const currentFilter = urlParams.get('filter');
            
            // Build skill link with preserved filter state
            let skillUrl = `./?skill=${skill.id}`;
            if (currentFilter) skillUrl += `&filter=${currentFilter}`;
            
            skillLink = `<a href="${skillUrl}" class="view-skill-btn" data-skill-id="${skill.id}">${skill.name}</a>`;
        }
        const nameCell = skillLink || skill.name;

        // Render tags as Bulma tag elements
        const tagsHtml = (skill.tags && skill.tags.length > 0) 
            ? `<div class="tags">${skill.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
            : '';
        
        tbody.append(`
            <tr data-skill-id="${skill.id}" data-has-page="${skill.hasDetails}">
                <td>${getSkillIconHTML(skill.image, skill.class, "is-48x48")}</td>
                <td>${nameCell}</td>
                <td>${tagsHtml}</td>
                <td>${skill.class}</td>
                <td>${skill.tabName}</td>
            </tr>
        `);
    });
    
    // Initialize DataTable with basic configuration
    skillsDataTable = new DataTable('#skills-table',({
        paging: false,
        responsive: true,
        autoWidth: false,
        compact: true,
        order: [[1, 'asc']],
        columnDefs: [
            {
                targets: 0, orderable: false
            },
            {
                targets: [2, 4],
                className: 'none',
                responsivePriority: 2
            }
        ],
        layout: {
            topStart: () => {
                return `
                <div class="field is-grouped is-grouped-multiline">
                    <div class="control">
                        <div class="select">
                            <select id="class-filter">
                                ${classOptions}
                            </select>
                        </div>
                    </div>
                    <div class="control">
                        <button id="filter-toggle" class="button is-outlined filter-toggle is-info">
                            Show all
                        </button>
                    </div>
                </div>
                `
            },
            topEnd: 'search',
            bottomStart: "",
            bottomEnd: ""
        }
    }));
        
    // Restore filter button state after DataTable is initialized
    setTimeout(() => {
        restoreFilterButtonState();
    }, 100);
    
    return skillsDataTable;
}

// Restore filter button state based on current filterState
function restoreFilterButtonState() {
    const filterButton = document.getElementById('filter-toggle');
    if (filterButton) {
        switch(filterState) {
            case 'all':
                filterButton.textContent = 'Show all';
                filterButton.classList.remove('is-primary', 'is-success');
                filterButton.classList.add('is-info');
                break;
            case 'with_details':
                filterButton.textContent = 'Show only with details';
                filterButton.classList.remove('is-info', 'is-success');
                filterButton.classList.add('is-primary');
                break;
            case 'without_details':
                filterButton.textContent = 'Show only without details';
                filterButton.classList.remove('is-primary', 'is-info');
                filterButton.classList.add('is-success');
                break;
        }
    }
}

$(document).on('click', '#filter-toggle', function() {
    // Cycle through the 3 states
    let newFilterState;
    switch(filterState) {
        case 'all':
            newFilterState = 'with_details';
            this.textContent = 'Show only with details';
            this.classList.remove('is-info', 'is-success');
            this.classList.add('is-primary');
            break;
        case 'with_details':
            newFilterState = 'without_details';
            this.textContent = 'Show only without details';
            this.classList.remove('is-primary', 'is-info');
            this.classList.add('is-success');
            break;
        case 'without_details':
            newFilterState = 'all';
            this.textContent = 'Show all';
            this.classList.remove('is-success', 'is-primary');
            this.classList.add('is-info');
            break;
    }
    
    // Update URL state
    updateFilterState(newFilterState);
    
    if (skillsDataTable && typeof skillsDataTable.draw === 'function') {
        skillsDataTable.draw();
    }
});

// Class filter event handler
$(document).on('change', '#class-filter', function() {
    if (skillsDataTable && typeof skillsDataTable.draw === 'function') {
        skillsDataTable.draw();
    }
});


$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    const ao = settings && settings.aoData;
    const rowNode = ao && ao[dataIndex] && ao[dataIndex].nTr;
    if (!rowNode) return true;
    
    // Filter by detail state
    if (filterState !== 'all') {
        const hasPage = $(rowNode).attr("data-has-page") === "true";
        if (filterState === 'with_details' && !hasPage) return false;
        if (filterState === 'without_details' && hasPage) return false;
    }
    
    // Filter by class
    const selectedClass = $('#class-filter').val();
    if (selectedClass) {
        const rowClass = data[3]; // Class column index
        if (rowClass !== selectedClass) return false;
    }
    
    return true;
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
        let html = '';
        
        // Render main description
        if (skillInfo.description) {
            const expanded = expandPlaceholdersWithScaling(SkillDB.db, skillInfo.dbId, level, skillInfo.description);
            html += `<p class="is-size-5"><strong>Description:</strong></p>`;
            html += `<div>${expanded}</div>`;
        }
        
        // Render skill effect
        if (skillInfo.skillEffect) {
            const expandedEffect = expandPlaceholdersWithScaling(SkillDB.db, skillInfo.dbId, level, skillInfo.skillEffect);
            const lines = expandedEffect.split('\n');
            
            html += `<p class="is-size-5 mt-4"><strong>Skill Effect:</strong></p>`;
            lines.forEach(line => {
                if (line.trim()) {
                    html += `<div>${line}</div>`;
                } else {
                    html += '<div>&nbsp;</div>';
                }
            });
        }
        
        return html;
    }
    
    function renderRestrictionAtLevel(level) {
        if (!skillInfo.restriction) return '';
        
        let html = `<p class="is-size-5"><strong>Restriction:</strong></p>`;
        // Expand placeholders in restriction text
        const expandedRestriction = expandPlaceholdersWithScaling(SkillDB.db, skillInfo.dbId, level, skillInfo.restriction);
        html += expandedRestriction.split('\n').map(
            line => `<p><span class="has-text-danger">${line}</span></p>`
        ).join('');
        html += `<br>`;
        
        return html;
    }


    let descriptionHtml = renderDescriptionAtLevel(initialLevel);
    let restrictionHtml = renderRestrictionAtLevel(initialLevel);

    // Add max level information
    let maxLevelHtml = '';
    try {
        const maxLevelStmt = SkillDB.db.prepare(`
            SELECT base_max_level, can_be_enhanced, can_add_points
            FROM skill_max_levels
            WHERE skill_id = ?
        `);
        maxLevelStmt.bind([skillInfo.dbId]);
        
        if (maxLevelStmt.step()) {
            const [baseMaxLevel, affectedBySpecialization, canAddPoints] = maxLevelStmt.get();
            maxLevelHtml = `<p class="is-size-5"><strong>Max Level:</strong></p>`;
            
            if (canAddPoints) {
                maxLevelHtml += `<p>Base: ${baseMaxLevel}`;
                if (affectedBySpecialization) {
                    maxLevelHtml += ` (can be enhanced)`;
                }
                maxLevelHtml += `</p>`;
            } else {
                maxLevelHtml += `<p>Innate skill (no points can be added)</p>`;
            }
            maxLevelHtml += `<br>`;
        }
        maxLevelStmt.free();
    } catch (error) {
        console.warn('No max level data available for this skill:', error.message);
    }
    
    let scalingTable = '';
    // Create back button that preserves state
    const urlParams = new URLSearchParams(window.location.search);
    const treeClass = urlParams.get('class');
    const treeTab = urlParams.get('tab');
    const filter = urlParams.get('filter');
    
    let backUrl = './';
    if (treeClass || treeTab) {
        backUrl = `./tree.html?class=${treeClass || ''}&tab=${treeTab || ''}`;
    } else if (filter) {
        backUrl = `./?filter=${filter}`;
    }
    
    const backButton = `
        <div class="mb-4">
            <a href="${backUrl}" class="button is-light">
                <span class="icon">
                    <i class="fas fa-arrow-left"></i>
                </span>
                <span>Back to ${treeClass || treeTab ? 'Tree' : 'Skills'}</span>
            </a>
        </div>
    `;
    
    contentElement.innerHTML = `
        <div class="skill-detail" style="position: relative;">
            ${backButton}
            <div class="columns is-mobile is-multiline">
                <div class="column is-full-mobile is-two-thirds-tablet order-2-mobile">
                    <div class="skill-info">
                        <div class="skill-restriction">${restrictionHtml}</div>
                        ${maxLevelHtml}
                        <div class="skill-description">${descriptionHtml}</div>
                        ${levelControl}
                    </div>
                </div>
                <div class="column is-full-mobile is-one-third-tablet order-1-mobile">
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
            
            // Update description
            const newDescHtml = renderDescriptionAtLevel(level);
            const descriptionContainer = document.querySelector('.skill-description');
            if (descriptionContainer) {
                descriptionContainer.innerHTML = newDescHtml;
            }
            
            // Update restriction (if it has placeholders)
            const newRestHtml = renderRestrictionAtLevel(level);
            const restrictionContainer = document.querySelector('.skill-restriction');
            if (restrictionContainer) {
                restrictionContainer.innerHTML = newRestHtml;
            }
        }
        levelSelect.addEventListener('change', handleLevelChange);
    }

}

// Handle browser back/forward navigation
window.addEventListener('popstate', async function(event) {
    // Re-initialize filter state from URL
    initializeFilterState();
    
    const params = getUrlParams();
    if (params.skill) {
        await displaySkillDetail(params.skill);
    } else {
        await loadSkillsFromSQLite();
    }
});

// Initialize the page based on URL parameters
async function initializePage() {
    // Initialize filter state from URL
    initializeFilterState();
    
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
        // Get version-aware database file
        const { getDatabaseFile } = await import('./version-config.js');
        const dbFile = getDatabaseFile();
        
        // Fetch SQLite file
        const response = await fetch(dbFile);
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
                hasDetails: (row.description && row.description.trim().length > 0) || (row.skill_effect && row.skill_effect.trim().length > 0),
                restriction: row.restriction || null,
                description: row.description || null,
                skillEffect: row.skill_effect || null
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