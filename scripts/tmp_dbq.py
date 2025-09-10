import sqlite3, sys
conn=sqlite3.connect(r'src-tauri/resources/eye_tracking.db')
cur=conn.cursor()
cur.execute('SELECT test_name, "group", sentence, "Mentioned character (Animal)", "Mentioned object", correct_AOIs FROM test_catalog LIMIT 5')
rows=cur.fetchall()
open('scripts/tmp_dbq.out','wb').write(('\n'.join(['|'.join('' if (x is None) else str(x) for x in r) for r in rows])).encode('utf-8'))
print('WROTE scripts/tmp_dbq.out')
