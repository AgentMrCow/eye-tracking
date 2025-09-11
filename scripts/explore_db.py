#!/usr/bin/env python3
"""
Database exploration script for eye_tracking.db
Analyzes the database structure, tables, and sample data
"""

import sqlite3
import json
import os
from pathlib import Path

def connect_to_db():
    """Connect to the eye tracking database"""
    db_paths = [
        'src-tauri/resources/eye_tracking.db',
        'src-tauri/target/debug/resources/eye_tracking.db'
    ]
    
    for db_path in db_paths:
        if os.path.exists(db_path):
            print(f"Found database at: {db_path}")
            return sqlite3.connect(db_path)
    
    raise FileNotFoundError("Could not find eye_tracking.db in expected locations")

def get_all_tables(cursor):
    """Get all table names in the database"""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    return [row[0] for row in cursor.fetchall()]

def analyze_table(cursor, table_name):
    """Analyze a specific table structure and sample data"""
    print(f"\n{'='*60}")
    print(f"TABLE: {table_name}")
    print('='*60)
    
    # Get table info
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    
    print("COLUMNS:")
    for col in columns:
        cid, name, dtype, notnull, default, pk = col
        pk_str = " (PRIMARY KEY)" if pk else ""
        notnull_str = " NOT NULL" if notnull else ""
        default_str = f" DEFAULT {default}" if default is not None else ""
        print(f"  {name}: {dtype}{pk_str}{notnull_str}{default_str}")
    
    # Get row count
    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    row_count = cursor.fetchone()[0]
    print(f"\nROW COUNT: {row_count}")
    
    # Get sample data
    if row_count > 0:
        cursor.execute(f"SELECT * FROM {table_name} LIMIT 3")
        sample_rows = cursor.fetchall()
        
        print(f"\nSAMPLE DATA (first 3 rows):")
        col_names = [desc[0] for desc in cursor.description]
        
        for i, row in enumerate(sample_rows, 1):
            print(f"\nRow {i}:")
            for col_name, value in zip(col_names, row):
                # Truncate long values
                if isinstance(value, str) and len(value) > 100:
                    value = value[:100] + "..."
                print(f"  {col_name}: {value}")
    
    return {
        'name': table_name,
        'columns': [{'name': col[1], 'type': col[2], 'pk': bool(col[5])} for col in columns],
        'row_count': row_count
    }

def analyze_relationships(cursor, tables_info):
    """Analyze foreign key relationships between tables"""
    print(f"\n{'='*60}")
    print("FOREIGN KEY RELATIONSHIPS")
    print('='*60)
    
    relationships = []
    for table_info in tables_info:
        table_name = table_info['name']
        cursor.execute(f"PRAGMA foreign_key_list({table_name})")
        fks = cursor.fetchall()
        
        for fk in fks:
            id_fk, seq, table_ref, from_col, to_col, on_update, on_delete, match = fk
            relationship = {
                'from_table': table_name,
                'from_column': from_col,
                'to_table': table_ref,
                'to_column': to_col
            }
            relationships.append(relationship)
            print(f"{table_name}.{from_col} -> {table_ref}.{to_col}")
    
    if not relationships:
        print("No explicit foreign key constraints found")
    
    return relationships

def analyze_indexes(cursor):
    """Analyze database indexes"""
    print(f"\n{'='*60}")
    print("INDEXES")
    print('='*60)
    
    cursor.execute("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL")
    indexes = cursor.fetchall()
    
    if indexes:
        for name, table, sql in indexes:
            print(f"{name} on {table}:")
            print(f"  {sql}")
    else:
        print("No custom indexes found")

def main():
    """Main analysis function"""
    print("Eye Tracking Database Analysis")
    print("=" * 60)
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get all tables
        tables = get_all_tables(cursor)
        print(f"Found {len(tables)} tables: {', '.join(tables)}")
        
        # Analyze each table
        tables_info = []
        for table in tables:
            table_info = analyze_table(cursor, table)
            tables_info.append(table_info)
        
        # Analyze relationships
        relationships = analyze_relationships(cursor, tables_info)
        
        # Analyze indexes
        analyze_indexes(cursor)
        
        # Summary
        print(f"\n{'='*60}")
        print("SUMMARY")
        print('='*60)
        total_rows = sum(t['row_count'] for t in tables_info)
        print(f"Total tables: {len(tables)}")
        print(f"Total rows across all tables: {total_rows}")
        print(f"Tables by size:")
        for table_info in sorted(tables_info, key=lambda x: x['row_count'], reverse=True):
            print(f"  {table_info['name']}: {table_info['row_count']:,} rows")
        
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
