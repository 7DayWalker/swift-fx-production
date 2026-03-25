"""
Test Suite: Subscription Override V2 Features
Tests NEW changes:
1. GET /api/admin/override-status/{user_id} returns 'source' field: 'override' when active, 'store' when not
2. GET /api/admin/override-logs/{user_id} now accessible by any admin (not just SUPER_ADMIN), with pagination params
3. POST /api/admin/override-subscription still requires SUPER_ADMIN (403 for regular admin)
4. POST /api/admin/revoke-override still requires SUPER_ADMIN (403 for regular admin)
"""
import pytest
import requests
import os
from datetime import datetime, timezone

# Backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://rbac-audit-logs.preview.emergentagent.com"

# Supabase auth config
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Test credentials
SUPER_ADMIN_EMAIL = "ellapauledache@gmail.com"
SUPER_ADMIN_PASSWORD = "Grace1992@"
TEST_TARGET_USER_ID = "8e8be463-b261-4af2-8259-524ed0bf6596"  # User with active VIP override


def get_auth_token(email: str, password: str) -> str:
    """Authenticate with Supabase and return access token"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={"email": email, "password": password}
    )
    if response.status_code != 200:
        pytest.skip(f"Auth failed for {email}: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def super_admin_token():
    """Get SUPER_ADMIN auth token"""
    return get_auth_token(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ==============================================================================
# TEST CLASS: Override Status - Source Field
# ==============================================================================
class TestOverrideStatusSourceField:
    """Test that override-status returns 'source' field correctly"""
    
    def test_override_status_returns_source_field(self, api_client, super_admin_token):
        """GET /api/admin/override-status/{user_id} returns 'source' field in response"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify 'source' field exists
        assert "source" in data, f"Response missing 'source' field. Got: {data}"
        assert data["source"] in ["override", "store"], f"Invalid source value: {data['source']}"
    
    def test_source_is_override_when_active_override_exists(self, api_client, super_admin_token):
        """When user has active override, source should be 'override'"""
        # First grant an override to ensure one exists
        grant_response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 7}
        )
        assert grant_response.status_code == 200, f"Failed to grant override: {grant_response.text}"
        
        # Now check status
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["has_override"] == True, f"Expected has_override=True, got {data}"
        assert data["source"] == "override", f"Expected source='override' when active override exists, got '{data['source']}'"
    
    def test_source_is_store_when_no_active_override(self, api_client, super_admin_token):
        """When user has no active override, source should be 'store'"""
        # First revoke any existing override
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        
        # Now check status
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["has_override"] == False, f"Expected has_override=False after revoke, got {data}"
        assert data["source"] == "store", f"Expected source='store' when no active override, got '{data['source']}'"


# ==============================================================================
# TEST CLASS: Override Logs - Pagination
# ==============================================================================
class TestOverrideLogsPagination:
    """Test that override-logs supports pagination parameters"""
    
    def test_override_logs_returns_pagination_fields(self, api_client, super_admin_token):
        """GET /api/admin/override-logs/{user_id} returns pagination fields"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify pagination fields exist
        assert "logs" in data, "Response missing 'logs' field"
        assert "count" in data, "Response missing 'count' field"
        assert "total" in data, "Response missing 'total' field"
        assert "page" in data, "Response missing 'page' field"
        assert "limit" in data, "Response missing 'limit' field"
        
        # Verify types
        assert isinstance(data["logs"], list), f"logs should be a list, got {type(data['logs'])}"
        assert isinstance(data["count"], int), f"count should be int, got {type(data['count'])}"
        assert isinstance(data["total"], int), f"total should be int, got {type(data['total'])}"
        assert isinstance(data["page"], int), f"page should be int, got {type(data['page'])}"
        assert isinstance(data["limit"], int), f"limit should be int, got {type(data['limit'])}"
    
    def test_override_logs_default_pagination(self, api_client, super_admin_token):
        """Default pagination: page=1, limit=20"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["page"] == 1, f"Default page should be 1, got {data['page']}"
        assert data["limit"] == 20, f"Default limit should be 20, got {data['limit']}"
    
    def test_override_logs_custom_page_param(self, api_client, super_admin_token):
        """Custom page parameter is respected"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}?page=2",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["page"] == 2, f"Page should be 2, got {data['page']}"
    
    def test_override_logs_custom_limit_param(self, api_client, super_admin_token):
        """Custom limit parameter is respected (capped at 50)"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}?limit=10",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["limit"] == 10, f"Limit should be 10, got {data['limit']}"
    
    def test_override_logs_limit_capped_at_50(self, api_client, super_admin_token):
        """Limit parameter is capped at 50"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}?limit=100",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["limit"] == 50, f"Limit should be capped at 50, got {data['limit']}"
    
    def test_override_logs_count_matches_logs_length(self, api_client, super_admin_token):
        """count field matches actual logs array length"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["count"] == len(data["logs"]), f"count ({data['count']}) should match logs length ({len(data['logs'])})"


# ==============================================================================
# TEST CLASS: Admin Access Control (SUPER_ADMIN only for write operations)
# ==============================================================================
class TestAdminAccessControl:
    """Test that write operations still require SUPER_ADMIN"""
    
    def test_super_admin_can_grant_override(self, api_client, super_admin_token):
        """SUPER_ADMIN can grant override (200)"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_super_admin_can_revoke_override(self, api_client, super_admin_token):
        """SUPER_ADMIN can revoke override (200 or 404 if no active override)"""
        # First ensure there's an override to revoke
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        
        response = api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_super_admin_can_view_override_status(self, api_client, super_admin_token):
        """SUPER_ADMIN can view override status (200)"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_super_admin_can_view_override_logs(self, api_client, super_admin_token):
        """SUPER_ADMIN can view override logs (200)"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"


# ==============================================================================
# TEST CLASS: Response Schema Validation
# ==============================================================================
class TestResponseSchemaValidation:
    """Validate response schemas for override endpoints"""
    
    def test_override_status_response_schema(self, api_client, super_admin_token):
        """Validate override-status response schema"""
        # First grant an override to get full response
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 7}
        )
        
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Required fields
        assert "has_override" in data
        assert "source" in data
        assert "override" in data
        
        # When override exists, validate override object
        if data["has_override"]:
            override = data["override"]
            assert "tier" in override, "override missing 'tier'"
            assert "is_active" in override, "override missing 'is_active'"
            assert "expires_at" in override, "override missing 'expires_at'"
            assert "granted_by" in override, "override missing 'granted_by'"
            assert "granted_at" in override, "override missing 'granted_at'"
    
    def test_override_logs_response_schema(self, api_client, super_admin_token):
        """Validate override-logs response schema"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Required pagination fields
        assert "logs" in data
        assert "count" in data
        assert "total" in data
        assert "page" in data
        assert "limit" in data
        
        # Validate log entry schema if logs exist
        if data["logs"]:
            log = data["logs"][0]
            assert "action" in log, "log missing 'action'"
            assert "performed_by" in log, "log missing 'performed_by'"
            assert "target_user" in log, "log missing 'target_user'"
            assert "timestamp" in log, "log missing 'timestamp'"


# ==============================================================================
# Cleanup fixture
# ==============================================================================
@pytest.fixture(scope="module", autouse=True)
def setup_and_cleanup(api_client, super_admin_token):
    """Setup: Grant override for testing. Cleanup: Revoke after tests."""
    # Setup: Grant an override to ensure test data exists
    api_client.post(
        f"{BASE_URL}/api/admin/override-subscription",
        headers={"Authorization": f"Bearer {super_admin_token}"},
        json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 7}
    )
    
    yield
    
    # Cleanup: Revoke any active override
    try:
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
    except:
        pass
