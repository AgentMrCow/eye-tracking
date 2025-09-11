# Repository Guidelines

## Project Structure & Module Organization
- `src/` – SolidJS + TypeScript app organized feature‑first: `features/{gaze,catalog}/{components,hooks,services,utils}`; shared UI in `components/ui/`.
- `public/` – static assets served by Vite.
- `src-tauri/` – Tauri (Rust) backend; entry `src/main.rs`, logic in `src/lib.rs`.
- `src-tauri/resources/` – bundled SQLite DB (`eye_tracking.db`) and test images.
- `dist/` – production build output (frontend only).
- Path alias: import from app root with `@` (example: `import { GazeAnalysis } from '@/features/gaze'`).

## Build, Test, and Development Commands
- `npm install` – install Node deps (Tauri CLI is included as a dev dep).
- `npm run dev` – Vite dev server (web preview) on port 1420.
- `npm run tauri dev` – launch the desktop app (rebuilds Rust + runs Vite).
- `npm run build` – build frontend to `dist/`.
- `npm run serve` – preview the built frontend locally.
- `npm run tauri build` – produce desktop binaries/installers (requires Rust toolchain).
- Type check: `npx tsc --noEmit`.

## Coding Style & Naming Conventions
- TypeScript, strict mode on; prefer explicit types on public APIs.
- Indentation: 2 spaces; use ES modules.
- Components: PascalCase filenames and component names (e.g., `GazeAnalysis.tsx`).
- Hooks: `useXxx` in `hooks/` (e.g., `useReplay.ts`).
- Utilities/constants/types live in `utils.ts`, `constants.ts`, `types.ts` per feature.
- Imports use `@/…` alias; keep relative imports shallow.

## Testing Guidelines
- No test runner is configured yet. Validate changes with `npx tsc --noEmit`, run `npm run dev` and `npm run tauri dev` to manually verify flows (Gaze, Catalog Compare).
- If adding tests, prefer Vitest + @testing-library/solid; name as `*.test.ts(x)` colocated with source or under `__tests__/`.

## Commit & Pull Request Guidelines
- Prefer Conventional Commits: `feat(gaze): …`, `fix(catalog): …`, `chore: …`.
- PRs should include: clear description, linked issues, screenshots/gifs for UI, steps to verify, and confirmation that `npm run build` and `npm run tauri dev` work.
- Keep changes scoped; avoid unrelated refactors and file moves.

## Security & Configuration Tips
- Do not commit secrets. The bundled DB is read‑only; replace it at `src-tauri/resources/eye_tracking.db` if needed.
- Vite port is fixed at 1420 for Tauri; free the port before running.

## Agent‑Specific Instructions
- Respect the feature‑first layout and the `@` alias.
- Update this file and `README.md` when behavior or commands change.

## Backend Additions (QAC)
- SQLite table `participants(participant TEXT PRIMARY KEY, is_qac INTEGER CHECK (is_qac IN (0,1)))` is bundled in `src-tauri/resources/eye_tracking.db`.
- Preload: `TLK311`–`TLK320` have `is_qac = 0` (non‑QAC). All others are treated as QAC by default.
- New Tauri command: `get_participants()` → returns the full `participants` table as an array of maps (future‑proof if more columns are added).
 - New Tauri command: `get_participants()` → returns the full `participants` table as an array of maps (future‑proof if more columns are added).
 - New Tauri commands: `search_tests()` (aggregated by test) and `search_slices()` (triple-level rows for the Data Toggle table: test_name, participant, recording, group, image_name, sentence, pair duration).

## Data Toggle Panel
- New feature under route `/data-toggle` adds a panel to disable specific `Test × Recording × Participant` triples.
- Backend stores disabled triples in `AppData/disabled_slices.json` and excludes them in:
  - `get_gaze_data`, `get_box_stats`, `get_timeline_recordings`, `get_participants_for_test`, `get_tests_for_participant`, and the maps in `get_static_data`.
 - New Tauri commands:
  - `list_gaze_slices(testName?, participants?: string[])` → list distinct triples from `gaze_data`.
  - `get_disabled_slices()` / `set_disabled_slices(slices)` / `toggle_disabled_slice(slice, disabled)` for management.
 - The panel includes a single sortable search table (TanStack) built from `search_slices()` with columns from `test_catalog` and durations from `test_group`. The Enable/Disable toggle is in-table.

## Preferences Persistence
- Catalog Compare user preferences are persisted across runs using Tauri Store (fallback to `localStorage` in web preview):
  - Stored file: `user_prefs.json` under the app's data directory.
  - Stored keys: `compare_prefs` with `{ blueKeys, redKeys, redCustom, invalidCats }`.
- On app start, these preferences are loaded and applied in `useCatalogState`.
- Changing AOI sets or invalid categories automatically saves the updated preferences.

## AI Explain (Grok / xAI)
- All JSON viewers include an "Explain" button.
- If `VITE_XAI_API_KEY` is set in env, the viewer calls xAI (Grok) to explain the JSON; otherwise, it falls back to a built-in short explanation (when provided).
- How to use:
  - Create `.env.local` at the project root with:
    - `VITE_XAI_API_KEY=your_xai_key_here`
  - Restart the dev server or rebuild.
  - You can also set/override the key in-app under Settings → xAI Grok API (stored in Tauri Store).
