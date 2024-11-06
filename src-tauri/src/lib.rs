// src-tauri/src/lib.rs

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri_plugin_sql::{Builder, Migration, MigrationKind, DbInstances, DbPool};
use serde::Deserialize;
use sqlx::sqlite::SqlitePool;
use tauri::api::path::resource_dir;
use csv::ReaderBuilder;

#[derive(Debug, Deserialize)]
struct GazeDataRecord {
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

pub fn run() {
    let migrations = vec![
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
    ];

    tauri::Builder::default()
        .plugin(
            Builder::default()
                .add_migrations("sqlite:eye_tracking.db", migrations)
                .build(),
        )
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Spawn an asynchronous task
            tauri::async_runtime::spawn(async move {
                // Access the database instances
                let db_instances = app_handle.state::<DbInstances>();
                let db_url = "sqlite:eye_tracking.db".to_string();

                // Acquire a read lock to access the DbPool
                let pool_option = {
                    let instances = db_instances.0.read().await;
                    instances.get(&db_url)
                };

                if let Some(db_pool) = pool_option {
                    {
                        // Access the SQLite pool by matching on DbPool enum
                        let sqlite_pool = match db_pool {
                            DbPool::Sqlite(pool) => pool,
                            _ => {
                                eprintln!("Unsupported database pool type");
                                return;
                            },
                        };

                        // Check if the gaze_data table is empty
                        let count: (i64,) = match sqlx::query_as("SELECT COUNT(*) FROM gaze_data")
                            .fetch_one(sqlite_pool)
                            .await
                        {
                            Ok(count) => count,
                            Err(e) => {
                                eprintln!("Failed to query gaze_data table: {}", e);
                                return;
                            }
                        };

                        if count.0 == 0 {
                            // Access the resource directory using PathResolver
                            let resource_dir = match resource_dir(&app_handle) {
                                Some(dir) => dir,
                                None => {
                                    eprintln!("Failed to get resource directory");
                                    return;
                                },
                            };
                            let csv_path = resource_dir.join("data").join("eye_tracking.csv");

                            if !csv_path.exists() {
                                eprintln!("CSV file not found at {:?}", csv_path);
                                return;
                            }

                            // Create a CSV reader
                            let mut rdr = match ReaderBuilder::new()
                                .has_headers(true)
                                .from_path(&csv_path)
                            {
                                Ok(reader) => reader,
                                Err(e) => {
                                    eprintln!("Failed to create CSV reader: {}", e);
                                    return;
                                }
                            };

                            // Begin a transaction for bulk insertion
                            let mut transaction = match sqlite_pool.begin().await {
                                Ok(tx) => tx,
                                Err(e) => {
                                    eprintln!("Failed to begin transaction: {}", e);
                                    return;
                                }
                            };

                            // Iterate over each record and insert into the database
                            for result in rdr.deserialize() {
                                let record: GazeDataRecord = match result {
                                    Ok(rec) => rec,
                                    Err(e) => {
                                        eprintln!("Failed to deserialize record: {}", e);
                                        continue; // Skip this record
                                    }
                                };

                                if let Err(e) = sqlx::query(
                                    "INSERT INTO gaze_data (gaze_point_x, gaze_point_y, box_name, presented_media_name, timeline_name, participant_name, recording_name, exact_time, test_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                )
                                .bind(record.gaze_point_x)
                                .bind(record.gaze_point_y)
                                .bind(record.box_name)
                                .bind(record.presented_media_name)
                                .bind(record.timeline_name)
                                .bind(record.participant_name)
                                .bind(record.recording_name)
                                .bind(record.exact_time)
                                .bind(record.test_name)
                                .execute(&mut transaction)
                                .await
                                {
                                    eprintln!("Failed to insert record: {}", e);
                                    continue; // Skip to next record
                                }
                            }

                            // Commit the transaction
                            if let Err(e) = transaction.commit().await {
                                eprintln!("Failed to commit transaction: {}", e);
                            }
                        }
                    }
                } else {
                    eprintln!("Database pool not found");
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
