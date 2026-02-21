"""
Backend API tests for Supabase JWT Authentication
Tests: Token verification, protected endpoints, legacy endpoints removal, public endpoints
"""
import pytest
import requests
import os

# Using preview URL for testing
BASE_URL = "https://data-flow-fix-3.preview.emergentagent.com"

# Supabase credentials
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5Nzk3MiwiZXhwIjoyMDg1ODczOTcyfQ.6lQ5_g-LnORjWrz9Yn1hBYA3-SXcI5aidmyKI9SjGvY"

# Test user credentials
TEST_EMAIL = "testbro@gmail.com"
TEST_PASSWORD = "TestBro123!@#"
TEST_USER_ID = "233d098e-64f7-4120-970b-f5424c92922b"


@pytest.fixture(scope="module")
def supabase_access_token():
    """Get a Supabase access token using email/password auth"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
    )
    if response.status_code != 200:
        pytest.skip(f"Failed to get Supabase token: {response.status_code} - {response.text}")
    data = response.json()
    return data.get("access_token")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestPublicEndpoints:
    """Test public endpoints that should work without authentication"""
    
    def test_signals_endpoint_no_auth(self, api_client):
        """GET /api/signals should work without auth (returns signals array)"""
        response = api_client.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected signals array"
        print(f"✅ GET /api/signals works without auth - returned {len(data)} signals")
    
    def test_health_or_root_endpoint(self, api_client):
        """Test that the API is reachable"""
        response = api_client.get(f"{BASE_URL}/api/signals")
        assert response.status_code in [200, 404], f"API not reachable: {response.status_code}"
        print("✅ API is reachable")


class TestLegacyEndpointsRemoved:
    """Test that legacy MongoDB auth endpoints are removed"""
    
    def test_register_endpoint_removed(self, api_client):
        """POST /api/auth/register should return 404 (removed)"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "name": "Test",
                "email": "test@example.com",
                "password": "test123"
            }
        )
        assert response.status_code in [404, 405], f"Expected 404/405 (endpoint removed), got {response.status_code}: {response.text}"
        print(f"✅ POST /api/auth/register correctly returns {response.status_code} (removed)")
    
    def test_login_endpoint_removed(self, api_client):
        """POST /api/auth/login should return 404 (removed)"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "test123"
            }
        )
        assert response.status_code in [404, 405], f"Expected 404/405 (endpoint removed), got {response.status_code}: {response.text}"
        print(f"✅ POST /api/auth/login correctly returns {response.status_code} (removed)")
    
    def test_google_callback_removed(self, api_client):
        """GET /api/auth/google/callback should return 404 (removed)"""
        response = api_client.get(f"{BASE_URL}/api/auth/google/callback")
        assert response.status_code in [404, 405], f"Expected 404/405 (endpoint removed), got {response.status_code}: {response.text}"
        print(f"✅ GET /api/auth/google/callback correctly returns {response.status_code} (removed)")
    
    def test_auth_me_removed(self, api_client):
        """GET /api/auth/me should return 404 (removed)"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [404, 405], f"Expected 404/405 (endpoint removed), got {response.status_code}: {response.text}"
        print(f"✅ GET /api/auth/me correctly returns {response.status_code} (removed)")


class TestProtectedEndpointsNoToken:
    """Test that protected endpoints reject requests without token (401)"""
    
    def test_subscription_status_no_token(self, api_client):
        """GET /api/subscription/status without token should return 401"""
        response = api_client.get(f"{BASE_URL}/api/subscription/status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ GET /api/subscription/status correctly returns 401 without token")
    
    def test_admin_rbac_admins_no_token(self, api_client):
        """GET /api/admin/rbac/admins without token should return 401"""
        response = api_client.get(f"{BASE_URL}/api/admin/rbac/admins")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print(f"✅ GET /api/admin/rbac/admins correctly returns {response.status_code} without token")
    
    def test_settings_profile_no_token(self, api_client):
        """GET /api/settings/profile without token should return 401"""
        response = api_client.get(f"{BASE_URL}/api/settings/profile")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ GET /api/settings/profile correctly returns 401 without token")


class TestSupabaseTokenVerification:
    """Test that Supabase JWT tokens are properly verified"""
    
    def test_get_supabase_token(self, supabase_access_token):
        """Verify we can obtain a Supabase access token"""
        assert supabase_access_token is not None, "Failed to get Supabase access token"
        assert len(supabase_access_token) > 100, "Access token seems too short"
        print(f"✅ Got Supabase access token (length: {len(supabase_access_token)})")
    
    def test_subscription_status_with_valid_token(self, api_client, supabase_access_token):
        """GET /api/subscription/status with valid Supabase token should return 200"""
        response = api_client.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {supabase_access_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data, "Response should include user_id"
        assert "subscription" in data, "Response should include subscription"
        print(f"✅ GET /api/subscription/status returns 200 with valid token - user_id: {data.get('user_id')}")
    
    def test_settings_profile_with_valid_token(self, api_client, supabase_access_token):
        """GET /api/settings/profile with valid token returns user profile"""
        response = api_client.get(
            f"{BASE_URL}/api/settings/profile",
            headers={"Authorization": f"Bearer {supabase_access_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required profile fields
        assert "user_id" in data, "Response should include user_id"
        assert "name" in data, "Response should include name"
        assert "email" in data, "Response should include email"
        assert "role" in data, "Response should include role"
        
        print(f"✅ GET /api/settings/profile returns profile - user_id: {data.get('user_id')}, email: {data.get('email')}, role: {data.get('role')}")
    
    def test_invalid_token_rejected(self, api_client):
        """Test that invalid tokens are rejected"""
        response = api_client.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"
        print("✅ Invalid tokens are correctly rejected with 401")
    
    def test_expired_format_token_rejected(self, api_client):
        """Test that malformed tokens are rejected"""
        response = api_client.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"}
        )
        # This should fail since it's not a valid Supabase token
        assert response.status_code == 401, f"Expected 401 for malformed token, got {response.status_code}"
        print("✅ Malformed tokens are correctly rejected with 401")


class TestAdminEndpointProtection:
    """Test admin endpoint protection"""
    
    def test_admin_rbac_requires_auth(self, api_client):
        """Admin RBAC endpoints should require authentication"""
        endpoints = [
            "/api/admin/rbac/admins",
            "/api/admin/rbac/me",
        ]
        for endpoint in endpoints:
            response = api_client.get(f"{BASE_URL}{endpoint}")
            assert response.status_code in [401, 403], f"{endpoint} should return 401/403 without auth, got {response.status_code}"
        print("✅ Admin RBAC endpoints correctly require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
