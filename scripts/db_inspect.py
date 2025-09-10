import sqlite3
import json
conn=sqlite3.connect('src-tauri/resources/eye_tracking.db')
cur=conn.cursor()
for t in ['gaze_data','test_catalog','test_group','recordings']:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (t,))
    if not cur.fetchone():
        print(json.dumps({'table':t,'exists':False}))
        continue
    cur.execute(f'PRAGMA table_info({t})')
    cols=[c[1] for c in cur.fetchall()]
    cur.execute(f'SELECT * FROM {t} LIMIT 2')
    rows=cur.fetchall()
    print(json.dumps({'table':t,'exists':True,'columns':cols,'sample':rows}, ensure_ascii=False))
