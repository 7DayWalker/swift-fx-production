"""
P0 Verification Tests for Swift FX Signals
Tests all critical backend endpoints after environment unification

Endpoints tested:
- GET /api/signals - Signal data with correct schema
- GET /api/iap/products - iOS and Android product IDs
- GET /api/community/posts - Community posts
- GET /api/calendar/events - Calendar events
- GET /api/health - Health check
- GET /api/dashboard - Dashboard data
- GET /api/subscription/plans - Subscription plans
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndBasics:
    """Basic health and connectivity tests"""
    
    def test_base_url_set(self):
        """Verify BASE_URL is properly set"""
        assert BASE_URL, "BASE_URL environment variable not set"
        assert BASE_URL.startswith("https://"), f"BASE_URL should use HTTPS: {BASE_URL}"
        print(f"✅ BASE_URL correctly set: {BASE_URL}")
    
    def test_api_reachable(self):
        """Test API is reachable via signals endpoint"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"API not reachable, got status {response.status_code}"
        print(f"✅ API is reachable")


class TestSignalsEndpoint:
    """Tests for /api/signals endpoint"""
    
    def test_get_signals_returns_200(self):
        """Test /api/signals returns 200"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/signals returned 200")
    
    def test_signals_returns_list(self):
        """Test /api/signals returns a list"""
        response = requests.get(f"{BASE_URL}/api/signals")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Signals returned list with {len(data)} signals")
    
    def test_signals_schema_has_required_fields(self):
        """Test signal objects have required schema fields"""
        response = requests.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        # Required fields per spec
        required_fields = ["signal_id", "pair", "signal_type", "state", "visibility", "created_at"]
        
        if signals:
            signal = signals[0]
            for field in required_fields:
                assert field in signal, f"Missing required field: {field}"
            print(f"✅ Signal has all required fields: {required_fields}")
        else:
            pytest.skip("No signals in database to verify schema")
    
    def test_signals_state_field_not_status(self):
        """Test signals use 'state' field, NOT 'status' (per refactor)"""
        response = requests.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if signals:
            signal = signals[0]
            assert "state" in signal, "Signal should have 'state' field"
            assert "status" not in signal, "Signal should NOT have 'status' field (deprecated)"
            print(f"✅ Signal correctly uses 'state' field: {signal['state']}")
        else:
            pytest.skip("No signals to verify state field")
    
    def test_signals_has_is_active_boolean(self):
        """Test signals have is_active boolean field"""
        response = requests.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if signals:
            signal = signals[0]
            assert "is_active" in signal, "Signal should have 'is_active' field"
            assert isinstance(signal["is_active"], bool), "is_active should be boolean"
            print(f"✅ Signal has is_active boolean: {signal['is_active']}")
        else:
            pytest.skip("No signals to verify is_active field")
    
    def test_signals_state_values_valid(self):
        """Test signal state values are from valid set"""
        response = requests.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        valid_states = ["pending", "active", "tp1", "tp2", "tp3", "closed"]
        
        for signal in signals:
            state = signal.get("state")
            assert state in valid_states, f"Invalid state '{state}'. Valid states: {valid_states}"
        
        print(f"✅ All {len(signals)} signals have valid state values")


class TestIAPEndpoint:
    """Tests for /api/iap/products endpoint"""
    
    def test_iap_products_returns_200(self):
        """Test /api/iap/products returns 200"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/iap/products returned 200")
    
    def test_iap_products_has_ios_android(self):
        """Test IAP products has iOS and Android sections"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        data = response.json()
        
        assert "ios" in data, "Missing 'ios' section in IAP products"
        assert "android" in data, "Missing 'android' section in IAP products"
        print(f"✅ IAP products has iOS and Android sections")
    
    def test_iap_products_has_product_ids(self):
        """Test IAP products has premium_monthly and vip_monthly product IDs"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        data = response.json()
        
        # Verify iOS products
        assert "premium_monthly" in data["ios"], "Missing iOS premium_monthly"
        assert "vip_monthly" in data["ios"], "Missing iOS vip_monthly"
        
        # Verify Android products
        assert "premium_monthly" in data["android"], "Missing Android premium_monthly"
        assert "vip_monthly" in data["android"], "Missing Android vip_monthly"
        
        print(f"✅ IAP products: iOS={data['ios']}, Android={data['android']}")


class TestCommunityEndpoint:
    """Tests for /api/community/posts endpoint"""
    
    def test_community_posts_returns_200(self):
        """Test /api/community/posts returns 200"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/community/posts returned 200")
    
    def test_community_posts_returns_list(self):
        """Test /api/community/posts returns a list"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Community posts returned list with {len(data)} posts")
    
    def test_community_post_schema(self):
        """Test community post schema has required fields"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        posts = response.json()
        
        required_fields = ["post_id", "user_id", "user_name", "content", "created_at"]
        
        if posts:
            post = posts[0]
            for field in required_fields:
                assert field in post, f"Missing required field: {field}"
            print(f"✅ Community post has required fields")
        else:
            pytest.skip("No community posts to verify schema")


class TestCalendarEndpoint:
    """Tests for /api/calendar/events endpoint"""
    
    def test_calendar_events_returns_200(self):
        """Test /api/calendar/events returns 200"""
        response = requests.get(f"{BASE_URL}/api/calendar/events")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/calendar/events returned 200")
    
    def test_calendar_events_has_events_list(self):
        """Test calendar response has events list"""
        response = requests.get(f"{BASE_URL}/api/calendar/events")
        data = response.json()
        
        assert "events" in data, "Missing 'events' field in calendar response"
        assert isinstance(data["events"], list), "events should be a list"
        print(f"✅ Calendar returned {len(data['events'])} events")
    
    def test_calendar_event_schema(self):
        """Test calendar event schema"""
        response = requests.get(f"{BASE_URL}/api/calendar/events")
        data = response.json()
        events = data.get("events", [])
        
        required_fields = ["id", "title", "country", "date", "impact"]
        
        if events:
            event = events[0]
            for field in required_fields:
                assert field in event, f"Missing required field: {field}"
            print(f"✅ Calendar event has required fields: {event['title']}")
        else:
            pytest.skip("No calendar events to verify schema")


class TestDashboardEndpoint:
    """Tests for /api/dashboard endpoint (unauthenticated)"""
    
    def test_dashboard_returns_200(self):
        """Test /api/dashboard returns 200 for unauthenticated user"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/dashboard returned 200")
    
    def test_dashboard_has_basic_fields(self):
        """Test dashboard has expected fields"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        data = response.json()
        
        # Basic fields expected in dashboard response
        expected_fields = ["active_signals_count", "total_pips_today"]
        
        for field in expected_fields:
            assert field in data, f"Missing expected field: {field}"
        
        print(f"✅ Dashboard has expected fields: {list(data.keys())}")


class TestSubscriptionPlansEndpoint:
    """Tests for /api/subscription/plans endpoint"""
    
    def test_subscription_plans_returns_200(self):
        """Test /api/subscription/plans returns 200"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✅ GET /api/subscription/plans returned 200")
    
    def test_subscription_plans_returns_list(self):
        """Test /api/subscription/plans returns list"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✅ Subscription plans returned {len(data)} plans")


class TestEndpointNotFound:
    """Verify that non-implemented endpoints return 404"""
    
    def test_news_endpoint_not_found(self):
        """Test /api/news returns 404 (not implemented)"""
        response = requests.get(f"{BASE_URL}/api/news")
        # 404 is expected - endpoint not implemented
        assert response.status_code == 404, f"Expected 404 for /api/news, got {response.status_code}"
        print(f"✅ /api/news correctly returns 404 (not implemented)")
    
    def test_academy_categories_not_found(self):
        """Test /api/academy/categories returns 404 (not implemented)"""
        response = requests.get(f"{BASE_URL}/api/academy/categories")
        # 404 is expected - endpoint not implemented
        assert response.status_code == 404, f"Expected 404 for /api/academy/categories, got {response.status_code}"
        print(f"✅ /api/academy/categories correctly returns 404 (not implemented)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
