# MorphShop

AI-powered e-commerce model processing platform for virtual try-on, background replacement, and video generation.

## Features

- **Virtual Try-On**: Upload model and clothing images to generate realistic try-on results
- **Background Change**: Replace backgrounds with custom images or AI-generated scenes
- **Video Generation**: Transform static images into dynamic videos
- **Project Management**: Organize and track your processing workflows
- **Cost Control**: Built-in usage tracking and quota management
- **Multi-language Support**: English and Simplified Chinese (简体中文)
- **Flexible Workflows**: Use full workflow or independent modules

## Quick Start

### Prerequisites

- Docker and Docker Compose
- RunningHub API key (get one at https://www.runninghub.cn)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/morphshop.git
cd morphshop
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Edit `.env` and add your RunningHub API key and application IDs

4. Start all services:
```bash
docker-compose up -d
```

5. Access the application:
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/docs

### Development Setup

For local development without Docker:

#### First-time Setup

**Backend:**
```bash
cd backend
python -m venv venv

# Windows PowerShell
.\venv\Scripts\Activate.ps1
# Windows CMD
venv\Scripts\activate.bat
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend
npm install
```

#### Starting Services

**Windows (PowerShell):**
```powershell
# Terminal 1 - Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Windows (CMD):**
```cmd
# Terminal 1 - Backend
cd backend
venv\Scripts\activate.bat
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Linux/Mac:**
```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

#### Restarting Services

**Stop services:**
```bash
# Frontend - press Ctrl+C or:
npx kill-port 3000

# Backend - press Ctrl+C or:
# Windows
taskkill /F /IM python.exe
# Linux/Mac
pkill -f uvicorn
```

**Clear cache and restart (if build issues):**
```bash
# Frontend - clear Next.js cache
cd frontend
rm -rf .next
npm run dev

# Backend - no cache to clear, just restart
```

**Celery Worker (Optional - for production async tasks):**
```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

#### Default Ports
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│   FastAPI   │────▶│ RunningHub  │
│  Frontend   │◀────│   Backend   │◀────│    API      │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
              ┌─────▼─────┐ ┌─────▼─────┐
              │ PostgreSQL│ │   Redis   │
              │           │ │  + Celery │
              └───────────┘ └───────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, Shadcn/ui, Tailwind CSS, SWR |
| Backend | FastAPI, SQLAlchemy 2.0, Celery |
| Database | PostgreSQL |
| Cache/Queue | Redis |
| Auth | JWT |
| AI Processing | RunningHub API |
| i18n | React Context + localStorage |

## Workflow Modes

### Full Workflow
Access via `/workflow?project=ID` - A guided 4-step process:
1. **Upload** - Upload model and clothing images
2. **Try-On** - AI-powered virtual try-on
3. **Background** - Replace or generate backgrounds
4. **Video** - Generate promotional videos

### Independent Modules
Each module can be accessed directly from the Dashboard:
- `/modules/try-on?project=ID` - Virtual try-on only
- `/modules/background?project=ID` - Background replacement only
- `/modules/video?project=ID` - Video generation only

## Internationalization

The platform supports multiple languages:
- **English** (default)
- **简体中文** (Simplified Chinese)

Switch languages using the globe icon in the header. Language preference is saved locally.

## API Documentation

When running locally, visit http://localhost:8000/docs for interactive API documentation.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login and get tokens |
| POST | /api/projects | Create new project |
| GET | /api/projects/{id} | Get project details |
| POST | /api/tasks/try-on | Start try-on task |
| POST | /api/tasks/background | Start background task |
| POST | /api/tasks/video | Start video task |
| GET | /api/tasks/{id}/status | Poll task status |
| GET | /api/tasks/project/{id} | Get all tasks for a project |

## Configuration

See `.env.example` for all available configuration options.

### Required Configuration

- `JWT_SECRET_KEY` - Generate a strong secret for production
- `RUNNINGHUB_API_KEY` - Your RunningHub API key
- `RUNNINGHUB_*_APP_ID` - Application IDs for each workflow

### Optional Configuration

- `DAILY_USER_LIMIT_MONEY` - Daily spending limit per user
- `DAILY_USER_LIMIT_TASKS` - Daily task limit per user
- `MAX_TASK_TIMEOUT` - Maximum task duration in seconds

## Usage Limits

The platform includes built-in cost control:

- Per-user daily task limits
- Per-user daily spending limits
- Global balance warning threshold
- Rate limiting on all endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
