"""User management API routes."""
from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession, CurrentUser
from app.schemas.user import UserResponse, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: CurrentUser):
    """Get current user profile."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """Update current user profile."""
    if update_data.username is not None:
        current_user.username = update_data.username
    if update_data.avatar_url is not None:
        current_user.avatar_url = update_data.avatar_url

    await db.flush()
    await db.refresh(current_user)
    return current_user


@router.get("/me/credits")
async def get_credits(current_user: CurrentUser):
    """Get current user credit balance."""
    return {
        "credits": current_user.credits,
        "credits_used": current_user.credits_used,
        "credits_available": current_user.credits - current_user.credits_used,
    }
