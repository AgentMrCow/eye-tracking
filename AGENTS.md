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

