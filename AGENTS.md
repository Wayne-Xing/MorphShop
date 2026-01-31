# Repository Guidelines

## Project Structure & Module Organization
MorphShop is a full‑stack app with a clear split between backend and frontend.
- `backend/`: FastAPI app in `backend/app/` (API routes, services, models, schemas), with migrations in `backend/alembic/`.
- `frontend/`: Next.js 14 app in `frontend/src/` (App Router, components, hooks, lib, i18n).
- `uploads/`: Local file storage for uploaded assets when using local storage.
- Root config: `docker-compose.yml`, `.env.example`, and service Dockerfiles.

## Build, Test, and Development Commands
Docker (recommended):
- `docker compose up -d --build` — start full stack.
- `docker compose exec backend alembic upgrade head` — apply DB migrations.
- `docker compose up -d --build celery-worker celery-beat` — enable scheduled cleanup.

Local backend:
- `cd backend`
- `python -m venv venv` and activate the venv
- `pip install -r requirements.txt`
- `alembic upgrade head`
- `uvicorn app.main:app --reload --port 8000`

Local frontend:
- `cd frontend`
- `npm install`
- `npm run dev` (dev server), `npm run build`, `npm run start`, `npm run lint`

## Coding Style & Naming Conventions
- Python: 4‑space indent, snake_case modules, keep imports grouped.
- TypeScript/TSX: 2‑space indent, PascalCase components, file names follow existing patterns.
- Frontend linting: `next/core-web-vitals` via `npm run lint`. No backend formatter configured—match nearby style.

## Testing Guidelines
- No automated test runner is configured. The only test artifact is `backend/test_runninghub.py` (manual RunningHub API check).
- Run it with `python test_runninghub.py` after setting `RUNNINGHUB_API_KEY` and app IDs.
- If you add tests, place them near the relevant module and document the command here.

## Commit & Pull Request Guidelines
- Commit messages follow conventional prefixes seen in history: `feat: …`, `fix: …`.
- Keep subjects short and imperative; add scope if helpful (e.g., `feat(frontend): …`).
- PRs should include a short summary, test steps, and UI screenshots for visual changes.
- Call out migrations, env changes, or new background tasks.

## Configuration & Secrets
- Use `.env.example` (root, backend, frontend) as templates; never commit real keys.
- RunningHub API keys and app IDs are required for try‑on/background/video tasks.

## Agent Notes
- For deeper architecture details, see `CLAUDE.md`.
