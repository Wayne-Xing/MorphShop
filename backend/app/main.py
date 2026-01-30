"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import api_router
from app.config import get_settings
from app.database import init_db
from app.utils.rate_limiter import limiter

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    await init_db()

    # Ensure upload directory exists
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    yield

    # Shutdown
    pass


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="E-commerce Model AI Processing Platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix=settings.api_prefix)


# Static file serving for uploads
@app.get("/api/files/{file_path:path}")
async def serve_file(file_path: str):
    """Serve uploaded files."""
    full_path = Path(settings.upload_dir) / file_path

    if not full_path.exists():
        return JSONResponse(
            status_code=404,
            content={"detail": "File not found"},
        )

    if not full_path.is_file():
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid file path"},
        )

    # Security check: prevent path traversal
    try:
        full_path.resolve().relative_to(Path(settings.upload_dir).resolve())
    except ValueError:
        return JSONResponse(
            status_code=403,
            content={"detail": "Access denied"},
        )

    return FileResponse(full_path)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "1.0.0"}


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs" if settings.debug else None,
    }
