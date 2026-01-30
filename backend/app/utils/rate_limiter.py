"""Rate limiting utilities using slowapi."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

settings = get_settings()

# Create limiter instance
limiter = Limiter(key_func=get_remote_address)


def get_user_key(request):
    """
    Get rate limit key based on user ID if authenticated,
    otherwise fall back to IP address.
    """
    # Try to get user from request state (set by auth middleware)
    user = getattr(request.state, "user", None)
    if user is not None:
        return f"user:{user.id}"
    return get_remote_address(request)


# Rate limit decorators
def rate_limit_default():
    """Default rate limit decorator."""
    return limiter.limit(f"{settings.rate_limit_per_minute}/minute")


def rate_limit_strict():
    """Strict rate limit for expensive operations."""
    return limiter.limit("5/minute")


def rate_limit_auth():
    """Rate limit for authentication endpoints."""
    return limiter.limit("10/minute")
