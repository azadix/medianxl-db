#!/usr/bin/env python3
"""
Simple migration runner for MedianXL Skills Database
Usage: python migrate.py [database_path] [target_version]
"""

import sqlite3
import sys
import os
import re
from pathlib import Path

def get_current_version(conn):
    """Get the current schema version from the database."""
    try:
        cursor = conn.execute("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
        result = cursor.fetchone()
        return result[0] if result else 0
    except sqlite3.OperationalError:
        # schema_version table doesn't exist, assume version 0
        return 0

def get_available_migrations():
    """Get list of available migration files."""
    sql_dir = Path(__file__).parent
    migrations = []
    
    for file in sql_dir.glob("*.sql"):
        if file.name == "00_initialize_database.sql":
            continue
            
        # Extract version number from filename (e.g., "01_migration.sql" -> 1)
        match = re.match(r"(\d+)_.*\.sql", file.name)
        if match:
            version = int(match.group(1))
            migrations.append((version, file))
    
    return sorted(migrations, key=lambda x: x[0])

def apply_migration(conn, migration_file):
    """Apply a single migration file."""
    print(f"Applying migration: {migration_file.name}")
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    try:
        conn.executescript(sql_content)
        print(f"✓ Successfully applied {migration_file.name}")
        return True
    except sqlite3.Error as e:
        print(f"✗ Error applying {migration_file.name}: {e}")
        return False

def initialize_database(conn):
    """Initialize a new database with the base schema."""
    init_file = Path(__file__).parent / "00_initialize_database.sql"
    
    if not init_file.exists():
        print("Error: 00_initialize_database.sql not found")
        return False
    
    print("Initializing new database...")
    return apply_migration(conn, init_file)

def main():
    if len(sys.argv) < 2:
        print("Usage: python migrate.py <database_path> [target_version]")
        print("Example: python migrate.py ../skills.sqlite")
        print("Example: python migrate.py ../skills.sqlite 3")
        sys.exit(1)
    
    db_path = sys.argv[1]
    target_version = int(sys.argv[2]) if len(sys.argv) > 2 else None
    
    # Check if database exists
    db_exists = os.path.exists(db_path)
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    
    try:
        current_version = get_current_version(conn)
        print(f"Current database version: {current_version}")
        
        # If database is new (version 0), initialize it
        if current_version == 0:
            if not initialize_database(conn):
                sys.exit(1)
            current_version = get_current_version(conn)
        
        # Get available migrations
        migrations = get_available_migrations()
        
        if not migrations:
            print("No migration files found")
            return
        
        # Determine target version
        if target_version is None:
            target_version = max(m[0] for m in migrations)
        
        print(f"Target version: {target_version}")
        
        # Apply migrations
        applied_count = 0
        for version, migration_file in migrations:
            if version <= current_version:
                continue
                
            if version > target_version:
                break
                
            if not apply_migration(conn, migration_file):
                print(f"Migration failed at version {version}")
                sys.exit(1)
                
            applied_count += 1
        
        if applied_count == 0:
            print("Database is already up to date")
        else:
            final_version = get_current_version(conn)
            print(f"✓ Successfully migrated from version {current_version} to {final_version}")
            print(f"Applied {applied_count} migration(s)")
    
    finally:
        conn.close()

if __name__ == "__main__":
    main()
