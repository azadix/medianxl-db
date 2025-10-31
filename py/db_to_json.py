import sqlite3
import json
import os
import argparse
from pathlib import Path

def export_database_to_json(db_name):
    """Export all tables from the SQLite database to separate JSON files"""
    
    # Database path
    db_path = f'../{db_name}' if not db_name.startswith('/') and not db_name.startswith('../') else db_name
    
    if not os.path.exists(db_path):
        print(f"Database file not found: {db_path}")
        return
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # This enables column access by name
    cursor = conn.cursor()
    
    # Get all table names
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    
    print(f"Found {len(tables)} tables to export:")
    for table in tables:
        print(f"  - {table}")
    
    # Create output directory
    output_dir = Path('json_export')
    output_dir.mkdir(exist_ok=True)
    
    # Export each table
    for table_name in tables:
        try:
            print(f"\nExporting table: {table_name}")
            
            # Get table structure
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns_info = cursor.fetchall()
            print(f"  Columns: {[col[1] for col in columns_info]}")
            
            # Get all data from table
            cursor.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()
            
            # Convert rows to list of dictionaries
            data = []
            for row in rows:
                # Convert sqlite3.Row to dictionary
                row_dict = dict(row)
                # Handle any special data types
                for key, value in row_dict.items():
                    if isinstance(value, bytes):
                        # Convert binary data to base64 string
                        import base64
                        row_dict[key] = base64.b64encode(value).decode('utf-8')
                
                data.append(row_dict)
            
            # Write to JSON file
            output_file = output_dir / f"{table_name}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"  [OK] Exported {len(data)} rows to {output_file}")
            
        except Exception as e:
            print(f"  [ERROR] Error exporting table {table_name}: {e}")
    
    # Get some statistics
    print(f"\n[STATS] Database Statistics:")
    for table_name in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f"  {table_name}: {count} rows")
        except Exception as e:
            print(f"  {table_name}: Error getting count - {e}")
    
    conn.close()
    print(f"\n[COMPLETE] Export completed! Files saved to: {output_dir.absolute()}")

def build_database_from_json(db_name):
    """Build SQLite database from JSON files"""
    
    json_dir = Path('json_export')
    if not json_dir.exists():
        print(f"JSON export directory not found: {json_dir}")
        return
    
    # Database path
    db_path = f'../{db_name}' if not db_name.startswith('/') and not db_name.startswith('../') else db_name
    
    # Remove existing database if it exists
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"Removed existing database: {db_path}")
    
    # Connect to new database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all JSON files
    json_files = list(json_dir.glob('*.json'))
    if not json_files:
        print("No JSON files found in json_export directory")
        return
    
    print(f"Found {len(json_files)} JSON files to import:")
    for json_file in json_files:
        print(f"  - {json_file.name}")
    
    # Import each JSON file
    for json_file in json_files:
        table_name = json_file.stem  # filename without extension
        try:
            print(f"\nImporting table: {table_name}")
            
            # Load JSON data
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not data:
                print(f"  [SKIP] No data in {table_name}.json")
                continue
            
            # Get column names from first row
            columns = list(data[0].keys())
            print(f"  Columns: {columns}")
            
            # Create table with proper schema
            # First, determine column types based on data
            column_defs = []
            for col in columns:
                # Check all rows to determine type (more comprehensive)
                sample_values = [row[col] for row in data if row[col] is not None]
                if not sample_values:
                    column_defs.append(f"{col} TEXT")
                else:
                    # More sophisticated type detection
                    all_int = True
                    all_float = True
                    all_numeric = True
                    
                    for val in sample_values:
                        # Handle string representations of numbers
                        if isinstance(val, str):
                            # Skip empty strings for type detection
                            if not val.strip():
                                continue
                            # Try to convert string to number
                            try:
                                if '.' in val or 'e' in val.lower():
                                    float(val)
                                    all_int = False
                                else:
                                    int(val)
                            except ValueError:
                                all_numeric = False
                                break
                        elif isinstance(val, (int, float)):
                            if not isinstance(val, int):
                                all_int = False
                            if not isinstance(val, float):
                                all_float = False
                        else:
                            all_numeric = False
                            break
                    
                    if all_numeric and all_int:
                        column_defs.append(f"{col} INTEGER")
                    elif all_numeric and all_float:
                        column_defs.append(f"{col} REAL")
                    else:
                        column_defs.append(f"{col} TEXT")
            
            # Create table
            create_sql = f"CREATE TABLE {table_name} ({', '.join(column_defs)})"
            cursor.execute(create_sql)
            
            # Insert data preserving order with proper type conversion
            placeholders = ', '.join(['?' for _ in columns])
            insert_sql = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
            
            for row in data:
                values = []
                for col in columns:
                    val = row[col]
                    
                    # Convert string numbers back to proper types based on column type
                    if isinstance(val, str) and val.strip():
                        # Check if this column should be numeric
                        col_def = next((defn for defn in column_defs if defn.startswith(f"{col} ")), "")
                        if "INTEGER" in col_def:
                            try:
                                val = int(val)
                            except ValueError:
                                pass  # Keep as string if conversion fails
                        elif "REAL" in col_def:
                            try:
                                val = float(val)
                            except ValueError:
                                pass  # Keep as string if conversion fails
                    elif isinstance(val, str) and not val.strip() and val != "":
                        # Handle empty strings - keep as empty string, not convert to None
                        pass
                    
                    values.append(val)
                
                cursor.execute(insert_sql, values)
            
            print(f"  [OK] Imported {len(data)} rows to {table_name}")
            
        except Exception as e:
            print(f"  [ERROR] Error importing table {table_name}: {e}")
    
    # Commit and close
    conn.commit()
    conn.close()
    
    print(f"\n[COMPLETE] Database built successfully: {db_path}")
    
    # Verify the built database
    print(f"\n[VERIFY] Verifying built database:")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    
    for table_name in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        print(f"  {table_name}: {count} rows")
    
    conn.close()

def main():
    parser = argparse.ArgumentParser(description='Export SQLite database to JSON or build database from JSON')
    parser.add_argument('--build', action='store_true', 
                       help='Build SQLite database from JSON files instead of exporting to JSON')
    parser.add_argument('db_name', nargs='?', default='skills.sqlite', help='Database filename (default: skills.sqlite)')
    
    args = parser.parse_args()
    
    if args.build:
        print(f"Building SQLite database '{args.db_name}' from JSON files...")
        build_database_from_json(args.db_name)
    else:
        print(f"Exporting SQLite database '{args.db_name}' to JSON files...")
        export_database_to_json(args.db_name)

if __name__ == "__main__":
    main()
