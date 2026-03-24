"""
Test AI Analysis Sharing Endpoints
- POST /api/ai/share/{analysis_id} - Generate shareable link
- GET /api/ai/shared/{share_token} - Public view shared analysis
- POST /api/ai/share/{analysis_id}/community - Post to community feed
"""

import pytest
import requests
import os

# Get URLs from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
SUPABASE_URL = os.environ.get('EXPO_PUBLIC_SUPABASE_URL', '').rstrip('/')
SUPABASE_ANON_KEY = os.environ.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', '')

# Test credentials
VIP_USER_EMAIL = "paradoxella@gmail.com"
VIP_USER_PASSWORD = "Grace1992@"
ADMIN_USER_EMAIL = "ellapauledache@gmail.com"
ADMIN_USER_PASSWORD = "Grace1992@"


def get_supabase_auth_token(email: str, password: str) -> str:
    """Get Supabase auth token via REST API"""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    payload = {"email": email, "password": password}
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code != 200:
        pytest.skip(f"Auth failed for {email}: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin user auth token"""
    return get_supabase_auth_token(ADMIN_USER_EMAIL, ADMIN_USER_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def existing_analysis_id(admin_headers):
    """Get an existing analysis_id from the user's history"""
    response = requests.get(f"{BACKEND_URL}/api/ai/history", headers=admin_headers)
    if response.status_code != 200:
        pytest.skip(f"Could not fetch AI history: {response.status_code}")
    
    data = response.json()
    items = data.get("items", [])
    if not items:
        pytest.skip("No existing AI analyses found in history")
    
    return items[0].get("analysis_id")


class TestShareEndpointAuth:
    """Test authentication requirements for share endpoints"""
    
    def test_share_returns_401_unauthenticated(self):
        """POST /api/ai/share/{analysis_id} returns 401 without auth"""
        response = requests.post(f"{BACKEND_URL}/api/ai/share/fake_analysis_id")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ POST /api/ai/share returns 401 for unauthenticated users")
    
    def test_community_share_returns_401_unauthenticated(self):
        """POST /api/ai/share/{analysis_id}/community returns 401 without auth"""
        response = requests.post(f"{BACKEND_URL}/api/ai/share/fake_analysis_id/community")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ POST /api/ai/share/{id}/community returns 401 for unauthenticated users")


class TestShareEndpointAuthenticated:
    """Test share endpoints with authenticated user"""
    
    def test_share_returns_404_for_nonexistent_analysis(self, admin_headers):
        """POST /api/ai/share/{analysis_id} returns 404 for non-existent analysis"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/nonexistent_analysis_12345",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✅ POST /api/ai/share returns 404 for non-existent analysis")
    
    def test_share_returns_share_token_for_valid_analysis(self, admin_headers, existing_analysis_id):
        """POST /api/ai/share/{analysis_id} returns share_token for valid analysis"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "share_token" in data, f"Response missing share_token: {data}"
        assert "analysis_id" in data, f"Response missing analysis_id: {data}"
        assert data["analysis_id"] == existing_analysis_id
        assert len(data["share_token"]) == 16, f"share_token should be 16 chars: {data['share_token']}"
        
        print(f"✅ POST /api/ai/share returns share_token: {data['share_token']}")
        return data["share_token"]
    
    def test_share_is_idempotent(self, admin_headers, existing_analysis_id):
        """POST /api/ai/share/{analysis_id} reuses existing share_token on second call"""
        # First call
        response1 = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}",
            headers=admin_headers
        )
        assert response1.status_code == 200
        token1 = response1.json().get("share_token")
        
        # Second call - should return same token
        response2 = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}",
            headers=admin_headers
        )
        assert response2.status_code == 200
        token2 = response2.json().get("share_token")
        
        assert token1 == token2, f"Tokens should be same: {token1} vs {token2}"
        print(f"✅ POST /api/ai/share is idempotent - same token returned: {token1}")


class TestSharedViewEndpoint:
    """Test public shared analysis view endpoint"""
    
    @pytest.fixture
    def share_token(self, admin_headers, existing_analysis_id):
        """Get a share token for testing"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}",
            headers=admin_headers
        )
        if response.status_code != 200:
            pytest.skip(f"Could not create share token: {response.status_code}")
        return response.json().get("share_token")
    
    def test_shared_view_returns_404_for_nonexistent_token(self):
        """GET /api/ai/shared/{share_token} returns 404 for non-existent token"""
        response = requests.get(f"{BACKEND_URL}/api/ai/shared/nonexistent_token")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✅ GET /api/ai/shared returns 404 for non-existent token")
    
    def test_shared_view_returns_analysis_publicly(self, share_token):
        """GET /api/ai/shared/{share_token} returns analysis data without auth"""
        # No auth headers - public endpoint
        response = requests.get(f"{BACKEND_URL}/api/ai/shared/{share_token}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields are present
        assert "analysis_id" in data, f"Response missing analysis_id: {data}"
        assert "pair" in data, f"Response missing pair: {data}"
        
        print(f"✅ GET /api/ai/shared returns analysis publicly: pair={data.get('pair')}")
    
    def test_shared_view_excludes_user_id_and_image(self, share_token):
        """GET /api/ai/shared/{share_token} excludes user_id and image_snapshot"""
        response = requests.get(f"{BACKEND_URL}/api/ai/shared/{share_token}")
        assert response.status_code == 200
        
        data = response.json()
        assert "user_id" not in data, f"Response should NOT contain user_id: {data.keys()}"
        assert "image_snapshot" not in data, f"Response should NOT contain image_snapshot: {data.keys()}"
        
        print("✅ GET /api/ai/shared excludes user_id and image_snapshot from response")
    
    def test_shared_view_increments_view_count(self, share_token):
        """GET /api/ai/shared/{share_token} increments view_count"""
        # First view
        response1 = requests.get(f"{BACKEND_URL}/api/ai/shared/{share_token}")
        assert response1.status_code == 200
        view_count_1 = response1.json().get("view_count", 0)
        
        # Second view
        response2 = requests.get(f"{BACKEND_URL}/api/ai/shared/{share_token}")
        assert response2.status_code == 200
        view_count_2 = response2.json().get("view_count", 0)
        
        # View count should have incremented
        assert view_count_2 > view_count_1, f"view_count should increment: {view_count_1} -> {view_count_2}"
        print(f"✅ GET /api/ai/shared increments view_count: {view_count_1} -> {view_count_2}")


class TestCommunityShareEndpoint:
    """Test community share endpoint"""
    
    def test_community_share_returns_404_for_nonexistent_analysis(self, admin_headers):
        """POST /api/ai/share/{analysis_id}/community returns 404 for non-existent analysis"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/nonexistent_analysis_12345/community",
            headers=admin_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✅ POST /api/ai/share/{id}/community returns 404 for non-existent analysis")
    
    def test_community_share_creates_post(self, admin_headers, existing_analysis_id):
        """POST /api/ai/share/{analysis_id}/community creates a community post"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}/community",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "post_id" in data, f"Response missing post_id: {data}"
        assert "content" in data, f"Response missing content: {data}"
        assert "post_type" in data, f"Response missing post_type: {data}"
        
        print(f"✅ POST /api/ai/share/{existing_analysis_id}/community created post: {data.get('post_id')}")
        return data
    
    def test_community_post_has_correct_type(self, admin_headers, existing_analysis_id):
        """Community post has post_type='ai_analysis'"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}/community",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("post_type") == "ai_analysis", f"post_type should be 'ai_analysis': {data.get('post_type')}"
        print("✅ Community post has post_type='ai_analysis'")
    
    def test_community_post_includes_bias_and_confidence(self, admin_headers, existing_analysis_id):
        """Community post content includes trade_bias and confidence_score"""
        response = requests.post(
            f"{BACKEND_URL}/api/ai/share/{existing_analysis_id}/community",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        content = data.get("content", "")
        
        # Content should include Bias and Confidence
        assert "Bias:" in content, f"Content should include 'Bias:': {content}"
        assert "Confidence:" in content, f"Content should include 'Confidence:': {content}"
        
        print(f"✅ Community post includes trade_bias and confidence_score in content")
        print(f"   Content preview: {content[:100]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
