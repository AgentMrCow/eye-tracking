import sqlite3
conn=sqlite3.connect(r'src-tauri/resources/eye_tracking.db')
cur=conn.cursor()
cur.execute('PRAGMA table_info(test_catalog)')
print([c[1] for c in cur.fetchall()])
cur.execute('SELECT "Mentioned character (Animal)", "Mentioned object", self_AOIs, correct_AOIs FROM test_catalog LIMIT 5')
for row in cur.fetchall():
    print([x for x in row])
