#!/usr/bin/env python3
"""
Script to extract skills that contain {{*}} placeholder format in their descriptions
from the skills.sqlite database.
"""

import sqlite3
import re
import sys
import argparse
from pathlib import Path

def extract_skills_with_placeholders(db_path='../skills-2.11.sqlite'):
    """
    Extract skills that contain {{*}} placeholder format in their descriptions.
    
    Args:
        db_path (str): Path to the SQLite database file
        
    Returns:
        tuple: (skills_list, all_stat_keys) where skills_list contains skill data and all_stat_keys contains all available stat keys
    """
    db_full_path = f'../{db_path}' if not db_path.startswith('/') and not db_path.startswith('../') else db_path
    if not Path(db_full_path).exists():
        print(f"Error: Database file '{db_full_path}' not found!")
        return [], []
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_full_path)
        cursor = conn.cursor()
        
        # First, get all stat keys from the stats table
        cursor.execute("SELECT key FROM stats ORDER BY key")
        all_stat_keys = [row[0] for row in cursor.fetchall()]
        
        # Query to get all skills with descriptions, skill effects, or restrictions that contain {{*}} format
        query = """
        SELECT s.id, s.name, s.display_name, s.description, s.skill_effect, s.restriction, c.name as class_name
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        WHERE ((s.description IS NOT NULL AND s.description != '' AND s.description LIKE '%{{%}}%')
           OR (s.skill_effect IS NOT NULL AND s.skill_effect != '' AND s.skill_effect LIKE '%{{%}}%')
           OR (s.restriction IS NOT NULL AND s.restriction != '' AND s.restriction LIKE '%{{%}}%'))
        ORDER BY c.name, s.display_name
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        conn.close()
        return results, all_stat_keys
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return [], []
    except Exception as e:
        print(f"Error: {e}")
        return [], []

def analyze_placeholders(description):
    """
    Analyze the description to find all placeholder patterns.
    
    Args:
        description (str): The skill description
        
    Returns:
        list: List of found placeholder patterns
    """
    # Pattern to match {{...}} placeholders
    pattern = r'\{\{[^}]+\}\}'
    matches = re.findall(pattern, description)
    return matches

def main():
    """Main function to run the extraction and display results."""
    parser = argparse.ArgumentParser(description='Extract skills that contain {{*}} placeholder format in their descriptions')
    parser.add_argument('db_path', help='Path to the SQLite database file (e.g., skills-2.11.sqlite)')
    
    args = parser.parse_args()
    
    print("Extracting skills with {{*}} placeholder format...")
    print("=" * 60)
    
    # Extract skills with placeholders and get all stat keys
    skills, all_stat_keys = extract_skills_with_placeholders(args.db_path)
    
    if not skills:
        print("No skills found with {{*}} placeholder format in descriptions.")
        return
    
    print(f"Found {len(skills)} skills with placeholder format:\n")
    
    # Group by class for better organization
    current_class = None
    placeholder_stats = {}
    
    # Initialize all stat keys with 0 usage
    for stat_key in all_stat_keys:
        placeholder_stats[stat_key] = 0
    
    for skill_id, skill_name, display_name, description, skill_effect, restriction, class_name in skills:
        # Print class header if it changed
        if class_name != current_class:
            if current_class is not None:
                print()  # Add spacing between classes
            print(f"[CLASS] {class_name or 'No Class'}")
            print("-" * 40)
            current_class = class_name
        
        # Find placeholders in this skill's description, skill effect, and restriction
        all_text = (description or '') + ' ' + (skill_effect or '') + ' ' + (restriction or '')
        placeholders = analyze_placeholders(all_text)
        
        # Count placeholder types for statistics
        for placeholder in placeholders:
            # Extract the stat key (part before colon if present)
            stat_key = placeholder.replace('{{', '').replace('}}', '').split(':')[0].strip()
            if stat_key in placeholder_stats:
                placeholder_stats[stat_key] += 1
        
        # Print skill info
        print(f"  - {display_name} (ID: {skill_id})")
        print(f"    Key: {skill_name}")
        print(f"    Placeholders: {', '.join(placeholders)}")
        print()
    
    # Print statistics
    if placeholder_stats:
        print("=" * 60)
        print("PLACEHOLDER STATISTICS")
        print("=" * 60)
        print("All stat keys and their usage count:")
        
        # Sort by usage count (descending), then by stat key
        sorted_stats = sorted(placeholder_stats.items(), key=lambda x: (-x[1], x[0]))
        
        for stat_key, count in sorted_stats:
            print(f"  {stat_key}: {count} times")
    
    used_stats = sum(1 for count in placeholder_stats.values() if count > 0)
    unused_stats = sum(1 for count in placeholder_stats.values() if count == 0)
    
    print(f"\n[SUCCESS] Total skills with placeholders: {len(skills)}")
    print(f"[SUCCESS] Total stat keys in database: {len(all_stat_keys)}")
    print(f"[SUCCESS] Stat keys used: {used_stats}")
    print(f"[SUCCESS] Stat keys unused: {unused_stats}")

if __name__ == "__main__":
    main()

