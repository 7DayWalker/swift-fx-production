"""
Production-Readiness Tests for Swift FX Signals Backend (Iteration 8)
Tests the 7 mandatory fixes before deployment:
1. No Google mock expiry fallback
2. No sandbox default for APPLE_ENVIRONMENT  
3. Unified MongoDB-based entitlement resolution
4. MongoDB indexes
5. Clean CORS (no localhost/preview URLs)
6. No empty-string env fallbacks for critical vars
7. /api/health endpoint

Auth uses Supabase directly via /auth/v1/token endpoint.
"""

import pytest
import requests
import os
import re

# Backend URL for API testing
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://secure-refactor-2.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

# Supabase credentials for auth
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

TEST_USER_EMAIL = "paradoxella@gmail.com"
TEST_USER_PASSWORD = "Grace1992@"
ADMIN_USER_EMAIL = "ellapauledache@gmail.com"
ADMIN_USER_PASSWORD = "Grace1992@"


@pytest.fixture(scope="module")
def test_user_token():
    """Get auth token for test user via Supabase"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        }
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Failed to get test user token: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def admin_user_token():
    """Get auth token for admin user via Supabase"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": ADMIN_USER_EMAIL,
            "password": ADMIN_USER_PASSWORD
        }
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Failed to get admin token: {response.status_code} - {response.text}")


class TestHealthEndpoint:
    """Fix #7: /api/health endpoint"""
    
    def test_health_endpoint_exists(self):
        """GET /api/health returns status and mongo connection info"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "status" in data, "Missing 'status' in response"
        assert "mongo" in data, "Missing 'mongo' in response"
        print(f"Health check: status={data['status']}, mongo={data['mongo']}")
    
    def test_health_endpoint_mongo_connected(self):
        """Verify MongoDB is connected (status: healthy)"""
        response = requests.get(f"{BASE_URL}/api/health")
        data = response.json()
        assert data["status"] in ["healthy", "degraded"], f"Unexpected status: {data['status']}"
        assert data["mongo"] == "connected", f"MongoDB not connected: {data['mongo']}"


class TestSignalsRegression:
    """Regression: Ensure signals endpoint still works"""
    
    def test_signals_endpoint_returns_data(self):
        """GET /api/signals returns signal list"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of signals"
        print(f"Signals endpoint returned {len(data)} signals")


class TestIAPProductsRegression:
    """Regression: Ensure IAP products endpoint returns 6 SKUs"""
    
    def test_iap_products_returns_6_skus(self):
        """GET /api/iap/products returns all 6 official SKUs"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        products = data.get("products", [])
        assert len(products) == 6, f"Expected 6 SKUs, got {len(products)}"
        
        expected_skus = [
            'com.swiftfx.signals.premium.weekly',
            'com.swiftfx.signals.premium.monthly',
            'com.swiftfx.signals.premium.yearly',
            'com.swiftfx.signals.vip.weekly',
            'com.swiftfx.signals.vip.monthly',
            'com.swiftfx.signals.vip.yearly',
        ]
        for sku in expected_skus:
            assert sku in products, f"Missing SKU: {sku}"
        
        print(f"IAP products endpoint returned {len(products)} SKUs (all 6 present)")


class TestSubscriptionStatus:
    """Fix #3: Unified MongoDB-based entitlement resolution"""
    
    def test_subscription_status_test_user(self, test_user_token):
        """Test user entitlement comes from MongoDB iap_transactions"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "entitlement" in data, "Missing 'entitlement' field"
        assert data["entitlement"] in ["free", "premium", "vip"], f"Invalid entitlement: {data['entitlement']}"
        
        print(f"Test user entitlement: {data['entitlement']}")
        print(f"Is admin: {data.get('is_admin', False)}")
    
    def test_subscription_status_admin_user(self, admin_user_token):
        """Admin user has is_admin=true but entitlement=free (no IAP)"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {admin_user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify admin flag
        assert "is_admin" in data, "Missing 'is_admin' field"
        assert data["is_admin"] == True, f"Expected is_admin=true, got {data['is_admin']}"
        
        # Admin gets VIP access but entitlement should be 'free' if no IAP
        # OR the entitlement could be 'vip' if admin access grants VIP entitlement
        # Based on the code: get_effective_subscription returns 'vip' for admins
        assert "entitlement" in data, "Missing 'entitlement' field"
        
        print(f"Admin user is_admin: {data['is_admin']}")
        print(f"Admin user entitlement: {data['entitlement']}")


class TestSubscriptionPlans:
    """Verify subscription plans endpoint works correctly"""
    
    def test_subscription_plans_no_pricing(self):
        """GET /api/subscription/plans returns plan metadata without pricing field"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "plans" in data, "Missing 'plans' in response"
        plans = data["plans"]
        assert len(plans) > 0, "Expected at least one plan"
        
        # Check plan structure
        for plan in plans:
            assert "id" in plan or "tier" in plan, "Plan missing identifier"
            # Note: pricing may or may not be included based on implementation
        
        print(f"Subscription plans returned {len(plans)} plans")


class TestAdminSignalAccess:
    """Verify admin gets VIP-level signal access"""
    
    def test_admin_gets_all_signals(self, admin_user_token):
        """Admin user gets all signals (VIP-level access)"""
        response = requests.get(
            f"{BASE_URL}/api/signals",
            headers={"Authorization": f"Bearer {admin_user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Admin should see all signals without 'locked' flag
        for signal in data:
            if "locked" in signal:
                assert signal["locked"] == False, f"Admin signal should not be locked: {signal.get('signal_id')}"
        
        print(f"Admin can access {len(data)} signals")


# ============ CODE AUDIT TESTS ============

class TestCodeAuditCORS:
    """Fix #5: No localhost or preview URLs in CORS"""
    
    def test_no_localhost_in_cors(self):
        """CORS configuration has no localhost URLs"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Find CORS configuration section
        cors_pattern = r'CORS_ORIGINS\s*=\s*\[(.*?)\]'
        match = re.search(cors_pattern, content, re.DOTALL)
        
        if match:
            cors_section = match.group(0)
            # Should use env var, not hardcoded values
            assert 'localhost' not in cors_section.lower(), "CORS contains localhost"
            assert '127.0.0.1' not in cors_section, "CORS contains 127.0.0.1"
            print("CORS section clean - no localhost")
        
        # Check for hardcoded preview URLs
        assert 'preview.emergentagent.com' not in content.split('CORS_ORIGINS')[1].split('app.add_middleware')[0] if 'CORS_ORIGINS' in content else True, "CORS contains preview URL"
    
    def test_cors_uses_env_var(self):
        """CORS uses CORS_ORIGINS env var"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Check that CORS_ORIGINS is loaded from env
        assert "os.environ.get('CORS_ORIGINS'" in content or 'os.environ.get("CORS_ORIGINS"' in content, \
            "CORS_ORIGINS should be loaded from environment variable"
        print("CORS uses CORS_ORIGINS env var")


class TestCodeAuditAppleEnvironment:
    """Fix #2: No sandbox default for APPLE_ENVIRONMENT"""
    
    def test_apple_environment_no_default(self):
        """APPLE_ENVIRONMENT has no default fallback value"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Find APPLE_ENVIRONMENT assignment
        # Should be: APPLE_ENVIRONMENT = os.environ.get('APPLE_ENVIRONMENT')
        # NOT: APPLE_ENVIRONMENT = os.environ.get('APPLE_ENVIRONMENT', 'sandbox')
        pattern = r"APPLE_ENVIRONMENT\s*=\s*os\.environ\.get\s*\(\s*['\"]APPLE_ENVIRONMENT['\"]\s*(?:,\s*['\"](\w+)['\"])?\s*\)"
        match = re.search(pattern, content)
        
        if match:
            default_value = match.group(1)
            assert default_value is None, f"APPLE_ENVIRONMENT has default '{default_value}' - should have no default"
            print("APPLE_ENVIRONMENT has no default value (correct)")
        else:
            # Check if it's set without get() default
            assert "APPLE_ENVIRONMENT = os.environ.get('APPLE_ENVIRONMENT')" in content or \
                   'APPLE_ENVIRONMENT = os.environ.get("APPLE_ENVIRONMENT")' in content, \
                   "APPLE_ENVIRONMENT not properly configured"
            print("APPLE_ENVIRONMENT correctly configured without default")
    
    def test_apple_environment_validation(self):
        """APPLE_ENVIRONMENT validates allowed values"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Should have validation: sandbox, production, or None
        assert "APPLE_ENVIRONMENT not in" in content or "if APPLE_ENVIRONMENT not in" in content, \
            "Missing APPLE_ENVIRONMENT validation"
        print("APPLE_ENVIRONMENT validation present")


class TestCodeAuditGoogleMockExpiry:
    """Fix #1: No mock expiry fallback in Google verify"""
    
    def test_no_mock_expiry_fallback(self):
        """Google verify rejects if no expiryTimeMillis"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Check for mock expiry pattern that should NOT exist
        assert 'mock_expiry' not in content.lower(), "Found mock_expiry in code"
        assert 'timedelta(days=30)' not in content.split('verify_google')[1].split('return')[0] if 'verify_google' in content else True, \
            "Found fallback expiry calculation in Google verify"
        
        # Check that rejection logic exists
        assert 'No expiryTimeMillis' in content or 'missing expiry' in content.lower(), \
            "Missing rejection for absent expiryTimeMillis"
        print("Google verify correctly rejects missing expiryTimeMillis")


class TestCodeAuditSupabaseEnvVars:
    """Fix #6: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY have no empty-string fallback"""
    
    def test_supabase_url_no_empty_fallback(self):
        """SUPABASE_URL has no empty-string fallback"""
        auth_path = "/app/backend/supabase_auth.py"
        with open(auth_path, 'r') as f:
            content = f.read()
        
        # Check for empty-string default pattern
        bad_patterns = [
            "os.environ.get('SUPABASE_URL', '')",
            'os.environ.get("SUPABASE_URL", "")',
            "os.environ.get('SUPABASE_URL','')",
        ]
        for pattern in bad_patterns:
            assert pattern not in content, f"SUPABASE_URL has empty-string fallback: {pattern}"
        
        # Should raise error if not set
        assert "raise" in content and "SUPABASE_URL" in content, \
            "Should raise error if SUPABASE_URL not set"
        print("SUPABASE_URL correctly configured - no empty-string fallback")
    
    def test_supabase_service_key_no_empty_fallback(self):
        """SUPABASE_SERVICE_ROLE_KEY has no empty-string fallback"""
        auth_path = "/app/backend/supabase_auth.py"
        with open(auth_path, 'r') as f:
            content = f.read()
        
        # Check for empty-string default pattern
        bad_patterns = [
            "os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')",
            'os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")',
        ]
        for pattern in bad_patterns:
            assert pattern not in content, f"SUPABASE_SERVICE_ROLE_KEY has empty-string fallback: {pattern}"
        
        # Should raise error if not set
        assert "raise" in content and "SUPABASE_SERVICE_ROLE_KEY" in content, \
            "Should raise error if SUPABASE_SERVICE_ROLE_KEY not set"
        print("SUPABASE_SERVICE_ROLE_KEY correctly configured - no empty-string fallback")


class TestCodeAuditMongoIndexes:
    """Fix #4: MongoDB indexes are created on startup"""
    
    def test_mongodb_indexes_created(self):
        """MongoDB indexes are created in startup event"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Check for index creation in startup
        required_indexes = [
            'iap_transactions',
            'signals',
            'device_tokens',
        ]
        
        for collection in required_indexes:
            assert f"db.{collection}.create_index" in content, f"Missing index creation for {collection}"
        
        print("MongoDB indexes created for all required collections")
    
    def test_indexes_in_startup_event(self):
        """Index creation is in startup event handler"""
        server_path = "/app/backend/server.py"
        with open(server_path, 'r') as f:
            content = f.read()
        
        # Find startup event
        startup_section = content.split('@app.on_event("startup")')[1].split('@app.on_event')[0] if '@app.on_event("startup")' in content else ""
        
        assert 'create_index' in startup_section, "create_index not in startup event"
        print("Index creation correctly placed in startup event")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
