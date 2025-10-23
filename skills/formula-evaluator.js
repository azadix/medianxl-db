/**
 * Formula evaluator for skill scaling calculations
 * Supports basic arithmetic, functions, and character state variables
 */

export class FormulaEvaluator {
  constructor() {
    // Use registries instead of hardcoded maps
    this.functionRegistry = new Map();
    this.variableRegistry = new Set();
    
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
      keyword: 'abs',
      function: Math.abs,
      description: 'Returns absolute value (removes negative sign)',
      example: 'abs(-5) == 5'
    });
    this.registerFunction({
      keyword: 'sqrt',
      function: Math.sqrt,
      description: 'Returns square root',
      example: 'sqrt(25) == 5'
    });
    this.registerFunction({
      keyword: 'pow',
      function: Math.pow,
      description: 'Raises base to the power of exponent',
      example: 'pow(2, 3) == 8'
    });
    this.registerFunction({
      keyword: 'seconds',
      function: (frames) => {
        // Convert frames to seconds (25 frames per second) with 0.1 rounding
        return Math.round((frames / 25) * 10) / 10;
      },
      description: 'Converts frame count to seconds (25 frames = 1 second) with 0.1 rounding',
      example: 'seconds(25) == 1.0, seconds(6) == 0.2'
    });
    this.registerFunction({
      keyword: 'range',
      function: (feet) => {
        // Convert feet to yards with 1/3 feet precision
        // Pattern: 1=0.3, 2=0.6, 3=1.0, 4=1.3, 5=1.6, 6=2.0, etc.
        return Math.round((feet * 0.3 + Math.floor(feet / 3) * 0.1) * 10) / 10;
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
    
    // Register default variables with descriptions and examples
    this.registerVariable({
      keyword: 'blvl',
      description: 'Base skill level (points invested in this skill)',
      example: '50 + 15*blvl'
    });
    this.registerVariable({
      keyword: 'lvl',
      description: 'All skills bonus (coming from the "+# to All Skills" field)',
      example: '100 + 5*lvl'
    });
    this.registerVariable({
      keyword: 'clvl',
      description: 'Character level',
      example: '25 + clvl'
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
    return [{
      name: '[[skill_name]]',
      description: 'Reference another skill\'s blvl in formulas',
      example: '5 + [[barrage]] * 2'
    }];
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

      // Check for valid characters (including square brackets for skill references)
      const validChars = /^[0-9+\-*/.(),a-zA-Z_\[\]\s]+$/;
      if (!validChars.test(trimmed)) {
        return { success: false, error: 'Formula contains invalid characters' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: `Parse error: ${error.message}` };
    }
  }

  /**
   * Evaluate a formula with given variables
   * @param {string} formula - The formula to evaluate
   * @param {Object} variables - Variable values (blvl, lvl, clvl, etc.)
   * @returns {Object} Evaluation result with success flag, value, and error message
   */
  evaluate(formula, variables = {}) {
    try {
      const parseResult = this.parseFormula(formula);
      if (!parseResult.success) {
        return parseResult;
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
      
      if (isNaN(result)) {
        return { success: false, error: 'Formula evaluation resulted in NaN' };
      }
      
      if (!isFinite(result)) {
        return { success: false, error: 'Formula evaluation resulted in infinity' };
      }

      return { success: true, value: result };
    } catch (error) {
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
    
    // Replace skill name references first (e.g., [[bear_companion]] -> blvl of that skill)
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
   * Replace skill name references with their blvl values
   * Syntax: [[skill_name]] -> blvl of that skill
   */
  replaceSkillReferences(formula, context) {
    // Match [[skill_name]] pattern
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
    const withoutSkillRefs = formula.replace(/\[\[[a-zA-Z_][a-zA-Z0-9_]*\]\]/g, '0');
    
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
   */
  safeEvaluate(formula) {
    try {
      const context = {};
      for (const [name, info] of this.functionRegistry) {
        context[name] = info.func;
      }
      
      const func = new Function('context', `return ${formula}`);
      return func(context);
    } catch (error) {
      throw new Error(`Formula evaluation failed: ${error.message}`);
    }
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
