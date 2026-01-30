# MorphShop - E-commerce Model AI Processing Platform

## Project Overview

MorphShop is a full-stack web application for AI-powered e-commerce model processing, featuring virtual try-on, background replacement, and video generation capabilities.

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with SQLAlchemy 2.0 (async)
- **Task Queue**: Celery + Redis
- **Authentication**: JWT (python-jose)
- **Rate Limiting**: slowapi

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI**: Shadcn/ui + Tailwind CSS
- **Data Fetching**: SWR
- **Language**: TypeScript
- **Internationalization**: React Context + localStorage

## Directory Structure

```
morphshop/
├── backend/                     # FastAPI backend
│   ├── app/
│   │   ├── main.py              # Application entry point
│   │   ├── config.py            # Configuration management
│   │   ├── database.py          # Database connection
│   │   ├── api/                 # API routes
│   │   │   ├── auth.py          # Authentication endpoints
│   │   │   ├── users.py         # User management
│   │   │   ├── projects.py      # Project CRUD
│   │   │   ├── tasks.py         # AI task management
│   │   │   └── upload.py        # File upload
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Business logic
│   │   │   ├── runninghub/      # RunningHub API client
│   │   │   ├── try_on.py        # Try-on service
│   │   │   ├── background.py    # Background service
│   │   │   └── video.py         # Video service
│   │   ├── tasks/               # Celery tasks
│   │   └── utils/               # Utilities
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                    # Next.js frontend
│   ├── src/
│   │   ├── app/                 # App Router pages
│   │   │   ├── dashboard/       # Dashboard page
│   │   │   ├── workflow/        # Full workflow page
│   │   │   └── modules/         # Independent module pages
│   │   │       ├── try-on/      # Try-on module
│   │   │       ├── background/  # Background change module
│   │   │       └── video/       # Video generation module
│   │   ├── components/          # React components
│   │   │   ├── ui/              # Shadcn components
│   │   │   ├── workflow/        # Workflow components
│   │   │   └── layout/          # Layout components
│   │   ├── lib/                 # Utilities
│   │   │   ├── i18n/            # Internationalization
│   │   │   │   ├── index.ts     # I18nProvider and hooks
│   │   │   │   └── locales/     # Translation files
│   │   │   │       ├── en.ts    # English
│   │   │   │       └── zh.ts    # Chinese
│   │   │   ├── api.ts           # API client
│   │   │   └── utils.ts         # Utility functions
│   │   └── hooks/               # React hooks
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

## Common Commands

### Development Setup

```bash
# Start all services with Docker Compose
docker-compose up -d
```

### Starting Services (Windows)

**PowerShell:**
```powershell
# Terminal 1 - Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**CMD:**
```cmd
# Terminal 1 - Backend
cd backend
venv\Scripts\activate.bat
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Restarting Services

```bash
# Stop Frontend (Ctrl+C or)
npx kill-port 3000

# Stop Backend (Ctrl+C or Windows)
taskkill /F /IM python.exe

# Clear Next.js cache if build issues
cd frontend
rm -rf .next
npm run dev
```

### Celery Worker (Optional)
```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

### Default Ports
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Database Migrations

```bash
cd backend

# Create a new migration
alembic revision --autogenerate -m "description"

# Run migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Testing

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT tokens
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info

### Projects
- `GET /api/projects` - List user's projects
- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project details
- `PATCH /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Tasks
- `POST /api/tasks/try-on` - Create try-on task
- `POST /api/tasks/background` - Create background task
- `POST /api/tasks/video` - Create video task
- `GET /api/tasks/{id}/status` - Get task status
- `GET /api/tasks/project/{project_id}` - Get all tasks for a project

### Files
- `POST /api/upload/image` - Upload image

## Environment Variables

See `.env.example` for all configuration options. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET_KEY` - Secret for JWT signing
- `RUNNINGHUB_API_KEY` - RunningHub API key
- `RUNNINGHUB_*_APP_ID` - Application IDs for each workflow

## Workflow

1. **Upload**: User uploads model and clothing images
2. **Try-On**: AI generates virtual try-on result
3. **Background**: AI replaces background
4. **Video**: AI generates video from final image

Each step creates a Task that is processed asynchronously.

### Task Processing Flow

任务处理流程 (`backend/app/api/tasks.py:submit_and_poll_task`):

1. **创建任务** - 任务状态设为 `PENDING`
2. **上传图片** - 读取本地图片，上传到 RunningHub 获取 `fileName`
3. **提交任务** - 调用 RunningHub API 创建任务，状态更新为 `RUNNING`
4. **轮询状态** - 每3秒查询一次，更新进度 `progress_percent`
5. **保存结果** - 任务完成后：
   - 保存 `result_url` 到 Task 表
   - 创建新的 Asset 记录（存储结果图片/视频URL）
   - 更新 Project 的结果字段（`try_on_result_id`, `background_result_id`, `video_result_id`）

> **注意**: 当前使用 FastAPI BackgroundTasks 处理。生产环境可切换为 Celery。

### 前端任务状态管理

- **进度显示**: 使用 SWR 每2秒轮询 `/api/tasks/{id}/status`，显示进度条
- **结果展示**: 任务完成后从 `result_url` 获取图片/视频并展示
- **任务恢复**: 重新进入页面时，自动加载项目的任务列表，恢复进行中的任务轮询

## RunningHub Integration

The platform integrates with RunningHub API for AI processing.

### API Endpoints

| 功能 | 端点 | 认证方式 |
|------|------|----------|
| 上传图片 | `POST /task/openapi/upload` | apiKey in form data |
| 创建任务 | `POST /openapi/v2/run/ai-app/{app_id}` | Bearer Token |
| 查询状态 | `POST /task/openapi/outputs` | apiKey in body |

### 工作流节点配置

**换装工作流** (App ID: `2016740236478386178`):
- 人物图节点ID: `107`
- 服装图节点ID: `285`

**换背景工作流** (App ID: `2016791478260998145`):
- 人物图节点ID: `441`
- 背景图节点ID: `446`

### API调用示例

**1. 上传图片**
```bash
curl -X POST "https://www.runninghub.cn/task/openapi/upload" \
  -F "apiKey=YOUR_API_KEY" \
  -F "file=@image.png"
```
响应: `{"code": 0, "data": {"fileName": "api/xxxx.png"}}`

**2. 创建换装任务**
```bash
curl -X POST "https://www.runninghub.cn/openapi/v2/run/ai-app/2016740236478386178" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "nodeInfoList": [
      {"nodeId": "285", "fieldName": "image", "fieldValue": "api/clothing.png"},
      {"nodeId": "107", "fieldName": "image", "fieldValue": "api/model.png"}
    ],
    "instanceType": "default",
    "usePersonalQueue": "false"
  }'
```
响应: `{"taskId": "xxx", "status": "RUNNING", "clientId": "xxx"}`

**3. 查询任务状态**
```bash
curl -X POST "https://www.runninghub.cn/task/openapi/outputs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"taskId": "xxx", "apiKey": "YOUR_API_KEY"}'
```
### 响应格式

RunningHub API有多种响应格式，`TaskStatusResponse` 模型已适配所有格式：

**Format 1a (Legacy Dict):**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "outputs": [{"fileUrl": "https://..."}],
    "progress": 100,
    "usage": {"consumeCoins": 11}
  }
}
```

**Format 1b (Legacy List):**
```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {"fileUrl": "https://...", "consumeCoins": "11", "taskCostTime": "45"}
  ]
}
```

**Format 2 (Current):**
```json
{
  "taskId": "xxx",
  "status": "SUCCESS",
  "results": [
    {"url": "https://...", "outputType": "png", "text": null}
  ],
  "usage": {"consumeMoney": null, "taskCostTime": "0"}
}
```

**状态码:**
- `code: 0` 或 `status: "SUCCESS"` - 成功
- `code: 804` 或 `status: "RUNNING"` - 运行中
- `code: 805` 或 `status: "FAILED"` - 失败

> **注意**: 结果URL从 `results[].url`、`data.outputs[].fileUrl` 或 `data[].fileUrl` 获取。

### 测试脚本

独立测试脚本位于 `backend/test_runninghub.py`，可直接运行测试API调用：
```bash
cd backend
.\venv\Scripts\python.exe test_runninghub.py
```

## Internationalization (i18n)

The frontend supports multiple languages with a React Context-based i18n system.

### Supported Languages
- English (`en`) - Default
- Simplified Chinese (`zh`)

### Architecture
```
frontend/src/lib/i18n/
├── index.ts          # I18nProvider, useI18n, useTranslation hooks
└── locales/
    ├── en.ts         # English translations (source of truth for keys)
    └── zh.ts         # Chinese translations
```

### Usage
```tsx
import { useI18n } from "@/lib/i18n";

function Component() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div>
      <h1>{t.dashboard.title}</h1>
      <button onClick={() => setLocale("zh")}>切换中文</button>
    </div>
  );
}
```

### Adding New Translations
1. Add new key to `locales/en.ts` (with TypeScript type)
2. Add corresponding translation to `locales/zh.ts`

### Language Detection
- Priority: localStorage → browser language → default (English)
- Persisted to `localStorage` key: `morphshop-locale`

## Module Architecture

The workflow is split into independent modules for flexibility:

### Full Workflow (`/workflow?project=ID`)
Linear 4-step process: Upload → Try-On → Background → Video

### Independent Modules
Each module can be accessed directly:

| Module | Path | Description |
|--------|------|-------------|
| Try-On | `/modules/try-on?project=ID` | Upload images and generate try-on |
| Background | `/modules/background?project=ID` | Change background of try-on result |
| Video | `/modules/video?project=ID` | Generate video from result image |

### Module Features
- Direct access from Dashboard with quick-action buttons
- Task restoration on page reload
- Progress tracking with polling
- Result preview with download option
- Navigation to next module after completion

## Development Notes

- All database operations use async SQLAlchemy
- Task status is polled via SWR with automatic refresh
- Rate limiting prevents API abuse
- Usage quotas protect RunningHub credits
- Files are stored locally with cloud storage abstraction

## Code Style

- Python: Follow PEP 8, use type hints
- TypeScript: Strict mode, prefer functional components
- Use meaningful variable names
- Keep functions small and focused
- Add comments for complex logic only
