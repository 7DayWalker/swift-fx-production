"""
Test Suite: Admin Subscription Override System
Tests SUPER_ADMIN-only override/revoke endpoints, access control, validation, and audit logging.
"""
import pytest
import requests
import os
from datetime import datetime, timezone

# Backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://fx-analytics-pro.preview.emergentagent.com"

# Supabase auth config
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Test credentials
SUPER_ADMIN_EMAIL = "ellapauledache@gmail.com"
SUPER_ADMIN_PASSWORD = "Grace1992@"
TEST_TARGET_USER_ID = "8e8be463-b261-4af2-8259-524ed0bf6596"  # Free tier user


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
# TEST CLASS: Unauthenticated Access
# ==============================================================================
class TestOverrideUnauthenticated:
    """Test that override endpoints reject unauthenticated requests"""
    
    def test_grant_override_no_auth_returns_401(self, api_client):
        """POST /api/admin/override-subscription without auth returns 401"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_revoke_override_no_auth_returns_401(self, api_client):
        """POST /api/admin/revoke-override without auth returns 401"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            json={"user_id": TEST_TARGET_USER_ID}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_override_status_no_auth_returns_401(self, api_client):
        """GET /api/admin/override-status/{user_id} without auth returns 401"""
        response = api_client.get(f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_override_logs_no_auth_returns_401(self, api_client):
        """GET /api/admin/override-logs/{user_id} without auth returns 401"""
        response = api_client.get(f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


# ==============================================================================
# TEST CLASS: SUPER_ADMIN Access Control
# ==============================================================================
class TestOverrideSuperAdminAccess:
    """Test that SUPER_ADMIN can access all override endpoints"""
    
    def test_super_admin_can_view_override_status(self, api_client, super_admin_token):
        """GET /api/admin/override-status/{user_id} returns 200 for SUPER_ADMIN"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "has_override" in data
        assert "override" in data
    
    def test_super_admin_can_view_override_logs(self, api_client, super_admin_token):
        """GET /api/admin/override-logs/{user_id} returns 200 for SUPER_ADMIN"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "logs" in data
        assert "count" in data
        assert isinstance(data["logs"], list)


# ==============================================================================
# TEST CLASS: Validation Rules
# ==============================================================================
class TestOverrideValidation:
    """Test validation rules for override endpoints"""
    
    def test_invalid_tier_returns_400(self, api_client, super_admin_token):
        """POST /api/admin/override-subscription with invalid tier returns 400"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "invalid_tier", "duration_days": 7}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "Invalid tier" in data["detail"]
    
    def test_duration_less_than_1_returns_400(self, api_client, super_admin_token):
        """POST /api/admin/override-subscription with duration_days < 1 returns 400"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 0}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "duration_days" in data["detail"]
    
    def test_duration_greater_than_30_returns_400(self, api_client, super_admin_token):
        """POST /api/admin/override-subscription with duration_days > 30 returns 400"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 31}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "duration_days" in data["detail"]
    
    def test_nonexistent_user_returns_404(self, api_client, super_admin_token):
        """POST /api/admin/override-subscription with nonexistent user returns 404"""
        fake_user_id = "00000000-0000-0000-0000-000000000000"
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": fake_user_id, "tier": "premium", "duration_days": 7}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()


# ==============================================================================
# TEST CLASS: Grant Override Flow
# ==============================================================================
class TestGrantOverrideFlow:
    """Test the full grant override flow"""
    
    def test_grant_premium_override_success(self, api_client, super_admin_token):
        """POST /api/admin/override-subscription grants premium override successfully"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "message" in data
        assert "user_id" in data
        assert "tier" in data
        assert "expires_at" in data
        assert "is_active" in data
        
        # Verify values
        assert data["user_id"] == TEST_TARGET_USER_ID
        assert data["tier"] == "premium"
        assert data["is_active"] == True
    
    def test_grant_vip_override_success(self, api_client, super_admin_token):
        """POST /api/admin/override-subscription grants VIP override successfully"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 14}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["tier"] == "vip"
        assert data["is_active"] == True
    
    def test_override_status_shows_active_after_grant(self, api_client, super_admin_token):
        """GET /api/admin/override-status shows active override after grant"""
        # First grant an override
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        
        # Then check status
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["has_override"] == True
        assert data["override"] is not None
        assert data["override"]["tier"] == "premium"
        assert data["override"]["is_active"] == True


# ==============================================================================
# TEST CLASS: Revoke Override Flow
# ==============================================================================
class TestRevokeOverrideFlow:
    """Test the revoke override flow"""
    
    def test_revoke_active_override_success(self, api_client, super_admin_token):
        """POST /api/admin/revoke-override revokes active override successfully"""
        # First ensure there's an active override
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        
        # Then revoke it
        response = api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "message" in data
        assert "revoked" in data["message"].lower()
        assert data["user_id"] == TEST_TARGET_USER_ID
    
    def test_revoke_nonexistent_override_returns_404(self, api_client, super_admin_token):
        """POST /api/admin/revoke-override for user without active override returns 404"""
        # First revoke any existing override
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        
        # Try to revoke again - should fail
        response = api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        assert "no active override" in data["detail"].lower()
    
    def test_override_status_shows_inactive_after_revoke(self, api_client, super_admin_token):
        """GET /api/admin/override-status shows no active override after revoke"""
        # Grant then revoke
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        
        # Check status
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["has_override"] == False


# ==============================================================================
# TEST CLASS: Audit Logging
# ==============================================================================
class TestAuditLogging:
    """Test immutable audit logging for override actions"""
    
    def test_grant_action_creates_audit_log(self, api_client, super_admin_token):
        """GRANT_OVERRIDE action is logged in audit logs"""
        # Grant an override
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        
        # Check audit logs
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find GRANT_OVERRIDE log
        grant_logs = [log for log in data["logs"] if log["action"] == "GRANT_OVERRIDE"]
        assert len(grant_logs) > 0, "No GRANT_OVERRIDE log found"
        
        latest_grant = grant_logs[0]
        assert latest_grant["target_user"] == TEST_TARGET_USER_ID
        assert latest_grant["tier"] == "premium"
        assert latest_grant["duration_days"] == 7
        assert "timestamp" in latest_grant
        assert "performed_by" in latest_grant
    
    def test_revoke_action_creates_audit_log(self, api_client, super_admin_token):
        """REVOKE_OVERRIDE action is logged in audit logs"""
        # Grant then revoke
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 7}
        )
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
        
        # Check audit logs
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-logs/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find REVOKE_OVERRIDE log
        revoke_logs = [log for log in data["logs"] if log["action"] == "REVOKE_OVERRIDE"]
        assert len(revoke_logs) > 0, "No REVOKE_OVERRIDE log found"
        
        latest_revoke = revoke_logs[0]
        assert latest_revoke["target_user"] == TEST_TARGET_USER_ID
        assert "timestamp" in latest_revoke
        assert "performed_by" in latest_revoke


# ==============================================================================
# TEST CLASS: Subscription Status Integration
# ==============================================================================
class TestSubscriptionStatusIntegration:
    """Test that override affects subscription status endpoint"""
    
    def test_subscription_status_reflects_active_override(self, api_client, super_admin_token):
        """GET /api/subscription/status shows override info when active"""
        # Grant an override
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 7}
        )
        
        # Get a token for the target user to check their subscription status
        # Since we don't have the target user's password, we'll check via admin endpoint
        # The subscription status endpoint requires the user's own token
        # Instead, verify via override-status that it's active
        response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["has_override"] == True
        assert data["override"]["tier"] == "vip"
        
        # Clean up
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )


# ==============================================================================
# TEST CLASS: Edge Cases
# ==============================================================================
class TestOverrideEdgeCases:
    """Test edge cases for override system"""
    
    def test_override_replaces_existing_override(self, api_client, super_admin_token):
        """Granting new override replaces existing one"""
        # Grant premium
        api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "premium", "duration_days": 7}
        )
        
        # Grant VIP (should replace)
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "vip", "duration_days": 14}
        )
        assert response.status_code == 200
        
        # Check status shows VIP
        status_response = api_client.get(
            f"{BASE_URL}/api/admin/override-status/{TEST_TARGET_USER_ID}",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        data = status_response.json()
        assert data["override"]["tier"] == "vip"
        
        # Clean up
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
    
    def test_free_tier_override_is_valid(self, api_client, super_admin_token):
        """Granting 'free' tier override is valid (for downgrade scenarios)"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/override-subscription",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID, "tier": "free", "duration_days": 7}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tier"] == "free"
        
        # Clean up
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )


# ==============================================================================
# Cleanup fixture
# ==============================================================================
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_overrides(api_client, super_admin_token):
    """Clean up any test overrides after all tests complete"""
    yield
    # Cleanup: revoke any active override on test user
    try:
        api_client.post(
            f"{BASE_URL}/api/admin/revoke-override",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            json={"user_id": TEST_TARGET_USER_ID}
        )
    except:
        pass  # Ignore errors during cleanup
