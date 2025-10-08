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
                    <button id="filter-toggle" class="button is-small filter-toggle is-info">
                        Show all
                    </button>
                </div>`
            },
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


$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    if (filterState === 'all') return true;
    
    const ao = settings && settings.aoData;
    const rowNode = ao && ao[dataIndex] && ao[dataIndex].nTr;
    if (!rowNode) return true;
    
    const hasPage = $(rowNode).attr("data-has-page") === "true";
    
    if (filterState === 'with_details') {
        return hasPage;
    } else if (filterState === 'without_details') {
        return !hasPage;
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
        if (!skillInfo.description) return '';
        const expanded = expandPlaceholdersWithScaling(SkillDB.db, skillInfo.dbId, level, skillInfo.description);
        const lines = expanded.split('\n');
        
        // Add extra newline after first line if there are multiple lines
        if (lines.length > 1) {
            lines.splice(1, 0, ''); // Insert empty string at index 1 (after first line)
        }
        
        const htmlLines = lines.map(line => `${line}<br>`).join('');
        return `<p class="is-size-5"><strong>Description:</strong></p>${htmlLines}<br>`;
    }

    function createScalingGraphs(skillId) {
        if (!hasScaling) return '';
        
        // Get all scaling data for this skill
        const scalingData = [];
        try {
            const stmt = SkillDB.db.prepare(`
                SELECT ss.level, s.key, s.name, ss.value0, ss.value1, ss.value2, ss.value3
                FROM skill_scaling ss
                JOIN stats s ON ss.stat_id = s.id
                WHERE ss.skill_id = ?
                ORDER BY ss.level, s.name
            `);
            stmt.bind([skillId]);
            
            while (stmt.step()) {
                const [level, key, name, v0, v1, v2, v3] = stmt.get();
                scalingData.push({ level, key, name, values: [v0, v1, v2, v3] });
            }
            stmt.free();
        } catch (error) {
            console.warn('Error fetching scaling data:', error.message);
            return '';
        }

        if (scalingData.length === 0) return '';

        // Check if we have at least 2 different levels
        const uniqueLevels = new Set(scalingData.map(item => item.level));
        if (uniqueLevels.size < 2) return '';

        // Group data by stat
        const statsMap = new Map();
        scalingData.forEach(item => {
            if (!statsMap.has(item.key)) {
                statsMap.set(item.key, {
                    name: item.name,
                    key: item.key,
                    data: []
                });
            }
            statsMap.get(item.key).data.push({
                level: item.level,
                values: item.values
            });
        });

        // Create individual graph containers for each stat
        let graphsHtml = `
            <div class="box mt-4">
                <div class="is-flex is-justify-content-space-between is-align-items-center">
                    <h3 class="title is-5 mb-0">Skill Scaling Graphs</h3>
                    <button class="button is-small" id="toggle-graphs">
                        Show Graphs
                    </button>
                </div>
                <div class="is-hidden mt-4" id="graphs-container">
                    <div class="columns is-multiline">
        `;
        
        let chartIndex = 0;
        statsMap.forEach((stat, key) => {
            // Sort by level
            stat.data.sort((a, b) => a.level - b.level);
            
            // Check if this stat has any non-null values
            const hasValues = stat.data.some(d => d.values.some(v => v !== null && v !== ''));
            if (!hasValues) return;
            
            graphsHtml += `
                <div class="column is-half">
                    <h4 class="title is-6">${stat.name}</h4>
                    <div class="chart-container" style="position: relative; height: 300px;">
                        <canvas id="scaling-chart-${chartIndex}"></canvas>
                    </div>
                </div>
            `;
            chartIndex++;
        });
        
        graphsHtml += `
                    </div>
                </div>
            </div>
        `;
        
        return graphsHtml;
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
    const scalingGraphs = createScalingGraphs(skillInfo.dbId);
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
        <div class="skill-detail">
            ${backButton}
            <div class="columns">
                <div class="column is-two-thirds">
                    <div class="skill-info">
                        ${restrictionHtml}
                        ${maxLevelHtml}
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
            ${scalingGraphs}
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

    // Initialize the scaling charts if they exist
    if (scalingGraphs && hasScaling) {
        initializeScalingCharts(skillInfo.dbId);
        
        // Add toggle functionality for graphs
        const toggleBtn = document.getElementById('toggle-graphs');
        const graphsContainer = document.getElementById('graphs-container');
        
        if (toggleBtn && graphsContainer) {
            toggleBtn.addEventListener('click', () => {
                graphsContainer.classList.toggle('is-hidden');
                const isHidden = graphsContainer.classList.contains('is-hidden');
                
                if (isHidden) {
                    toggleBtn.textContent = 'Show Graphs';
                } else {
                    toggleBtn.textContent = 'Hide Graphs';
                }
            });
        }
    }
}

function initializeScalingCharts(skillId) {
    // Get all scaling data for this skill
    const scalingData = [];
    try {
        const stmt = SkillDB.db.prepare(`
            SELECT ss.level, s.key, s.name, ss.value0, ss.value1, ss.value2, ss.value3
            FROM skill_scaling ss
            JOIN stats s ON ss.stat_id = s.id
            WHERE ss.skill_id = ?
            ORDER BY ss.level, s.name
        `);
        stmt.bind([skillId]);
        
        while (stmt.step()) {
            const [level, key, name, v0, v1, v2, v3] = stmt.get();
            scalingData.push({ level, key, name, values: [v0, v1, v2, v3] });
        }
        stmt.free();
    } catch (error) {
        console.warn('Error fetching scaling data for charts:', error.message);
        return;
    }

    if (scalingData.length === 0) return;

    // Check if we have at least 2 different levels
    const uniqueLevels = new Set(scalingData.map(item => item.level));
    if (uniqueLevels.size < 2) return;

    // Group data by stat
    const statsMap = new Map();
    scalingData.forEach(item => {
        if (!statsMap.has(item.key)) {
            statsMap.set(item.key, {
                name: item.name,
                key: item.key,
                data: []
            });
        }
        statsMap.get(item.key).data.push({
            level: item.level,
            values: item.values
        });
    });

    // Create individual charts for each stat
    let chartIndex = 0;
    const colors = [
        '#3273dc', '#ff3860', '#00d1b2', '#ffdd57', 
        '#ff470f', '#b86bff', '#48c774', '#f14668'
    ];
    
    statsMap.forEach((stat, key) => {
        // Sort by level
        stat.data.sort((a, b) => a.level - b.level);
        
        // Check if this stat has any non-null values
        const hasValues = stat.data.some(d => d.values.some(v => v !== null && v !== ''));
        if (!hasValues) return;
        
        const canvas = document.getElementById(`scaling-chart-${chartIndex}`);
        if (!canvas) return;
        
        // Create datasets for this stat
        const datasets = [];
        const values = stat.data[0].values;
        
        for (let i = 0; i < values.length; i++) {
            if (values[i] !== null && values[i] !== '') {
                const label = values.length > 1 ? `Value ${i}` : 'Value';
                datasets.push({
                    label: label,
                    data: stat.data.map(d => ({ x: d.level, y: d.values[i] })),
                    borderColor: colors[i % colors.length],
                    backgroundColor: colors[i % colors.length] + '20',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            }
        }

        if (datasets.length === 0) return;

        // Create the chart for this stat
        new Chart(canvas, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Skill Level'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Value'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
        chartIndex++;
    });
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