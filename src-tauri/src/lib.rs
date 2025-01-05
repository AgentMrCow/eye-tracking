// src-tauri/src/lib.rs

use rusqlite::Result as SqlResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{State, Manager};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::sync::Arc;
use tauri::path::BaseDirectory;

#[derive(Debug, Serialize, Deserialize)]
pub struct GazeData {
    gaze_x: f64,
    gaze_y: f64,
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

pub struct DbPool(Arc<Pool<SqliteConnectionManager>>);

#[tauri::command]
async fn get_participants(pool: State<'_, DbPool>) -> Result<Vec<String>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT \"Participant name\" FROM gaze_data ORDER BY \"Participant name\"")
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
        .prepare("SELECT DISTINCT \"Test Name\" FROM gaze_data ORDER BY \"Test Name\"")
        .map_err(|e| e.to_string())?;
    
    let tests = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<String>>>()
        .map_err(|e| e.to_string())?;

    Ok(tests)
}

#[tauri::command]
async fn get_gaze_data(
    test_name: String,
    participants: Vec<String>,
    pool: State<'_, DbPool>
) -> Result<Vec<GazeData>, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut query = String::from(
        "SELECT \"Gaze point X\", \"Gaze point Y\", Box, \"Presented Media name\", 
         \"Timeline name\", \"Participant name\", \"Recording name\", \"Exact time\", \"Test Name\"
         FROM gaze_data 
         WHERE \"Test Name\" = ?"
    );
    
    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    query.push_str(" ORDER BY \"Exact time\"");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test_name];
    for p in &participants {
        params.push(p);
    }

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(GazeData {
                gaze_x: row.get(0)?,
                gaze_y: row.get(1)?,
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

    let data = rows.collect::<SqlResult<Vec<GazeData>>>().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
async fn get_box_stats(
    test_name: String,
    participants: Vec<String>,
    pool: State<'_, DbPool>
) -> Result<GazeStats, String> {
    let conn = pool.0.get().map_err(|e| e.to_string())?;
    let mut query = String::from(
        "SELECT Box, COUNT(*) as count 
         FROM gaze_data 
         WHERE \"Test Name\" = ?"
    );
    
    if !participants.is_empty() {
        query.push_str(" AND \"Participant name\" IN (");
        query.push_str(&vec!["?"; participants.len()].join(","));
        query.push(')');
    }
    query.push_str(" GROUP BY Box");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&test_name];
    for p in &participants {
        params.push(p);
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

    Ok(GazeStats {
        box_percentages: box_counts,
        total_points,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Add print statement to indicate setup has started
            println!("Setting up the application...");

            // Resolve the "eye_tracking.db" file from the Resource directory
            let resource_path = match app
                .path()
                .resolve("resources/eye_tracking.db", BaseDirectory::Resource)
            {
                Ok(path) => {
                    println!("Resolved DB path: {:?}", path);
                    path
                },
                Err(e) => {
                    println!("Failed to resolve resource path for DB file: {}", e);
                    return Err(e.into());
                }
            };

            // Check if the database file exists
            if resource_path.exists() {
                println!("Database file found at path: {:?}", resource_path);
            } else {
                println!("Database file does NOT exist at path: {:?}", resource_path);
            }

            // Optionally, print the current working directory
            match std::env::current_dir() {
                Ok(dir) => println!("Current working directory: {:?}", dir),
                Err(e) => println!("Failed to get current working directory: {}", e),
            }

            // Optionally, list contents of the resource directory for verification
            // if let Some(dir) = resource_path.parent() {
            //     println!("Listing contents of resource directory: {:?}", dir);
            //     match std::fs::read_dir(dir) {
            //         Ok(entries) => {
            //             for entry in entries {
            //                 match entry {
            //                     Ok(entry) => {
            //                         println!(" - {:?}", entry.path());
            //                     }
            //                     Err(e) => {
            //                         println!("Error reading directory entry: {}", e);
            //                     }
            //                 }
            //             }
            //         }
            //         Err(e) => {
            //             println!("Failed to read resource directory: {}", e);
            //         }
            //     }
            // } else {
            //     println!("Failed to get parent directory of resource path.");
            // }

            // Create the pool using the resolved path
            let manager = SqliteConnectionManager::file(&resource_path);
            let pool = match Pool::new(manager) {
                Ok(p) => {
                    println!("Database pool created successfully.");
                    p
                },
                Err(e) => {
                    println!("Failed to create database pool: {}", e);
                    return Err(e.into());
                }
            };

            // Make the database pool globally available as `DbPool`
            app.manage(DbPool(Arc::new(pool)));

            // Indicate that setup completed successfully
            println!("Setup completed successfully.");

            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_participants,
            get_test_names,
            get_gaze_data,
            get_box_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
