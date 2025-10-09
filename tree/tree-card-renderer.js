// Skill card rendering utility
// Separates data preparation from HTML rendering

import { getSkillIconHTML } from '../utils.js';

/**
 * Render a skill card with consistent styling
 * @param {Object} cardData - Data for the skill card
 * @param {string} cardData.skillId - Internal skill name for data-skill-id
 * @param {string} cardData.iconHTML - HTML for skill icon
 * @param {string} cardData.displayName - Display name of the skill
 * @param {boolean} cardData.hasDescription - Whether skill has description (for styling)
 * @param {number} cardData.currentPoints - Current allocated points
 * @param {number|string} cardData.maxPoints - Max points (number or '∞')
 * @param {string} cardData.levelColor - CSS class for level display color
 * @param {Object} cardData.buttons - Button configuration
 * @param {boolean} cardData.buttons.show - Whether to show buttons
 * @param {boolean} cardData.buttons.plusDisabled - Whether plus button is disabled
 * @param {boolean} cardData.buttons.minusDisabled - Whether minus button is disabled
 * @param {string} cardData.buttons.plusTooltip - Tooltip for plus button
 * @param {string} cardData.buttons.dataSkill - data-skill attribute value
 * @returns {HTMLElement} The skill card element
 */
export function renderSkillCard(cardData) {
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.dataset.skillId = cardData.skillId;
    
    // Build card HTML
    let html = '';
    
    // Section 1: Top row (left spacer | icon | buttons container)
    html += '<div class="skill-card-header">';
    html += '<div class="skill-card-spacer"></div>'; // Left spacer for centering
    html += `<div class="skill-card-icon">${cardData.iconHTML}</div>`;
    html += '<div class="skill-buttons-container"></div>';
    html += '</div>';
    
    // Section 2: Skill name
    html += '<div class="skill-card-name">';
    // Style name as link if skill has description, but don't make it clickable
    const nameClass = cardData.hasDescription ? 'has-text-info' : '';
    html += `<span class="${nameClass}">${cardData.displayName}</span>`;
    html += '</div>';
    
    // Section 3: Level display
    html += '<div class="skill-card-level">';
    html += `<div class="${cardData.levelColor} is-size-6">${cardData.currentPoints} / ${cardData.maxPoints}</div>`;
    html += '</div>';
    
    card.innerHTML = html;
    
    // Add buttons if configured
    if (cardData.buttons.show) {
        const buttonsContainer = card.querySelector('.skill-buttons-container');
        if (buttonsContainer) {
            const plusClass = cardData.buttons.plusDisabled ? 'is-ghost' : 'is-success';
            const minusClass = cardData.buttons.minusDisabled ? 'is-ghost' : 'is-danger';
            const plusDisabledAttr = cardData.buttons.plusDisabled ? 'disabled' : '';
            const minusDisabledAttr = cardData.buttons.minusDisabled ? 'disabled' : '';
            const plusTooltip = cardData.buttons.plusTooltip || '';
            
            buttonsContainer.innerHTML = `
                <div class="skill-buttons">
                    <button class="button is-outlined is-small ${plusClass} skill-plus-btn" 
                            data-skill="${cardData.buttons.dataSkill}" 
                            ${plusDisabledAttr} 
                            title="${plusTooltip}">+</button>
                    <button class="button is-outlined is-small ${minusClass} skill-minus-btn" 
                            data-skill="${cardData.buttons.dataSkill}" 
                            ${minusDisabledAttr}>−</button>
                </div>
            `;
        }
    }
    
    return card;
}

/**
 * Get icon HTML for a skill
 * @param {string} image - Image filename
 * @param {string} className - Class name for the skill
 * @returns {string} HTML for the skill icon
 */
export function getSkillIcon(image, className) {
    return getSkillIconHTML(image, className);
}

