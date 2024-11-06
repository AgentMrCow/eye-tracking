// src-tauri/src/lib.rs

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri_plugin_sql::{Builder, Migration, MigrationKind};
use serde::Deserialize;
use tauri::{command};
use std::fs::File;

// Define the data structure matching the CSV
#[derive(Debug, Deserialize)]
struct GazeDataCSV {
    #[serde(rename = "Gaze point X")]
    gaze_point_x: f64,

    #[serde(rename = "Gaze point Y")]
    gaze_point_y: f64,

    #[serde(rename = "Box")]
    box_name: String,

    #[serde(rename = "Presented Media name")]
    presented_media_name: String,

    #[serde(rename = "Timeline name")]
    timeline_name: String,

    #[serde(rename = "Participant name")]
    participant_name: String,

    #[serde(rename = "Recording name")]
    recording_name: String,

    #[serde(rename = "Exact time")]
    exact_time: String,

    #[serde(rename = "Test Name")]
    test_name: String,
}

// Migration to create the gaze_data table
fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_gaze_data_table",
            sql: "
                CREATE TABLE IF NOT EXISTS gaze_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gaze_point_x REAL,
                    gaze_point_y REAL,
                    box_name TEXT,
                    presented_media_name TEXT,
                    timeline_name TEXT,
                    participant_name TEXT,
                    recording_name TEXT,
                    exact_time TEXT,
                    test_name TEXT
                );
            ",
            kind: MigrationKind::Up,
        },
    ]
}

// Define a Tauri command to load CSV data into the database
#[command]
async fn load_csv_data(
    db_handle: tauri_plugin_sql::Sql,
) -> Result<String, String> {
    // Determine the path to the CSV file
    let resource_dir = tauri::api::path::resource_dir().ok_or("Failed to get resource directory")?;
    let csv_path = resource_dir.join("resources/combined_tests_complete_corrected.csv");

    // Open the CSV file
    let file = File::open(&csv_path).map_err(|e| format!("Failed to open CSV file: {}", e))?;
    let mut rdr = csv::Reader::from_reader(file);

    // Prepare the insert statement
    let insert_sql = "
        INSERT INTO gaze_data (
            gaze_point_x,
            gaze_point_y,
            box_name,
            presented_media_name,
            timeline_name,
            participant_name,
            recording_name,
            exact_time,
            test_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ";

    // Begin a transaction for efficient bulk insertion
    db_handle.execute("BEGIN TRANSACTION;").map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Iterate over CSV records and insert into the database
    for result in rdr.deserialize() {
        let record: GazeDataCSV = result.map_err(|e| format!("Failed to deserialize record: {}", e))?;
        
        db_handle.execute_with_values(
            insert_sql,
            &[
                &record.gaze_point_x,
                &record.gaze_point_y,
                &record.box_name,
                &record.presented_media_name,
                &record.timeline_name,
                &record.participant_name,
                &record.recording_name,
                &record.exact_time,
                &record.test_name,
            ],
        ).map_err(|e| format!("Failed to execute insert: {}", e))?;
    }

    // Commit the transaction
    db_handle.execute("COMMIT;").map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok("CSV data loaded successfully.".into())
}

pub fn run() {
    let migrations = get_migrations();

    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations("sqlite:eye_tracking.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![load_csv_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
