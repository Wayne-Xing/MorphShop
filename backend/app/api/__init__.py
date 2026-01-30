"""API routes."""
from fastapi import APIRouter

from app.api import auth, users, projects, tasks, upload, assets

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
api_router.include_router(upload.router, prefix="/upload", tags=["Upload"])
api_router.include_router(assets.router, prefix="/assets", tags=["Assets"])
