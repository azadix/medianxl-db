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

import { resolveCharacterStatKeyForToken } from '@/shared/skill-data-store.js';
import { isConditionSelected } from '@/stores/planner-config-store.js';

const framesPerSecond = 25;

export class FormulaEvaluator {
  constructor(characterState = null) {
    /** @type {Map<string, (...args: unknown[]) => unknown>} */
    this.functionRegistry = new Map();

    // Store character state reference for tree() function
    this.characterState = characterState;

    // Store tree skills cache
    this.treeSkillsCache = characterState?.treeSkillsCache || {};

    this.registerFunction('floor', Math.floor);
    this.registerFunction('ceil', Math.ceil);
    this.registerFunction('round', (value, decimals = 0) => {
      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    });
    this.registerFunction('min', Math.min);
    this.registerFunction('max', Math.max);
    this.registerFunction('pow', Math.pow);
    this.registerFunction('frames', (frames) => {
      // Convert frames to seconds with 0.01 rounding
      return Math.floor((frames / framesPerSecond) * 100) / 100;
    });
    this.registerFunction('range', (feet) => {
      // Convert feet to yards with 1/3 feet precision
      // Pattern: 1=0.3, 2=0.6, 3=1.0, 4=1.3, 5=1.6, 6=2.0, etc.
      return Math.floor((feet * 0.3 + Math.floor(feet / 3) * 0.1) * 1000) / 1000;
    });
    this.registerFunction('bool', (value) => (value === 0 ? 0 : 1));
    // Rewritten to 0/1 before eval; keep a no-op so the keyword is registered.
    this.registerFunction('cond', (value) => (value === 0 ? 0 : 1));
    this.registerFunction('tree', (tabId) => this.calculateTreePoints(tabId));
    this.registerFunction('if', (condition, trueValue, falseValue) =>
      condition ? trueValue : falseValue
    );
    this.registerFunction('ln', (a, b, lvl) => this.linearFromParams(a, b, lvl));
    this.registerFunction('dm', (a, b, lvl) => this.diminishingFromParams(a, b, lvl));
    // D2 SKILLS_CalculateDamageBonusByLevel: base + bracket-scaled per-level gain.
    // lev_scaled(base, per1..per5, lvl) — brackets 2-8 / 9-16 / 17-22 / 23-28 / 29+
    this.registerFunction('lev_scaled', (base, p1, p2, p3, p4, p5, lvl) =>
      this.levScaled(base, [p1, p2, p3, p4, p5], lvl)
    );
    // D2 SKILLS_GetElementalLength: ELen + brackets 2-8 / 9-16 / 17+
    this.registerFunction('lev_elen', (base, p1, p2, p3, lvl) =>
      this.levElen(base, [p1, p2, p3], lvl)
    );
    // Minion life (_minion_life in the extractor): params p2/p3/p4 + calc1 bonus + ulvl.
    this.registerFunction('minion_life', (p2, p3, p4, calc1, lvl, ulvl) =>
      this.minionLife(p2, p3, p4, calc1, lvl, ulvl)
    );
    // Minion attack rating (mnar): param5 * max(lvl - 1, 0)
    this.registerFunction('minion_ar', (p5, lvl) => (Number(p5) || 0) * Math.max((Number(lvl) || 1) - 1, 0));
    // HitShift application for elemental/physical damage values: (v << hs) >> 8
    this.registerFunction('hitshift', (value, hs) => {
      const v = Math.trunc(Number(value) || 0);
      const h = Number(hs) || 8;
      return Math.trunc((v * Math.pow(2, h)) / 256);
    });

    // Truncating integer division toward zero (matches the game's MSVC `/`), rhs=0 -> 0.
    this.registerFunction('truncdiv', (a, b) => {
      if (b === 0) return 0;
      return Math.trunc(a / b);
    });
    // "Standard caster synergy" (mxlplanner's energySpellDamage program):
    //   (1 + ext) * ((50 + 10*min(clvl,120)) * (50 + 130*(energy+20)/(500+energy)
    //                + min(spellFocus/10, 100)) / 100 - 75) + ext*100
    // ext is the "Energy: X% increased damage" synergy as a fraction.
    this.registerFunction('energy_synergy', (energy, spellFocus, clvl, ext) =>
      this.energySynergy(energy, spellFocus, clvl, ext)
    );
  }

  /**
   * Standard caster (energy) synergy percentage, ported from mxlplanner.
   * @param {number} energy
   * @param {number} spellFocus
   * @param {number} clvl character level (capped at 120)
   * @param {number} ext energy synergy as a fraction (0.82 for 82%)
   * @returns {number}
   */
  energySynergy(energy, spellFocus, clvl, ext) {
    const lvl = Math.min(Number(clvl) || 1, 120);
    const e = Number(energy) || 0;
    const sf = Math.min((Number(spellFocus) || 0) / 10, 100);
    const factor = 50 + (130 * (e + 20)) / (500 + e) + sf;
    const base = ((50 + 10 * lvl) * factor) / 100 - 75;
    const ex = Number(ext) || 0;
    return (1 + ex) * base + ex * 100;
  }

  /**
   * Register a function that can be used in formulas.
   * @param {string} keyword
   * @param {(...args: unknown[]) => unknown} func
   */
  registerFunction(keyword, func) {
    if (!keyword) {
      throw new Error('Function keyword is required');
    }
    if (!func || typeof func !== 'function') {
      throw new Error(`Cannot register ${keyword}: function is required and must be a function`);
    }
    this.functionRegistry.set(keyword, func);
  }

  /**
   * Parse and validate a formula string
   * @param {string} formula - The formula to parse
   * @returns {object} Parse result with success flag and error message
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
      const validChars = /^[0-9+\-*/.(),a-zA-Z_[\]{}()\s=<>!]+$/;
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
   * Linear param curve: a + b * (lvl - 1) (ln12 like).
   * @param {number} a
   * @param {number} b
   * @param {number} lvl
   * @returns {number}
   */
  linearFromParams(a, b, lvl) {
    const lv = Number(lvl);
    const level = Number.isFinite(lv) ? lv : 1;
    const aa = Number(a) || 0;
    const bb = Number(b) || 0;
    
    return aa + bb * (level - 1);
  }

  /**
   * Diminishing param curve (dm12 like).
   * @param {number} a
   * @param {number} b
   * @param {number} lvl
   * @returns {number}
   */
  diminishingFromParams(a, b, lvl) {
    const lv = Number(lvl);
    const level = Number.isFinite(lv) ? lv : 1;
    const aa = Number(a) || 0;
    const bb = Number(b) || 0;

    return Math.floor(aa + ((110 * level) * (bb - aa)) / (100 * (level + 6)));
  }

  /**
   * D2 SKILLS_CalculateDamageBonusByLevel. Brackets: 2-8 / 9-16 / 17-22 / 23-28 / 29+.
   * @param {number} base
   * @param {number[]} per five per-level gains
   * @param {number} lvl
   * @returns {number}
   */
  levScaled(base, per, lvl) {
    const level = Number.isFinite(Number(lvl)) ? Number(lvl) : 1;
    const b = Number(base) || 0;
    if (level <= 0) return 0;
    const p = [0, 0, 0, 0, 0].map((_, i) => Number((per || [])[i]) || 0);
    if (level <= 1) return b;
    if (level <= 8) return b + p[0] * (level - 1);
    if (level <= 16) return b + 7 * p[0] + p[1] * (level - 8);
    if (level <= 22) return b + 7 * p[0] + 8 * p[1] + p[2] * (level - 16);
    if (level <= 28) return b + 7 * p[0] + 8 * p[1] + 6 * p[2] + p[3] * (level - 22);
    return b + 7 * p[0] + 8 * p[1] + 6 * p[2] + 6 * p[3] + p[4] * (level - 28);
  }

  /**
   * D2 SKILLS_GetElementalLength. Brackets: 2-8 / 9-16 / 17+.
   * @param {number} base
   * @param {number[]} per three per-level gains
   * @param {number} lvl
   * @returns {number}
   */
  levElen(base, per, lvl) {
    const level = Number.isFinite(Number(lvl)) ? Number(lvl) : 1;
    const b = Number(base) || 0;
    if (level <= 0) return 0;
    const p = [0, 0, 0].map((_, i) => Number((per || [])[i]) || 0);
    if (level <= 8) return b + p[0] * (level - 1);
    if (level <= 16) return b + 7 * p[0] + p[1] * (level - 8);
    return b + 7 * p[0] + 8 * p[1] + p[2] * (level - 16);
  }

  /**
   * Minion life, ported from the extractor's `_minion_life`:
   * truncdiv((p3 + (lvl-1)*p4) * (100+p2) * (100+calc1) * (100+truncdiv(ulvl,2)), 1000000)
   * @returns {number}
   */
  minionLife(p2, p3, p4, calc1, lvl, ulvl) {
    const level = Number.isFinite(Number(lvl)) ? Number(lvl) : 1;
    const unit = Number.isFinite(Number(ulvl)) ? Number(ulvl) : 0;
    const base = (Number(p3) || 0) + (level - 1) * (Number(p4) || 0);
    const a = 100 + (Number(p2) || 0);
    const b = 100 + (Number(calc1) || 0);
    const c = 100 + Math.trunc(unit / 2);
    return Math.trunc((base * a * b * c) / 1000000);
  }

  /**
   * Validate if() function syntax
   * Checks that all if() calls have exactly 3 arguments
   * @param {string} formula - The formula to validate
   * @returns {object} Validation result with success flag and error message
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
   * @param {object} variables - Variable values (blvl, lvl, ulvl, etc.)
   * @returns {object} Evaluation result with success flag, value, and error message
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

    // Planner conditions: cond(while_wielding_twohanded_weapon) -> 1 or 0
    processed = processed.replace(/\bcond\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g, (_, key) =>
      isConditionSelected(key) ? '1' : '0'
    );
    
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
    const stats = context.characterState?.stats;

    return formula.replace(statRefPattern, (match, statName) => {
      const k = String(statName).toLowerCase();
      // Direct character_stats key (e.g. {{strength}}, {{life_stolen_per_hit}})
      // Prefer injected {{base_dexterity}} etc. when present (raw accrued attrs).
      if (stats && stats[k] !== undefined) {
        return String(stats[k]);
      }
      // stats.json alias via pairedStat reverse map (e.g. {{life_steal}} -> life_stolen_per_hit)
      // Also maps {{base_dexterity}} -> dexterity when base_* was not injected.
      const aliased = resolveCharacterStatKeyForToken(k);
      if (aliased && aliased !== k && stats && stats[aliased] !== undefined) {
        return String(stats[aliased]);
      }

      // If stat not found, return 0
      return '0';
    });
  }

  /**
   * Extract character stat references from a formula (for auto-fill of Character Stats field).
   * Does not include tokens inside [[skill_name]].{{stat_key}} — those resolve from the other skill, not character.
   * @param {string} formula - The formula to analyze
   * @returns {Array<string>} Array of stat names
   */
  extractStatReferences(formula) {
    if (!formula || typeof formula !== 'string') {
      return [];
    }

    const statRefPattern = /(?<!\]\]\.)\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
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
    // Cross-skill stat tokens are resolved in Skill before evaluate (numeric literals)
    let withoutSkillRefs = formula.replace(
      /\[\[[a-zA-Z_][a-zA-Z0-9_]*\]\]\.\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g,
      '0'
    );
    // Plain skill references (blvl)
    withoutSkillRefs = withoutSkillRefs.replace(/\[\[[a-zA-Z_][a-zA-Z0-9_]*(?::[a-zA-Z_][a-zA-Z0-9_]*)?\]\]/g, '0');
    
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
      for (const [name, func] of this.functionRegistry) {
        context[name] = func;
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
      throw new Error(`Formula evaluation failed: ${error.message}`, { cause: error });
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
