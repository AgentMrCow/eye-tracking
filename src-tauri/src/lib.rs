// src-tauri/src/lib.rs

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use tauri::State;
use tauri_plugin_sql::{Builder as SqlBuilder, DbInstances, Migration, MigrationKind};
use sqlx::Arguments;

// Define the GazeData struct with proper field names
#[derive(Serialize)]
struct GazeData {
    gaze_point_x: f64,
    gaze_point_y: f64,
    box_name: String, // Renamed from `box` to `box_name`
    presented_media_name: String,
    timeline_name: String,
    participant_name: String,
    recording_name: String,
    exact_time: String,
    test_name: String,
}

#[tauri::command]
async fn get_gaze_data(
    db_instances: State<'_, DbInstances>,
    test_name: Option<String>,
    participant_names: Option<Vec<String>>,
) -> Result<Vec<GazeData>, String> {
    let db_name = "sqlite:eye_tracking.db";
    let pool = db_instances.0.read().await.get(db_name)
        .cloned()
        .ok_or("Database not loaded")?;
    
    let mut query = "SELECT gaze_point_x, gaze_point_y, box, presented_media_name, timeline_name, participant_name, recording_name, exact_time, test_name FROM gaze_data".to_string();
    let mut conditions = Vec::new();
    let mut params: Vec<serde_json::Value> = Vec::new();

    if let Some(ref test) = test_name {
        conditions.push("test_name = ?".to_string());
        params.push(serde_json::Value::String(test.clone()));
    }

    if let Some(ref participants) = participant_names {
        if !participants.is_empty() {
            let placeholders = participants.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            conditions.push(format!("participant_name IN ({})", placeholders));
            for p in participants {
                params.push(serde_json::Value::String(p.clone()));
            }
        }
    }

    if !conditions.is_empty() {
        query.push_str(" WHERE ");
        query.push_str(&conditions.join(" AND "));
    }

    let rows = pool.select(query, params).await.map_err(|e| e.to_string())?;

    let gaze_data = rows.iter().map(|row| GazeData {
        gaze_point_x: row.get("gaze_point_x").as_f64().unwrap_or(0.0),
        gaze_point_y: row.get("gaze_point_y").as_f64().unwrap_or(0.0),
        box_name: row.get("box").as_str().unwrap_or("").to_string(),
        presented_media_name: row.get("presented_media_name").as_str().unwrap_or("").to_string(),
        timeline_name: row.get("timeline_name").as_str().unwrap_or("").to_string(),
        participant_name: row.get("participant_name").as_str().unwrap_or("").to_string(),
        recording_name: row.get("recording_name").as_str().unwrap_or("").to_string(),
        exact_time: row.get("exact_time").as_str().unwrap_or("").to_string(),
        test_name: row.get("test_name").as_str().unwrap_or("").to_string(),
    }).collect();

    Ok(gaze_data)
}

#[derive(Serialize)]
struct Test {
    test_name: String,
}

#[tauri::command]
async fn get_tests(db_instances: State<'_, DbInstances>) -> Result<Vec<Test>, String> {
    let db_name = "sqlite:eye_tracking.db";
    let pool = db_instances.0.read().await.get(db_name)
        .cloned()
        .ok_or("Database not loaded")?;

    let query = "SELECT DISTINCT test_name FROM gaze_data";
    let params: Vec<serde_json::Value> = Vec::new();

    let rows = pool.select(query.to_string(), params).await.map_err(|e| e.to_string())?;

    let tests = rows.iter().map(|row| Test {
        test_name: row.get("test_name").as_str().unwrap_or("").to_string(),
    }).collect();

    Ok(tests)
}

#[derive(Serialize)]
struct Participant {
    participant_name: String,
}

#[tauri::command]
async fn get_participants(db_instances: State<'_, DbInstances>) -> Result<Vec<Participant>, String> {
    let db_name = "sqlite:eye_tracking.db";
    let pool = db_instances.0.read().await.get(db_name)
        .cloned()
        .ok_or("Database not loaded")?;

    let query = "SELECT DISTINCT participant_name FROM gaze_data";
    let params: Vec<serde_json::Value> = Vec::new();

    let rows = pool.select(query.to_string(), params).await.map_err(|e| e.to_string())?;

    let participants = rows.iter().map(|row| Participant {
        participant_name: row.get("participant_name").as_str().unwrap_or("").to_string(),
    }).collect();

    Ok(participants)
}

#[derive(Serialize)]
struct AggregatedGazeData {
    exact_time: String,
    box_name: String,
    percentage: f64,
}

#[tauri::command]
async fn get_aggregated_gaze_data(
    db_instances: State<'_, DbInstances>,
    test_name: Option<String>,
    participant_names: Option<Vec<String>>,
) -> Result<Vec<AggregatedGazeData>, String> {
    let db_name = "sqlite:eye_tracking.db";
    let pool = db_instances.0.read().await.get(db_name)
        .cloned()
        .ok_or("Database not loaded")?;
    
    let mut query = "
        SELECT exact_time, box, COUNT(*) as count, 
               (COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY exact_time)) as percentage
        FROM gaze_data
    "
    .to_string();

    let mut conditions = Vec::new();
    let mut params: Vec<serde_json::Value> = Vec::new();

    if let Some(ref test) = test_name {
        conditions.push("test_name = ?".to_string());
        params.push(serde_json::Value::String(test.clone()));
    }

    if let Some(ref participants) = participant_names {
        if !participants.is_empty() {
            let placeholders = participants.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
            conditions.push(format!("participant_name IN ({})", placeholders));
            for p in participants {
                params.push(serde_json::Value::String(p.clone()));
            }
        }
    }

    if !conditions.is_empty() {
        query.push_str(" WHERE ");
        query.push_str(&conditions.join(" AND "));
    }

    query.push_str(" GROUP BY exact_time, box");

    let rows = pool.select(query, params).await.map_err(|e| e.to_string())?;

    let aggregated_data = rows.iter().map(|row| AggregatedGazeData {
        exact_time: row.get("exact_time").as_str().unwrap_or("").to_string(),
        box_name: row.get("box").as_str().unwrap_or("").to_string(),
        percentage: row.get("percentage").as_f64().unwrap_or(0.0),
    }).collect();

    Ok(aggregated_data)
}

#[derive(Serialize)]
struct ComparisonData {
    participant_name: String,
    exact_time: String,
    box_name: String,
    gaze_count: i32,
}

#[tauri::command]
async fn compare_participants(
    db_instances: State<'_, DbInstances>,
    test_name: String,
    participant_names: Vec<String>,
) -> Result<Vec<ComparisonData>, String> {
    if participant_names.is_empty() {
        return Err("Participant names cannot be empty".to_string());
    }

    let db_name = "sqlite:eye_tracking.db";
    let pool = db_instances.0.read().await.get(db_name)
        .cloned()
        .ok_or("Database not loaded")?;

    let placeholders = participant_names.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let query = format!(
        "SELECT participant_name, exact_time, box, COUNT(*) as gaze_count 
         FROM gaze_data 
         WHERE test_name = ? AND participant_name IN ({}) 
         GROUP BY participant_name, exact_time, box",
        placeholders
    );

    let mut params: Vec<serde_json::Value> = Vec::new();
    params.push(serde_json::Value::String(test_name));
    for name in participant_names {
        params.push(serde_json::Value::String(name));
    }

    let rows = pool.select(query, params).await.map_err(|e| e.to_string())?;

    let comparison_data = rows.iter().map(|row| ComparisonData {
        participant_name: row.get("participant_name").as_str().unwrap_or("").to_string(),
        exact_time: row.get("exact_time").as_str().unwrap_or("").to_string(),
        box_name: row.get("box").as_str().unwrap_or("").to_string(),
        gaze_count: row.get("gaze_count").as_i64().unwrap_or(0) as i32,
    }).collect();

    Ok(comparison_data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Define migrations if needed
    let migrations = vec![Migration {
        version: 1,
        description: "create_gaze_data_table",
        sql: "CREATE TABLE IF NOT EXISTS gaze_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gaze_point_x REAL,
                gaze_point_y REAL,
                box TEXT,
                presented_media_name TEXT,
                timeline_name TEXT,
                participant_name TEXT,
                recording_name TEXT,
                exact_time TEXT,
                test_name TEXT
            );",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            SqlBuilder::new()
                .add_migrations("sqlite:eye_tracking.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_gaze_data,
            get_tests,
            get_participants,
            get_aggregated_gaze_data,
            compare_participants
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
