import os
import sqlite3


def get_db_path() -> str:
    here = os.path.dirname(__file__)
    root = os.path.normpath(os.path.join(here, '..'))
    return os.path.join(root, 'src-tauri', 'resources', 'eye_tracking.db')


def ensure_table(conn: sqlite3.Connection) -> None:
    # New canonical table name: participants
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS participants (
            participant TEXT PRIMARY KEY,
            is_qac INTEGER NOT NULL CHECK (is_qac IN (0,1))
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_participants_is_qac
        ON participants(is_qac)
        """
    )

    # If legacy table exists, migrate its rows then drop it
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='participant_qac'")
    if cur.fetchone():
        conn.execute(
            "INSERT OR REPLACE INTO participants(participant, is_qac)\n"
            "SELECT participant, is_qac FROM participant_qac"
        )
        conn.execute("DROP TABLE participant_qac")


def sync_from_gaze_data(conn: sqlite3.Connection) -> dict:
    """Populate participants from distinct values in gaze_data."""
    cur = conn.cursor()
    # Read distinct participant names from gaze_data
    cur.execute(
        """
        SELECT DISTINCT TRIM(CAST("Participant name" AS TEXT)) AS p
        FROM gaze_data
        WHERE "Participant name" IS NOT NULL
          AND TRIM(CAST("Participant name" AS TEXT)) <> ''
        ORDER BY 1
        """
    )
    all_parts = [row[0] for row in cur.fetchall()]

    # Define default statuses: TLK311..TLK320 are non-QAC (0), others QAC (1)
    non_qac = {f"TLK{i}" for i in range(311, 321)}

    ins = conn.cursor()
    added = 0
    updated = 0
    for p in all_parts:
        is_qac = 0 if p in non_qac else 1
        # Upsert with desired is_qac
        ins.execute(
            "INSERT INTO participants(participant, is_qac) VALUES (?, ?)\n"
            "ON CONFLICT(participant) DO UPDATE SET is_qac=excluded.is_qac",
            (p, is_qac),
        )
        # sqlite3 doesn't expose conflict info easily; recalc by checking row afterwards
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM participants")
    total = int(cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM participants WHERE is_qac=0")
    n_non_qac = int(cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM participants WHERE is_qac=1")
    n_qac = int(cur.fetchone()[0])

    return {
        "total_participants": total,
        "non_qac": n_non_qac,
        "qac": n_qac,
        "source_distinct": len(all_parts),
    }


def main() -> None:
    db_path = get_db_path()
    if not os.path.exists(db_path):
        print(f"DB not found: {db_path}")
        raise SystemExit(2)
    conn = sqlite3.connect(db_path)
    try:
        # Back up DB before schema/data changes
        from datetime import datetime
        bak = db_path + ".bak-" + datetime.now().strftime("%Y%m%d-%H%M%S")
        import shutil
        shutil.copy2(db_path, bak)

        ensure_table(conn)
        summary = sync_from_gaze_data(conn)
        print(
            "participants ready; total={total}, non_qac={nz}, qac={q}, source_distinct={sd}".format(
                total=summary["total_participants"],
                nz=summary["non_qac"],
                q=summary["qac"],
                sd=summary["source_distinct"],
            )
        )
    finally:
        conn.close()


if __name__ == '__main__':
    main()
