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
    this.registerFunction('floor', Math.floor);
    this.registerFunction('ceil', Math.ceil);
    this.registerFunction('round', (value, decimals = 0) => {
      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    });
    this.registerFunction('min', Math.min);
    this.registerFunction('max', Math.max);
    
    // Register default variables
    this.registerVariable('blvl'); // base skill level
    this.registerVariable('lvl'); // all skills
    this.registerVariable('clvl'); // character level
  }

  /**
   * Register a new function that can be used in formulas
   * @param {string} name - Function name
   * @param {Function} func - Function implementation
   */
  registerFunction(name, func) {
    if (typeof func !== 'function') {
      throw new Error(`Cannot register ${name}: not a function`);
    }
    this.functionRegistry.set(name, func);
  }
  
  /**
   * Register a new variable that can be used in formulas
   * @param {string} name - Variable name
   */
  registerVariable(name) {
    if (typeof name !== 'string' || !name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      throw new Error(`Invalid variable name: ${name}`);
    }
    this.variableRegistry.add(name);
  }
  
  /**
   * Get all registered functions
   * @returns {Array<string>} Array of function names
   */
  getRegisteredFunctions() {
    return Array.from(this.functionRegistry.keys());
  }
  
  /**
   * Get all registered variables
   * @returns {Array<string>} Array of variable names
   */
  getRegisteredVariables() {
    return Array.from(this.variableRegistry);
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
    for (const [name, func] of this.functionRegistry) {
      context[name] = func;
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
      for (const [name, func] of this.functionRegistry) {
        context[name] = func;
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
