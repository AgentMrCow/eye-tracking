import sqlite3
conn=sqlite3.connect(r'src-tauri/resources/eye_tracking.db')
cur=conn.cursor()
cur.execute('SELECT "Exact time" FROM gaze_data LIMIT 3')
print(cur.fetchall())
