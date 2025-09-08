use base64::{engine::general_purpose, Engine as _};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{OpenFlags, OptionalExtension, Result as SqlResult};
use rusqlite::types::Value as SqlValue;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};
use url::Url;

/* ──────────────────────────────────────────────────────────────
Data types
────────────────────────────────────────────────────────────── */

#[derive(Debug, Serialize, Deserialize)]
pub struct GazeData {
    gaze_x: Option<f64>,
    gaze_y: Option<f64>,
    box_name: String,
    media_name: String,
    timeline: String,
    participant: String,
    recording: String,
    timestamp: String,
    test_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GazeStats {
    box_percentages: HashMap<String, f64>,
    total_points: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineRecording {
    timeline: String,
    recording: String,
}

/* Generic small-table row: return every column as String (or null) */
pub type RowMap = HashMap<String, Option<String>>;

#[derive(Debug, Serialize, Deserialize)]
pub struct StaticData {
    pub test_catalog: Vec<RowMap>,
    pub test_group: Vec<RowMap>,
    pub recordings: Vec<RowMap>,
    pub participants: Vec<String>,
    pub test_names: Vec<String>,
}

pub struct DbPool(Arc<Pool<SqliteConnectionManager>>);

/* ──────────────────────────────────────────────────────────────
Helpers
────────────────────────────────────────────────────────────── */

fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
    let mut stmt =
        match conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1") {
            Ok(s) => s,
            Err(_) => return false,
        };
    stmt.exists([name]).unwrap_or(false)
}

fn value_to_string(v: SqlValue) -> Option<String> {
    match v {
        SqlValue::Null => None,
        SqlValue::Integer(i) => Some(i.to_string()),
        SqlValue::Real(f) => Some(f.to_string()),
        SqlValue::Text(t) => Some(t),                          // <- TEXT already a String
        SqlValue::Blob(b) => Some(general_purpose::STANDARD.encode(b)),
    }
}

/* Dump any table as Vec<RowMap> (String/None for all columns) */
fn dump_table(conn: &rusqlite::Connection, table: &str) -> Result<Vec<RowMap>, String> {
    if !table_exists(conn, table) {
        return Ok(vec![]);
    }
    let mut cstmt = conn
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|e| e.to_string())?;
    let cols = cstmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;

    if cols.is_empty() {
        return Ok(vec![]);
    }

    let mut select_sql = String::from("SELECT ");
    for (i, c) in cols.iter().enumerate() {
        if i > 0 { select_sql.push(','); }
        select_sql.push('"'); select_sql.push_str(c); select_sql.push('"');
    }
    select_sql.push_str(" FROM "); select_sql.push_str(table);

    let mut stmt = conn.prepare(&select_sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let mut map = RowMap::new();
        for (i, name) in cols.iter().enumerate() {
            let v: SqlValue = row.get(i)?;
            map.insert(name.clone(), value_to_string(v));
        }
        Ok(map)
    }).map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<RowMap>>>().map_err(|e| e.to_string())?)
}

/* Cast to TEXT + TRIM; quote spaced column names safely */
fn distinct_nonempty(conn: &rusqlite::Connection, table: &str, col: &str) -> Result<Vec<String>, String> {
    if !table_exists(conn, table) {
        return Ok(vec![]);
    }
    let sql = format!(
        "SELECT DISTINCT TRIM(CAST(\"{col}\" AS TEXT)) AS val
         FROM {table}
         WHERE \"{col}\" IS NOT NULL
           AND TRIM(CAST(\"{col}\" AS TEXT)) <> ''
         ORDER BY val"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let vals = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;
    Ok(vals)
}

/* ──────────────────────────────────────────────────────────────
Commands
────────────────────────────────────────────────────────────── */

/* 1) Bootstrap: fetch small tables. (Skip huge test_group) */
#[tauri::command]
async fn get_static_data(pool: State<'_, DbPool>) -> Result<StaticData, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    // Full dumps — do NOT fetch test_group
    let test_catalog = dump_table(&conn, "test_catalog")?;
    let recordings   = dump_table(&conn, "recordings")?;
    let test_group: Vec<RowMap> = Vec::new();

    // Participants from recordings
    let participants = distinct_nonempty(&conn, "recordings", "Participant")?;

    // Test names from test_catalog
    let test_names = distinct_nonempty(&conn, "test_catalog", "test_name")?;

    Ok(StaticData { test_catalog, test_group, recordings, participants, test_names })
}

/* 2) Heavy data: filtered gaze stream (with optional limit/offset)
     Accept BOTH `test_name` and `testName` from JS. */
#[tauri::command]
async fn get_gaze_data(
    test_name: Option<String>,
    testName: Option<String>,
    participants: Vec<String>,
    timeline: Option<String>,
    recording: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    pool: State<'_, DbPool>,
) -> Result<Vec<GazeData>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName).ok_or_else(|| "missing param: test_name/testName".to_string())?;

    let lim_guard: i64 = limit.unwrap_or(0);
    let off_guard: i64 = offset.unwrap_or(0);

    let mut query = String::from(
        r#"
        SELECT "Gaze point X", "Gaze point Y", Box, "Presented Media name",
               "Timeline name", "Participant name", "Recording name",
               "Exact time", "Test Name"
        FROM   gaze_data
        WHERE  "Test Name" = ?1
        "#,
    );

    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    if timeline.is_some() { query.push_str(" AND \"Timeline name\" = ?"); }
    if recording.is_some() { query.push_str(" AND \"Recording name\" = ?"); }
    query.push_str(" ORDER BY \"Exact time\"");

    if lim_guard > 0 {
        query.push_str(" LIMIT ?");
        if off_guard > 0 { query.push_str(" OFFSET ?"); }
    }

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test];
    for p in &participants { params.push(p); }
    if let Some(ref tl) = timeline { params.push(tl); }
    if let Some(ref rc) = recording { params.push(rc); }
    if lim_guard > 0 {
        params.push(&lim_guard);
        if off_guard > 0 { params.push(&off_guard); }
    }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(GazeData {
                gaze_x: row.get::<_, Option<f64>>(0)?,
                gaze_y: row.get::<_, Option<f64>>(1)?,
                box_name: row.get(2)?,
                media_name: row.get(3)?,
                timeline: row.get(4)?,
                participant: row.get(5)?,
                recording: row.get(6)?,
                timestamp: row.get(7)?,
                test_name: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<rusqlite::Result<Vec<GazeData>>>().map_err(|e| e.to_string())?)
}

/* 3) Distinct (timeline, recording) for a test + optional participants */
#[tauri::command]
async fn get_timeline_recordings(
    test_name: Option<String>,
    testName: Option<String>,
    participants: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<TimelineRecording>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName).ok_or_else(|| "missing param: test_name/testName".to_string())?;

    let mut query = String::from(
        r#"
        SELECT DISTINCT "Timeline name", "Recording name"
        FROM gaze_data
        WHERE "Test Name" = ?1
        "#,
    );

    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    query.push_str(r#" ORDER BY "Timeline name", "Recording name""#);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test];
    for p in &participants { params.push(p); }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(TimelineRecording { timeline: row.get(0)?, recording: row.get(1)? })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<TimelineRecording>>>().map_err(|e| e.to_string())?)
}

/* 4) Box share stats for filtered slice */
#[tauri::command]
async fn get_box_stats(
    test_name: Option<String>,
    testName: Option<String>,
    participants: Vec<String>,
    timeline: Option<String>,
    recording: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<GazeStats, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName).ok_or_else(|| "missing param: test_name/testName".to_string())?;

    let mut query = String::from(
        r#"
        SELECT Box, COUNT(*) AS count
        FROM   gaze_data
        WHERE  "Test Name" = ?1
        "#,
    );

    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    if timeline.is_some() { query.push_str(" AND \"Timeline name\" = ?"); }
    if recording.is_some() { query.push_str(" AND \"Recording name\" = ?"); }
    query.push_str(" GROUP BY Box");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test];
    for p in &participants { params.push(p); }
    if let Some(ref tl) = timeline { params.push(tl); }
    if let Some(ref rc) = recording { params.push(rc); }

    let mut box_counts = HashMap::new();
    let mut total_points = 0i64;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            let box_name: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            Ok((box_name, count))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (box_name, count) = row.map_err(|e| e.to_string())?;
        total_points += count;
        box_counts.insert(box_name, count as f64);
    }
    for count in box_counts.values_mut() {
        *count = (*count / total_points as f64) * 100.0;
    }

    Ok(GazeStats { box_percentages: box_counts, total_points })
}

/* 5) On-demand image loader (base64) */
#[tauri::command]
async fn get_test_image(
    app: AppHandle,
    test_name: Option<String>,
    testName: Option<String>,
    timeline: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Option<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName).ok_or_else(|| "missing param: test_name/testName".to_string())?;

    let try_sqls: [&str; 3] = [
        // exact + timeline
        r#"
        SELECT image_path
        FROM   test_catalog
        WHERE  image_path IS NOT NULL AND TRIM(image_path) <> '' 
               AND test_name = ?1 AND timeline = ?2
        LIMIT  1
        "#,
        // exact by test_name
        r#"
        SELECT image_path
        FROM   test_catalog
        WHERE  image_path IS NOT NULL AND TRIM(image_path) <> '' 
               AND test_name = ?1
        LIMIT  1
        "#,
        // prefix fallback
        r#"
        SELECT image_path
        FROM   test_catalog
        WHERE  image_path IS NOT NULL AND TRIM(image_path) <> '' 
               AND ?1 LIKE test_name || '%'
        LIMIT  1
        "#,
    ];

    let mut image_path: Option<String> = None;

    if let Some(ref tl) = timeline {
        if let Ok(mut stmt) = conn.prepare(try_sqls[0]) {
            image_path = stmt
                .query_row(rusqlite::params![&test, tl], |row| {
                    row.get::<_, Option<String>>("image_path")
                })
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
        }
    }

    if image_path.is_none() {
        let mut stmt = conn.prepare(try_sqls[1]).map_err(|e| e.to_string())?;
        image_path = stmt
            .query_row([&test], |row| row.get::<_, Option<String>>("image_path"))
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
    }

    if image_path.is_none() {
        let mut stmt = conn.prepare(try_sqls[2]).map_err(|e| e.to_string())?;
        image_path = stmt
            .query_row([&test], |row| row.get::<_, Option<String>>("image_path"))
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
    }

    let Some(rel) = image_path else { return Ok(None); };
    if rel.trim().is_empty() { return Ok(None); }

    let base = app
        .path()
        .resolve("resources", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let mut full: PathBuf = base;
    full.push(rel);

    let bytes = fs::read(&full).map_err(|e| format!("read image: {e}"))?;
    let b64 = general_purpose::STANDARD.encode(bytes);
    Ok(Some(b64))
}

/* ──────────────────────────────────────────────────────────────
App bootstrap
────────────────────────────────────────────────────────────── */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            println!("Setting up the application...");

            let resource_path = app
                .path()
                .resolve("resources/eye_tracking.db", BaseDirectory::Resource)
                .map_err(|e| {
                    println!("Failed to resolve DB path: {e}");
                    e
                })?;

            if resource_path.exists() {
                println!("DB found at: {:?}", resource_path);
            } else {
                println!("DB MISSING at: {:?}", resource_path);
            }

            // Open read-only, immutable
            let mut url = Url::from_file_path(&resource_path).map_err(|_| {
                println!("Bad DB path for URL: {:?}", &resource_path);
                "bad DB path"
            })?;
            url.set_query(Some("mode=ro&immutable=1"));

            let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI;

            let manager = SqliteConnectionManager::file(url.as_str())
                .with_flags(flags)
                .with_init(|c| {
                    c.execute_batch("PRAGMA query_only=ON;")?;
                    Ok(())
                });

            let pool = r2d2::Pool::builder()
                .max_size(4)
                .connection_timeout(Duration::from_secs(10))
                .build(manager)
                .map_err(|e| {
                    println!("Failed to create DB pool: {e}");
                    e
                })?;

            app.manage(DbPool(Arc::new(pool)));
            println!("Setup completed (read-only).");
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // bootstrap + small tables
            get_static_data,
            // gaze
            get_timeline_recordings,
            get_gaze_data,
            get_box_stats,
            // assets
            get_test_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
