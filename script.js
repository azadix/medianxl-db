// DOM elements
const contentElement = document.getElementById('content');
const pageTitleElement = document.getElementById('page-title');
const breadcrumbHomeElement = document.getElementById('breadcrumb-home');
const breadcrumbCurrentElement = document.getElementById('breadcrumb-current');
const homeLinkElement = document.getElementById('home-link');

// Cache for available skill IDs with localStorage
const SKILL_CACHE_KEY = 'availableSkillsCache';
const CACHE_LIFETIME = 60 * 60 * 1000; // 60 minutes in milliseconds

// Global variable for DataTable instance
let skillsDataTable = null;

// Global skills list
let skillsList = [];

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


// Function to check multiple files in parallel with localStorage caching
async function getAvailableSkillIds() {
    const now = Date.now();
    
    // Try to get cached data from localStorage
    try {
        const cachedData = localStorage.getItem(SKILL_CACHE_KEY);
        if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            
            // Return cached data if still valid
            if (now - timestamp < CACHE_LIFETIME) {
                return new Set(data);
            }
        }
    } catch (error) {
        console.warn('Failed to read cache from localStorage:', error);
    }
    
    // Get all skill IDs that need to be checked
    const skillIdsToCheck = skillsList.map(skill => skill.id).filter(Boolean);
    
    if (skillIdsToCheck.length === 0) {
        return new Set();
    }
    
    // Check all files in parallel with error suppression
    const checks = skillIdsToCheck.map(async (skillId) => {
        try {
            const response = await fetch(`skill_data/${skillId}.json`, { 
                method: 'HEAD',
                // Add cache busting to avoid browser caching HEAD requests
                headers: { 'Cache-Control': 'no-cache' }
            });

            return { skillId, exists: response.ok };
        } catch (error) {
            console.warn(`Unexpected error checking ${skillId}:`, error);
            return { skillId, exists: false };
        }
    });
    
    const results = await Promise.all(checks);
    const existingSkills = new Set();
    
    results.forEach(({ skillId, exists }) => {
        if (exists) existingSkills.add(skillId);
    });
    
    // Update cache in localStorage
    try {
        const cacheData = {
            data: Array.from(existingSkills),
            timestamp: now
        };
        localStorage.setItem(SKILL_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('Failed to save cache to localStorage:', error);
    }
    
    return existingSkills;
}

// Updated initializeDataTable function
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
                <th>Type</td>
            </tr>
        </thead>
        <tbody></tbody>
    `);
    
    // Get available skill IDs (with caching)
    const availableSkills = await getAvailableSkillIds();
    
    // Populate table data
    const tbody = table.find('tbody');
    
    skillsData.forEach(skill => {
        const hasId = skill.id && skill.id.trim() !== '';
        const hasFile = hasId && availableSkills.has(skill.id);
        
        const imagePath = skill.image 
            ? skill.image
            : "-1/icons-shared_missing.png";
        
        const nameCell = hasFile 
            ? `<a href="#" class="view-skill-btn" data-skill-id="${skill.id}">${skill.name}</a>`
            : skill.name;
        
        tbody.append(`
            <tr ${!hasId} data-has-id="${hasId}">
                <td><img src="icons/${imagePath}" alt="${skill.name}" class="image is-48x48"></td>
                <td>${nameCell}</td>
                <td>${skill.category || ''}</td>
                <td>${Classes.getName(skill.class) || ''}</td>
                <td>${ClassTabs.getTabName(skill.class, skill.tab) || ''}</td>
                <td>TODO: Active/Passive</td>
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
            topStart: "",
            bottomStart: "",
            bottomEnd: ""
        }
    }));
        
    return skillsDataTable;
}

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
        contentElement.innerHTML = '<p>Error loading skill data. Please try again later.</p>';
        return null;
    }
}

// Updated displayAllSkills function
async function displayAllSkills() {
    pageTitleElement.textContent = 'All Skills';
    breadcrumbCurrentElement.textContent = 'All Skills';
    
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

// Function to convert newlines to HTML line breaks
function formatTextWithNewlines(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
}

// Function to display a specific skill's details
async function displaySkillDetail(skillId) {
    const skillInfo = getSkillInfo(skillId);
    const skillData = await loadSkillData(skillId);
    
    if (!skillInfo || !skillData) return;
    
    pageTitleElement.textContent = skillInfo.name;
    breadcrumbCurrentElement.textContent = skillInfo.name;
    
    // Create scaling table
    let scalingTable = '';
    if (skillData.scaling && skillData.scaling.length > 0) {
        // Get the stat names from the first scaling entry
        const statNames = Object.keys(skillData.scaling[0]).filter(key => key !== 'level');
        
        scalingTable = `
            <p class="is-size-4">Skill Scaling (only soft points):</p>
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
    
    // Add skill image if available (now from skills.json)
    const skillImage = skillInfo.image 
        ? `<img src="icons/${skillInfo.image}" alt="${skillInfo.name}" class="skill-image">` 
        : '';

    // Only show restriction if it exists
    const restrictionHtml = skillData.restriction 
        ? `<p><strong>Restriction:</strong></p><p><span class="has-text-danger">${formatTextWithNewlines(skillData.restriction)}</span></p>`
        : '';
    
    contentElement.innerHTML = `
        <div class="skill-detail">
            <div class="skill-info">
                ${skillImage}
                <p><strong>Category:</strong></p>
                <p>${skillInfo.category}</p>

                ${restrictionHtml}
                
                <p><strong>Description:</strong></p>
                <p>${formatTextWithNewlines(skillData.description)}</p>
            </div><br />
            ${scalingTable}
        </div>
    `;
}

// Helper function to format stat names for display
function formatStatName(stat) {
    return stat.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Event listeners
breadcrumbHomeElement.addEventListener('click', function(e) {
    e.preventDefault();
    displayAllSkills();
});

function attachViewSkillListeners() {
    $(document).on('click', '.view-skill-btn', function(e) {
        e.preventDefault();
        const skillId = $(this).data('skill-id');
        displaySkillDetail(skillId);
    });
}

// Call this once during initialization (add to the end of your script)
attachViewSkillListeners();

// Initialize the page
displayAllSkills();