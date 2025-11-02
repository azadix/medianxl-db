/**
 * Formula evaluator for skill scaling calculations
 * Supports basic arithmetic, functions, and character state variables
 * 
 * Integer Math Note:
 * - All formula results are truncated to integer values (using Math.trunc)
 * - For proper integer math, ensure operators are written in the correct order
 * - GOOD: "lvl/3" (division happens first, then multiplication if any)
 * - BAD: "1/3*lvl" (division on constant truncates to 0 first, then *lvl gives 0)
 * - Example: If lvl=10, "lvl/3" = 3 but "1/3*lvl" = 0
 */

export class FormulaEvaluator {
  constructor(characterState = null) {
    // Use registries instead of hardcoded maps
    this.functionRegistry = new Map();
    this.variableRegistry = new Set();
    
    // Store character state reference for tree() function
    this.characterState = characterState;
    
    // Store tree skills cache
    this.treeSkillsCache = characterState?.treeSkillsCache || {};
    
    // Register default functions
    this.registerFunction({
      keyword: 'floor',
      function: Math.floor,
      description: 'Rounds down to the nearest integer',
      example: 'floor(5.7) == 5'
    });
    this.registerFunction({
      keyword: 'ceil',
      function: Math.ceil,
      description: 'Rounds up to the nearest integer',
      example: 'ceil(5.2) == 6'
    });
    this.registerFunction({
      keyword: 'round',
      function: (value, decimals = 0) => {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
      },
      description: 'Rounds to specified decimal places (default: 0)',
      example: 'round(5.678, 2) == 5.68'
    });
    this.registerFunction({
      keyword: 'min',
      function: Math.min,
      description: 'Returns the smallest of the given numbers',
      example: 'min(5, 10, 3) == 3'
    });
    this.registerFunction({
      keyword: 'max',
      function: Math.max,
      description: 'Returns the largest of the given numbers',
      example: 'max(5, 10, 3) == 10'
    });
    this.registerFunction({
      keyword: 'pow',
      function: Math.pow,
      description: 'Raises base to the power of exponent',
      example: 'pow(2, 3) == 8'
    });
    this.registerFunction({
      keyword: 'frames',
      function: (frames) => {
        // Convert frames to seconds (25 frames per second) with 0.01 rounding
        return Math.floor((frames / 25) * 100) / 100;
      },
      description: 'Converts frame count to seconds (25 frames = 1 second) with 0.01 rounding',
      example: 'frames(25) == 1.0, frames(1) == 0.04'
    });
    this.registerFunction({
      keyword: 'range',
      function: (feet) => {
        // Convert feet to yards with 1/3 feet precision
        // Pattern: 1=0.3, 2=0.6, 3=1.0, 4=1.3, 5=1.6, 6=2.0, etc.
        return Math.floor((feet * 0.3 + Math.floor(feet / 3) * 0.1) * 1000) / 1000;
      },
      description: 'Converts feet to yards with 1/3 feet precision',
      example: 'range(3) == 1.0, range(4) == 1.3'
    });
    this.registerFunction({
      keyword: 'bool',
      function: (value) => {
        // Returns 0 if value is 0, 1 if value is different than 0
        return value === 0 ? 0 : 1;
      },
      description: 'Returns 0 if value is 0, 1 if value is different than 0',
      example: 'bool(0) == 0, bool(5) == 1'
    });
    this.registerFunction({
      keyword: 'tree',
      function: (tabId) => {
        // Get character state from variables passed to evaluate()
        return this.calculateTreePoints(tabId);
      },
      description: 'Returns total skill points spent in the specified skill tree',
      example: 'tree(1) returns points in tab ID 1'
    });
    this.registerFunction({
      keyword: 'if',
      function: (condition, trueValue, falseValue) => {
        // Condition is evaluated by JavaScript before being passed here
        // Handle boolean, number (0 = false, non-zero = true), or truthy/falsy values
        const conditionResult = Boolean(condition);
        return conditionResult ? trueValue : falseValue;
      },
      description: 'Conditional: returns trueValue if condition is true, otherwise falseValue. Supports comparisons: ==, !=, <, <=, >, >=',
      example: 'if(lvl <= 22, 5*slvl, 0) - returns 5*slvl if level <= 22, otherwise 0'
    });
    
    // Register default variables with descriptions and examples
    this.registerVariable({
      keyword: 'blvl',
      description: 'Base skill level (points invested in this skill from tree)',
      example: '50 + 15*blvl'
    });
    this.registerVariable({
      keyword: 'slvl',
      description: 'All skills bonus (from "+# to All Skills" input field only)',
      example: '100 + 5*slvl'
    });
    this.registerVariable({
      keyword: 'lvl',
      description: 'Total effective skill level (slvl + blvl combined)',
      example: '100 + 5*lvl'
    });
    this.registerVariable({
      keyword: 'ulvl',
      description: 'Character level',
      example: '25 + ulvl'
    });
  }

  /**
   * Register a new function that can be used in formulas
   * @param {Object} options - Function registration options
   * @param {string} options.keyword - Function name (required)
   * @param {Function} options.function - Function implementation (required)
   * @param {string} options.description - Optional description of what the function does
   * @param {string} options.example - Optional example of how to use the function
   */
  registerFunction({ keyword, function: func, description = '', example = '' }) {
    if (!keyword) {
      throw new Error('Function keyword is required');
    }
    if (!func || typeof func !== 'function') {
      throw new Error(`Cannot register ${keyword}: function is required and must be a function`);
    }
    this.functionRegistry.set(keyword, { func, description, example });
  }
  
  /**
   * Register a new variable that can be used in formulas
   * @param {Object} options - Variable registration options
   * @param {string} options.keyword - Variable name (required)
   * @param {string} options.description - Optional description of what the variable represents
   * @param {string} options.example - Optional example of how to use the variable
   */
  registerVariable({ keyword, description = '', example = '' }) {
    if (!keyword) {
      throw new Error('Variable keyword is required');
    }
    if (typeof keyword !== 'string' || !keyword.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      throw new Error(`Invalid variable name: ${keyword}`);
    }
    this.variableRegistry.add({ name: keyword, description, example });
  }
  
  /**
   * Get all registered functions
   * @returns {Array<string>} Array of function names
   */
  getRegisteredFunctions() {
    return Array.from(this.functionRegistry.keys());
  }
  
  /**
   * Get function information including description and example
   * @returns {Array<Object>} Array of function objects with name, description, and example
   */
  getFunctionInfo() {
    return Array.from(this.functionRegistry.entries()).map(([name, info]) => ({
      name,
      description: info.description || 'No description available',
      example: info.example || 'No example available'
    }));
  }
  
  /**
   * Get variable information including description and example
   * @returns {Array<Object>} Array of variable objects with name, description, and example
   */
  getVariableInfo() {
    return Array.from(this.variableRegistry).map(v => ({
      name: v.name,
      description: v.description || 'No description available',
      example: v.example || 'No example available'
    }));
  }
  
  /**
   * Get skill reference information for the modal
   * @returns {Array<Object>} Array of skill reference objects with name, description, and example
   */
  getSkillReferenceInfo() {
    return [
      {
        name: '[[skill_name]]',
        description: 'Reference another skill\'s blvl (base points) in formulas',
        example: '5 + [[barrage]] * 2'
      },
    ];
  }

  /**
   * Get stat reference information character stat references in formulas
   * @returns {Array<Object>} Array of stat reference objects with name, description, and example
   */
  getStatReferenceInfo() {
    return [
      {
        name: '{{stat_name}}',
        description: 'Reference character stat value in formulas (e.g., strength, dexterity, vitality, energy)',
        example: '50 + {{strength}} * 2'
      },
    ];
  }

  /**
   * Parse and validate a formula string
   * @param {string} formula - The formula to parse
   * @returns {Object} Parse result with success flag and error message
   */
  parseFormula(formula) {
    try {
      if (!formula || typeof formula !== 'string') {
        return { success: false, error: 'Formula is required' };
      }

      // Basic syntax validation
      const trimmed = formula.trim();
      if (!trimmed) {
        return { success: false, error: 'Formula cannot be empty' };
      }

      // Check for balanced parentheses
      let parenCount = 0;
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '(') parenCount++;
        else if (trimmed[i] === ')') parenCount--;
        if (parenCount < 0) {
          return { success: false, error: 'Unmatched closing parenthesis' };
        }
      }
      if (parenCount !== 0) {
        return { success: false, error: 'Unmatched opening parenthesis' };
      }

      // Check for valid characters (including square brackets for skill references, braces for stat references, and comparison operators for if())
      const validChars = /^[0-9+\-*/.(),a-zA-Z_\[\]\{\}\s=<>!]+$/;
      if (!validChars.test(trimmed)) {
        return { success: false, error: 'Formula contains invalid characters' };
      }
      
      // Validate if() function syntax (must have exactly 3 arguments)
      const ifValidation = this.validateIfSyntax(trimmed);
      if (!ifValidation.success) {
        return ifValidation;
      }

      // Check for problematic integer math patterns (1/3*lvl style)
      const integerMathWarning = this.checkIntegerMathIssues(trimmed);
      if (integerMathWarning) {
        return { success: true, warning: integerMathWarning };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: `Parse error: ${error.message}` };
    }
  }

  /**
   * Check for problematic integer math patterns
   * Detects patterns like "1/3*lvl" which will truncate to 0 in integer math
   * @param {string} formula - The formula to check
   * @returns {string|null} Warning message if issue found, null otherwise
   */
  checkIntegerMathIssues(formula) {
    // Pattern: number/number*variable or number/number*number (fraction times something)
    // This will truncate to 0 in integer math
    const badPattern = /(\d+\s*\/\s*\d+)\s*\*/g;
    
    const matches = formula.match(badPattern);
    if (matches) {
      for (const match of matches) {
        const fraction = match.replace(/\s*\*/g, '').trim();
        try {
          const [num, den] = fraction.split('/').map(n => parseFloat(n.trim()));
          if (num < den && den > 1) {
            // This is a fraction less than 1, will truncate to 0
            return `Warning: "${fraction}*..." will evaluate to 0 in integer math. Use ".../${den}" instead.`;
          }
        } catch (e) {
          // Skip if we can't parse
        }
      }
    }
    
    return null;
  }

  /**
   * Validate if() function syntax
   * Checks that all if() calls have exactly 3 arguments
   * @param {string} formula - The formula to validate
   * @returns {Object} Validation result with success flag and error message
   */
  validateIfSyntax(formula) {
    // Find all if() function calls (case-insensitive word boundary)
    const ifPattern = /\bif\s*\(/gi;
    let match;
    
    while ((match = ifPattern.exec(formula)) !== null) {
      const startPos = match.index + match[0].length - 1; // Position of opening parenthesis
      
      // Find the matching closing parenthesis and count arguments
      let parenCount = 0;
      let argumentCount = 1; // Start with 1 (we count commas)
      let inString = false;
      let stringChar = null;
      
      for (let i = startPos; i < formula.length; i++) {
        const char = formula[i];
        
        // Track string literals (though formulas typically don't have them)
        if ((char === '"' || char === "'") && (i === 0 || formula[i - 1] !== '\\')) {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
            stringChar = null;
          }
          continue;
        }
        
        if (inString) continue;
        
        if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
          if (parenCount === 0) {
            // Found the closing parenthesis for this if()
            if (argumentCount !== 3) {
              return { 
                success: false, 
                error: `if() function requires exactly 3 arguments (condition, trueValue, falseValue), found ${argumentCount}` 
              };
            }
            break; // Move to next if() call
          }
        } else if (char === ',' && parenCount === 1) {
          // Comma at the top level of if() arguments
          argumentCount++;
        }
      }
      
      // If we didn't find a closing parenthesis, it's an error
      if (parenCount !== 0) {
        return { 
          success: false, 
          error: 'if() function call has unmatched parentheses' 
        };
      }
    }
    
    return { success: true };
  }

  /**
   * Evaluate a formula with given variables
   * @param {string} formula - The formula to evaluate
   * @param {Object} variables - Variable values (blvl, lvl, ulvl, etc.)
   * @returns {Object} Evaluation result with success flag, value, and error message
   */
  evaluate(formula, variables = {}) {
    try {
      const parseResult = this.parseFormula(formula);
      if (!parseResult.success) {
        return parseResult;
      }

      // Set temporary character state for tree() function if character state is in variables
      if (variables.characterState) {
        this.setTempCharacterState(variables.characterState);
      }

      // Create a safe evaluation context
      const context = this.createEvaluationContext(variables);
      
      // Replace variables in formula with their values
      let processedFormula = this.replaceVariables(formula, context);
      
      // Validate that all variables were replaced
      if (this.containsUnreplacedVariables(processedFormula)) {
        return { success: false, error: 'Formula contains undefined variables' };
      }

      // Evaluate the formula safely
      const result = this.safeEvaluate(processedFormula);
      
      // Clear temporary character state
      this.tempCharacterState = null;
      
      if (isNaN(result)) {
        return { success: false, error: 'Formula evaluation resulted in NaN' };
      }
      
      if (!isFinite(result)) {
        return { success: false, error: 'Formula evaluation resulted in infinity' };
      }

      return { success: true, value: result };
    } catch (error) {
      // Clear temporary character state on error
      this.tempCharacterState = null;
      return { success: false, error: `Evaluation error: ${error.message}` };
    }
  }

  /**
   * Create evaluation context with available functions and variables
   */
  createEvaluationContext(variables) {
    const context = { ...variables };
    
    // Add all registered functions
    for (const [name, info] of this.functionRegistry) {
      context[name] = info.func;
    }
    
    return context;
  }

  /**
   * Replace variables in formula with their values
   */
  replaceVariables(formula, context) {
    let processed = formula;
    
    // Replace character stat references first (e.g., {{strength}} -> stat value)
    processed = this.replaceStatReferences(processed, context);
    
    // Replace skill name references (e.g., [[bear_companion]] -> blvl of that skill)
    processed = this.replaceSkillReferences(processed, context);
    
    // Replace function calls
    for (const funcName of this.functionRegistry.keys()) {
      const regex = new RegExp(`\\b${funcName}\\b`, 'g');
      processed = processed.replace(regex, `context.${funcName}`);
    }
    
    // Replace variables
    for (const [varName, varValue] of Object.entries(context)) {
      if (typeof varValue === 'function') continue; // Skip functions
      
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      processed = processed.replace(regex, String(varValue));
    }
    
    return processed;
  }

  /**
   * Replace character stat references with their values
   * Syntax: {{statName}} -> stat value (defaults to 0 if not set)
   */
  replaceStatReferences(formula, context) {
    // Match {{statName}} patterns (double braces)
    const statRefPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    
    return formula.replace(statRefPattern, (match, statName) => {
      // Get stat value from character state stats
      if (context.characterState && context.characterState.stats && context.characterState.stats[statName] !== undefined) {
        return String(context.characterState.stats[statName]);
      }
      
      // If stat not found, return 0
      return '0';
    });
  }

  /**
   * Extract stat references from a formula
   * Returns an array of unique stat names used in the formula
   * @param {string} formula - The formula to analyze
   * @returns {Array<string>} Array of stat names
   */
  extractStatReferences(formula) {
    if (!formula || typeof formula !== 'string') {
      return [];
    }
    
    const statRefPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    const stats = new Set();
    let match;
    
    while ((match = statRefPattern.exec(formula)) !== null) {
      stats.add(match[1]);
    }
    
    return Array.from(stats);
  }

  /**
   * Replace skill name references with their blvl values
   * Syntax: [[skill_name]] -> blvl of that skill
   */
  replaceSkillReferences(formula, context) {
    // Match [[skill_name]] patterns
    const skillRefPattern = /\[\[([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g;
    
    return formula.replace(skillRefPattern, (match, skillName) => {
      // Get blvl for the referenced skill from the full _blvl object
      if (context._blvl && context._blvl[skillName] !== undefined) {
        return String(context._blvl[skillName]);
      }
      
      // If skill not found, return 0
      return '0';
    });
  }

  /**
   * Check if formula contains unreplaced variables
   */
  containsUnreplacedVariables(formula) {
    // First, remove skill references since they're handled separately
    const withoutSkillRefs = formula.replace(/\[\[[a-zA-Z_][a-zA-Z0-9_]*(?::[a-zA-Z_][a-zA-Z0-9_]*)?\]\]/g, '0');
    
    const variablePattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = withoutSkillRefs.match(variablePattern);
    
    if (!matches) return false;
    
    for (const match of matches) {
      if (!this.functionRegistry.has(match) && match !== 'context') {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Safely evaluate the processed formula
   * Note: The final result is truncated to integer (matches Diablo 2's integer-only behavior)
   * However, if the formula contains frames() or range() functions, decimal precision is preserved
   */
  safeEvaluate(formula) {
    try {
      const context = {};
      
      // Add all registered functions to context
      for (const [name, info] of this.functionRegistry) {
        context[name] = info.func;
      }
      
      const func = new Function('context', `return ${formula}`);
      const result = func(context);
      
      // Check if formula contains decimal-preserving functions (frames or range)
      const hasDecimalFunction = /context\.(frames|range)\(/g.test(formula);
      
      if (hasDecimalFunction) {
        // Preserve decimal precision for formulas using frames() or range()
        return Math.round(result * 100) / 100;
      } else {
        // Truncate to integer for all other formulas (matches Diablo 2's integer-only behavior)
        return Math.trunc(result);
      }
    } catch (error) {
      throw new Error(`Formula evaluation failed: ${error.message}`);
    }
  }

  /**
   * Calculate total skill points spent in a specific skill tree
   * @param {number} tabId - ID from classTabs table identifying the skill tree
   * @returns {number} Total points spent in the tree
   */
  calculateTreePoints(tabId) {
    // Get character state from the evaluation context
    // This is accessed via closure from the function wrapper
    if (!this.tempCharacterState || !this.tempCharacterState.blvl) {
      return 0;
    }
    
    // Get tree skills cache from character state
    const treeSkillsCache = this.tempCharacterState.treeSkillsCache || this.treeSkillsCache;
    const treeSkills = treeSkillsCache[tabId] || [];
    
    let totalPoints = 0;
    for (const skillName of treeSkills) {
      totalPoints += this.tempCharacterState.blvl[skillName] || 0;
    }
    
    return totalPoints;
  }
  
  /**
   * Set temporary character state for evaluation
   * This is used when tree() is called
   */
  setTempCharacterState(characterState) {
    this.tempCharacterState = characterState;
  }

  /**
   * Get list of variables used in a formula
   * @param {string} formula - The formula to analyze
   * @returns {Array} Array of variable names found in the formula
   */
  getVariables(formula) {
    const variables = new Set();
    
    for (const varName of this.variableRegistry) {
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      if (regex.test(formula)) {
        variables.add(varName);
      }
    }
    
    return Array.from(variables);
  }
}

// Create and export a singleton instance
export const formulaEvaluator = new FormulaEvaluator();

// Export helper functions for backward compatibility
export function parseFormula(formula) {
  return formulaEvaluator.parseFormula(formula);
}

export function evaluateFormula(formula, variables) {
  return formulaEvaluator.evaluate(formula, variables);
}

export function extractStatReferences(formula) {
  return formulaEvaluator.extractStatReferences(formula);
}
