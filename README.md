# Tauri + Solid + Typescript

This template should help get you started developing with Tauri, Solid and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Backend Notes (QAC)
- Database (`src-tauri/resources/eye_tracking.db`) includes table `participants(participant TEXT PRIMARY KEY, is_qac INTEGER)`.
- Preloaded non-QAC participants: TLK311–TLK320 (`is_qac = 0`). Others are considered QAC by default.
- Tauri command: `get_participants()` returns the full `participants` table.
 - Tauri command: `search_tests()` returns searchable test metadata combining `test_catalog` (group, image, sentence) and `test_group` (avg mp4+png duration).

## Data Toggle Panel
- Route: `/data-toggle` in the app sidebar.
- Purpose: Temporarily disable any `Test × Recording × Participant` combinations.
- Persistence: Disabled triples saved to `AppData/disabled_slices.json` and automatically excluded across backend queries.
- Affected endpoints: `get_gaze_data`, `get_box_stats`, `get_timeline_recordings`, `get_participants_for_test`, `get_tests_for_participant`, and `get_static_data` derived maps.
- Single sortable search table (TanStack Table) `search_slices()` columns: test_name, participant, recording, group, image_name, sentence, pair duration. Toggle Enable/Disable in-table.
