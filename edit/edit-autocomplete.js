// Description autocomplete functionality
import { SkillDB } from './edit-core.js';

export function initializeAutocomplete() {
  const descriptionField = document.getElementById('description');
  const restrictionField = document.getElementById('restriction');
  const skillEffectField = document.getElementById('skill_effect');
  if (!descriptionField) return;

  let autocompleteDropdown = null;
  let currentMatches = [];
  let selectedIndex = -1;
  let statUsageCounts = {};
  let skillUsageCounts = {};
  let activeField = null; // Track which field is currently active
  let activeAutocompleteType = null; // Track if we're autocompleting stats or skills

  function countStatUsageInDescriptions() {
    if (!SkillDB.db) return {};
    
    const usageCounts = {};
    
    try {
      // Get all skill descriptions, skill effects, and restrictions that contain placeholders
      const stmt = SkillDB.db.prepare(`
        SELECT description, skill_effect, restriction
        FROM skills 
        WHERE (description IS NOT NULL AND description != '' AND description LIKE '%{{%}}%')
        OR (skill_effect IS NOT NULL AND skill_effect != '' AND skill_effect LIKE '%{{%}}%')
        OR (restriction IS NOT NULL AND restriction != '' AND restriction LIKE '%{{%}}%')
      `);
      
      while (stmt.step()) {
        const [description, skillEffect, restriction] = stmt.get();
        const text = (description || '') + ' ' + (skillEffect || '') + ' ' + (restriction || '');
        
        // Find all {{...}} placeholders in this text
        const matches = text.match(/\{\{([^}]+)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            // Extract the stat key (part before colon if present)
            const statKey = match.replace(/\{\{|\}\}/g, '').split(':')[0].trim().toLowerCase();
            usageCounts[statKey] = (usageCounts[statKey] || 0) + 1;
          });
        }
      }
      stmt.free();
    } catch (error) {
      console.warn('Failed to count stat usage in descriptions, skill effects, and restrictions:', error);
    }
    
    return usageCounts;
  }

  function countSkillUsageInDescriptions() {
    if (!SkillDB.db) return {};
    
    const usageCounts = {};
    
    try {
      // Get all skill descriptions, skill effects, and restrictions that contain skill name placeholders
      const stmt = SkillDB.db.prepare(`
        SELECT description, skill_effect, restriction
        FROM skills 
        WHERE (description IS NOT NULL AND description != '' AND description LIKE '%[[%]]%')
        OR (skill_effect IS NOT NULL AND skill_effect != '' AND skill_effect LIKE '%[[%]]%')
        OR (restriction IS NOT NULL AND restriction != '' AND restriction LIKE '%[[%]]%')
      `);
      
      while (stmt.step()) {
        const [description, skillEffect, restriction] = stmt.get();
        const text = (description || '') + ' ' + (skillEffect || '') + ' ' + (restriction || '');
        
        // Find all [[...]] placeholders in this description
        const matches = text.match(/\[\[([^\]]+)\]\]/g);
        if (matches) {
          matches.forEach(match => {
            // Extract the skill name
            const skillName = match.replace(/\[\[|\]\]/g, '').trim().toLowerCase();
            usageCounts[skillName] = (usageCounts[skillName] || 0) + 1;
          });
        }
      }
      stmt.free();
    } catch (error) {
      console.warn('Failed to count skill usage in descriptions:', error);
    }
    
    return usageCounts;
  }

  function fuzzyFilter(items, query, itemType = 'stats') {
    if (!query) return items.slice(0, 20); // Return first 20 if no query
    
    const results = [];
    
    for (const item of items) {
      const key = itemType === 'stats' ? item.key.toLowerCase() : item.name.toLowerCase();
      const name = itemType === 'stats' ? item.name.toLowerCase() : item.display_name.toLowerCase();
      const usageCount = item.usage_count || 0;
      let score = 0;
      
      // Exact match gets highest score
      if (key === query) {
        score = 1000;
      }
      // Starts with query gets high score
      else if (key.startsWith(query)) {
        score = 500 + (key.length - query.length);
      }
      // Contains query gets medium score
      else if (key.includes(query)) {
        score = 200 + (key.length - key.indexOf(query) - query.length);
      }
      // Name contains query gets lower score
      else if (name.includes(query)) {
        score = 100 + (name.length - name.indexOf(query) - query.length);
      }
      // Fuzzy match - check if all query characters appear in order
      else {
        let keyIndex = 0;
        let queryIndex = 0;
        
        while (keyIndex < key.length && queryIndex < query.length) {
          if (key[keyIndex] === query[queryIndex]) {
            queryIndex++;
          }
          keyIndex++;
        }
        
        if (queryIndex === query.length) {
          score = 50 - (key.length - query.length);
        }
      }
      
      // Add usage count bonus
      score += Math.min(usageCount * 5, 100);
      
      if (score > 0) {
        results.push({ ...item, score });
      }
    }
    
    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, 10);
  }

  function showAutocomplete(query, startPos, endPos, type = 'stat') {
    if (!SkillDB.db) return;

    activeAutocompleteType = type;
    let allItems = [];

    if (type === 'stat') {
      // Initialize usage counts on first use
      if (Object.keys(statUsageCounts).length === 0) {
        statUsageCounts = countStatUsageInDescriptions();
      }

      // Get all stats ordered by usage count (most used first), then by key
      const stmt = SkillDB.db.prepare("SELECT key, name, format FROM stats ORDER BY key");
      while (stmt.step()) {
        const [key, name, format] = stmt.get();
        const usage_count = statUsageCounts[key.toLowerCase()] || 0;
        allItems.push({ key, name, format, usage_count });
      }
      stmt.free();
      
      // Sort by usage count (most used first), then by key
      allItems.sort((a, b) => {
        if (b.usage_count !== a.usage_count) {
          return b.usage_count - a.usage_count;
        }
        return a.key.localeCompare(b.key);
      });

      // Fuzzy filter the stats
      currentMatches = fuzzyFilter(allItems, query.toLowerCase(), 'stats');
    } else if (type === 'skill') {
      // Initialize skill usage counts on first use
      if (Object.keys(skillUsageCounts).length === 0) {
        skillUsageCounts = countSkillUsageInDescriptions();
      }

      // Get all skills ordered by usage count (most used first), then by name
      const stmt = SkillDB.db.prepare("SELECT name, display_name FROM skills ORDER BY name");
      while (stmt.step()) {
        const [name, display_name] = stmt.get();
        const usage_count = skillUsageCounts[name.toLowerCase()] || 0;
        allItems.push({ name, display_name, usage_count });
      }
      stmt.free();
      
      // Sort by usage count (most used first), then by name
      allItems.sort((a, b) => {
        if (b.usage_count !== a.usage_count) {
          return b.usage_count - a.usage_count;
        }
        return a.name.localeCompare(b.name);
      });

      // Fuzzy filter the skills
      currentMatches = fuzzyFilter(allItems, query.toLowerCase(), 'skills');
    }

    if (currentMatches.length === 0) {
      hideAutocomplete();
      return;
    }

    // Create or update dropdown
    if (!autocompleteDropdown) {
      autocompleteDropdown = document.createElement('div');
      autocompleteDropdown.className = 'autocomplete-dropdown dropdown-list';
      autocompleteDropdown.style.cssText = `
        position: absolute;
        left: 0;
        top: 100%;
        transform: none;
        min-width: 90%;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        display: none;
        margin-top: 4px;
        background-color: var(--bg-color);
        color: var(--text-color);
        border: 1px solid var(--border-color);
        border-radius: 3px;
      `;
      document.body.appendChild(autocompleteDropdown);
    }

    // Populate dropdown
    autocompleteDropdown.innerHTML = '';
    currentMatches.forEach((match, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item dropdown-list-item';
      item.style.cssText = `
        background-color: var(--bg-color);
        color: var(--text-color);
        display: flex;
        align-items: center;
        padding: 4px 8px;
        gap: 8px;
      `;
      
      // Create key element (10% width)
      const keyElement = document.createElement('div');
      keyElement.style.cssText = `
        flex: 0 0 25%;
        font-weight: bold;
        color: inherit;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      if (type === 'stat') {
        keyElement.textContent = match.key;
      } else {
        keyElement.textContent = match.name;
      }
      item.appendChild(keyElement);
      
      // Create name element (20% width) with usage count
      const nameElement = document.createElement('div');
      nameElement.style.cssText = `
        flex: 0 0 35%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      let nameText;
      if (type === 'stat') {
        nameText = match.name;
      } else {
        nameText = match.display_name;
      }
      
      // Add usage count right after the name
      if (match.usage_count > 0) {
        nameText += ` (${match.usage_count})`;
      }
      nameElement.textContent = nameText;
      item.appendChild(nameElement);
      
      // Create format/description element (remaining width)
      const formatElement = document.createElement('div');
      formatElement.style.cssText = `
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-color-secondary, #888);
      `;
      if (type === 'stat') {
        formatElement.textContent = match.format || '{name}: {value}';
      } else {
        formatElement.textContent = ''; // Skills don't have format
      }
      item.appendChild(formatElement);
      
      item.addEventListener('click', () => {
        if (type === 'stat') {
          completeStat(match);
        } else {
          completeSkill(match);
        }
      });
      
      item.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
      });
      
      autocompleteDropdown.appendChild(item);
    });

    // Position dropdown relative to active field
    const rect = activeField.getBoundingClientRect();
    autocompleteDropdown.style.left = rect.left + 'px';
    autocompleteDropdown.style.top = (rect.bottom + window.scrollY) + 'px';
    autocompleteDropdown.style.width = rect.width + 'px';
    autocompleteDropdown.style.display = 'block';
    
    selectedIndex = 0;
    updateSelection();
  }

  function hideAutocomplete() {
    if (autocompleteDropdown) {
      autocompleteDropdown.style.display = 'none';
      selectedIndex = -1;
      currentMatches = []; // Clear matches when hiding
    }
  }

  function updateSelection() {
    if (!autocompleteDropdown) return;
    
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.style.backgroundColor = 'var(--hover-bg-color)';
        item.style.color = 'var(--hover-text-color)';
        
        // Make format column (3rd child) more readable when selected
        const formatElement = item.children[2]; // Format column is the 3rd child
        if (formatElement) {
          formatElement.style.color = '#000000'; // Black text for better readability
        }
        
        // Scroll the selected item into view
        item.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      } else {
        item.style.backgroundColor = 'var(--bg-color)';
        item.style.color = 'var(--text-color)';
        
        // Reset format column color when not selected
        const formatElement = item.children[2]; // Format column is the 3rd child
        if (formatElement) {
          formatElement.style.color = 'var(--text-color-secondary, #888)';
        }
      }
    });
  }

  function completeStat(match) {
    if (!activeField) return;
    
    const text = activeField.value;
    const cursorPos = activeField.selectionStart;
    
    // Find the last {{ before cursor
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    const lastOpen = beforeCursor.lastIndexOf('{{');
    
    if (lastOpen !== -1) {
      // Check if we're inside an open {{ block
      const contentAfterOpen = beforeCursor.substring(lastOpen + 2);
      
      // Look for the next }} but make sure it's not part of another placeholder
      // by checking if there's a {{ before the }}
      let nextClose = afterCursor.indexOf('}}');
      const nextOpen = afterCursor.indexOf('{{');
      
      // If there's a {{ before the next }}, then the }} belongs to a different placeholder
      // In that case, treat it as if there's no closing }}
      if (nextOpen !== -1 && nextOpen < nextClose) {
        nextClose = -1;
      }
      
      // Build the new text
      const beforeMatch = text.substring(0, lastOpen + 2);
      let afterMatch;
      
      if (nextClose === -1) {
        // No closing }}, so just keep everything after cursor as-is
        afterMatch = afterCursor;
      } else {
        // There's a closing }}, skip past it (cursor + nextClose + 2)
        afterMatch = afterCursor.substring(nextClose + 2);
      }
      
      const newText = beforeMatch + match.key + '}}' + afterMatch;
      activeField.value = newText;

      // Set cursor position after the completed stat
      const newCursorPos = beforeMatch.length + match.key.length + 2;
      activeField.setSelectionRange(newCursorPos, newCursorPos);
    }
    
    hideAutocomplete();
  }

  function completeSkill(match) {
    if (!activeField) return;
    
    const text = activeField.value;
    const cursorPos = activeField.selectionStart;
    
    // Find the last [[ before cursor
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    const lastOpen = beforeCursor.lastIndexOf('[[');
    
    if (lastOpen !== -1) {
      // Check if we're inside an open [[ block
      const contentAfterOpen = beforeCursor.substring(lastOpen + 2);
      
      // Look for the next ]] but make sure it's not part of another placeholder
      // by checking if there's a [[ before the ]]
      let nextClose = afterCursor.indexOf(']]');
      const nextOpen = afterCursor.indexOf('[[');
      
      // If there's a [[ before the next ]], then the ]] belongs to a different placeholder
      // In that case, treat it as if there's no closing ]]
      if (nextOpen !== -1 && nextOpen < nextClose) {
        nextClose = -1;
      }
      
      // Build the new text
      const beforeMatch = text.substring(0, lastOpen + 2);
      let afterMatch;
      
      if (nextClose === -1) {
        // No closing ]], so just keep everything after cursor as-is
        afterMatch = afterCursor;
      } else {
        // There's a closing ]], skip past it (cursor + nextClose + 2)
        afterMatch = afterCursor.substring(nextClose + 2);
      }
      
      const newText = beforeMatch + match.name + ']]' + afterMatch;
      activeField.value = newText;

      // Set cursor position after the completed skill name
      const newCursorPos = beforeMatch.length + match.name.length + 2;
      activeField.setSelectionRange(newCursorPos, newCursorPos);
    }
    
    hideAutocomplete();
  }

  // Helper function to attach autocomplete to a field
  function attachAutocompleteToField(field) {
    field.addEventListener('input', function(e) {
      activeField = field;
      const cursorPos = e.target.selectionStart;
      const text = e.target.value;
      
      // Find the current {{}} or [[]] block the cursor is in
      const beforeCursor = text.substring(0, cursorPos);
      const afterCursor = text.substring(cursorPos);
      
      // Look for the last {{ or [[ before cursor
      const lastStatOpen = beforeCursor.lastIndexOf('{{');
      const lastSkillOpen = beforeCursor.lastIndexOf('[[');
      
      // Determine which delimiter we're inside (if any)
      if (lastStatOpen !== -1 || lastSkillOpen !== -1) {
        // We're potentially inside a placeholder
        const useSkill = lastSkillOpen > lastStatOpen;
        const lastOpen = useSkill ? lastSkillOpen : lastStatOpen;
        const closeDelim = useSkill ? ']]' : '}}';
        const openDelim = useSkill ? '[[' : '{{';
        const type = useSkill ? 'skill' : 'stat';
        
        // Check if there's a closing delimiter after the opening delimiter
        const textAfterOpen = text.substring(lastOpen);
        const closeIndex = textAfterOpen.indexOf(closeDelim);
        
        // Only show autocomplete if:
        // 1. There's no closing delimiter yet, OR
        // 2. Cursor is between opening and closing delimiters
        if (closeIndex === -1) {
          // No closing delimiter - we're inside an open block
          const innerContent = beforeCursor.substring(lastOpen + 2);
          showAutocomplete(innerContent, lastOpen, cursorPos, type);
        } else if (cursorPos > lastOpen && cursorPos < lastOpen + closeIndex) {
          // Cursor is between delimiters
          const innerContent = beforeCursor.substring(lastOpen + 2);
          showAutocomplete(innerContent, lastOpen, cursorPos, type);
        } else {
          // Cursor is outside the block
          hideAutocomplete();
        }
      } else {
        hideAutocomplete();
      }
    });

    field.addEventListener('keydown', function(e) {
      if (!autocompleteDropdown || autocompleteDropdown.style.display === 'none') return;

      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, currentMatches.length - 1);
          updateSelection();
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, 0);
          updateSelection();
          break;
        case 'Tab':
          // Tab: autocomplete if something is selected
          if (selectedIndex >= 0 && selectedIndex < currentMatches.length && currentMatches[selectedIndex]) {
            e.preventDefault();
            if (activeAutocompleteType === 'skill') {
              completeSkill(currentMatches[selectedIndex]);
            } else {
              completeStat(currentMatches[selectedIndex]);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          hideAutocomplete();
          break;
        case 'Enter':
          // Enter: only autocomplete if user explicitly selected an item (not on first item by default)
          // This allows typing custom stats and pressing Enter to insert newline
          if (selectedIndex > 0 && selectedIndex < currentMatches.length && currentMatches[selectedIndex]) {
            e.preventDefault();
            if (activeAutocompleteType === 'skill') {
              completeSkill(currentMatches[selectedIndex]);
            } else {
              completeStat(currentMatches[selectedIndex]);
            }
          } else {
            // Let Enter work normally (insert newline or submit form)
            hideAutocomplete();
            currentMatches = []; // Clear matches to prevent Tab from autocompleting
            selectedIndex = -1;
          }
          break;
      }
    });

    // Hide autocomplete when field loses focus (with small delay for clicks)
    field.addEventListener('blur', function() {
      setTimeout(() => {
        hideAutocomplete();
      }, 200);
    });
  }
  
  // Attach autocomplete to restriction field if it exists
  if (restrictionField) {
    attachAutocompleteToField(restrictionField);
  }
  
  // Attach autocomplete to skill effect field if it exists
  if (skillEffectField) {
    attachAutocompleteToField(skillEffectField);
  }

  // Hide autocomplete when clicking outside
  document.addEventListener('click', function(e) {
    const isRestrictionField = restrictionField && restrictionField.contains(e.target);
    const isSkillEffectField = skillEffectField && skillEffectField.contains(e.target);
    const isDropdown = autocompleteDropdown && autocompleteDropdown.contains(e.target);
    
    if (!isRestrictionField && !isSkillEffectField && !isDropdown) {
      hideAutocomplete();
    }
  });
}