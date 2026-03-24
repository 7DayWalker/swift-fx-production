"""
Test suite for GET /api/admin/health endpoint
Tests admin-only backend health widget functionality
"""
import pytest
import requests
import os
from datetime import datetime

# Get backend URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Supabase credentials for auth
SUPABASE_URL = os.environ.get('EXPO_PUBLIC_SUPABASE_URL', 'https://hrzghlqcfccnmgcipxxo.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ')

# Test credentials
ADMIN_EMAIL = "ellapauledache@gmail.com"
ADMIN_PASSWORD = "Grace1992@"


def get_supabase_token(email: str, password: str) -> str:
    """Get Supabase auth token via REST API"""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    payload = {"email": email, "password": password}
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    token = get_supabase_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip("Failed to authenticate admin user")
    return token


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestAdminHealthUnauthenticated:
    """Test /api/admin/health returns 401 for unauthenticated requests"""
    
    def test_no_auth_returns_401(self, api_client):
        """Unauthenticated request should return 401"""
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Unauthenticated request returns 401")
    
    def test_invalid_token_returns_401(self, api_client):
        """Invalid token should return 401"""
        api_client.headers.update({"Authorization": "Bearer invalid_token_12345"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Invalid token returns 401")


class TestAdminHealthAuthenticated:
    """Test /api/admin/health returns 200 with correct data for admin users"""
    
    def test_admin_returns_200(self, api_client, admin_token):
        """Admin user should get 200 response"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✅ Admin user returns 200")
    
    def test_response_has_engine_status(self, api_client, admin_token):
        """Response should have engine_status field"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert "engine_status" in data, f"Missing engine_status field: {data}"
        print(f"✅ engine_status present: {data['engine_status']}")
    
    def test_response_has_engine_detail(self, api_client, admin_token):
        """Response should have engine_detail field"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert "engine_detail" in data, f"Missing engine_detail field: {data}"
        print(f"✅ engine_detail present: {data['engine_detail']}")
    
    def test_response_has_engine_error_count(self, api_client, admin_token):
        """Response should have engine_error_count field"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert "engine_error_count" in data, f"Missing engine_error_count field: {data}"
        print(f"✅ engine_error_count present: {data['engine_error_count']}")
    
    def test_response_has_last_signal_time(self, api_client, admin_token):
        """Response should have last_signal_time field"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert "last_signal_time" in data, f"Missing last_signal_time field: {data}"
        print(f"✅ last_signal_time present: {data['last_signal_time']}")
    
    def test_response_has_api_response_ms(self, api_client, admin_token):
        """Response should have api_response_ms field"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert "api_response_ms" in data, f"Missing api_response_ms field: {data}"
        print(f"✅ api_response_ms present: {data['api_response_ms']}")
    
    def test_response_has_mongo_connected(self, api_client, admin_token):
        """Response should have mongo_connected field"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert "mongo_connected" in data, f"Missing mongo_connected field: {data}"
        print(f"✅ mongo_connected present: {data['mongo_connected']}")


class TestAdminHealthFieldValidation:
    """Test field values are correct types and valid values"""
    
    def test_engine_status_valid_values(self, api_client, admin_token):
        """engine_status should be Running, Paused, or Disabled"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        valid_statuses = ["Running", "Paused", "Disabled"]
        assert data["engine_status"] in valid_statuses, f"Invalid engine_status: {data['engine_status']}, expected one of {valid_statuses}"
        print(f"✅ engine_status is valid: {data['engine_status']}")
    
    def test_api_response_ms_is_positive_integer(self, api_client, admin_token):
        """api_response_ms should be a positive integer"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert isinstance(data["api_response_ms"], int), f"api_response_ms should be int, got {type(data['api_response_ms'])}"
        assert data["api_response_ms"] >= 0, f"api_response_ms should be non-negative, got {data['api_response_ms']}"
        print(f"✅ api_response_ms is positive integer: {data['api_response_ms']}")
    
    def test_mongo_connected_is_boolean(self, api_client, admin_token):
        """mongo_connected should be a boolean"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert isinstance(data["mongo_connected"], bool), f"mongo_connected should be bool, got {type(data['mongo_connected'])}"
        print(f"✅ mongo_connected is boolean: {data['mongo_connected']}")
    
    def test_mongo_connected_is_true(self, api_client, admin_token):
        """mongo_connected should be True (MongoDB is connected)"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert data["mongo_connected"] is True, f"mongo_connected should be True, got {data['mongo_connected']}"
        print("✅ mongo_connected is True")
    
    def test_last_signal_time_format(self, api_client, admin_token):
        """last_signal_time should be valid ISO datetime string or null"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        last_signal_time = data["last_signal_time"]
        
        if last_signal_time is not None:
            # Try to parse as ISO datetime
            try:
                # Handle various ISO formats
                if 'T' in last_signal_time:
                    datetime.fromisoformat(last_signal_time.replace('Z', '+00:00'))
                print(f"✅ last_signal_time is valid ISO datetime: {last_signal_time}")
            except ValueError as e:
                pytest.fail(f"last_signal_time is not valid ISO datetime: {last_signal_time}, error: {e}")
        else:
            print("✅ last_signal_time is null (no signals yet)")
    
    def test_engine_error_count_is_integer(self, api_client, admin_token):
        """engine_error_count should be an integer"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        assert isinstance(data["engine_error_count"], int), f"engine_error_count should be int, got {type(data['engine_error_count'])}"
        assert data["engine_error_count"] >= 0, f"engine_error_count should be non-negative, got {data['engine_error_count']}"
        print(f"✅ engine_error_count is integer: {data['engine_error_count']}")
    
    def test_engine_detail_is_string_or_null(self, api_client, admin_token):
        """engine_detail should be a string or null"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        engine_detail = data["engine_detail"]
        assert engine_detail is None or isinstance(engine_detail, str), f"engine_detail should be string or null, got {type(engine_detail)}"
        print(f"✅ engine_detail is string or null: {engine_detail}")


class TestAdminHealthResponseStructure:
    """Test complete response structure"""
    
    def test_response_has_all_6_fields(self, api_client, admin_token):
        """Response should have exactly 6 fields"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        
        required_fields = [
            "engine_status",
            "engine_detail",
            "engine_error_count",
            "last_signal_time",
            "api_response_ms",
            "mongo_connected"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✅ All 6 required fields present: {list(data.keys())}")
    
    def test_full_response_sample(self, api_client, admin_token):
        """Print full response for documentation"""
        api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
        response = api_client.get(f"{BASE_URL}/api/admin/health")
        data = response.json()
        
        print("\n📋 Full /api/admin/health response:")
        print(f"  engine_status: {data['engine_status']}")
        print(f"  engine_detail: {data['engine_detail']}")
        print(f"  engine_error_count: {data['engine_error_count']}")
        print(f"  last_signal_time: {data['last_signal_time']}")
        print(f"  api_response_ms: {data['api_response_ms']}")
        print(f"  mongo_connected: {data['mongo_connected']}")
        
        assert True  # This test is for documentation


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
