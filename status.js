import { loadDatabase, showDatabaseError } from './utils.js';

let db = null;

async function loadStatusPage() {
    const contentElement = document.getElementById('content');
    
    try {
        db = await loadDatabase();
        
        // Get overall progress
        const overallStats = db.exec(`
            SELECT 
                COUNT(*) AS total_skills,
                SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END) AS completed_skills,
                ROUND(100.0 * SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END) / COUNT(*), 1) AS percent_completed
            FROM skills;
        `);

        const [totalSkills, completedSkills, percentCompleted] = overallStats.length > 0 ? overallStats[0].values[0] : [0, 0, 0];

        // Get progress by class with both description and scaling stats
        const classStats = db.exec(`
            SELECT 
                s.class_id,
                c.name as class_name,
                COUNT(*) AS total_skills,
                SUM(CASE WHEN s.description IS NOT NULL AND s.description != '' THEN 1 ELSE 0 END) AS skills_with_description,
                SUM(CASE WHEN (
                    EXISTS(SELECT 1 FROM skill_scaling ss WHERE ss.skill_id = s.id AND (
                        (ss.value0 IS NOT NULL AND ss.value0 != '' AND ss.value0 GLOB '*[^0-9.]*') OR
                        (ss.value1 IS NOT NULL AND ss.value1 != '' AND ss.value1 GLOB '*[^0-9.]*') OR
                        (ss.value2 IS NOT NULL AND ss.value2 != '' AND ss.value2 GLOB '*[^0-9.]*') OR
                        (ss.value3 IS NOT NULL AND ss.value3 != '' AND ss.value3 GLOB '*[^0-9.]*')
                    )) OR
                    EXISTS(SELECT 1 FROM skill_scaling_constants ssc WHERE ssc.skill_id = s.id AND (
                        (ssc.value0 IS NOT NULL AND ssc.value0 != '' AND ssc.value0 GLOB '*[^0-9.]*') OR
                        (ssc.value1 IS NOT NULL AND ssc.value1 != '' AND ssc.value1 GLOB '*[^0-9.]*') OR
                        (ssc.value2 IS NOT NULL AND ssc.value2 != '' AND ssc.value2 GLOB '*[^0-9.]*') OR
                        (ssc.value3 IS NOT NULL AND ssc.value3 != '' AND ssc.value3 GLOB '*[^0-9.]*')
                    ))
                ) THEN 1 ELSE 0 END) AS skills_with_scaling,
                ROUND(100.0 * SUM(CASE WHEN s.description IS NOT NULL AND s.description != '' THEN 1 ELSE 0 END) / COUNT(*), 1) AS percent_with_description,
                ROUND(100.0 * SUM(CASE WHEN (
                    EXISTS(SELECT 1 FROM skill_scaling ss WHERE ss.skill_id = s.id AND (
                        (ss.value0 IS NOT NULL AND ss.value0 != '' AND ss.value0 GLOB '*[^0-9.]*') OR
                        (ss.value1 IS NOT NULL AND ss.value1 != '' AND ss.value1 GLOB '*[^0-9.]*') OR
                        (ss.value2 IS NOT NULL AND ss.value2 != '' AND ss.value2 GLOB '*[^0-9.]*') OR
                        (ss.value3 IS NOT NULL AND ss.value3 != '' AND ss.value3 GLOB '*[^0-9.]*')
                    )) OR
                    EXISTS(SELECT 1 FROM skill_scaling_constants ssc WHERE ssc.skill_id = s.id AND (
                        (ssc.value0 IS NOT NULL AND ssc.value0 != '' AND ssc.value0 GLOB '*[^0-9.]*') OR
                        (ssc.value1 IS NOT NULL AND ssc.value1 != '' AND ssc.value1 GLOB '*[^0-9.]*') OR
                        (ssc.value2 IS NOT NULL AND ssc.value2 != '' AND ssc.value2 GLOB '*[^0-9.]*') OR
                        (ssc.value3 IS NOT NULL AND ssc.value3 != '' AND ssc.value3 GLOB '*[^0-9.]*')
                    ))
                ) THEN 1 ELSE 0 END) / COUNT(*), 1) AS percent_with_scaling
            FROM skills s
            LEFT JOIN classes c ON s.class_id = c.id
            GROUP BY s.class_id, c.name
            ORDER BY c.name;
        `);

        let html = `
            <div class="mb-6">
                <h3 class="title is-4 mb-4">
                    <i class="fas fa-chart-line"></i> Overall Progress
                </h3>
                <div class="level">
                    <div class="level-left">
                        <div class="level-item">
                            <div>
                                <p class="heading">Completed Skills</p>
                                <p class="title is-3">${completedSkills} / ${totalSkills}</p>
                            </div>
                        </div>
                    </div>
                    <div class="level-right">
                        <div class="level-item">
                            <div>
                                <p class="heading">Completion Rate</p>
                                <p class="title is-3">${percentCompleted}%</p>
                            </div>
                        </div>
                    </div>
                </div>
                <progress class="progress is-large is-primary" value="${percentCompleted}" max="100">${percentCompleted}%</progress>
            </div>

            <div>
                <h3 class="title is-4 mb-4">
                    <i class="fas fa-users"></i> Progress by Class
                </h3>
                <div class="columns is-multiline">
        `;

        if (classStats.length > 0) {
            for (const row of classStats[0].values) {
                const [classId, className, total, skillsWithDesc, skillsWithScaling, percentDesc, percentScaling] = row;
                const displayName = className || `Class ${classId}`;

                html += `
                    <div class="column is-half">
                        <div>
                            <div class="media mb-2">
                                <div class="media-content">
                                    <p class="title is-5">${displayName}</p>
                                </div>
                            </div>
                            
                            <div>
                                <div class="level mb-1">
                                    <div class="level-left">
                                        <div class="level-item">
                                            <span class="tag">Description</span>
                                        </div>
                                    </div>
                                    <div class="level-right">
                                        <div class="level-item">
                                            <span class="tag is-light has-text-dark">${skillsWithDesc}/${total}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="level mb-1">
                                    <div class="level-left">
                                        <div class="level-item">
                                            <span class="tag">Scaling</span>
                                        </div>
                                    </div>
                                    <div class="level-right">
                                        <div class="level-item">
                                            <span class="tag is-warning">${skillsWithScaling}/${total}</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="progress-container">
                                    <progress class="progress m-0" value="${percentDesc}" max="100">${percentDesc}%</progress>
                                    <progress class="progress is-warning overlay-progress" value="${percentScaling}" max="100">${percentScaling}%</progress>
                                </div>  
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        html += `
                </div>
            </div>
        `;

        contentElement.innerHTML = html;

    } catch (error) {
        console.error('Error loading status page:', error);
        showDatabaseError(error.message);
    }
}


// Load the status page when the DOM is ready
document.addEventListener('DOMContentLoaded', loadStatusPage);
