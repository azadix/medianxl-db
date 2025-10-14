#!/usr/bin/env python3
"""
Script to extract skills that contain {{*}} placeholder format in their descriptions
from the skills.sqlite database.
"""

import sqlite3
import re
import sys
from pathlib import Path

def extract_skills_with_placeholders(db_path='../skills-2.11.sqlite'):
    """
    Extract skills that contain {{*}} placeholder format in their descriptions.
    
    Args:
        db_path (str): Path to the SQLite database file
        
    Returns:
        list: List of tuples containing (skill_id, skill_name, display_name, description)
    """
    if not Path(db_path).exists():
        print(f"Error: Database file '{db_path}' not found!")
        return []
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Query to get all skills with descriptions or skill effects that contain {{*}} format
        query = """
        SELECT s.id, s.name, s.display_name, s.description, s.skill_effect, c.name as class_name
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        WHERE ((s.description IS NOT NULL AND s.description != '' AND s.description LIKE '%{{%}}%')
           OR (s.skill_effect IS NOT NULL AND s.skill_effect != '' AND s.skill_effect LIKE '%{{%}}%'))
        ORDER BY c.name, s.display_name
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        conn.close()
        return results
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return []
    except Exception as e:
        print(f"Error: {e}")
        return []

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
    print("Extracting skills with {{*}} placeholder format...")
    print("=" * 60)
    
    # Extract skills with placeholders
    skills = extract_skills_with_placeholders()
    
    if not skills:
        print("No skills found with {{*}} placeholder format in descriptions.")
        return
    
    print(f"Found {len(skills)} skills with placeholder format:\n")
    
    # Group by class for better organization
    current_class = None
    placeholder_stats = {}
    
    for skill_id, skill_name, display_name, description, skill_effect, class_name in skills:
        # Print class header if it changed
        if class_name != current_class:
            if current_class is not None:
                print()  # Add spacing between classes
            print(f"[CLASS] {class_name or 'No Class'}")
            print("-" * 40)
            current_class = class_name
        
        # Find placeholders in this skill's description and skill effect
        all_text = (description or '') + ' ' + (skill_effect or '')
        placeholders = analyze_placeholders(all_text)
        
        # Count placeholder types for statistics
        for placeholder in placeholders:
            # Extract the stat key (part before colon if present)
            stat_key = placeholder.replace('{{', '').replace('}}', '').split(':')[0].strip()
            placeholder_stats[stat_key] = placeholder_stats.get(stat_key, 0) + 1
        
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
        print("Most commonly used stat keys:")
        
        # Sort by usage count (descending)
        sorted_stats = sorted(placeholder_stats.items(), key=lambda x: x[1], reverse=True)
        
        for stat_key, count in sorted_stats:
            print(f"  {stat_key}: {count} times")
    
    print(f"\n[SUCCESS] Total skills with placeholders: {len(skills)}")
    print(f"[SUCCESS] Total unique stat keys used: {len(placeholder_stats)}")

if __name__ == "__main__":
    main()

