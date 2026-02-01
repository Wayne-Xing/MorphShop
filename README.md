# MorphShop

MorphShop 是一个面向电商场景的 AI 模特工作流平台，支持「虚拟试衣 / 换背景 / 生成视频」，并提供项目化管理、用量/额度控制与工作流解耦。

## 你会得到什么

- 换装（Try-on）：上传人物图 + 服装图，生成换装结果图
- 换背景（Background）：对换装结果图或任意人物图进行背景替换（当前版本使用「背景图」作为输入）
- 视频（Video）：上传/选择人物图 + 参考视频，执行动作迁移并生成视频结果
- 项目管理：以项目维度组织素材与结果
- 工作流解耦：创建项目时可勾选启用 Try-on / Background / Video，三个模块可完全独立运行
- 顺序可配置：创建项目时可拖拽调整执行顺序（例如先换背景后换装）
- 上传即预览：选择文件后立即展示本地预览（无需等待上传成功）
- 统一结果命名（展示名 + 下载文件名）：`项目名_工作流_YYYYMMDD_HHMMSS.ext`（使用服务器本地时间）
- 结果保留 7 天：仅保留 7 天内的工作流“结果资源”，便于后续复用；过期后关联会自动置空
- 结果库：查看最近 7 天的所有生成结果（跨项目）

## 技术栈

- 前端：Next.js 14 + Tailwind + SWR
- 后端：FastAPI + SQLAlchemy + Alembic
- 数据库：PostgreSQL
- 队列/定时：Redis + Celery（可选，但建议生产启用）
- 第三方：RunningHub API（实际生成任务）

## 快速开始（Docker 推荐）

### 0) 前置条件

- Docker / Docker Compose
- RunningHub 账号与 API Key（https://www.runninghub.cn）
- RunningHub 三个应用的 App ID（Try-on / Background / Video）

### 1) 配置环境变量

在项目根目录复制并编辑 `.env`：

```bash
cp .env.example .env
```

说明：

- Docker Compose 会读取根目录 `.env` 用于变量替换（例如 `RUNNINGHUB_API_KEY` / App ID）。
- 后端应用会优先读取根目录 `.env`，并兼容读取 `backend/.env`（用于旧的本地开发方式）；Docker 下仍以容器环境变量为准。

至少需要配置（字段名以 `.env.example` 为准）：

- `JWT_SECRET_KEY`
- `RUNNINGHUB_API_KEY`
- `RUNNINGHUB_TRY_ON_APP_ID`
- `RUNNINGHUB_BACKGROUND_APP_ID`
- `RUNNINGHUB_VIDEO_APP_ID`

### 2) 启动服务

启动全栈（数据库/Redis/后端/前端）：

```bash
docker compose up -d --build
```

首次启动（或有迁移变更）后，应用数据库迁移：

```bash
docker compose exec backend alembic upgrade head
```

查看服务状态/日志（可选）：

```bash
docker compose ps
docker compose logs -f --tail 200 backend
```

### 3)（可选但推荐）启用结果 7 天清理

结果保留依赖定时任务（Celery Beat）。如果你希望自动按 7 天清理结果：

```bash
docker compose up -d --build celery-worker celery-beat
```

说明：清理只针对结果类型资源（Try-on / Background / Video 的产物），不会删除用户上传的素材图。

## 本地开发（不使用 Docker）

### 后端

```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

默认端口：

- 前端：http://localhost:3000
- 后端：http://localhost:8000

## 使用说明（核心工作流）

## 统一工作流页面（全流程管理）

访问：`/workflow?project=ID`（无论勾选了哪种工作流组合，都统一在此页面管理）

- 顶部：全局控制
  - 全部启动：按项目的 `workflow_steps` 顺序依次执行（顺序执行）
  - 全部停止：请求停止后续（当前任务会跑完，但不会启动下一步）
- 主体：按模块分段（顺序由创建项目时配置决定）
  - 每个模块都是两列：左侧输入 / 右侧进度 + 输出 + 单独启动
  - 如果当前有任务在执行，点击“单独启动/全部启动”会提示等待当前任务完成

### 1) 创建项目与工作流选择

在 Dashboard 创建项目时可勾选：

- 启用 Try-on
- 启用 Background
- 启用 Video

三个模块完全解耦：你可以只启用其中一个模块并独立运行。

此外，支持拖拽调整执行顺序（例如 `background -> try_on`）。

### 2) 模块间默认衔接 + 可选输入来源

- 换背景人物图默认衔接：当启用换装且换装在换背景之前时，换背景默认使用“换装结果图”作为人物图
- 可选开关：你也可以切换为“使用人物图”（与换装共用同一张人物图）
- 视频人物图默认衔接：优先使用上游的“最近一步图片结果”（例如换背景/换装结果），否则回退到人物图（model image）；参考视频必须提供
- 选择素材：同一窗口支持「上传新素材（上传即预览）」与「选择最近 7 天已有素材」
- 最近 7 天素材库会按内容去重：同一张素材只显示一次

### 3) 结果命名与下载

- 结果展示名与下载到本地文件名统一为：`项目名_工作流_YYYYMMDD_HHMMSS.ext`
- 时间使用“服务器本地时间”生成
- 由于 RunningHub 的 CDN 文件无法直接重命名，系统通过后端下载代理接口控制下载文件名

下载接口：

- `GET /api/assets/{asset_id}/download`

### 4) 结果保留与过期清理（7 天）

- 系统只保留 7 天内的工作流结果资源，便于后续选择复用
- 到期后会删除结果资源记录（本地文件会尽力删除；外链资源只删除数据库记录）
- 结果被删除后，项目中对应的结果引用会自动置空（你看到的“结果”区域会变为空）

## 结果库（最近 7 天）

访问：`/results`

- 展示当前用户最近 7 天内生成的全部结果（换装/换背景/视频）
- 支持下载（下载文件名与展示名一致）

## 常见问题（排查指引）

### 工作流运行到「视频-动作迁移」很快失败，提示 `Timeout failed (...)`

这通常不是前端问题，而是后端轮询 RunningHub 结果时超时导致任务被标记为失败。

排查/处理：

1) 检查后端实际超时配置（Docker 时后端读取 `backend/.env`）：

- `MAX_TASK_TIMEOUT`：全局任务轮询超时（秒）

2) 检查视频应用的预期耗时配置：

- `backend/app/services/runninghub/apps.py` 里的 `VIDEO_CONFIG.timeout`（默认 600 秒）

建议：

- 视频任务通常比图片任务更慢。若 `MAX_TASK_TIMEOUT` 设置过小（例如 300 秒），会出现视频步骤提前失败。
- 现在后端会使用 `max(MAX_TASK_TIMEOUT, VIDEO_CONFIG.timeout)` 作为最终等待时间，并在错误信息中显示真实超时（例如 `Timeout failed (5m)` / `Timeout failed (10m)`），便于定位。

### 登录提示 “Request failed”

这通常意味着前端没拿到后端返回的 JSON（例如：后端未启动、反向代理失败、后端崩溃返回了 HTML/500）。建议按顺序检查：

1. 后端健康检查：打开 http://localhost:8000/health
2. Docker 日志：`docker compose logs --tail 200 backend`
3. 如果你使用 Docker 前端：确认前端容器能访问后端容器（同一 compose 网络）

### Docker 启动前端报 “3000 端口被占用”

说明你本机已有进程占用了 3000 端口。你可以：

1. 停止占用 3000 的进程后再启动 docker
2. 或把 `docker-compose.yml` 中前端端口映射改成 `3001:3000`

## 关键接口（后端）

- 认证：`POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`
- 项目：`POST /api/projects`、`PATCH /api/projects/{id}`、`GET /api/projects/{id}`
- 顺序工作流：`POST /api/projects/{id}/pipeline/start`、`POST /api/projects/{id}/pipeline/cancel`
- 任务：`POST /api/tasks/try-on`、`POST /api/tasks/background`、`POST /api/tasks/video`、`GET /api/tasks/{id}/status`
- 资源：`GET /api/assets`、`GET /api/assets/{id}/download`
- 项目结果（最近 N 天）：`GET /api/projects/{id}/results`
- 用户结果库（最近 N 天）：`GET /api/assets?asset_type=try_on_result&asset_type=background_result&days=7`

## 目录结构

```text
backend/   # FastAPI + SQLAlchemy + Alembic + Celery
frontend/  # Next.js 14 应用
uploads/   # 本地上传/产物（若使用本地存储）
```
