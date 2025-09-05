use base64::{engine::general_purpose, Engine as _};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{OptionalExtension, Result as SqlResult, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri::path::BaseDirectory;
use url::Url;

/* ──────────────────────────────────────────────────────────────
   Data types
   ────────────────────────────────────────────────────────────── */

#[derive(Debug, Serialize, Deserialize)]
pub struct WordWindow {
    chinese_word: String,
    start_sec: f64,
    end_sec: f64,
    test_name: String,
    timeline: String,
}

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
pub struct AoiRow {
    tag: String,
    region_id: String,
    rgb_hex: Option<String>,
}

/* Minimal “meta” used by the UI filters/badges */
#[derive(Debug, Serialize, Deserialize)]
pub struct TestMetaRow {
    test_name: String,
    sentence: Option<String>,
    truth_value: Option<String>,
    only_position: Option<String>,
    morpheme: Option<String>,
    series: Option<String>,
    case_no: Option<i64>, // parsed from TEXT if present
}

/* Full(er) catalog row for UI — original fields + aoi_extra map */
#[derive(Debug, Serialize, Deserialize)]
pub struct TestCatalogRow {
    test_name: String,
    sentence: Option<String>,
    #[serde(rename = "group")]
    group_: Option<String>,

    correct_AOIs: Option<String>,
    potentially_correct_AOIs: Option<String>,
    incorrect_AOIs: Option<String>,
    correct_NULL: Option<String>,
    potentially_correct_NULL: Option<String>,
    incorrect_NULL: Option<String>,

    truth_value: Option<String>,
    only_position: Option<String>,
    morpheme: Option<String>,
    series: Option<String>,
    case_no: Option<i64>,        // parsed from TEXT
    #[serde(rename = "Image name")]
    image_name: Option<String>,
    timeline: Option<String>,
    word_windows_json: Option<String>,
    image_path: Option<String>,

    /* NEW: extra AOI columns (as a map keyed by their original column names) */
    aoi_extra: Option<HashMap<String, String>>,
}

/* recordings table */
#[derive(Debug, Serialize, Deserialize)]
pub struct RecordingRow {
    recording: String,
    participant: String,
    timeline: String,
    duration: Option<String>,
    date: Option<String>,
    gaze_samples: Option<i64>,
}

/* NEW: distinct pair used by UI */
#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineRecording {
    timeline: String,
    recording: String,
}

pub struct DbPool(Arc<Pool<SqliteConnectionManager>>);

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */

fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
    let mut stmt = match conn.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1",
    ) {
        Ok(s) => s,
        Err(_) => return false,
    };
    stmt.exists([name]).unwrap_or(false)
}

/* The extra AOI columns present in test_catalog (CSV columns 17..35) */
const EXTRA_AOI_COLS: [&str; 19] = [
    "Mentioned character (Animal)",
    "Mentioned object",
    "Mentioned character's extra object [For Szinghai]",
    "Mentioned character's extra object [For Vzinghai]",
    "Competitor character (Animal) [Correct interpretation]",
    "Competitor object [Correct interpretation (optional)]",
    "Competitor's extra object [Potentially correct interpretation]",
    "Dangling character i (Animal) [Potentially correct interpretation]",
    "Dangling object ia (R) [Potentially correct interpretation]",
    "Dangling object ib (L) [Potentially correct interpretation]",
    "Dangling character ii (Animal) [Potentially correct interpretation]",
    "Dangling object iia (R) [Potentially correct interpretation]",
    "Dangling object iib (L) [Potentially correct interpretation]",
    "Dangling character i (Animal) [Critical incorrect interpretation]",
    "Dangling object ia (R) [Critical incorrect interpretation]",
    "Dangling object ib (L) [Critical incorrect interpretation]",
    "Dangling character ii (Animal) [Critical incorrect interpretation]",
    "Dangling object iia (R) [Critical incorrect interpretation]",
    "Dangling object iib (L) [Critical incorrect interpretation]",
];

/* ──────────────────────────────────────────────────────────────
   Gaze-data backed commands
   ────────────────────────────────────────────────────────────── */

#[tauri::command]
async fn get_participants(pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(r#"SELECT DISTINCT "Participant name" FROM gaze_data ORDER BY "Participant name""#)
        .map_err(|e| e.to_string())?;

    let participants = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;

    Ok(participants)
}

#[tauri::command]
async fn get_test_names(pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(r#"SELECT DISTINCT "Test Name" FROM gaze_data ORDER BY "Test Name""#)
        .map_err(|e| e.to_string())?;

    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;

    Ok(names)
}

/* NEW: distinct (timeline, recording) pairs for a test+participant */
#[tauri::command]
async fn get_timeline_recordings(
    test_name: String,
    participants: Vec<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<TimelineRecording>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    let mut query = String::from(
        r#"SELECT DISTINCT "Timeline name", "Recording name"
           FROM gaze_data
           WHERE "Test Name" = ?1"#,
    );

    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    query.push_str(r#" ORDER BY "Timeline name", "Recording name""#);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test_name];
    for p in &participants {
        params.push(p);
    }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(TimelineRecording {
                timeline: row.get(0)?,
                recording: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<TimelineRecording>>>().map_err(|e| e.to_string())?)
}

#[tauri::command]
/* CHANGED: added optional `timeline` and `recording` filters */
async fn get_gaze_data(
    test_name: String,
    participants: Vec<String>,
    timeline: Option<String>,
    recording: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<Vec<GazeData>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    let mut query = String::from(
        r#"SELECT "Gaze point X", "Gaze point Y", Box, "Presented Media name",
                  "Timeline name", "Participant name", "Recording name",
                  "Exact time", "Test Name"
           FROM   gaze_data
           WHERE  "Test Name" = ?1"#,
    );

    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    if timeline.is_some() {
        query.push_str(" AND \"Timeline name\" = ?");
    }
    if recording.is_some() {
        query.push_str(" AND \"Recording name\" = ?");
    }
    query.push_str(" ORDER BY \"Exact time\"");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test_name];
    for p in &participants {
        params.push(p);
    }
    if let Some(ref tl) = timeline {
        params.push(tl);
    }
    if let Some(ref rc) = recording {
        params.push(rc);
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

    Ok(rows.collect::<SqlResult<Vec<GazeData>>>().map_err(|e| e.to_string())?)
}

#[tauri::command]
/* CHANGED: same optional filters as get_gaze_data */
async fn get_box_stats(
    test_name: String,
    participants: Vec<String>,
    timeline: Option<String>,
    recording: Option<String>,
    pool: State<'_, DbPool>,
) -> Result<GazeStats, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    let mut query = String::from(
        r#"SELECT Box, COUNT(*) AS count
           FROM   gaze_data
           WHERE  "Test Name" = ?1"#,
    );

    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    if timeline.is_some() {
        query.push_str(" AND \"Timeline name\" = ?");
    }
    if recording.is_some() {
        query.push_str(" AND \"Recording name\" = ?");
    }
    query.push_str(" GROUP BY Box");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test_name];
    for p in &participants {
        params.push(p);
    }
    if let Some(ref tl) = timeline {
        params.push(tl);
    }
    if let Some(ref rc) = recording {
        params.push(rc);
    }

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

/* ──────────────────────────────────────────────────────────────
   test_catalog-backed features
   ────────────────────────────────────────────────────────────── */

#[tauri::command]
async fn get_word_windows(
    test_name: String,
    timeline: Option<String>,                // kept for compatibility, but not required
    pool: State<'_, DbPool>,
) -> Result<Vec<WordWindow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    // Try exact+timeline (if provided), else exact by test_name, else prefix fallback
    let try_sqls: [&str; 3] = [
        // 1) exact + timeline
        r#"
        SELECT timeline, word_windows_json, test_name
        FROM   test_catalog
        WHERE  test_name = ?1 AND timeline = ?2
        LIMIT  1
        "#,
        // 2) exact by test_name
        r#"
        SELECT timeline, word_windows_json, test_name
        FROM   test_catalog
        WHERE  test_name = ?1
        LIMIT  1
        "#,
        // 3) prefix fallback (handles rows like "<name> ..." in your catalog)
        r#"
        SELECT timeline, word_windows_json, test_name
        FROM   test_catalog
        WHERE  ?1 LIKE test_name || '%'
        LIMIT  1
        "#,
    ];

    let mut row_opt: Option<(Option<String>, Option<String>, String)> = None;

    // 1) exact+timeline only if timeline was provided
    if let Some(ref tl) = timeline {
        if let Ok(mut stmt) = conn.prepare(try_sqls[0]) {
            row_opt = stmt.query_row(rusqlite::params![&test_name, tl], |row| {
                Ok((
                    row.get::<_, Option<String>>("timeline")?,
                    row.get::<_, Option<String>>("word_windows_json")?,
                    row.get::<_, String>("test_name")?,
                ))
            }).optional().map_err(|e| e.to_string())?;
        }
    }

    // 2) exact by test_name
    if row_opt.is_none() {
        let mut stmt = conn.prepare(try_sqls[1]).map_err(|e| e.to_string())?;
        row_opt = stmt.query_row([&test_name], |row| {
            Ok((
                row.get::<_, Option<String>>("timeline")?,
                row.get::<_, Option<String>>("word_windows_json")?,
                row.get::<_, String>("test_name")?,
            ))
        }).optional().map_err(|e| e.to_string())?;
    }

    // 3) prefix fallback
    if row_opt.is_none() {
        let mut stmt = conn.prepare(try_sqls[2]).map_err(|e| e.to_string())?;
        row_opt = stmt.query_row([&test_name], |row| {
            Ok((
                row.get::<_, Option<String>>("timeline")?,
                row.get::<_, Option<String>>("word_windows_json")?,
                row.get::<_, String>("test_name")?,
            ))
        }).optional().map_err(|e| e.to_string())?;
    }

    if let Some((timeline_opt, json_opt, tname)) = row_opt {
        let timeline = timeline_opt.unwrap_or_default();
        let mut out = Vec::<WordWindow>::new();
        if let Some(json) = json_opt {
            let val: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            if let Some(arr) = val.as_array() {
                for it in arr {
                    let w = it.get("w").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let start = it.get("start").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let end = it.get("end").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    out.push(WordWindow {
                        chinese_word: w,
                        start_sec: start,
                        end_sec: end,
                        test_name: tname.clone(),
                        timeline: timeline.clone(),
                    });
                }
            }
        }
        Ok(out)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
async fn get_test_image(
    app: AppHandle,
    test_name: String,
    timeline: Option<String>,                // kept for compatibility, but not required
    pool: State<'_, DbPool>,
) -> Result<Option<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    // Same three-step fallback pattern as above
    let try_sqls: [&str; 3] = [
        // 1) exact + timeline
        r#"
        SELECT image_path
        FROM   test_catalog
        WHERE  image_path IS NOT NULL AND TRIM(image_path) <> '' 
               AND test_name = ?1 AND timeline = ?2
        LIMIT  1
        "#,
        // 2) exact by test_name
        r#"
        SELECT image_path
        FROM   test_catalog
        WHERE  image_path IS NOT NULL AND TRIM(image_path) <> '' 
               AND test_name = ?1
        LIMIT  1
        "#,
        // 3) prefix fallback
        r#"
        SELECT image_path
        FROM   test_catalog
        WHERE  image_path IS NOT NULL AND TRIM(image_path) <> '' 
               AND ?1 LIKE test_name || '%'
        LIMIT  1
        "#,
    ];

    let mut image_path: Option<String> = None;

    // 1) exact+timeline only if timeline provided
    if let Some(ref tl) = timeline {
        if let Ok(mut stmt) = conn.prepare(try_sqls[0]) {
            image_path = stmt.query_row(rusqlite::params![&test_name, tl], |row| {
                row.get::<_, Option<String>>("image_path")
            }).optional().map_err(|e| e.to_string())?.flatten();
        }
    }

    // 2) exact by test_name
    if image_path.is_none() {
        let mut stmt = conn.prepare(try_sqls[1]).map_err(|e| e.to_string())?;
        image_path = stmt.query_row([&test_name], |row| {
            row.get::<_, Option<String>>("image_path")
        }).optional().map_err(|e| e.to_string())?.flatten();
    }

    // 3) prefix fallback
    if image_path.is_none() {
        let mut stmt = conn.prepare(try_sqls[2]).map_err(|e| e.to_string())?;
        image_path = stmt.query_row([&test_name], |row| {
            row.get::<_, Option<String>>("image_path")
        }).optional().map_err(|e| e.to_string())?.flatten();
    }

    let Some(rel) = image_path else { return Ok(None); };
    if rel.trim().is_empty() { return Ok(None); }

    let base = app.path()
        .resolve("resources", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let mut full: PathBuf = base;
    full.push(rel);

    let bytes = fs::read(&full).map_err(|e| format!("read image: {e}"))?;
    let b64 = general_purpose::STANDARD.encode(bytes);
    Ok(Some(b64))
}


/* AOI map optional */
#[tauri::command]
async fn get_aoi_map(
    test_name: String,
    pool: State<'_, DbPool>,
) -> Result<Vec<AoiRow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    if !table_exists(&conn, "aoi_map") {
        return Ok(vec![]);
    }
    let mut stmt = conn.prepare(
        r#"SELECT tag, region_id, rgb_hex
           FROM   aoi_map
           WHERE  test_name = ?1"#,
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&test_name], |row| {
            Ok(AoiRow {
                tag: row.get("tag")?,
                region_id: row.get("region_id")?,
                rgb_hex: row.get::<_, Option<String>>("rgb_hex")?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<AoiRow>>>().map_err(|e| e.to_string())?)
}

/* Back-compat: frontend still calls get_all_test_meta. */
#[tauri::command]
async fn get_all_test_meta(pool: State<'_, DbPool>) -> Result<Vec<TestMetaRow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        r#"SELECT test_name, sentence, truth_value, only_position,
                  morpheme, series, case_no
           FROM   test_catalog"#,
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        let case_txt: Option<String> = row.get("case_no")?;
        let case_no = case_txt.and_then(|s| s.trim().parse::<i64>().ok());
        Ok(TestMetaRow {
            test_name: row.get("test_name")?,
            sentence: row.get("sentence")?,
            truth_value: row.get("truth_value")?,
            only_position: row.get("only_position")?,
            morpheme: row.get("morpheme")?,
            series: row.get("series")?,
            case_no,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<TestMetaRow>>>().map_err(|e| e.to_string())?)
}

/* Full catalog including extra AOIs as a map */
#[tauri::command]
async fn get_all_test_catelog(pool: State<'_, DbPool>) -> Result<Vec<TestCatalogRow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;

    // Build SELECT with named columns so we can get by name safely.
    let quoted_extras = EXTRA_AOI_COLS
        .iter()
        .map(|c| format!(r#""{}""#, c))
        .collect::<Vec<_>>()
        .join(",");

    let select = format!(
        r#"SELECT
            test_name, sentence, "group",
            correct_AOIs, potentially_correct_AOIs, incorrect_AOIs,
            correct_NULL, potentially_correct_NULL, incorrect_NULL,
            truth_value, only_position, morpheme, series, case_no,
            "Image name", timeline, word_windows_json, {quoted_extras},
            image_path
        FROM test_catalog
        ORDER BY test_name"#
    );

    let mut stmt = conn.prepare(&select).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        // case_no is stored as TEXT sometimes
        let case_txt: Option<String> = row.get("case_no")?;
        let case_no = case_txt.and_then(|s| s.trim().parse::<i64>().ok());

        // Collect extra AOIs into a map
        let mut aoi_map: HashMap<String, String> = HashMap::new();
        for key in EXTRA_AOI_COLS.iter() {
            let v: Option<String> = row.get(*key)?;
            if let Some(s) = v {
                if !s.trim().is_empty() {
                    aoi_map.insert((*key).to_string(), s);
                }
            }
        }
        let aoi_extra = if aoi_map.is_empty() { None } else { Some(aoi_map) };

        Ok(TestCatalogRow {
            test_name: row.get("test_name")?,
            sentence: row.get("sentence")?,
            group_: row.get::<_, Option<String>>("group")?,
            correct_AOIs: row.get("correct_AOIs")?,
            potentially_correct_AOIs: row.get("potentially_correct_AOIs")?,
            incorrect_AOIs: row.get("incorrect_AOIs")?,
            correct_NULL: row.get("correct_NULL")?,
            potentially_correct_NULL: row.get("potentially_correct_NULL")?,
            incorrect_NULL: row.get("incorrect_NULL")?,
            truth_value: row.get("truth_value")?,
            only_position: row.get("only_position")?,
            morpheme: row.get("morpheme")?,
            series: row.get("series")?,
            case_no,
            image_name: row.get("Image name")?,
            timeline: row.get("timeline")?,
            word_windows_json: row.get("word_windows_json")?,
            image_path: row.get("image_path")?,
            aoi_extra,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<TestCatalogRow>>>().map_err(|e| e.to_string())?)
}

/* New: recordings table dump */
#[tauri::command]
async fn get_all_recordings(pool: State<'_, DbPool>) -> Result<Vec<RecordingRow>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    if !table_exists(&conn, "recordings") {
        return Ok(vec![]);
    }

    let mut stmt = conn.prepare(
        r#"SELECT "Recording", "Participant", "Timeline", "Duration", "Date", "Gaze samples"
           FROM   recordings
           ORDER  BY "Date", "Recording""#,
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(RecordingRow {
            recording: row.get("Recording")?,
            participant: row.get("Participant")?,
            timeline: row.get("Timeline")?,
            duration: row.get("Duration")?,
            date: row.get("Date")?,
            gaze_samples: row.get::<_, Option<i64>>("Gaze samples")?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.collect::<SqlResult<Vec<RecordingRow>>>().map_err(|e| e.to_string())?)
}

/* ──────────────────────────────────────────────────────────────
   App bootstrap
   ────────────────────────────────────────────────────────────── */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            let mut url = Url::from_file_path(&resource_path)
                .map_err(|_| {
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
            // gaze
            get_participants,
            get_test_names,
            get_timeline_recordings,   // NEW
            get_gaze_data,             // CHANGED signature
            get_box_stats,             // CHANGED signature
            // catalog / meta / images
            get_word_windows,          // CHANGED signature
            get_test_image,            // CHANGED signature
            get_aoi_map,
            get_all_test_meta,         // back-compat
            get_all_test_catelog,      // new
            // recordings
            get_all_recordings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
