// src-tauri/src/lib.rs

use serde::Serialize;
use tauri_plugin_sql::Sql;
use tauri::State;

// Define data structures for serialization
#[derive(Serialize)]
struct GazeData {
    gaze_point_x: f64,
    gaze_point_y: f64,
    count: u32,
}

#[derive(Serialize)]
struct AggregatedData {
    label: String,
    data: Vec<f64>,
}

#[tauri::command]
async fn get_average_gaze_points(sql: State<'_, Sql>) -> Result<Vec<GazeData>, String> {
    // Query to calculate average gaze points grouped by some category, e.g., Participant
    let query = "
        SELECT AVG(`Gaze point X`) as avg_x, AVG(`Gaze point Y`) as avg_y, `Participant name`, COUNT(*) as count
        FROM eye_tracking
        GROUP BY `Participant name`
        LIMIT 100; -- Limit to prevent too much data
    ";

    let result = sql
        .prepare("sqlite:database/eye_tracking.db")
        .await
        .map_err(|e| e.to_string())?
        .query(query)
        .await
        .map_err(|e| e.to_string())?;

    let mut gaze_data = Vec::new();

    for row in result.rows {
        let avg_x: f64 = row.get("avg_x").unwrap_or(0.0);
        let avg_y: f64 = row.get("avg_y").unwrap_or(0.0);
        let participant: String = row.get("Participant name").unwrap_or_default();
        let count: u32 = row.get("count").unwrap_or(0);

        gaze_data.push(GazeData {
            gaze_point_x: avg_x,
            gaze_point_y: avg_y,
            count,
        });
    }

    Ok(gaze_data)
}

#[tauri::command]
async fn get_gaze_over_time(sql: State<'_, Sql>) -> Result<AggregatedData, String> {
    // Example: Count gaze points over time (e.g., per minute)
    let query = "
        SELECT 
            strftime('%Y-%m-%d %H:%M', `Exact time`) as time_min,
            COUNT(*) as count
        FROM eye_tracking
        GROUP BY time_min
        ORDER BY time_min
        LIMIT 1000; -- Limit to prevent too much data
    ";

    let result = sql
        .prepare("sqlite:database/eye_tracking.db")
        .await
        .map_err(|e| e.to_string())?
        .query(query)
        .await
        .map_err(|e| e.to_string())?;

    let mut labels = Vec::new();
    let mut data = Vec::new();

    for row in result.rows {
        let time_min: String = row.get("time_min").unwrap_or_default();
        let count: u32 = row.get("count").unwrap_or(0);

        labels.push(time_min);
        data.push(count as f64);
    }

    Ok(AggregatedData {
        label: "Gaze Points Over Time".to_string(),
        data,
    })
}

#[tauri::command]
async fn get_gaze_heatmap(sql: State<'_, Sql>) -> Result<Vec<GazeData>, String> {
    // Fetch gaze points for heatmap
    let query = "
        SELECT `Gaze point X`, `Gaze point Y`, COUNT(*) as count
        FROM eye_tracking
        GROUP BY `Gaze point X`, `Gaze point Y`
        ORDER BY count DESC
        LIMIT 10000; -- Adjust limit based on performance
    ";

    let result = sql
        .prepare("sqlite:database/eye_tracking.db")
        .await
        .map_err(|e| e.to_string())?
        .query(query)
        .await
        .map_err(|e| e.to_string())?;

    let mut heatmap_data = Vec::new();

    for row in result.rows {
        let x: f64 = row.get("Gaze point X").unwrap_or(0.0);
        let y: f64 = row.get("Gaze point Y").unwrap_or(0.0);
        let count: u32 = row.get("count").unwrap_or(0);

        heatmap_data.push(GazeData {
            gaze_point_x: x,
            gaze_point_y: y,
            count,
        });
    }

    Ok(heatmap_data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_average_gaze_points,
            get_gaze_over_time,
            get_gaze_heatmap
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
