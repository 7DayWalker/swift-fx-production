"""
test_market_data_service.py — Tests for Multi-Asset Market Data Service + Auto Signal Engine

Tests:
1. GET /api/market/symbols - should return {symbols: ['XAUUSD']}
2. GET /api/market/price?symbol=XAUUSD - should return 503 with test keys (graceful failure)
3. GET /api/market/price?symbol=INVALID - should return 400 with clear error message
4. GET /api/market/price?symbol=XAU/USD - alias should resolve to XAUUSD (503 with test keys)
5. GET /api/market/price?symbol=GOLD - alias should resolve to XAUUSD (503 with test keys)
6. Regression tests for existing endpoints
7. Auth endpoints return 401 without token
8. Admin endpoints work with SA token
9. Automation status endpoint
"""
import pytest
import requests
import os
from datetime import datetime

# Use the public URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com')

# Supabase auth config
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Super Admin credentials
SA_EMAIL = "ellapauledache@gmail.com"
SA_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def sa_token(api_client):
    """Get Super Admin authentication token from Supabase"""
    response = api_client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": SA_EMAIL,
            "password": SA_PASSWORD
        }
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    pytest.skip(f"Failed to get SA token: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, sa_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {sa_token}"})
    return api_client


# ===================== MARKET DATA SERVICE TESTS =====================

class TestMarketSymbols:
    """Tests for GET /api/market/symbols endpoint"""
    
    def test_market_symbols_returns_xauusd(self, api_client):
        """GET /api/market/symbols should return {symbols: ['XAUUSD']}"""
        response = api_client.get(f"{BASE_URL}/api/market/symbols")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "symbols" in data, "Response should contain 'symbols' key"
        assert isinstance(data["symbols"], list), "symbols should be a list"
        assert "XAUUSD" in data["symbols"], "XAUUSD should be in supported symbols"
        print(f"✓ Market symbols: {data['symbols']}")


class TestMarketPriceXAUUSD:
    """Tests for GET /api/market/price?symbol=XAUUSD endpoint"""
    
    def test_market_price_xauusd_returns_503_with_test_keys(self, api_client):
        """GET /api/market/price?symbol=XAUUSD should return 503 with test keys (graceful failure)"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "XAUUSD"})
        
        # With test_key placeholders, all providers should fail gracefully → 503
        assert response.status_code == 503, f"Expected 503 (graceful failure with test keys), got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain 'detail' key"
        assert "XAUUSD" in data["detail"] or "failed" in data["detail"].lower(), \
            f"Error message should mention XAUUSD or failure: {data['detail']}"
        print(f"✓ XAUUSD price request correctly returns 503 with test keys: {data['detail']}")


class TestMarketPriceInvalid:
    """Tests for GET /api/market/price?symbol=INVALID endpoint"""
    
    def test_market_price_invalid_symbol_returns_400(self, api_client):
        """GET /api/market/price?symbol=INVALID should return 400 with clear error message"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "INVALID"})
        
        assert response.status_code == 400, f"Expected 400 for invalid symbol, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain 'detail' key"
        # Error should mention unsupported symbol and available symbols
        assert "unsupported" in data["detail"].lower() or "invalid" in data["detail"].lower() or "available" in data["detail"].lower(), \
            f"Error message should indicate unsupported symbol: {data['detail']}"
        print(f"✓ Invalid symbol correctly returns 400: {data['detail']}")


class TestMarketPriceAliases:
    """Tests for symbol alias resolution"""
    
    def test_market_price_xau_usd_alias_resolves(self, api_client):
        """GET /api/market/price?symbol=XAU/USD should resolve to XAUUSD (503 with test keys)"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "XAU/USD"})
        
        # Alias should resolve to XAUUSD, then fail with 503 due to test keys
        assert response.status_code == 503, f"Expected 503 (alias resolved, test keys), got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain 'detail' key"
        # The error should mention XAUUSD (the resolved symbol)
        assert "XAUUSD" in data["detail"], f"Error should mention resolved symbol XAUUSD: {data['detail']}"
        print(f"✓ XAU/USD alias correctly resolves to XAUUSD: {data['detail']}")
    
    def test_market_price_gold_alias_resolves(self, api_client):
        """GET /api/market/price?symbol=GOLD should resolve to XAUUSD (503 with test keys)"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "GOLD"})
        
        # Alias should resolve to XAUUSD, then fail with 503 due to test keys
        assert response.status_code == 503, f"Expected 503 (alias resolved, test keys), got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain 'detail' key"
        # The error should mention XAUUSD (the resolved symbol)
        assert "XAUUSD" in data["detail"], f"Error should mention resolved symbol XAUUSD: {data['detail']}"
        print(f"✓ GOLD alias correctly resolves to XAUUSD: {data['detail']}")


# ===================== REGRESSION TESTS - EXISTING ENDPOINTS =====================

class TestRegressionPublicEndpoints:
    """Regression tests for existing public endpoints"""
    
    def test_health_endpoint(self, api_client):
        """GET /api/health should return 200"""
        response = api_client.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status' key"
        print(f"✓ Health check: {data}")
    
    def test_signals_endpoint(self, api_client):
        """GET /api/signals should return 200"""
        response = api_client.get(f"{BASE_URL}/api/signals")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Signals endpoint returns 200")
    
    def test_automation_status_endpoint(self, api_client):
        """GET /api/automation/status should return 200 with engine mode info"""
        response = api_client.get(f"{BASE_URL}/api/automation/status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "mode" in data, "Response should contain 'mode' key"
        assert "auto_engine_running" in data, "Response should contain 'auto_engine_running' key"
        assert "enabled" in data, "Response should contain 'enabled' key"
        assert "paused" in data, "Response should contain 'paused' key"
        assert data["mode"] in ["AUTO", "PAUSED", "DISABLED"], f"Mode should be AUTO, PAUSED, or DISABLED: {data['mode']}"
        print(f"✓ Automation status: mode={data['mode']}, running={data['auto_engine_running']}, paused={data['paused']}")


# ===================== AUTH REJECTION TESTS =====================

class TestAuthRejection:
    """Tests that auth endpoints return 401 without token"""
    
    def test_admin_stats_requires_auth(self):
        """GET /api/admin/stats should return 401 without token"""
        # Use a fresh session without auth
        response = requests.get(f"{BASE_URL}/api/admin/stats")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}: {response.text}"
        print(f"✓ /api/admin/stats correctly returns 401 without auth")
    
    def test_subscription_status_requires_auth(self):
        """GET /api/subscription/status should return 401 without token"""
        response = requests.get(f"{BASE_URL}/api/subscription/status")
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}: {response.text}"
        print(f"✓ /api/subscription/status correctly returns 401 without auth")


# ===================== ADMIN ENDPOINTS WITH SA TOKEN =====================

class TestAdminEndpointsWithAuth:
    """Tests for admin endpoints with Super Admin token"""
    
    def test_admin_stats_with_sa_token(self, authenticated_client):
        """GET /api/admin/stats should return 200 with SA token"""
        response = authenticated_client.get(f"{BASE_URL}/api/admin/stats")
        
        assert response.status_code == 200, f"Expected 200 with SA token, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_users" in data, "Response should contain 'total_users'"
        assert "total_signals" in data, "Response should contain 'total_signals'"
        print(f"✓ Admin stats with SA token: users={data.get('total_users')}, signals={data.get('total_signals')}")
    
    def test_admin_rbac_me_with_sa_token(self, authenticated_client):
        """GET /api/admin/rbac/me should return 200 with SA token"""
        response = authenticated_client.get(f"{BASE_URL}/api/admin/rbac/me")
        
        assert response.status_code == 200, f"Expected 200 with SA token, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data or "email" in data or "role" in data, \
            f"Response should contain user info: {data}"
        print(f"✓ Admin RBAC me with SA token: {data}")


class TestDashboardWithAuth:
    """Tests for dashboard endpoint with auth"""
    
    def test_dashboard_with_sa_token(self, authenticated_client):
        """GET /api/dashboard should return 200 with auth"""
        response = authenticated_client.get(f"{BASE_URL}/api/dashboard")
        
        assert response.status_code == 200, f"Expected 200 with auth, got {response.status_code}: {response.text}"
        print(f"✓ Dashboard endpoint returns 200 with auth")


# ===================== SIGNAL ENGINE RESUME TEST =====================

class TestSignalEngineResume:
    """Test signal engine resume functionality"""
    
    def test_resume_automation_engine(self, authenticated_client):
        """POST /api/admin/automation/resume should work with SA token"""
        response = authenticated_client.post(f"{BASE_URL}/api/admin/automation/resume")
        
        # Should return 200 (resumed) or 400 (already running)
        assert response.status_code in [200, 400], \
            f"Expected 200 or 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"✓ Automation resume response: {data}")
        
        # Verify engine status after resume
        status_response = authenticated_client.get(f"{BASE_URL}/api/automation/status")
        assert status_response.status_code == 200
        status_data = status_response.json()
        print(f"✓ Engine status after resume: mode={status_data.get('mode')}, running={status_data.get('auto_engine_running')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
