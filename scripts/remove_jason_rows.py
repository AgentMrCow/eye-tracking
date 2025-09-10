import os
import sqlite3
import json
from typing import Dict, List, Any


def quote_ident(ident: str) -> str:
    """Safely quote an SQLite identifier (table/column name)."""
    return '"' + ident.replace('"', '""') + '"'


def main() -> None:
    repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
    db_path = os.path.join(repo_root, 'src-tauri', 'resources', 'eye_tracking.db')
    if not os.path.exists(db_path):
        print(json.dumps({
            'ok': False,
            'error': f'Database not found at {db_path}'
        }))
        return

    pattern_raw = 'Jason'
    pattern = '%jason%'

    summary: Dict[str, Any] = {
        'ok': True,
        'db_path': db_path,
        'pattern': pattern_raw,
        'tables': {},
        'total_deleted': 0,
    }

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        table_rows = cur.fetchall()
        tables = [r[0] for r in table_rows]

        for table in tables:
            tname = str(table)
            tquoted = quote_ident(tname)

            # Get columns and PK info
            cur.execute(f"PRAGMA table_info({tquoted})")
            cols = cur.fetchall()
            col_names = [c['name'] for c in cols]
            pk_cols = [c['name'] for c in cols if int(c['pk']) > 0]

            if not col_names:
                continue

            # Build OR conditions over all columns, casting to TEXT and lowercasing
            where_terms = [f"LOWER(CAST({quote_ident(c)} AS TEXT)) LIKE ?" for c in col_names]
            where_clause = " OR ".join(where_terms)
            params = [pattern] * len(where_terms)

            # Count matches
            cur.execute(f"SELECT COUNT(*) as cnt FROM {tquoted} WHERE {where_clause}", params)
            count = int(cur.fetchone()[0])
            if count == 0:
                continue

            # Try to fetch identifiers for reporting (limit to avoid huge output)
            id_cols = pk_cols.copy()
            used_rowid = False
            if not id_cols:
                # Prefer rowid when possible
                id_cols = ['rowid']
                used_rowid = True

            select_cols = ", ".join(quote_ident(c) for c in id_cols)
            ids: List[Dict[str, Any]] = []

            try:
                cur.execute(
                    f"SELECT {select_cols} FROM {tquoted} WHERE {where_clause} LIMIT 100",
                    params,
                )
                rows = cur.fetchall()
            except sqlite3.OperationalError:
                # Fallback: pick the first column if rowid unavailable
                fallback_col = col_names[0]
                id_cols = [fallback_col]
                used_rowid = False
                select_cols = quote_ident(fallback_col)
                cur.execute(
                    f"SELECT {select_cols} FROM {tquoted} WHERE {where_clause} LIMIT 100",
                    params,
                )
                rows = cur.fetchall()

            for r in rows:
                ids.append({k: r[k] for k in id_cols if k in r.keys()})

            # Perform deletion
            cur.execute(f"DELETE FROM {tquoted} WHERE {where_clause}", params)
            summary['tables'][tname] = {
                'deleted_count': count,
                'id_columns': id_cols,
                'used_rowid': used_rowid,
                'sample_ids': ids,
            }
            summary['total_deleted'] += count

        conn.commit()
    finally:
        conn.close()

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

