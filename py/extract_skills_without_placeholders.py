#!/usr/bin/env python3
"""
Script to extract skills that have descriptions but do NOT contain {{*}} placeholder format
from the skills.sqlite database.
"""

import sqlite3
import argparse
from pathlib import Path

def extract_skills_without_placeholders(db_path='../skills-2.11.sqlite'):
    """
    Extract skills that have descriptions but do NOT contain {{*}} placeholder format.
    
    Args:
        db_path (str): Path to the SQLite database file
        
    Returns:
        list: List of tuples containing (skill_id, skill_name, display_name, description, class_name)
    """
    db_full_path = f'../{db_path}' if not db_path.startswith('/') and not db_path.startswith('../') else db_path
    if not Path(db_full_path).exists():
        print(f"Error: Database file '{db_full_path}' not found!")
        return []
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_full_path)
        cursor = conn.cursor()
        
        # Query to get all skills with descriptions or skill effects that do NOT contain {{*}} format
        query = """
        SELECT s.id, s.name, s.display_name, s.description, s.skill_effect, c.name as class_name
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        WHERE ((s.description IS NOT NULL AND s.description != '')
           OR (s.skill_effect IS NOT NULL AND s.skill_effect != ''))
        AND (s.description IS NULL OR s.description = '' OR s.description NOT LIKE '%{{%}}%')
        AND (s.skill_effect IS NULL OR s.skill_effect = '' OR s.skill_effect NOT LIKE '%{{%}}%')
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

def main():
    """Main function to run the extraction and display results."""
    parser = argparse.ArgumentParser(description='Extract skills that have descriptions but do NOT contain {{*}} placeholder format')
    parser.add_argument('db_path', help='Path to the SQLite database file (e.g., skills-2.11.sqlite)')
    
    args = parser.parse_args()
    
    print("Extracting skills with descriptions but NO {{*}} placeholder format...")
    print("=" * 70)
    
    # Extract skills without placeholders
    skills = extract_skills_without_placeholders(args.db_path)
    
    if not skills:
        print("No skills found with descriptions but no placeholder format.")
        return
    
    print(f"Found {len(skills)} skills with descriptions but no placeholders:\n")
    
    # Group by class for better organization
    current_class = None
    class_counts = {}
    
    for skill_id, skill_name, display_name, description, skill_effect, class_name in skills:
        # Count skills per class
        class_counts[class_name or 'No Class'] = class_counts.get(class_name or 'No Class', 0) + 1
        
        # Print class header if it changed
        if class_name != current_class:
            if current_class is not None:
                print()  # Add spacing between classes
            print(f"[CLASS] {class_name or 'No Class'}")
            print("-" * 50)
            current_class = class_name
        
        # Print skill info
        print(f"  - {display_name} (ID: {skill_id})")
        print(f"    Key: {skill_name}")
        
        # Show first 100 characters of description
        if description:
            desc_preview = description[:100] + "..." if len(description) > 100 else description
            print(f"    Description: {desc_preview}")
        
        # Show first 100 characters of skill effect
        if skill_effect:
            effect_preview = skill_effect[:100] + "..." if len(skill_effect) > 100 else skill_effect
            print(f"    Skill Effect: {effect_preview}")
        print()
    
    # Print statistics
    print("=" * 70)
    print("STATISTICS")
    print("=" * 70)
    print("Skills per class:")
    
    # Sort classes by count (descending)
    sorted_classes = sorted(class_counts.items(), key=lambda x: x[1], reverse=True)
    
    for class_name, count in sorted_classes:
        print(f"  {class_name}: {count} skills")
    
    print(f"\n[SUCCESS] Total skills with descriptions but no placeholders: {len(skills)}")
    print(f"[SUCCESS] Total classes represented: {len(class_counts)}")

if __name__ == "__main__":
    main()

