// Template syntax validation utilities

/**
 * Check for template syntax errors in text
 * @param {string} text - The text to validate
 * @returns {Array} - Array of error messages, empty if no errors
 */
export function validateTemplateSyntax(text) {
    const errors = [];
    
    if (!text || text.trim() === '') {
        return errors;
    }
    
    // Check for triple braces
    if (text.includes('{{{') || text.includes('}}}')) {
        errors.push('Triple braces {{{ or }}} found. Use double braces {{}} for placeholders.');
    }
    
    // Check for unclosed double braces
    const doubleOpenCount = (text.match(/\{\{/g) || []).length;
    const doubleCloseCount = (text.match(/\}\}/g) || []).length;
    
    if (doubleOpenCount !== doubleCloseCount) {
        errors.push(`Mismatched {{ }} braces: ${doubleOpenCount} opening vs ${doubleCloseCount} closing.`);
    }
    
    // Find all properly formed {{ }} placeholders
    const placeholderPattern = /\{\{([^}]*)\}\}/g;
    const placeholders = [...text.matchAll(placeholderPattern)];
    
    // Check for {{ without closing }} by removing valid placeholders and checking if {{ remains
    let tempText = text;
    placeholders.forEach(match => {
        tempText = tempText.replace(match[0], '', 1);
    });
    
    if (tempText.includes('{{')) {
        const pos = tempText.indexOf('{{');
        const context = tempText.substring(Math.max(0, pos - 20), Math.min(tempText.length, pos + 50));
        errors.push(`Unclosed {{ found near: ...${context}...`);
    }
    
    // Check for single braces that might be typos
    // Only warn if it looks like it might be a placeholder attempt (contains : or alphanumeric)
    const singleBracePattern = /(?<!\{)\{(?!\{)([^}]*)\}(?!\})/g;
    const singleBraces = [...text.matchAll(singleBracePattern)];
    
    singleBraces.forEach(match => {
        const content = match[1];
        // Only warn if it looks like a placeholder (has : or contains letters)
        if (content.includes(':') || /[a-zA-Z]/.test(content)) {
            errors.push(`Single braces found (might be typo): {${content}}`);
        }
    });
    
    return errors;
}

/**
 * Validate both description and restriction fields
 * @param {string} description - Description field value
 * @param {string} restriction - Restriction field value
 * @returns {Object} - {valid: boolean, errors: {description: [], restriction: []}}
 */
export function validateSkillTemplates(description, restriction) {
    const result = {
        valid: true,
        errors: {
            description: [],
            restriction: []
        }
    };
    
    const descErrors = validateTemplateSyntax(description);
    const restrErrors = validateTemplateSyntax(restriction);
    
    if (descErrors.length > 0) {
        result.valid = false;
        result.errors.description = descErrors;
    }
    
    if (restrErrors.length > 0) {
        result.valid = false;
        result.errors.restriction = restrErrors;
    }
    
    return result;
}

/**
 * Display validation errors to the user
 * @param {Object} validationResult - Result from validateSkillTemplates
 */
export function displayValidationErrors(validationResult) {
    // Remove any existing error messages
    removeValidationErrors();
    
    if (validationResult.valid) {
        return;
    }
    
    // Display description errors
    if (validationResult.errors.description.length > 0) {
        const descField = document.getElementById('description');
        const errorDiv = createErrorDiv('Description Template Errors:', validationResult.errors.description);
        descField.parentNode.insertBefore(errorDiv, descField.nextSibling);
        descField.classList.add('is-danger');
    }
    
    // Display restriction errors
    if (validationResult.errors.restriction.length > 0) {
        const restrField = document.getElementById('restriction');
        const errorDiv = createErrorDiv('Restriction Template Errors:', validationResult.errors.restriction);
        restrField.parentNode.insertBefore(errorDiv, restrField.nextSibling);
        restrField.classList.add('is-danger');
    }
}

/**
 * Remove validation error displays
 */
export function removeValidationErrors() {
    document.querySelectorAll('.template-validation-error').forEach(el => el.remove());
    document.getElementById('description')?.classList.remove('is-danger');
    document.getElementById('restriction')?.classList.remove('is-danger');
}

/**
 * Create an error message div
 * @param {string} title - Error section title
 * @param {Array} errors - Array of error messages
 * @returns {HTMLElement} - The error div element
 */
function createErrorDiv(title, errors) {
    const div = document.createElement('div');
    div.className = 'notification is-danger is-light mt-2 template-validation-error';
    
    const titleEl = document.createElement('p');
    titleEl.className = 'has-text-weight-bold';
    titleEl.textContent = title;
    div.appendChild(titleEl);
    
    const ul = document.createElement('ul');
    ul.style.marginLeft = '1.5rem';
    
    errors.forEach(error => {
        const li = document.createElement('li');
        li.textContent = error;
        ul.appendChild(li);
    });
    
    div.appendChild(ul);
    
    return div;
}
