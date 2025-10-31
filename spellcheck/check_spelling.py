import sqlite3
import os
import sys
import re
import argparse
from pathlib import Path

# Default dictionary files to load automatically
DEFAULT_DICT_FILES = [
    'spelling-dict.txt',
    # Add more dictionary files here as needed
]

# Default ignore dictionary files to load automatically
DEFAULT_IGNORE_FILES = [
    'ignore-dict.txt',
    # Add more ignore dictionary files here as needed
]

def load_dictionaries(dict_files):
    """
    Load words from multiple dictionary files.
    
    Args:
        dict_files (list): List of paths to dictionary files
        
    Returns:
        set: Set of all known words from all dictionaries
    """
    known_words = set()
    total_words_before = 0
    
    for dict_file in dict_files:
        # Handle relative paths
        dict_path = Path(dict_file)
        if not dict_path.is_absolute() and not dict_path.exists():
            # Try relative to script directory
            script_dir = Path(__file__).parent
            dict_path = script_dir / dict_file
        
        if not dict_path.exists():
            print(f"Warning: Dictionary file not found: {dict_path}")
            print(f"  Attempted path: {dict_path.absolute()}")
            continue
            
        try:
            words_from_file = set()
            with open(dict_path, 'r', encoding='utf-8') as f:
                for line in f:
                    word = line.strip().lower()
                    # Skip empty lines and comments
                    if word and not word.startswith('#'):
                        words_from_file.add(word)
                        known_words.add(word)
            
            total_words_before = len(known_words) - len(words_from_file)
            print(f"Loaded {len(words_from_file)} words from {dict_path.name} (total: {len(known_words)})")
        except Exception as e:
            print(f"Error reading dictionary file {dict_path}: {e}")
    
    return known_words

def load_ignore_dictionary(ignore_files):
    """
    Load words to ignore from ignore dictionary files.
    
    Args:
        ignore_files (list): List of paths to ignore dictionary files
        
    Returns:
        set: Set of all words to ignore during spelling check
    """
    ignore_words = set()
    
    if not ignore_files:
        return ignore_words
    
    for ignore_file in ignore_files:
        # Handle relative paths
        ignore_path = Path(ignore_file)
        if not ignore_path.is_absolute() and not ignore_path.exists():
            # Try relative to script directory
            script_dir = Path(__file__).parent
            ignore_path = script_dir / ignore_file
        
        if not ignore_path.exists():
            print(f"Warning: Ignore dictionary file not found: {ignore_path}")
            print(f"  Attempted path: {ignore_path.absolute()}")
            continue
            
        try:
            words_from_file = set()
            with open(ignore_path, 'r', encoding='utf-8') as f:
                for line in f:
                    word = line.strip().lower()
                    # Skip empty lines and comments
                    if word and not word.startswith('#'):
                        words_from_file.add(word)
                        ignore_words.add(word)
            
            print(f"Loaded {len(words_from_file)} words to ignore from {ignore_path.name} (total ignored: {len(ignore_words)})")
        except Exception as e:
            print(f"Error reading ignore dictionary file {ignore_path}: {e}")
    
    return ignore_words

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

def check_spelling(db_path, dict_files, ignore_files=None, min_word_length=2):
    """
    Check spelling in database fields against dictionary files.
    
    Args:
        db_path (str): Path to SQLite database
        dict_files (list): List of dictionary file paths
        ignore_files (list): List of ignore dictionary file paths (optional)
        min_word_length (int): Minimum word length to check (default: 2)
    """
    # Load dictionaries
    known_words = load_dictionaries(dict_files)
    
    # Load ignore dictionary
    ignore_words = load_ignore_dictionary(ignore_files) if ignore_files else set()
    if ignore_words:
        print(f"Total words to ignore: {len(ignore_words)}\n")
    
    if not known_words:
        print("Error: No words loaded from dictionaries!")
        sys.exit(1)
    
    print(f"\nTotal unique words in dictionary: {len(known_words)}")
    print(f"Checking database: {db_path}\n")
    
    # Connect to database
    db_full_path = db_path if db_path.startswith('/') or db_path.startswith('../') else f'../{db_path}'
    
    if not os.path.exists(db_full_path):
        print(f"Error: Database file not found: {db_full_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(db_full_path)
    cursor = conn.cursor()
    
    # Get all skills with description, restriction, or skill_effect
    cursor.execute("""
        SELECT id, name, display_name, description, restriction, skill_effect
        FROM skills
        WHERE (description IS NOT NULL AND description != '')
           OR (restriction IS NOT NULL AND restriction != '')
           OR (skill_effect IS NOT NULL AND skill_effect != '')
        ORDER BY display_name
    """)
    
    skills = cursor.fetchall()
    print(f"Found {len(skills)} skills to check\n")
    
    errors = []
    checked_words_count = 0
    
    for skill_id, name, display_name, description, restriction, skill_effect in skills:
        skill_errors = []
        
        # Check description
        if description:
            words = extract_words(description)
            checked_words_count += len(words)
            for word in words:
                if len(word) >= min_word_length and word not in known_words and word not in ignore_words:
                    skill_errors.append({
                        'field': 'description',
                        'word': word,
                        'context': description[:100]  # First 100 chars for context
                    })
        
        # Check restriction
        if restriction:
            words = extract_words(restriction)
            checked_words_count += len(words)
            for word in words:
                if len(word) >= min_word_length and word not in known_words and word not in ignore_words:
                    skill_errors.append({
                        'field': 'restriction',
                        'word': word,
                        'context': restriction[:100]
                    })
        
        # Check skill_effect
        if skill_effect:
            words = extract_words(skill_effect)
            checked_words_count += len(words)
            for word in words:
                if len(word) >= min_word_length and word not in known_words and word not in ignore_words:
                    skill_errors.append({
                        'field': 'skill_effect',
                        'word': word,
                        'context': skill_effect[:100]
                    })
        
        if skill_errors:
            errors.append({
                'skill_id': skill_id,
                'name': name,
                'display_name': display_name,
                'errors': skill_errors
            })
    
    conn.close()
    
    # Report results
    print("=" * 80)
    print("SPELLING CHECK RESULTS")
    print("=" * 80)
    print(f"Total words checked: {checked_words_count}")
    print(f"Skills with potential spelling errors: {len(errors)}")
    print()
    
    if errors:
        unique_unknown_words = set()
        for error_entry in errors:
            for err in error_entry['errors']:
                unique_unknown_words.add(err['word'])
        
        print(f"Unique unknown words found: {len(unique_unknown_words)}")
        print(f"Unknown words: {', '.join(sorted(unique_unknown_words))}")
        print()
        print("=" * 80)
        print("DETAILED ERRORS BY SKILL")
        print("=" * 80)
        print()
        
        for error_entry in errors:
            print(f"[{error_entry['display_name']}] (ID: {error_entry['skill_id']}, Name: {error_entry['name']})")
            for err in error_entry['errors']:
                print(f"  Field: {err['field']}")
                print(f"  Unknown word: '{err['word']}'")
                print(f"  Context: ...{err['context']}...")
                print()
    else:
        print("[OK] No spelling errors found!")
        print()
    
    return len(errors)


def main():
    parser = argparse.ArgumentParser(description='Check spelling in skills database against dictionary files')
    parser.add_argument('db_path', nargs='?', default='../skills.sqlite', 
                       help='Path to the SQLite database file (default: ../skills.sqlite)')
    parser.add_argument('--dict', nargs='+', default=None,
                       help='Path(s) to additional dictionary file(s) (can specify multiple). Default files are loaded automatically.')
    parser.add_argument('--ignore', nargs='+', default=None,
                       help='Path(s) to additional ignore dictionary file(s) - words in these files will be skipped (can specify multiple). Default files are loaded automatically.')
    parser.add_argument('--min-length', type=int, default=2,
                       help='Minimum word length to check (default: 2)')
    
    args = parser.parse_args()
    
    # Get script directory for resolving relative paths
    script_dir = Path(__file__).parent
    
    # Combine default dictionary files with any specified via command line
    dict_files = []
    if args.dict:
        dict_files.extend(args.dict)
    # Add default dictionary files (relative to script directory)
    for default_file in DEFAULT_DICT_FILES:
        default_path = script_dir / default_file
        if default_path.exists():
            dict_files.append(str(default_path))
        else:
            # Try as relative path
            dict_files.append(default_file)
    
    # Combine default ignore files with any specified via command line
    ignore_files = []
    if args.ignore:
        ignore_files.extend(args.ignore)
    # Add default ignore dictionary files (relative to script directory)
    for default_file in DEFAULT_IGNORE_FILES:
        default_path = script_dir / default_file
        if default_path.exists():
            ignore_files.append(str(default_path))
        else:
            # Try as relative path
            ignore_files.append(default_file)
    
    # Convert to None if empty list (so it's treated as optional)
    ignore_files = ignore_files if ignore_files else None
    
    exit_code = check_spelling(args.db_path, dict_files, ignore_files, args.min_length)
    sys.exit(0 if exit_code == 0 else 1)


if __name__ == '__main__':
    main()

