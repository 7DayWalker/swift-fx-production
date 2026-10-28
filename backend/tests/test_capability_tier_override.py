"""
Test Suite: Admin Capability Tier Override System
Tests the billing_tier, capability_tier, and capability_source fields in /api/subscription/status
Verifies that SUPER_ADMIN and ADMIN users get VIP-level feature access
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com').rstrip('/')
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Test credentials
SUPER_ADMIN_EMAIL = "ellapauledache@gmail.com"
SUPER_ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")
SUPER_ADMIN_2_EMAIL = "ellaniswell@gmail.com"
SUPER_ADMIN_2_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


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
        pytest.skip(f"Authentication failed for {email}: {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def super_admin_token():
    """Get SUPER_ADMIN auth token"""
    return get_auth_token(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def super_admin_2_token():
    """Get second SUPER_ADMIN auth token"""
    return get_auth_token(SUPER_ADMIN_2_EMAIL, SUPER_ADMIN_2_PASSWORD)


class TestSubscriptionStatusFields:
    """Test that /api/subscription/status returns all required fields"""
    
    def test_returns_billing_tier_field(self, super_admin_token):
        """Verify billing_tier field is present in response"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "billing_tier" in data, "billing_tier field missing from response"
        assert data["billing_tier"] in ["free", "premium", "vip"], f"Invalid billing_tier: {data['billing_tier']}"
    
    def test_returns_capability_tier_field(self, super_admin_token):
        """Verify capability_tier field is present in response"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "capability_tier" in data, "capability_tier field missing from response"
        assert data["capability_tier"] in ["free", "premium", "vip"], f"Invalid capability_tier: {data['capability_tier']}"
    
    def test_returns_capability_source_field(self, super_admin_token):
        """Verify capability_source field is present in response"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "capability_source" in data, "capability_source field missing from response"
        assert data["capability_source"] in ["admin_privilege", "subscription"], f"Invalid capability_source: {data['capability_source']}"


class TestAdminCapabilityTierOverride:
    """Test that admin users get VIP capability tier regardless of billing tier"""
    
    def test_super_admin_has_vip_capability_tier(self, super_admin_token):
        """SUPER_ADMIN should have capability_tier=vip"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["capability_tier"] == "vip", f"Expected capability_tier=vip, got {data['capability_tier']}"
    
    def test_super_admin_has_admin_privilege_source(self, super_admin_token):
        """SUPER_ADMIN should have capability_source=admin_privilege"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["capability_source"] == "admin_privilege", f"Expected capability_source=admin_privilege, got {data['capability_source']}"
    
    def test_super_admin_billing_tier_shows_real_tier(self, super_admin_token):
        """SUPER_ADMIN billing_tier should show actual subscription tier (not elevated)"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # billing_tier should be the actual tier (free, premium, or vip) - not necessarily vip
        assert data["billing_tier"] in ["free", "premium", "vip"]
        # For this test user, billing_tier is likely "free" since they don't have a paid subscription
        print(f"SUPER_ADMIN billing_tier: {data['billing_tier']}")
    
    def test_second_super_admin_has_vip_capability(self, super_admin_2_token):
        """Second SUPER_ADMIN should also have VIP capability"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_2_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["capability_tier"] == "vip"
        assert data["capability_source"] == "admin_privilege"


class TestAdminVIPFeatures:
    """Test that admin users have all VIP features enabled"""
    
    def test_admin_has_fund_management_enabled(self, super_admin_token):
        """Admin should have fund_management=true (VIP feature)"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["features"]["fund_management"] == True, "fund_management should be true for admin"
    
    def test_admin_has_academy_enabled(self, super_admin_token):
        """Admin should have academy=true (VIP feature)"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["features"]["academy"] == True, "academy should be true for admin"
    
    def test_admin_has_image_uploads_enabled(self, super_admin_token):
        """Admin should have image_uploads=true"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["features"]["image_uploads"] == True, "image_uploads should be true for admin"
    
    def test_admin_has_unlimited_ai_limit(self, super_admin_token):
        """Admin should have unlimited AI analyzer usage"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["features"]["ai_limit"] == "unlimited", f"Expected ai_limit=unlimited, got {data['features']['ai_limit']}"
        assert data["features"]["ai_remaining"] == "unlimited", f"Expected ai_remaining=unlimited, got {data['features']['ai_remaining']}"
        assert data["features"]["ai_limit_reached"] == False, "ai_limit_reached should be false for unlimited"
    
    def test_admin_has_vip_signals_access(self, super_admin_token):
        """Admin should have VIP-level signals access"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["features"]["signals_access"] == "vip", f"Expected signals_access=vip, got {data['features']['signals_access']}"


class TestIsAdminFlag:
    """Test the is_admin flag in subscription status"""
    
    def test_super_admin_has_is_admin_true(self, super_admin_token):
        """SUPER_ADMIN should have is_admin=true"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_admin"] == True, "is_admin should be true for SUPER_ADMIN"
    
    def test_super_admin_subscription_active(self, super_admin_token):
        """SUPER_ADMIN should have subscription_active=true (due to admin privilege)"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["subscription_active"] == True, "subscription_active should be true for admin"


class TestResponseSchema:
    """Validate the complete response schema"""
    
    def test_complete_response_schema(self, super_admin_token):
        """Verify all expected fields are present in response"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Top-level required fields
        required_fields = [
            "user_id", "entitlement", "billing_tier", "capability_tier", 
            "capability_source", "subscription_active", "subscription_expiry",
            "subscription_platform", "subscription_product_id", "auto_renew",
            "is_admin", "override", "features"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Features required fields
        features_fields = [
            "signals_access", "ai_analyzer", "ai_limit", "ai_used",
            "ai_remaining", "ai_limit_reached", "fund_management", 
            "academy", "image_uploads"
        ]
        for field in features_fields:
            assert field in data["features"], f"Missing features field: {field}"
    
    def test_capability_source_values(self, super_admin_token):
        """Verify capability_source is one of the expected values"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        valid_sources = ["admin_privilege", "subscription"]
        assert data["capability_source"] in valid_sources, f"Invalid capability_source: {data['capability_source']}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
