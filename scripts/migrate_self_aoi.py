import os
import sqlite3
from typing import List, Dict


DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'resources', 'eye_tracking.db')


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def get_table_info(cur: sqlite3.Cursor, table: str) -> List[Dict]:
    cur.execute(f'PRAGMA table_info({quote_ident(table)})')
    cols = []
    for cid, name, coltype, notnull, dflt, pk in cur.fetchall():
        cols.append({
            'cid': cid,
            'name': name,
            'type': coltype or 'TEXT',
            'notnull': bool(notnull),
            'dflt': dflt,
            'pk': pk,
        })
    return cols


def main():
    db = os.path.normpath(DB_PATH)
    if not os.path.exists(db):
        raise SystemExit(f"DB not found: {db}")

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # If column already exists, do nothing
    cols = get_table_info(cur, 'test_catalog')
    if any(c['name'] == 'self_AOIs' for c in cols):
        print('self_AOIs already present; skipping migration')
        return

    # Determine position to insert after 'group'
    names = [c['name'] for c in cols]
    try:
        idx_group = names.index('group')
        idx_correct = names.index('correct_AOIs')
    except ValueError:
        raise SystemExit('Expected columns "group" and "correct_AOIs" not found in test_catalog')

    new_cols: List[Dict] = []
    for i, c in enumerate(cols):
        new_cols.append(c)
        if i == idx_group:
            new_cols.append({'name':'self_AOIs','type':'TEXT','notnull':False,'dflt':None,'pk':0,'cid':None})

    # Build CREATE TABLE
    defs = []
    for c in new_cols:
        if c['name'] == 'self_AOIs':
            defs.append(f'{quote_ident(c["name"]) } {c["type"]}')
        else:
            dtype = c['type'] or 'TEXT'
            nn = ' NOT NULL' if c['notnull'] else ''
            dv = f' DEFAULT {c["dflt"]}' if c['dflt'] is not None else ''
            pk = ' PRIMARY KEY' if c['pk'] else ''
            defs.append(f'{quote_ident(c["name"]) } {dtype}{nn}{dv}{pk}')
    create_sql = f'CREATE TABLE test_catalog_new ({", ".join(defs)})'

    cur.execute('BEGIN')
    try:
        cur.execute(create_sql)

        # Select all rows and transform
        cur.execute('SELECT * FROM test_catalog')
        rows = cur.fetchall()

        # Prepare insert
        col_names_new = [c['name'] for c in new_cols]
        placeholders = ','.join(['?'] * len(col_names_new))
        ins_sql = f'INSERT INTO test_catalog_new ({",".join(quote_ident(n) for n in col_names_new)}) VALUES ({placeholders})'

        for r in rows:
            row_dict = {k: r[k] for k in r.keys()}
            # Build self_AOIs from Mentioned character & Mentioned object
            mc = (row_dict.get('Mentioned character (Animal)') or '').strip()
            mo = (row_dict.get('Mentioned object') or '').strip()
            parts = [p for p in [mc, mo] if p]
            self_aoi = ','.join(parts) if parts else None

            # Recompute correct_AOIs minus self parts
            corr = (row_dict.get('correct_AOIs') or '').strip()
            if corr:
                codes = [t.strip() for t in corr.replace('，', ',').split(',') if t.strip()]
                codes = [c for c in codes if c not in parts]
                corr_new = ','.join(codes) if codes else None
            else:
                corr_new = None

            # Compose new row values in order
            values = []
            for name in col_names_new:
                if name == 'self_AOIs':
                    values.append(self_aoi)
                elif name == 'correct_AOIs':
                    values.append(corr_new)
                else:
                    values.append(row_dict.get(name))

            cur.execute(ins_sql, values)

        # Swap tables
        cur.execute('ALTER TABLE test_catalog RENAME TO test_catalog_old')
        cur.execute('ALTER TABLE test_catalog_new RENAME TO test_catalog')
        conn.commit()
        print(f'migrated {len(rows)} rows; self_AOIs added; correct_AOIs adjusted')
    except Exception as e:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()

