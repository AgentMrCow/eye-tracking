#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Builder as SqlPluginBuilder, Migration, MigrationKind};
use tauri_plugin_shell::init as shell_init;
use dirs::data_dir;
use std::path::PathBuf;
use std::fs;

/// Tauri command to get the absolute path of the database.
#[tauri::command]
fn get_db_path() -> Result<String, String> {
    let data_dir_path = data_dir().ok_or("Failed to retrieve data directory")?;
    let db_path = data_dir_path.join("eye_tracking.db");
    Ok(db_path.to_str().unwrap().to_string())
}

fn main() {
    // **1. Determine the Data Directory Using the dirs Crate**
    let data_dir_path = data_dir().expect("Failed to retrieve data directory");
    let mut db_path = PathBuf::from(&data_dir_path);
    db_path.push("eye_tracking.db"); // Database will be located in the data directory

    // **2. Log the Resolved Database Path for Debugging**
    println!("🔍 Resolved database path: {:?}", db_path);

    // **3. Check if the Database File Exists**
    if db_path.exists() {
        println!("✅ Database file exists.");
    } else {
        println!("❌ Database file does NOT exist at the specified path.");
        // **Optionally, create the database file if it doesn't exist**
        if let Err(e) = fs::File::create(&db_path) {
            println!("Failed to create database file: {}", e);
            // Handle the error as needed (e.g., exit, notify user)
        } else {
            println!("✅ Database file created successfully.");
        }
    }

    // **4. Define Migrations Matching Your Database Schema**
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_gaze_data_table",
            sql: "
                CREATE TABLE IF NOT EXISTS gaze_data (
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
                );
            ",
            kind: MigrationKind::Up,
        },
        // Add more migrations as needed for future schema changes
    ];

    // **5. Construct the Connection String**
    let connection_str = format!("sqlite:{}", db_path.to_str().unwrap());

    // **6. Initialize the SQL Plugin with the Connection String and Migrations**
    let sql_plugin = SqlPluginBuilder::default()
        .add_migrations(&connection_str, migrations) // Pass &str instead of String
        .build();

    // **7. Build and Run the Tauri Application**
    tauri::Builder::default()
        .plugin(sql_plugin)
        .plugin(shell_init())
        .invoke_handler(tauri::generate_handler![greet, get_db_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
