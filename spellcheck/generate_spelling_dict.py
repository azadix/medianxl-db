import sqlite3
import os
import sys
import re
import argparse
from collections import Counter
from pathlib import Path

def extract_words(text):
    """
    Extract words from text, ignoring placeholders and special formatting.
    
    Args:
        text (str): Text to extract words from
        
    Returns:
        list: List of words found in the text
    """
    if not text:
        return []
    
    # Remove placeholder syntax: {{...}} and [[...]]
    text = re.sub(r'\{\{[^}]*\}\}', '', text)
    text = re.sub(r'\[\[[^\]]*\]\]', '', text)
    
    # Remove special characters but keep apostrophes and hyphens within words
    # Split on whitespace and punctuation
    words = re.findall(r'\b[a-zA-Z]+(?:[\'-][a-zA-Z]+)*\b', text)
    
    return [word.lower() for word in words if len(word) > 1]  # Ignore single characters

def generate_dictionary(db_path, output_file, min_word_length=2, min_occurrences=1):
    """
    Generate a spelling dictionary from all words in the database.
    
    Args:
        db_path (str): Path to SQLite database
        output_file (str): Path to output dictionary file
        min_word_length (int): Minimum word length to include (default: 2)
        min_occurrences (int): Minimum occurrences to include (default: 1)
    """
    # Connect to database
    db_full_path = db_path if db_path.startswith('/') or db_path.startswith('../') else f'../{db_path}'
    
    if not os.path.exists(db_full_path):
        print(f"Error: Database file not found: {db_full_path}")
        sys.exit(1)
    
    print(f"Reading database: {db_full_path}")
    
    conn = sqlite3.connect(db_full_path)
    cursor = conn.cursor()
    
    # Get all skills with description, restriction, or skill_effect
    cursor.execute("""
        SELECT description, restriction, skill_effect
        FROM skills
        WHERE (description IS NOT NULL AND description != '')
           OR (restriction IS NOT NULL AND restriction != '')
           OR (skill_effect IS NOT NULL AND skill_effect != '')
    """)
    
    skills = cursor.fetchall()
    print(f"Found {len(skills)} skills to process\n")
    
    # Collect all words
    all_words = []
    
    for description, restriction, skill_effect in skills:
        if description:
            all_words.extend(extract_words(description))
        if restriction:
            all_words.extend(extract_words(restriction))
        if skill_effect:
            all_words.extend(extract_words(skill_effect))
    
    conn.close()
    
    # Count word occurrences
    word_counts = Counter(all_words)
    
    # Filter by minimum length and occurrences
    filtered_words = {
        word: count 
        for word, count in word_counts.items() 
        if len(word) >= min_word_length and count >= min_occurrences
    }
    
    # Sort alphabetically
    sorted_words = sorted(filtered_words.keys())
    
    print(f"Total words extracted: {len(all_words)}")
    print(f"Unique words found: {len(word_counts)}")
    print(f"Words after filtering (length >= {min_word_length}, occurrences >= {min_occurrences}): {len(filtered_words)}")
    print()
    
    # Write to file
    output_path = Path(output_file)
    # Handle relative paths - if not absolute and doesn't exist, try relative to script directory
    if not output_path.is_absolute() and not output_path.exists():
        script_dir = Path(__file__).parent
        output_path = script_dir / output_file
    
    # Create parent directory if it doesn't exist
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            for word in sorted_words:
                f.write(f"{word}\n")
        
        print(f"Dictionary saved to: {output_path.absolute()}")
        print(f"Total words written: {len(sorted_words)}")
        
        # Show some statistics
        if filtered_words:
            print("\nMost common words:")
            for word, count in word_counts.most_common(10):
                if len(word) >= min_word_length:
                    print(f"  {word}: {count} occurrences")
        
    except Exception as e:
        print(f"Error writing dictionary file: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='Generate spelling dictionary from database content')
    parser.add_argument('db_path', nargs='?', default='../skills.sqlite', 
                       help='Path to the SQLite database file (default: ../skills.sqlite)')
    parser.add_argument('--output', '-o', default='py/spelling-dict.txt',
                       help='Output dictionary file path (default: py/spelling-dict.txt)')
    parser.add_argument('--min-length', type=int, default=2,
                       help='Minimum word length to include (default: 2)')
    parser.add_argument('--min-occurrences', type=int, default=1,
                       help='Minimum occurrences to include (default: 1)')
    
    args = parser.parse_args()
    
    generate_dictionary(args.db_path, args.output, args.min_length, args.min_occurrences)


if __name__ == '__main__':
    main()

