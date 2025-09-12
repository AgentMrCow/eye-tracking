use base64::{engine::general_purpose, Engine as _};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{OpenFlags, OptionalExtension, Result as SqlResult};
use rusqlite::types::Value as SqlValue;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock, Mutex};
use std::time::Duration;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};
use tauri::async_runtime::spawn;
// use tokio::time::{sleep, Duration as TokioDuration};
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

#[derive(Debug, Serialize, Deserialize)]
pub struct ParticipantSession {
    participant: String,
    test_name: String,
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
    pub participants_by_test: HashMap<String, Vec<String>>,
    pub tests_by_participant: HashMap<String, Vec<String>>,
}

pub struct DbPool(Arc<Pool<SqliteConnectionManager>>);

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq, Hash)]
pub struct DisabledSlice {
    pub test_name: String,
    pub recording_name: String,
    pub participant_name: String,
}

pub struct DisabledStore(pub Arc<RwLock<HashSet<DisabledSlice>>>);

// ─────────────────────────── Splashscreen setup tracking ───────────────────────────
struct SetupState {
    frontend_task: bool,
    backend_task: bool,
}

#[tauri::command]
async fn set_complete(
    app: AppHandle,
    state: State<'_, Mutex<SetupState>>,
    task: String,
) -> Result<(), ()> {
    let mut state_lock = state.lock().unwrap();
    match task.as_str() {
        "frontend" => state_lock.frontend_task = true,
        "backend" => state_lock.backend_task = true,
        _ => return Ok(()),
    }
    if state_lock.frontend_task && state_lock.backend_task {
        if let Some(splash) = app.get_webview_window("splashscreen") { let _ = splash.close(); }
        if let Some(main) = app.get_webview_window("main") { let _ = main.show(); }
    }
    Ok(())
}

fn disabled_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("disabled_slices.json", BaseDirectory::AppData)
        .map_err(|e| e.to_string())
}

fn load_disabled_from_disk(app: &AppHandle) -> HashSet<DisabledSlice> {
    let path = match disabled_file_path(app) {
        Ok(p) => p,
        Err(_) => return HashSet::new(),
    };
    match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice::<Vec<DisabledSlice>>(&bytes)
            .map(|v| v.into_iter().collect())
            .unwrap_or_default(),
        Err(_) => HashSet::new(),
    }
}

fn save_disabled_to_disk(app: &AppHandle, set: &HashSet<DisabledSlice>) -> Result<(), String> {
    let path = disabled_file_path(app)?;
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    let vec: Vec<&DisabledSlice> = set.iter().collect();
    let json = serde_json::to_vec_pretty(&vec).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchTestRow {
    pub test_name: String,
    pub group: Option<String>,
    pub image_name: Option<String>,
    pub sentence: Option<String>,
    pub avg_pair_duration_seconds: Option<f64>,
    pub occurrences: Option<i64>,
    pub mp4_triples: Option<i64>,
    pub png_triples: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchSliceRow {
    pub test_name: String,
    pub recording_name: String,
    pub participant_name: String,
    pub group: Option<String>,
    pub image_name: Option<String>,
    pub sentence: Option<String>,
    pub pair_duration_seconds: Option<f64>,
    pub mp4_duration_seconds: Option<f64>,
    pub png_duration_seconds: Option<f64>,
}

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
async fn get_static_data(pool: State<'_, DbPool>, disabled: State<'_, DisabledStore>) -> Result<StaticData, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    // Full dumps — do NOT fetch test_group
    let test_catalog = dump_table(&conn, "test_catalog")?;
    let recordings   = dump_table(&conn, "recordings")?;
    let test_group: Vec<RowMap> = Vec::new();

    // Participants from recordings
    let participants = distinct_nonempty(&conn, "recordings", "Participant")?;

    // Test names from test_catalog
    let test_names = distinct_nonempty(&conn, "test_catalog", "test_name")?;

    // Build maps (test -> participants, participant -> tests) from gaze_data, honoring disabled triples
    let mut by_test: HashMap<String, BTreeSet<String>> = HashMap::new();
    let mut by_part: HashMap<String, BTreeSet<String>> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            r#"SELECT DISTINCT "Test Name", "Participant name", "Recording name"
               FROM gaze_data
               WHERE "Test Name" IS NOT NULL AND TRIM("Test Name") <> ''
                 AND "Participant name" IS NOT NULL AND TRIM("Participant name") <> ''
                 AND "Recording name" IS NOT NULL AND TRIM("Recording name") <> ''"#,
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            let t: String = row.get(0)?;
            let p: String = row.get(1)?;
            let r: String = row.get(2)?;
            Ok((t, p, r))
        }).map_err(|e| e.to_string())?;

        let disabled_set = disabled.0.read().unwrap();
        for r in rows {
            let (t, p, rname) = r.map_err(|e| e.to_string())?;
            let ds = DisabledSlice { test_name: t.clone(), recording_name: rname.clone(), participant_name: p.clone() };
            if disabled_set.contains(&ds) { continue; }
            by_test.entry(t.clone()).or_default().insert(p.clone());
            by_part.entry(p).or_default().insert(t);
        }
    }
    let participants_by_test: HashMap<String, Vec<String>> = by_test
        .into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect();
    let tests_by_participant: HashMap<String, Vec<String>> = by_part
        .into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect();

    Ok(StaticData { test_catalog, test_group, recordings, participants, test_names, participants_by_test, tests_by_participant })
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
    disabled: State<'_, DisabledStore>,
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

    // Exclude disabled slices
    let disabled_set = disabled.0.read().unwrap();
    let mut disabled_filters: Vec<&DisabledSlice> = disabled_set
        .iter()
        .filter(|ds| ds.test_name == test)
        .collect();
    if !participants.is_empty() {
        disabled_filters.retain(|ds| participants.contains(&ds.participant_name));
    }
    if let Some(ref rc) = recording {
        disabled_filters.retain(|ds| &ds.recording_name == rc);
    }
    if !disabled_filters.is_empty() {
        query.push_str(" AND NOT (");
        for (i, _) in disabled_filters.iter().enumerate() {
            if i > 0 { query.push_str(" OR "); }
            query.push_str("(\"Test Name\" = ? AND \"Recording name\" = ? AND \"Participant name\" = ?)");
        }
        query.push(')');
    }

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
    // disabled params
    for ds in &disabled_filters {
        params.push(&ds.test_name);
        params.push(&ds.recording_name);
        params.push(&ds.participant_name);
    }
    // no validity filters (temporarily disabled)
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
    disabled: State<'_, DisabledStore>,
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
    // Exclude disabled (per test/participants)
    let disabled_set = disabled.0.read().unwrap();
    let mut disabled_filters: Vec<&DisabledSlice> = disabled_set
        .iter()
        .filter(|ds| ds.test_name == test)
        .collect();
    if !participants.is_empty() {
        disabled_filters.retain(|ds| participants.contains(&ds.participant_name));
    }
    if !disabled_filters.is_empty() {
        query.push_str(" AND NOT (");
        for (i, _) in disabled_filters.iter().enumerate() {
            if i > 0 { query.push_str(" OR "); }
            query.push_str("(\"Test Name\" = ? AND \"Recording name\" = ? AND \"Participant name\" = ?)");
        }
        query.push(')');
    }
    query.push_str(r#" ORDER BY "Timeline name", "Recording name""#);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test];
    for p in &participants { params.push(p); }
    for ds in &disabled_filters {
        params.push(&ds.test_name);
        params.push(&ds.recording_name);
        params.push(&ds.participant_name);
    }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(TimelineRecording { timeline: row.get(0)?, recording: row.get(1)? })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<TimelineRecording>>>().map_err(|e| e.to_string())?)
}

/* Optimized: Get all participant sessions for multiple tests in one call */
#[tauri::command]
async fn get_all_participant_sessions(
    tests: Vec<String>,
    participants: Vec<String>,
    pool: State<'_, DbPool>,
    disabled: State<'_, DisabledStore>,
) -> Result<Vec<ParticipantSession>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    
    if tests.is_empty() || participants.is_empty() {
        return Ok(vec![]);
    }

    let mut query = String::from(
        r#"
        SELECT DISTINCT "Participant name", "Test Name", "Timeline name", "Recording name"
        FROM gaze_data
        WHERE "Test Name" IN (
        "#,
    );
    
    // Add test placeholders
    query.push_str(&vec!["?"; tests.len()].join(","));
    query.push_str(") AND \"Participant name\" IN (");
    
    // Add participant placeholders
    query.push_str(&vec!["?"; participants.len()].join(","));
    query.push(')');

    // Exclude disabled sessions
    let disabled_set = disabled.0.read().unwrap();
    let disabled_filters: Vec<&DisabledSlice> = disabled_set
        .iter()
        .filter(|ds| tests.contains(&ds.test_name) && participants.contains(&ds.participant_name))
        .collect();
    
    if !disabled_filters.is_empty() {
        query.push_str(" AND NOT (");
        for (i, _) in disabled_filters.iter().enumerate() {
            if i > 0 { query.push_str(" OR "); }
            query.push_str("(\"Test Name\" = ? AND \"Recording name\" = ? AND \"Participant name\" = ?)");
        }
        query.push(')');
    }
    
    query.push_str(r#" ORDER BY "Participant name", "Test Name", "Timeline name", "Recording name""#);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![];
    
    // Add test parameters
    for t in &tests { params.push(t); }
    // Add participant parameters
    for p in &participants { params.push(p); }
    // Add disabled filter parameters
    for ds in &disabled_filters {
        params.push(&ds.test_name);
        params.push(&ds.recording_name);
        params.push(&ds.participant_name);
    }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(ParticipantSession {
                participant: row.get(0)?,
                test_name: row.get(1)?,
                timeline: row.get(2)?,
                recording: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<ParticipantSession>>>().map_err(|e| e.to_string())?)
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
    disabled: State<'_, DisabledStore>,
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

    // Exclude disabled
    let disabled_set = disabled.0.read().unwrap();
    let mut disabled_filters: Vec<&DisabledSlice> = disabled_set
        .iter()
        .filter(|ds| ds.test_name == test)
        .collect();
    if !participants.is_empty() {
        disabled_filters.retain(|ds| participants.contains(&ds.participant_name));
    }
    if let Some(ref rc) = recording {
        disabled_filters.retain(|ds| &ds.recording_name == rc);
    }
    if !disabled_filters.is_empty() {
        query.push_str(" AND NOT (");
        for (i, _) in disabled_filters.iter().enumerate() {
            if i > 0 { query.push_str(" OR "); }
            query.push_str("(\"Test Name\" = ? AND \"Recording name\" = ? AND \"Participant name\" = ?)");
        }
        query.push(')');
    }

    query.push_str(" GROUP BY Box");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test];
    for p in &participants { params.push(p); }
    if let Some(ref tl) = timeline { params.push(tl); }
    if let Some(ref rc) = recording { params.push(rc); }
    for ds in &disabled_filters {
        params.push(&ds.test_name);
        params.push(&ds.recording_name);
        params.push(&ds.participant_name);
    }
    // no validity filters (temporarily disabled)

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

/* 5) Lookup helpers for UI filtering */
#[tauri::command]
async fn get_participants_for_test(
    test_name: Option<String>,
    testName: Option<String>,
    pool: State<'_, DbPool>,
    disabled: State<'_, DisabledStore>,
) -> Result<Vec<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName).ok_or_else(|| "missing param: test_name/testName".to_string())?;
    let mut stmt = conn
        .prepare(r#"SELECT DISTINCT "Participant name", "Recording name" FROM gaze_data WHERE "Test Name"=?1"#)
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&test], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let disabled_set = disabled.0.read().unwrap();
    let mut ok: HashSet<String> = HashSet::new();
    for r in rows {
        let (p, rec) = r.map_err(|e| e.to_string())?;
        let ds = DisabledSlice { test_name: test.clone(), recording_name: rec, participant_name: p.clone() };
        if !disabled_set.contains(&ds) { ok.insert(p); }
    }
    let mut out: Vec<String> = ok.into_iter().collect();
    out.sort();
    Ok(out)
}

#[tauri::command]
async fn get_tests_for_participant(
    participant: String,
    pool: State<'_, DbPool>,
    disabled: State<'_, DisabledStore>,
) -> Result<Vec<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(r#"SELECT DISTINCT "Test Name", "Recording name" FROM gaze_data WHERE "Participant name"=?1"#)
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&participant], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;

    let disabled_set = disabled.0.read().unwrap();
    let mut ok: HashSet<String> = HashSet::new();
    for r in rows {
        let (t, rec) = r.map_err(|e| e.to_string())?;
        let ds = DisabledSlice { test_name: t.clone(), recording_name: rec, participant_name: participant.clone() };
        if !disabled_set.contains(&ds) { ok.insert(t); }
    }
    let mut out: Vec<String> = ok.into_iter().collect();
    out.sort();
    Ok(out)
}

/* 6) Participants: return full participants table (future-proof for extra columns).
      Falls back to legacy table name if needed. */
#[tauri::command]
async fn get_participants(
    pool: State<'_, DbPool>,
) -> Result<Vec<RowMap>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    if table_exists(&conn, "participants") {
        return dump_table(&conn, "participants");
    }
    if table_exists(&conn, "participant_qac") {
        return dump_table(&conn, "participant_qac");
    }
    Ok(vec![])
}

/* 7) Disabled slices management + listing distinct gaze triples */
#[tauri::command]
async fn list_gaze_slices(
    test_name: Option<String>,
    testName: Option<String>,
    participants: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<DisabledSlice>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName);

    let mut query = String::from(
        r#"SELECT DISTINCT "Test Name", "Recording name", "Participant name"
            FROM gaze_data
            WHERE 1=1"#,
    );
    if let Some(_) = test { query.push_str(" AND \"Test Name\" = ?"); }
    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    query.push_str(" ORDER BY 1,2,3");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = Vec::new();
    if let Some(ref t) = test { params.push(t); }
    for p in &participants { params.push(p); }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(DisabledSlice {
                test_name: row.get(0)?,
                recording_name: row.get(1)?,
                participant_name: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<DisabledSlice>>>().map_err(|e| e.to_string())?)
}

/* 8) Search tests: enrich with test_catalog fields and aggregated pair (mp4+png) duration */
#[tauri::command]
async fn search_tests(
    pool: State<'_, DbPool>,
) -> Result<Vec<SearchTestRow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    let sql = r#"
    WITH names AS (
        SELECT DISTINCT test_name FROM test_group
        UNION
        SELECT DISTINCT test_name FROM test_catalog
    ),
    tc AS (
        SELECT test_name,
               MIN(NULLIF("group", '')) AS "group",
               MIN(NULLIF("Image name", '')) AS image_name,
               MIN(NULLIF(sentence, '')) AS sentence
        FROM test_catalog
        GROUP BY test_name
    ),
    grp AS (
        SELECT test_name,
               "Recording name" AS rec,
               "Participant name" AS part,
               SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.mp4' THEN duration_seconds ELSE 0 END) AS mp4_dur,
               SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.png' THEN duration_seconds ELSE 0 END) AS png_dur,
               CASE WHEN SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.mp4' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS mp4_present,
               CASE WHEN SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.png' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS png_present,
               CASE WHEN (
                   SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.mp4' THEN 1 ELSE 0 END) > 0 AND
                   SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.png' THEN 1 ELSE 0 END) > 0
               ) THEN 1 ELSE 0 END AS has_both
        FROM test_group
        GROUP BY test_name, rec, part
    ),
    agg AS (
        SELECT test_name,
               AVG(CASE WHEN has_both = 1 THEN mp4_dur + png_dur END) AS avg_pair_duration_seconds,
               SUM(mp4_present) AS mp4_triples,
               SUM(png_present) AS png_triples,
               SUM(has_both) AS occurrences
        FROM grp
        GROUP BY test_name
    )
    SELECT n.test_name,
           tc."group",
           tc.image_name,
           tc.sentence,
           agg.avg_pair_duration_seconds,
           agg.occurrences,
           agg.mp4_triples,
           agg.png_triples
    FROM names n
    LEFT JOIN tc  ON tc.test_name  = n.test_name
    LEFT JOIN agg ON agg.test_name = n.test_name
    ORDER BY n.test_name
    "#;

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SearchTestRow {
                test_name: row.get(0)?,
                group: row.get::<_, Option<String>>(1)?,
                image_name: row.get::<_, Option<String>>(2)?,
                sentence: row.get::<_, Option<String>>(3)?,
                avg_pair_duration_seconds: row.get::<_, Option<f64>>(4)?,
                occurrences: row.get::<_, Option<i64>>(5)?,
                mp4_triples: row.get::<_, Option<i64>>(6)?,
                png_triples: row.get::<_, Option<i64>>(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<SearchTestRow>>>().map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn search_slices(
    test_name: Option<String>,
    testName: Option<String>,
    participants: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<SearchSliceRow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let test = test_name.or(testName);

    let mut query = String::from(
        r#"
        WITH triples AS (
            SELECT DISTINCT "Test Name"   AS test_name,
                            "Recording name"    AS recording_name,
                            "Participant name"  AS participant_name
            FROM gaze_data
            WHERE "Test Name" IS NOT NULL AND TRIM("Test Name") <> ''
              AND "Recording name" IS NOT NULL AND TRIM("Recording name") <> ''
              AND "Participant name" IS NOT NULL AND TRIM("Participant name") <> ''
        ),
        tc AS (
            SELECT test_name,
                   MIN(NULLIF("group", '')) AS "group",
                   MIN(NULLIF("Image name", '')) AS image_name,
                   MIN(NULLIF(sentence, '')) AS sentence
            FROM test_catalog
            GROUP BY test_name
        ),
        dur AS (
            SELECT test_name,
                   "Recording name"   AS recording_name,
                   "Participant name" AS participant_name,
                   SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.mp4' THEN duration_seconds ELSE 0 END) AS mp4_dur,
                   SUM(CASE WHEN LOWER("Presented Media name") LIKE '%.png' THEN duration_seconds ELSE 0 END) AS png_dur
            FROM test_group
            GROUP BY test_name, recording_name, participant_name
        )
        SELECT t.test_name,
               t.recording_name,
               t.participant_name,
               tc."group",
               tc.image_name,
               tc.sentence,
               (CASE WHEN dur.mp4_dur IS NULL AND dur.png_dur IS NULL THEN NULL ELSE COALESCE(dur.mp4_dur,0)+COALESCE(dur.png_dur,0) END) AS pair_dur,
               dur.mp4_dur,
               dur.png_dur
        FROM triples t
        LEFT JOIN tc  ON tc.test_name = t.test_name
        LEFT JOIN dur ON dur.test_name = t.test_name AND dur.recording_name = t.recording_name AND dur.participant_name = t.participant_name
        WHERE 1=1
        "#,
    );

    if test.is_some() {
        query.push_str(" AND t.test_name = ?");
    }
    if !participants.is_empty() {
        query.push_str(" AND t.participant_name IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    query.push_str(" ORDER BY t.test_name, t.participant_name, t.recording_name");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = Vec::new();
    if let Some(ref t) = test { params.push(t); }
    for p in &participants { params.push(p); }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(SearchSliceRow {
                test_name: row.get(0)?,
                recording_name: row.get(1)?,
                participant_name: row.get(2)?,
                group: row.get::<_, Option<String>>(3)?,
                image_name: row.get::<_, Option<String>>(4)?,
                sentence: row.get::<_, Option<String>>(5)?,
                pair_duration_seconds: row.get::<_, Option<f64>>(6)?,
                mp4_duration_seconds: row.get::<_, Option<f64>>(7)?,
                png_duration_seconds: row.get::<_, Option<f64>>(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<SearchSliceRow>>>().map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_disabled_slices(
    store: State<'_, DisabledStore>,
) -> Result<Vec<DisabledSlice>, String> {
    let set = store.0.read().unwrap();
    Ok(set.iter().cloned().collect())
}

#[tauri::command]
async fn set_disabled_slices(
    app: AppHandle,
    store: State<'_, DisabledStore>,
    slices: Vec<DisabledSlice>,
) -> Result<(), String> {
    let mut guard = store.0.write().unwrap();
    let newset: HashSet<DisabledSlice> = slices.into_iter().collect();
    *guard = newset.clone();
    save_disabled_to_disk(&app, &newset)
}

#[tauri::command]
async fn toggle_disabled_slice(
    app: AppHandle,
    store: State<'_, DisabledStore>,
    slice: DisabledSlice,
    disabled: bool,
) -> Result<(), String> {
    let mut guard = store.0.write().unwrap();
    if disabled { guard.insert(slice.clone()); } else { guard.remove(&slice); }
    let snapshot = guard.clone();
    drop(guard);
    save_disabled_to_disk(&app, &snapshot)
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
        // splash tracking state
        .manage(Mutex::new(SetupState { frontend_task: false, backend_task: false }))
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
            let handle = app.handle();
            let disabled_set = load_disabled_from_disk(&handle);
            app.manage(DisabledStore(Arc::new(RwLock::new(disabled_set))));
            println!("Setup completed (read-only). Disabled slices loaded.");
            // Mark backend ready for splashscreen (non-blocking)
            let handle = app.handle().clone();
            spawn(async move {
                let _ = set_complete(handle.clone(), handle.state::<Mutex<SetupState>>(), "backend".to_string()).await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // bootstrap + small tables
            get_static_data,
            // gaze
            get_timeline_recordings,
            get_all_participant_sessions,
            get_gaze_data,
            get_box_stats,
            get_participants_for_test,
            get_tests_for_participant,
            // participants
            get_participants,
            // assets
            get_test_image,
            // search
            search_tests,
            search_slices,
            // disable panel APIs
            list_gaze_slices,
            get_disabled_slices,
            set_disabled_slices,
            toggle_disabled_slice,
            // splashscreen control
            set_complete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
