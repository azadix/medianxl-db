#!/usr/bin/env python3
"""
Script to extract skills that have descriptions but do NOT contain {{*}} placeholder format
from the skills.sqlite database.
"""

import sqlite3
import re
import sys
from pathlib import Path

def extract_skills_without_placeholders(db_path='skills.sqlite'):
    """
    Extract skills that have descriptions but do NOT contain {{*}} placeholder format.
    
    Args:
        db_path (str): Path to the SQLite database file
        
    Returns:
        list: List of tuples containing (skill_id, skill_name, display_name, description, class_name)
    """
    if not Path(db_path).exists():
        print(f"Error: Database file '{db_path}' not found!")
        return []
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Query to get all skills with descriptions that do NOT contain {{*}} format
        query = """
        SELECT s.id, s.name, s.display_name, s.description, c.name as class_name
        FROM skills s
        LEFT JOIN classes c ON s.class_id = c.id
        WHERE s.description IS NOT NULL 
        AND s.description != ''
        AND s.description NOT LIKE '%{{%}}%'
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

def has_placeholders(description):
    """
    Check if a description contains any placeholder patterns.
    
    Args:
        description (str): The skill description
        
    Returns:
        bool: True if placeholders are found, False otherwise
    """
    # Pattern to match {{...}} placeholders
    pattern = r'\{\{[^}]+\}\}'
    return bool(re.search(pattern, description))

def main():
    """Main function to run the extraction and display results."""
    print("Extracting skills with descriptions but NO {{*}} placeholder format...")
    print("=" * 70)
    
    # Extract skills without placeholders
    skills = extract_skills_without_placeholders()
    
    if not skills:
        print("No skills found with descriptions but no placeholder format.")
        return
    
    print(f"Found {len(skills)} skills with descriptions but no placeholders:\n")
    
    # Group by class for better organization
    current_class = None
    class_counts = {}
    
    for skill_id, skill_name, display_name, description, class_name in skills:
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
        desc_preview = description[:100] + "..." if len(description) > 100 else description
        print(f"    Description: {desc_preview}")
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
