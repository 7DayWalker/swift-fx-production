"""
supabase_auth.py — Supabase JWT verification, paginated Auth Admin lookups, and profile REST helpers.
"""
import os
import logging
from datetime import datetime, date, timezone
from typing import Any, Optional

import httpx
import jwt as pyjwt
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

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

# Exact mutable columns present on public.profiles in Supabase
VALID_PROFILE_COLUMNS = {
    'name',
    'role',
    'admin_role',
    'admin_enabled',
    'picture',
    'referral_code',
    'ai_weekly_used',
    'ai_weekly_reset',
    'notification_preferences',
    'updated_at',
    'subscription',
    'subscription_tier',
    'subscription_status',
    'subscription_expiry',
    'subscription_platform',
    'subscription_product_id',
    'subscription_auto_renew',
    'subscription_is_trial',
    'activated_at',
    'phone',
    'account_status',
    'deactivated_at',
    'deactivated_by',
    'deactivation_reason',
    'restored_at',
    'restored_by',
}

_LEGACY_COLUMN_ALIASES = {
    'subscription_source': 'subscription_platform',
    'subscription_expires_at': 'subscription_expiry',
    'ai_usage_count': 'ai_weekly_used',
    'ai_usage_reset_date': 'ai_weekly_reset',
    'deleted_at': 'deactivated_at',
}

_VALID_USER_ROLES = {'free', 'premium', 'vip', 'admin', 'super_admin'}
_VALID_ADMIN_ROLES = {
    'super_admin',
    'signal_admin',
    'fund_admin',
    'fund_manager',
    'account_manager',
    'customer_support',
}

# JWKS client with caching (keys are fetched once and reused)
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(SUPABASE_JWKS_URL, cache_jwk_set=True, lifespan=3600)
    return _jwks_client


def _normalize_profile_payload(data: dict) -> dict:
    """
    Normalize legacy field names, validate enum values, strip unknown columns
    so PostgREST never fails with PGRST204, and serialize datetimes to ISO-8601.
    """
    mapped: dict[str, Any] = {}
    for raw_key, raw_val in data.items():
        target_key = _LEGACY_COLUMN_ALIASES.get(raw_key, raw_key)
        if target_key != raw_key and target_key in data:
            # Canonical key was explicitly supplied alongside legacy alias; prefer canonical.
            continue
        mapped[target_key] = raw_val

    serialized: dict[str, Any] = {}
    dropped_keys: list[str] = []

    for key, value in mapped.items():
        if key not in VALID_PROFILE_COLUMNS:
            dropped_keys.append(key)
            continue

        # Unwrap Enum instances if passed directly
        if hasattr(value, 'value'):
            value = value.value

        if key == 'role' and value is not None:
            role_str = str(value).lower()
            if role_str == 'user':
                role_str = 'free'
            if role_str not in _VALID_USER_ROLES:
                logger.warning("[Supabase] Ignoring invalid profiles.role value: %r", value)
                continue
            value = role_str

        if key == 'admin_role' and value is not None:
            admin_role_str = str(value).lower()
            if admin_role_str not in _VALID_ADMIN_ROLES:
                logger.warning("[Supabase] Ignoring invalid profiles.admin_role value: %r", value)
                continue
            value = admin_role_str

        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            serialized[key] = value.isoformat()
        elif isinstance(value, date):
            serialized[key] = value.isoformat()
        else:
            serialized[key] = value

    if dropped_keys:
        logger.debug("[Supabase] Stripped non-schema profile fields: %s", dropped_keys)

    return serialized


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
    try:
        return verify_supabase_jwt(token)
    except ValueError:
        pass
    return await verify_token_via_api(token)


async def verify_user_password(email: str, password: str) -> bool:
    """
    Verify a user's current password against Supabase GoTrue password grant
    before permitting sensitive password/account changes.
    """
    if not email or not password:
        return False
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f'{SUPABASE_URL}/auth/v1/token?grant_type=password',
            headers={
                'apikey': SUPABASE_SERVICE_KEY,
                'Content-Type': 'application/json',
            },
            json={'email': email, 'password': password},
        )
        return r.status_code == 200


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
    """Look up a profile by email across ALL paginated GoTrue auth users."""
    if not email:
        return None
    target = email.strip().lower()
    users = await list_auth_users()
    for user in users:
        if (user.get('email') or '').lower() == target:
            profile = await fetch_profile(user['id'])
            if profile:
                profile['email'] = user['email']
            return profile
    return None


async def update_profile(user_id: str, data: dict) -> bool:
    """Update fields on a profile row, safely filtering columns and serializing datetimes."""
    payload = _normalize_profile_payload(data)
    if not payload:
        logger.warning("[Supabase] update_profile called with empty valid payload for user_id=%s", user_id)
        return False

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.patch(
            f'{SUPABASE_URL}/rest/v1/profiles?id=eq.{user_id}',
            headers={
                **_service_headers,
                'Prefer': 'return=representation',
            },
            json=payload,
        )
        if r.status_code not in (200, 204):
            logger.error(
                "[Supabase] update_profile failed user_id=%s status=%s body=%s",
                user_id,
                r.status_code,
                r.text[:300],
            )
            return False
        if r.status_code == 200:
            rows = r.json()
            return len(rows) > 0
        return True


async def list_profiles(filters: Optional[dict] = None) -> list:
    """List all profiles (paginated past PostgREST 1000-row cap), optionally with filters."""
    all_rows: list = []
    page_size = 1000
    offset = 0

    base_url = f'{SUPABASE_URL}/rest/v1/profiles?select=*'
    if filters:
        for key, value in filters.items():
            base_url += f'&{key}=eq.{value}'

    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            headers = {
                **_service_headers,
                'Range-Unit': 'items',
                'Range': f'{offset}-{offset + page_size - 1}',
            }
            r = await client.get(base_url, headers=headers)
            if r.status_code not in (200, 206):
                break
            batch = r.json()
            if not batch:
                break
            all_rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
    return all_rows


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
        if r.status_code in (200, 206):
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


# ── Auth Admin API helpers (paginated) ─────────────────────────────

async def list_auth_users(per_page: int = 1000) -> list:
    """
    List ALL Supabase auth users across all pages.
    Fixes GoTrue's default 50-user page truncation.
    """
    all_users: list = []
    page = 1
    async with httpx.AsyncClient(timeout=20) as client:
        while True:
            r = await client.get(
                f'{SUPABASE_URL}/auth/v1/admin/users',
                headers=_service_headers,
                params={'page': page, 'per_page': per_page},
            )
            if r.status_code != 200:
                logger.warning("[Supabase] list_auth_users page=%s status=%s", page, r.status_code)
                break
            batch = r.json().get('users', [])
            if not batch:
                break
            all_users.extend(batch)
            if len(batch) < per_page:
                break
            page += 1
    return all_users


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
    body: dict[str, Any] = {
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
    """Delete a Supabase auth user (cascades or pairs with profile deletion)."""
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
