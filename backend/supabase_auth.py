"""
Supabase Auth integration for FastAPI.
Verifies Supabase JWTs and queries profiles for role-based access control.
"""
import os
import httpx
import jwt as pyjwt
from jwt import PyJWKClient
from typing import Optional
from functools import lru_cache

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
SUPABASE_JWKS_URL = f'{SUPABASE_URL}/auth/v1/.well-known/jwks.json'
SUPABASE_ISSUER = f'{SUPABASE_URL}/auth/v1'

# Shared headers for service-role API calls
_service_headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'Content-Type': 'application/json',
}

# JWKS client with caching (keys are fetched once and reused)
_jwks_client: Optional[PyJWKClient] = None

def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(SUPABASE_JWKS_URL, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def verify_supabase_jwt(token: str) -> dict:
    """
    Verify a Supabase access token locally via JWKS (ES256).
    Returns the decoded JWT claims dict on success.
    Raises ValueError on any verification failure.
    """
    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        claims = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
        return claims
    except Exception as e:
        raise ValueError(f"Token verification failed: {e}")


async def verify_token_via_api(token: str) -> dict:
    """
    Fallback: verify token by calling Supabase GoTrue /auth/v1/user.
    Slower (HTTP call) but works for all token algorithms.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/auth/v1/user',
            headers={
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {token}',
            },
        )
        if r.status_code == 200:
            user = r.json()
            return {
                'sub': user['id'],
                'email': user.get('email'),
            }
        raise ValueError(f"API token verification failed: {r.status_code}")


async def get_supabase_user(token: str) -> dict:
    """
    Verify a Supabase access token and return user claims.
    Tries JWKS first (fast), falls back to API call.
    Returns dict with at least 'sub' (user_id) and 'email'.
    """
    # Try local JWKS verification first
    try:
        claims = verify_supabase_jwt(token)
        return claims
    except ValueError:
        pass

    # Fallback to API verification
    return await verify_token_via_api(token)


# ── Supabase REST helpers (profiles table) ─────────────────────────

async def fetch_profile(user_id: str) -> Optional[dict]:
    """Fetch a single profile row by user ID."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}&select=*',
            headers=_service_headers,
        )
        if r.status_code == 200:
            rows = r.json()
            return rows[0] if rows else None
    return None


async def fetch_profile_by_email(email: str) -> Optional[dict]:
    """Look up a profile by email (requires joining with auth.users)."""
    # Query auth admin API to find user by email
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/auth/v1/admin/users',
            headers=_service_headers,
        )
        if r.status_code == 200:
            for user in r.json().get('users', []):
                if user.get('email', '').lower() == email.lower():
                    profile = await fetch_profile(user['id'])
                    if profile:
                        profile['email'] = user['email']
                    return profile
    return None


async def update_profile(user_id: str, data: dict) -> bool:
    """Update fields on a profile row."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.patch(
            f'{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}',
            headers={**_service_headers, 'Prefer': 'return=minimal'},
            json=data,
        )
        return r.status_code in (200, 204)


async def list_profiles(filters: Optional[dict] = None) -> list:
    """List all profiles, optionally with filters."""
    url = f'{SUPABASE_URL}/rest/v1/profiles?select=*'
    if filters:
        for key, value in filters.items():
            url += f'&{key}=eq.{value}'
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers=_service_headers)
        if r.status_code == 200:
            return r.json()
    return []


async def count_profiles(role: Optional[str] = None) -> int:
    """Count profiles, optionally filtered by role."""
    url = f'{SUPABASE_URL}/rest/v1/profiles?select=id'
    if role:
        url += f'&role=eq.{role}'
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            url,
            headers={**_service_headers, 'Prefer': 'count=exact'},
        )
        if r.status_code == 200:
            # Count is in the Content-Range header
            content_range = r.headers.get('content-range', '')
            if '/' in content_range:
                total = content_range.split('/')[-1]
                return int(total) if total != '*' else len(r.json())
            return len(r.json())
    return 0


async def delete_profile(user_id: str) -> bool:
    """Delete a profile row."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.delete(
            f'{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}',
            headers={**_service_headers, 'Prefer': 'return=minimal'},
        )
        return r.status_code in (200, 204)


async def fetch_active_subscriptions(user_id: str) -> list:
    """Fetch active subscriptions joined with plans for a user."""
    url = (
        f'{SUPABASE_URL}/rest/v1/subscriptions'
        f'?user_id=eq.{user_id}&status=eq.active'
        f'&select=id,status,current_period_end,plans(tier)'
    )
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, headers=_service_headers)
        if r.status_code == 200:
            return r.json()
    return []


# ── Auth Admin API helpers ──────────────────────────────────────────

async def list_auth_users() -> list:
    """List all Supabase auth users (includes emails, metadata)."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/auth/v1/admin/users',
            headers=_service_headers,
        )
        if r.status_code == 200:
            return r.json().get('users', [])
    return []


async def get_auth_user(user_id: str) -> Optional[dict]:
    """Get a single auth user by ID."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/auth/v1/admin/users/{user_id}',
            headers=_service_headers,
        )
        if r.status_code == 200:
            return r.json()
    return None


async def get_auth_user_email(user_id: str) -> Optional[str]:
    """Get just the email for a user ID."""
    user = await get_auth_user(user_id)
    return user.get('email') if user else None


async def create_auth_user(email: str, password: str, user_metadata: Optional[dict] = None) -> Optional[dict]:
    """Create a new Supabase auth user."""
    body = {
        'email': email,
        'password': password,
        'email_confirm': True,
    }
    if user_metadata:
        body['user_metadata'] = user_metadata
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f'{SUPABASE_URL}/auth/v1/admin/users',
            headers=_service_headers,
            json=body,
        )
        if r.status_code in (200, 201):
            return r.json()
    return None


async def delete_auth_user(user_id: str) -> bool:
    """Delete a Supabase auth user."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.delete(
            f'{SUPABASE_URL}/auth/v1/admin/users/{user_id}',
            headers=_service_headers,
        )
        return r.status_code in (200, 204)


async def update_auth_user(user_id: str, data: dict) -> bool:
    """Update auth user (email, password, metadata)."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.put(
            f'{SUPABASE_URL}/auth/v1/admin/users/{user_id}',
            headers=_service_headers,
            json=data,
        )
        return r.status_code == 200
