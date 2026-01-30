"""User schemas for request/response validation."""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8, max_length=100)


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    """Schema for updating user profile."""
    username: str | None = Field(None, min_length=3, max_length=100)
    avatar_url: str | None = None


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    email: str
    username: str
    avatar_url: str | None
    is_active: bool
    is_verified: bool
    credits: float
    credits_used: float
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Schema for JWT token payload."""
    sub: str  # user_id
    exp: datetime
    type: str  # "access" or "refresh"
