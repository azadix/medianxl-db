#!/usr/bin/env python3
"""
Extract all text lines that are NOT template placeholders from skill descriptions and restrictions.
"""

import sqlite3
import re
import sys
import argparse


def is_placeholder_line(line):
    """
    Check if a line is purely a placeholder or contains only placeholders.
    Returns True if the line is just placeholders, False if it has actual text.
    """
    if not line or not line.strip():
        return True  # Empty lines don't count as content
    
    # Remove all {{...}} placeholders
    without_placeholders = re.sub(r'\{\{[^}]+\}\}', '', line)
    
    # Remove all [[...]] skill representations
    without_placeholders = re.sub(r'\[\[[^\]]+\]\]', '', without_placeholders)
    
    # Check if there's any meaningful text left (not just whitespace/punctuation)
    remaining = without_placeholders.strip()
    
    # If only punctuation/whitespace remains, consider it a placeholder line
    if not remaining or remaining in ['', '.', ',', ':', '-', '–', '—']:
        return True
    
    return False


def extract_non_placeholder_lines(db_path='2.11.sqlite'):
    """
    Extract all non-placeholder text lines from skill descriptions and restrictions.
    """
    db_full_path = f'../db/{db_path}' if not db_path.startswith('/') and not db_path.startswith('../') else db_path
    conn = sqlite3.connect(db_full_path)
    cursor = conn.cursor()
    
    print("=" * 80)
    print("EXTRACTING NON-PLACEHOLDER TEXT LINES")
    print("=" * 80)
    print()
    
    # Get all skills with descriptions, skill effects, or restrictions
    cursor.execute("""
        SELECT s.id, s.name, s.display_name, c.name as class_name,
               s.description, s.skill_effect, s.restriction
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        WHERE (s.description IS NOT NULL AND s.description != '')
           OR (s.skill_effect IS NOT NULL AND s.skill_effect != '')
           OR (s.restriction IS NOT NULL AND s.restriction != '')
        ORDER BY c.name, s.display_name
    """)
    
    skills = cursor.fetchall()
    
    print(f"Checking {len(skills)} skills...\n")
    
    # Collect all unique non-placeholder lines
    all_lines = set()
    skill_line_map = {}  # Map line -> list of (skill_name, location)
    
    for skill_id, skill_name, display_name, class_name, description, skill_effect, restriction in skills:
        # Check description
        if description:
            lines = description.split('\n')
            for line in lines:
                if not is_placeholder_line(line):
                    clean_line = line.strip()
                    all_lines.add(clean_line)
                    
                    if clean_line not in skill_line_map:
                        skill_line_map[clean_line] = []
                    skill_line_map[clean_line].append((display_name, 'Description', class_name or 'No Class'))
        
        # Check skill effect
        if skill_effect:
            lines = skill_effect.split('\n')
            for line in lines:
                if not is_placeholder_line(line):
                    clean_line = line.strip()
                    all_lines.add(clean_line)
                    
                    if clean_line not in skill_line_map:
                        skill_line_map[clean_line] = []
                    skill_line_map[clean_line].append((display_name, 'Skill Effect', class_name or 'No Class'))
        
        # Check restriction
        if restriction:
            lines = restriction.split('\n')
            for line in lines:
                if not is_placeholder_line(line):
                    clean_line = line.strip()
                    all_lines.add(clean_line)
                    
                    if clean_line not in skill_line_map:
                        skill_line_map[clean_line] = []
                    skill_line_map[clean_line].append((display_name, 'Restriction', class_name or 'No Class'))
    
    # Sort lines by occurrence count (most common first), then alphabetically
    sorted_lines = sorted(all_lines, key=lambda line: (-len(skill_line_map.get(line, [])), line))
    
    print(f"Found {len(sorted_lines)} unique non-placeholder text lines\n")
    
    # Output to stdout
    print("=" * 80)
    print("NON-PLACEHOLDER TEXT LINES FROM SKILL DESCRIPTIONS, SKILL EFFECTS, AND RESTRICTIONS")
    print("Sorted by occurrence count (most common first)")
    print("=" * 80)
    print()
    print(f"Total unique lines: {len(sorted_lines)}")
    print(f"Extracted from {len(skills)} skills")
    print()
    print("=" * 80)
    print()
    
    for line in sorted_lines:
        skills_using = skill_line_map.get(line, [])
        occurrence_count = len(skills_using)
        
        print(f"[{occurrence_count}x] {line}")
        
        # Show which skills use this line (limit to first 5)
        if skills_using:
            for skill_name, location, class_name in skills_using[:5]:
                print(f"  - {skill_name} ({class_name}) - {location}")
            if len(skills_using) > 5:
                print(f"  - ... and {len(skills_using) - 5} more")
        print()
    
    conn.close()
    return 0


def main():
    parser = argparse.ArgumentParser(description='Extract all text lines that are NOT template placeholders from skill descriptions and restrictions')
    parser.add_argument('db_path', help='Path to the SQLite database file (e.g., skills-2.11.sqlite)')
    
    args = parser.parse_args()
    
    exit_code = extract_non_placeholder_lines(args.db_path)
    sys.exit(exit_code)

if __name__ == '__main__':
    main()

