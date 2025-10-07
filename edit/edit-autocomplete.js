// Description autocomplete functionality
import { SkillDB } from './edit-core.js';

export function initializeAutocomplete() {
  const descriptionField = document.getElementById('description');
  if (!descriptionField) return;

  let autocompleteDropdown = null;
  let currentMatches = [];
  let selectedIndex = -1;
  let statUsageCounts = {};

  function countStatUsageInDescriptions() {
    if (!SkillDB.db) return {};
    
    const usageCounts = {};
    
    try {
      // Get all skill descriptions that contain placeholders
      const stmt = SkillDB.db.prepare(`
        SELECT description 
        FROM skills 
        WHERE description IS NOT NULL 
        AND description != '' 
        AND description LIKE '%{{%}}%'
      `);
      
      while (stmt.step()) {
        const description = stmt.get()[0];
        
        // Find all {{...}} placeholders in this description
        const matches = description.match(/\{\{([^}]+)\}\}/g);
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
      console.warn('Failed to count stat usage in descriptions:', error);
    }
    
    return usageCounts;
  }

  function fuzzyFilter(stats, query) {
    if (!query) return stats.slice(0, 10); // Return first 10 if no query
    
    const results = [];
    
    for (const stat of stats) {
      const key = stat.key.toLowerCase();
      const name = stat.name.toLowerCase();
      const usageCount = stat.usage_count || 0;
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
        results.push({ ...stat, score });
      }
    }
    
    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, 10);
  }

  function showAutocomplete(query, startPos, endPos) {
    if (!SkillDB.db) return;

    // Initialize usage counts on first use
    if (Object.keys(statUsageCounts).length === 0) {
      statUsageCounts = countStatUsageInDescriptions();
    }

    // Get all stats ordered by usage count (most used first), then by key
    const stmt = SkillDB.db.prepare("SELECT key, name FROM stats ORDER BY key");
    const allStats = [];
    while (stmt.step()) {
      const [key, name] = stmt.get();
      const usage_count = statUsageCounts[key.toLowerCase()] || 0;
      allStats.push({ key, name, usage_count });
    }
    stmt.free();
    
    // Sort by usage count (most used first), then by key
    allStats.sort((a, b) => {
      if (b.usage_count !== a.usage_count) {
        return b.usage_count - a.usage_count;
      }
      return a.key.localeCompare(b.key);
    });

    // Fuzzy filter the stats
    currentMatches = fuzzyFilter(allStats, query.toLowerCase());

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
        background-color: var(--bg-color, #14161A);
        color: var(--text-color, #FAFAFA);
        border: 1px solid var(--border-color, #3D4451);
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
        background-color: var(--bg-color, #14161A);
        color: var(--text-color, #FAFAFA);
      `;
      
      // Create strong element with proper color inheritance
      const strong = document.createElement('strong');
      strong.textContent = match.key;
      strong.style.color = 'inherit';
      
      item.appendChild(strong);
      
      // Add usage count if available
      const usageText = match.usage_count > 0 ? ` (${match.usage_count})` : '';
      item.appendChild(document.createTextNode(` - ${match.name}${usageText}`));
      
      item.addEventListener('click', () => {
        completeStat(match);
      });
      
      item.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
      });
      
      autocompleteDropdown.appendChild(item);
    });

    // Position dropdown
    const rect = descriptionField.getBoundingClientRect();
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
    }
  }

  function updateSelection() {
    if (!autocompleteDropdown) return;
    
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.style.backgroundColor = 'var(--accent-color, #4A9EFF)';
        item.style.color = 'var(--bg-color, #14161A)';
      } else {
        item.style.backgroundColor = 'var(--bg-color, #14161A)';
        item.style.color = 'var(--text-color, #FAFAFA)';
      }
    });
  }

  function completeStat(match) {
    const text = descriptionField.value;
    const cursorPos = descriptionField.selectionStart;
    
    // Find the last {{ before cursor
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    const lastOpen = beforeCursor.lastIndexOf('{{');
    
    if (lastOpen !== -1) {
      // Check if we're inside an open {{ block
      const contentAfterOpen = beforeCursor.substring(lastOpen + 2);
      const nextClose = afterCursor.indexOf('}}');
      
      // If there's no closing }}, just replace the content after {{ up to the next newline
      if (nextClose === -1) {
        const beforeMatch = text.substring(0, lastOpen + 2);
        const afterCursor = text.substring(cursorPos);
        const nextNewline = afterCursor.indexOf('\n');
        const afterMatch = nextNewline !== -1 ? afterCursor.substring(nextNewline) : afterCursor;
        const newText = beforeMatch + match.key + '}}' + afterMatch;

        descriptionField.value = newText;

        // Set cursor position after the completed stat
        const newCursorPos = beforeMatch.length + match.key.length + 2;
        descriptionField.setSelectionRange(newCursorPos, newCursorPos);
      } else {
        // Replace the content between {{ and }}
        const beforeMatch = text.substring(0, lastOpen + 2);
        const afterMatch = text.substring(lastOpen + 2 + contentAfterOpen.length + nextClose);
        const newText = beforeMatch + match.key + '}}' + afterMatch;

        descriptionField.value = newText;

        // Set cursor position after the completed stat
        const newCursorPos = beforeMatch.length + match.key.length + 2;
        descriptionField.setSelectionRange(newCursorPos, newCursorPos);
      }
    }
    
    hideAutocomplete();
  }

  descriptionField.addEventListener('input', function(e) {
    const cursorPos = e.target.selectionStart;
    const text = e.target.value;
    
    // Find the current {{}} block the cursor is in
    const beforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    
    // Look for the last {{ before cursor
    const lastOpen = beforeCursor.lastIndexOf('{{');
    
    if (lastOpen !== -1) {
      // Check if we're inside an open {{ block
      const contentAfterOpen = beforeCursor.substring(lastOpen + 2);
      const nextClose = afterCursor.indexOf('}}');
      
      // If there's no closing }} or cursor is before it, we're inside the block
      if (nextClose === -1 || cursorPos <= lastOpen + 2 + nextClose) {
        const innerContent = contentAfterOpen;
        
        // Show autocomplete immediately after {{ or with any content
        showAutocomplete(innerContent, lastOpen, cursorPos);
      } else {
        hideAutocomplete();
      }
    } else {
      hideAutocomplete();
    }
  });

  descriptionField.addEventListener('keydown', function(e) {
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
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < currentMatches.length && currentMatches[selectedIndex]) {
          completeStat(currentMatches[selectedIndex]);
        }
        break;
      case 'Escape':
        hideAutocomplete();
        break;
    }
  });

  // Hide autocomplete when clicking outside
  document.addEventListener('click', function(e) {
    if (!descriptionField.contains(e.target) && (!autocompleteDropdown || !autocompleteDropdown.contains(e.target))) {
      hideAutocomplete();
    }
  });
}