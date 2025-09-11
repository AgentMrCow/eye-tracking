# Eye Tracking Analysis Application

A comprehensive eye tracking data analysis platform built with Tauri, SolidJS, and TypeScript. This application analyzes Chinese language comprehension through gaze pattern analysis and Area of Interest (AOI) classification.

## Project Overview

This application processes eye tracking data from Chinese language comprehension studies, providing:
- Real-time gaze data visualization and analysis
- AOI (Area of Interest) classification and comparison
- Participant performance metrics and quality control
- Advanced statistical analysis with bootstrapping and permutation testing
- Multi-test comparison capabilities

## Technology Stack

- **Frontend**: SolidJS + TypeScript + Tailwind CSS
- **Backend**: Tauri (Rust)
- **Database**: SQLite (eye_tracking.db)
- **Charts**: Chart.js with custom plugins
- **UI Components**: Kobalte (headless UI primitives)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Database Structure

The SQLite database (`src-tauri/resources/eye_tracking.db`) contains:

### Core Tables
- **`gaze_data`** (1.8M rows): Timestamped gaze coordinates with AOI classifications
  - Columns: Exact time, Gaze point X/Y, Box, Presented Media name, Timeline name, Participant name, Recording name, Test Name
- **`test_catalog`** (48 rows): Test metadata and AOI definitions
  - Columns: test_name, sentence, group, self_AOIs, correct_AOIs, potentially_correct_AOIs, incorrect_AOIs, correct_NULL, potentially_correct_NULL, incorrect_NULL, image_path
- **`participants`** (36 rows): Participant information with QAC flags
  - Columns: participant (PRIMARY KEY), is_qac (INTEGER NOT NULL)
- **`recordings`**: Session metadata
- **`test_group`**: Test grouping information

### Data Relationships
```
Tests (stimuli) → Participants → Sessions (Timeline/Recording) → Gaze Points → AOI Classifications
```

## Key Features

### 1. Gaze Analysis (`/gaze`)
- Real-time gaze point visualization over stimulus images
- Time-series charts showing AOI percentages over time
- Quality filtering based on recording validity percentages
- Playback controls with progressive revelation

### 2. Catalog Compare (`/compare`)
- Side-by-side comparison of two test sessions
- Synchronized playback with gaze overlay
- Statistical analysis of AOI performance differences

### 3. Advanced Compare (`/advanced`)
- Multi-test, multi-participant statistical analysis
- Bootstrap confidence intervals and cluster permutation testing
- Flexible AOI set configuration
- Word window alignment and analysis

### 4. Data Management (`/data-toggle`)
- Disable problematic test/participant/recording combinations
- Quality control through selective data exclusion
- Persistent settings via `disabled_slices.json`

## Quality Assurance (QAC)

- **QAC Participants**: TLK311–TLK320 marked as `is_qac = 0` (non-QAC)
- **Quality Filtering**: Recording validity percentages filter out low-quality sessions
- **Data Toggle**: Manual exclusion of problematic data combinations

## API Endpoints

Key Tauri commands:
- `get_participants()`: Returns participant table with QAC flags
- `search_tests()`: Searchable test metadata
- `get_gaze_data()`: Filtered gaze data by test/participant/session
- `get_box_stats()`: AOI percentage statistics
- `get_timeline_recordings()`: Available sessions for test/participant pairs

## Development Notes

### Recent Improvements (2025-01-12)
- Fixed participant selection issues in Advanced Compare
- Added race condition protection to async effects
- Cleaned up debug logging for production
- Enhanced error handling and user feedback
- Improved CSS consistency

### Code Quality
- Race condition protection in all async effects
- Proper cleanup of stale requests
- Production-ready logging (debug statements commented out)
- Consistent error handling patterns
