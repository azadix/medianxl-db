#!/usr/bin/env python3
"""
Validate skill placeholders in the skills database.

This script checks:
1. Whether placeholders expand properly or result in "unknown stat"
2. Whether stats referenced in placeholders exist in the database
3. Whether scaling data exists for placeholders that need it

Note: Template syntax validation (unclosed braces, etc.) is now handled
by the edit page's client-side validation before saving.
"""

import sqlite3
import re
import sys
from collections import defaultdict


def get_stat_parameter_count(cursor, stat_key):
    """
    Get the number of parameters a stat format needs.
    """
    cursor.execute("SELECT format FROM stats WHERE LOWER(key) = ?", (stat_key.lower(),))
    row = cursor.fetchone()
    
    if not row:
        return 0
    
    format_str = row[0] or '{name}: {value}'
    
    # Count value placeholders
    value_matches = re.findall(r'\{value\d*\}', format_str)
    percent_matches = re.findall(r'%value\d*%', format_str)
    
    return max(len(value_matches), len(percent_matches))


def check_placeholder_validity(cursor, skill_id, skill_name, description):
    """
    Check if placeholders in the description are valid and can be expanded.
    Returns a list of issues found.
    """
    issues = []
    
    if not description:
        return issues
    
    # Find all placeholders
    placeholder_pattern = r'\{\{([^}]+)\}\}'
    placeholders = re.findall(placeholder_pattern, description)
    
    for placeholder in placeholders:
        # Parse placeholder
        parts = placeholder.split(':')
        if len(parts) < 1:
            continue
        
        stat_key = parts[0].strip().lower()
        
        # Check if stat exists
        cursor.execute("SELECT id, name, format FROM stats WHERE LOWER(key) = ?", (stat_key,))
        stat_row = cursor.fetchone()
        
        if not stat_row:
            issues.append(f"Unknown stat key: '{parts[0].strip()}' in placeholder {{{{{placeholder}}}}}")
            continue
        
        stat_id, stat_name, stat_format = stat_row
        
        # If there are inline values (not placeholders like %value0%), that's OK
        if len(parts) > 1:
            values = [v.strip() for v in parts[1].split(',')]
            # Check if these are placeholder tokens or actual values
            has_placeholders = any(re.match(r'%?value\d*%?', v, re.IGNORECASE) for v in values)
            
            if not has_placeholders:
                # Inline concrete values - these are always OK
                continue
        
        # Check if scaling data exists for this skill and stat
        cursor.execute("""
            SELECT COUNT(*) 
            FROM skill_scaling 
            WHERE skill_id = ? AND stat_id = ?
        """, (skill_id, stat_id))
        
        scaling_count = cursor.fetchone()[0]
        
        if scaling_count == 0:
            # No scaling data - check if inline values were provided
            if len(parts) == 1:
                issues.append(f"No scaling data for stat '{parts[0].strip()}'")
    
    return issues


def validate_skills(db_path='skills.sqlite'):
    """
    Main validation function.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("=" * 80)
    print("SKILL PLACEHOLDER VALIDATION")
    print("=" * 80)
    print()
    print("Note: Template syntax errors (unclosed braces, etc.) are now checked")
    print("      by the edit page before saving. This script only validates")
    print("      placeholder content against the database.")
    print()
    
    # Get all skills with descriptions
    cursor.execute("""
        SELECT s.id, s.name, s.display_name, s.description, s.restriction
        FROM skills s
        WHERE s.description IS NOT NULL AND s.description != ''
        ORDER BY s.name
    """)
    
    skills = cursor.fetchall()
    print(f"Found {len(skills)} skills with descriptions\n")
    
    placeholder_errors = defaultdict(list)
    total_placeholder_issues = 0
    
    for skill_id, skill_name, display_name, description, restriction in skills:
        # Check description
        desc_placeholder_issues = check_placeholder_validity(cursor, skill_id, display_name, description)
        
        if desc_placeholder_issues:
            placeholder_errors[display_name].extend([f"[Description] {issue}" for issue in desc_placeholder_issues])
            total_placeholder_issues += len(desc_placeholder_issues)
        
        # Check restriction if it exists
        if restriction:
            rest_placeholder_issues = check_placeholder_validity(cursor, skill_id, display_name, restriction)
            
            if rest_placeholder_issues:
                placeholder_errors[display_name].extend([f"[Restriction] {issue}" for issue in rest_placeholder_issues])
                total_placeholder_issues += len(rest_placeholder_issues)
    
    if placeholder_errors:
        print("=" * 80)
        print("PLACEHOLDER VALIDATION ERRORS")
        print("=" * 80)
        print()
        
        for skill_name, issues in sorted(placeholder_errors.items()):
            print(f"[X] {skill_name}")
            for issue in issues:
                print(f"    - {issue}")
            print()
    else:
        print("[OK] No placeholder validation errors found!")
        print()
    
    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total skills checked: {len(skills)}")
    print(f"Skills with placeholder errors: {len(placeholder_errors)}")
    print(f"Total placeholder issues: {total_placeholder_issues}")
    print()
    
    conn.close()
    
    # Return non-zero exit code if errors were found
    if placeholder_errors:
        return 1
    return 0


if __name__ == '__main__':
    exit_code = validate_skills()
    sys.exit(exit_code)
