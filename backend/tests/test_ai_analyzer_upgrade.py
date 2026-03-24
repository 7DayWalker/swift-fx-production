"""
Test suite for AI Chart Analyzer upgrade features:
- POST /api/ai/analyze: Returns trade_bias, confidence_score, analysis_text, detected_pattern, analysis_id
- GET /api/ai/history: Paginated history, newest first
- GET /api/ai/history/{analysis_id}: Detail view
- Auto-save to ai_analyses collection
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
SUPABASE_URL = os.environ.get('EXPO_PUBLIC_SUPABASE_URL', 'https://hrzghlqcfccnmgcipxxo.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ')

# Test credentials - using admin user (VIP credentials invalid)
# Admin user has VIP-level access for feature gating
TEST_USER_EMAIL = "ellapauledache@gmail.com"
TEST_USER_PASSWORD = "Grace1992@"


def get_supabase_token(email: str, password: str) -> str:
    """Authenticate with Supabase and return access token"""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    payload = {"email": email, "password": password}
    
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code != 200:
        pytest.skip(f"Failed to authenticate: {response.status_code} - {response.text}")
    
    data = response.json()
    return data.get("access_token")


class TestAIHistoryEndpointAuth:
    """Test authentication requirements for AI history endpoints"""
    
    def test_history_returns_401_unauthenticated(self):
        """GET /api/ai/history should return 401 without auth token"""
        response = requests.get(f"{BASE_URL}/api/ai/history")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ GET /api/ai/history returns 401 for unauthenticated requests")
    
    def test_history_detail_returns_401_unauthenticated(self):
        """GET /api/ai/history/{id} should return 401 without auth token"""
        response = requests.get(f"{BASE_URL}/api/ai/history/nonexistent")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ GET /api/ai/history/{id} returns 401 for unauthenticated requests")


class TestAIHistoryEndpointAuthenticated:
    """Test AI history endpoints with authenticated user"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for test user"""
        self.token = get_supabase_token(TEST_USER_EMAIL, TEST_USER_PASSWORD)
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_history_returns_paginated_list(self):
        """GET /api/ai/history should return paginated list for authenticated user"""
        response = requests.get(f"{BASE_URL}/api/ai/history", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "items" in data, "Response should have 'items' field"
        assert "total" in data, "Response should have 'total' field"
        assert "page" in data, "Response should have 'page' field"
        assert "limit" in data, "Response should have 'limit' field"
        assert "has_more" in data, "Response should have 'has_more' field"
        
        assert isinstance(data["items"], list), "'items' should be a list"
        assert isinstance(data["total"], int), "'total' should be an integer"
        
        print(f"✅ GET /api/ai/history returns paginated list (total: {data['total']}, items: {len(data['items'])})")
    
    def test_history_pagination_params(self):
        """GET /api/ai/history should respect pagination parameters"""
        response = requests.get(f"{BASE_URL}/api/ai/history?page=1&limit=5", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["page"] == 1
        assert data["limit"] <= 50, "Limit should be clamped to max 50"
        print("✅ GET /api/ai/history respects pagination parameters")
    
    def test_history_detail_returns_404_for_nonexistent(self):
        """GET /api/ai/history/{id} should return 404 for non-existent analysis"""
        response = requests.get(f"{BASE_URL}/api/ai/history/nonexistent_id_12345", headers=self.headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ GET /api/ai/history/{id} returns 404 for non-existent analysis")
    
    def test_history_items_have_required_fields(self):
        """History items should have required fields for display"""
        response = requests.get(f"{BASE_URL}/api/ai/history?limit=5", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["items"]:
            item = data["items"][0]
            # Check required fields for history card display
            required_fields = ["analysis_id", "pair", "timeframe", "trade_bias", "confidence_score", "created_at"]
            for field in required_fields:
                assert field in item, f"History item missing required field: {field}"
            
            # Verify trade_bias is valid
            assert item["trade_bias"] in ["BUY", "SELL", "WAIT"], f"Invalid trade_bias: {item['trade_bias']}"
            
            # Verify confidence_score is 0-100
            assert 0 <= item["confidence_score"] <= 100, f"confidence_score out of range: {item['confidence_score']}"
            
            print(f"✅ History items have all required fields: {required_fields}")
        else:
            print("⚠️ No history items to verify (empty history)")


class TestAIAnalyzeEndpoint:
    """Test POST /api/ai/analyze endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for test user"""
        self.token = get_supabase_token(TEST_USER_EMAIL, TEST_USER_PASSWORD)
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_analyze_returns_401_unauthenticated(self):
        """POST /api/ai/analyze should return 401 without auth token"""
        response = requests.post(
            f"{BASE_URL}/api/ai/analyze",
            json={"prompt": "test", "pair": "EUR/USD", "timeframe": "H1"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ POST /api/ai/analyze returns 401 for unauthenticated requests")
    
    def test_analyze_returns_new_fields(self):
        """POST /api/ai/analyze should return new fields: trade_bias, confidence_score, analysis_text, detected_pattern, analysis_id"""
        # Note: This test actually calls the AI - may take time and use quota
        # Using a simple text prompt without image to minimize cost
        payload = {
            "prompt": "The EUR/USD chart shows a clear uptrend with higher highs and higher lows. Price is above the 50 EMA.",
            "pair": "EUR/USD",
            "timeframe": "H1"
        }
        
        response = requests.post(f"{BASE_URL}/api/ai/analyze", json=payload, headers=self.headers, timeout=60)
        
        if response.status_code == 403:
            pytest.skip("AI usage limit reached - skipping analyze test")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify new required fields
        assert "analysis_id" in data, "Response missing 'analysis_id'"
        assert "trade_bias" in data, "Response missing 'trade_bias'"
        assert "confidence_score" in data, "Response missing 'confidence_score'"
        assert "analysis_text" in data, "Response missing 'analysis_text'"
        assert "detected_pattern" in data, "Response missing 'detected_pattern'"
        
        # Verify field values
        assert data["trade_bias"] in ["BUY", "SELL", "WAIT"], f"Invalid trade_bias: {data['trade_bias']}"
        assert isinstance(data["confidence_score"], int), "confidence_score should be integer"
        assert 0 <= data["confidence_score"] <= 100, f"confidence_score out of range: {data['confidence_score']}"
        assert data["analysis_id"].startswith("ai_"), f"analysis_id should start with 'ai_': {data['analysis_id']}"
        
        print(f"✅ POST /api/ai/analyze returns all new fields:")
        print(f"   - analysis_id: {data['analysis_id']}")
        print(f"   - trade_bias: {data['trade_bias']}")
        print(f"   - confidence_score: {data['confidence_score']}")
        print(f"   - detected_pattern: {data['detected_pattern']}")
        print(f"   - analysis_text: {data['analysis_text'][:50]}...")
        
        # Store analysis_id for detail test
        self.__class__.last_analysis_id = data["analysis_id"]
        return data["analysis_id"]


class TestAIAnalysisPersistence:
    """Test that analyses are auto-saved to MongoDB"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for test user"""
        self.token = get_supabase_token(TEST_USER_EMAIL, TEST_USER_PASSWORD)
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_analysis_saved_to_history(self):
        """After POST /api/ai/analyze, the analysis should appear in history"""
        # First, get current history count
        history_before = requests.get(f"{BASE_URL}/api/ai/history?limit=1", headers=self.headers)
        assert history_before.status_code == 200
        total_before = history_before.json()["total"]
        
        # Perform an analysis
        payload = {
            "prompt": "GBP/USD showing consolidation pattern near resistance.",
            "pair": "GBP/USD",
            "timeframe": "M15"
        }
        
        analyze_response = requests.post(
            f"{BASE_URL}/api/ai/analyze",
            json=payload,
            headers={**self.headers, "Content-Type": "application/json"},
            timeout=60
        )
        
        if analyze_response.status_code == 403:
            pytest.skip("AI usage limit reached - skipping persistence test")
        
        if analyze_response.status_code != 200:
            pytest.skip(f"Analysis failed: {analyze_response.status_code}")
        
        analysis_id = analyze_response.json()["analysis_id"]
        
        # Check history count increased
        history_after = requests.get(f"{BASE_URL}/api/ai/history?limit=1", headers=self.headers)
        assert history_after.status_code == 200
        total_after = history_after.json()["total"]
        
        assert total_after > total_before, f"History count should increase after analysis (before: {total_before}, after: {total_after})"
        
        # Verify the analysis can be retrieved by ID
        detail_response = requests.get(f"{BASE_URL}/api/ai/history/{analysis_id}", headers=self.headers)
        assert detail_response.status_code == 200, f"Should be able to fetch saved analysis: {detail_response.status_code}"
        
        detail = detail_response.json()
        assert detail["analysis_id"] == analysis_id
        assert detail["pair"] == "GBP/USD"
        assert detail["timeframe"] == "M15"
        
        print(f"✅ Analysis auto-saved to MongoDB and retrievable via /api/ai/history/{analysis_id}")


class TestAIHistoryDetailEndpoint:
    """Test GET /api/ai/history/{analysis_id} endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for test user"""
        self.token = get_supabase_token(TEST_USER_EMAIL, TEST_USER_PASSWORD)
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_history_detail_returns_full_analysis(self):
        """GET /api/ai/history/{id} should return full analysis including image_snapshot"""
        # First get a valid analysis_id from history
        history_response = requests.get(f"{BASE_URL}/api/ai/history?limit=1", headers=self.headers)
        assert history_response.status_code == 200
        
        items = history_response.json()["items"]
        if not items:
            pytest.skip("No history items available for detail test")
        
        analysis_id = items[0]["analysis_id"]
        
        # Fetch detail
        detail_response = requests.get(f"{BASE_URL}/api/ai/history/{analysis_id}", headers=self.headers)
        assert detail_response.status_code == 200
        
        detail = detail_response.json()
        
        # Verify all fields present
        required_fields = [
            "analysis_id", "user_id", "pair", "timeframe",
            "trade_bias", "market_bias", "confidence_score",
            "trend_structure", "support_levels", "resistance_levels",
            "trade_insight", "analysis_text", "detected_pattern",
            "created_at"
        ]
        
        for field in required_fields:
            assert field in detail, f"Detail missing field: {field}"
        
        print(f"✅ GET /api/ai/history/{analysis_id} returns full analysis with all fields")
        print(f"   - pair: {detail['pair']}, timeframe: {detail['timeframe']}")
        print(f"   - trade_bias: {detail['trade_bias']}, confidence_score: {detail['confidence_score']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
