"""
Phase 3 IAP System Tests - Swift FX Signals
Tests the new 6-SKU product system and backend-authoritative subscription status.

Features tested:
- /api/iap/products returns all 6 official SKUs
- /api/subscription/status returns entitlement from MongoDB iap_transactions
- /api/subscription/status for admin user returns is_admin=true but entitlement based on IAP only
- /api/subscription/plans returns plan data with pricing for all 3 billing cycles
- /api/signals regression test
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com').rstrip('/')
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Test credentials
TEST_USER_EMAIL = "paradoxella@gmail.com"
TEST_USER_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")
ADMIN_USER_EMAIL = "ellapauledache@gmail.com"
ADMIN_USER_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")

# Official 6 SKUs (locked - match App Store Connect / Google Play Console)
EXPECTED_SKUS = [
    'com.swiftfx.signals.premium.weekly',
    'com.swiftfx.signals.premium.monthly',
    'com.swiftfx.signals.premium.yearly',
    'com.swiftfx.signals.vip.weekly.v2',
    'com.swiftfx.signals.vip.monthly.v2',
    'com.swiftfx.signals.vip.yearly.v2',
]


class TestIAPProducts:
    """Tests for /api/iap/products endpoint - returns official 6 SKUs"""
    
    def test_iap_products_returns_200(self):
        """IAP products endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ /api/iap/products returns 200")
    
    def test_iap_products_has_products_list(self):
        """Response should contain 'products' key with list"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        data = response.json()
        assert "products" in data, "Response should have 'products' key"
        assert isinstance(data["products"], list), "'products' should be a list"
        print(f"✓ 'products' is a list with {len(data['products'])} items")
    
    def test_iap_products_contains_all_6_skus(self):
        """Products list should contain all 6 official SKUs"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        data = response.json()
        products = data.get("products", [])
        
        for sku in EXPECTED_SKUS:
            assert sku in products, f"Missing SKU: {sku}"
            print(f"  ✓ {sku}")
        
        assert len(products) == 6, f"Expected exactly 6 SKUs, got {len(products)}"
        print("✓ All 6 official SKUs present")
    
    def test_iap_products_by_tier_structure(self):
        """Response should have 'by_tier' with premium and vip"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        data = response.json()
        
        assert "by_tier" in data, "Response should have 'by_tier' key"
        by_tier = data["by_tier"]
        
        assert "premium" in by_tier, "by_tier should have 'premium'"
        assert "vip" in by_tier, "by_tier should have 'vip'"
        
        # Check premium tier has all 3 cycles
        for cycle in ["weekly", "monthly", "yearly"]:
            assert cycle in by_tier["premium"], f"premium missing '{cycle}'"
            assert cycle in by_tier["vip"], f"vip missing '{cycle}'"
        
        print("✓ by_tier structure correct with premium and vip tiers")
    
    def test_iap_products_sku_format(self):
        """All SKUs should follow com.swiftfx.signals.{tier}.{cycle} format"""
        response = requests.get(f"{BASE_URL}/api/iap/products")
        data = response.json()
        products = data.get("products", [])
        
        for sku in products:
            assert sku.startswith("com.swiftfx.signals."), f"SKU format wrong: {sku}"
            parts = sku.split(".")
            assert len(parts) == 5, f"SKU should have 5 parts: {sku}"
            tier = parts[3]
            cycle = parts[4]
            assert tier in ["premium", "vip"], f"Invalid tier in SKU: {tier}"
            assert cycle in ["weekly", "monthly", "yearly"], f"Invalid cycle in SKU: {cycle}"
        
        print("✓ All SKUs follow correct format")


class TestSubscriptionPlans:
    """Tests for /api/subscription/plans endpoint - returns plan data"""
    
    def test_subscription_plans_returns_200(self):
        """Subscription plans endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ /api/subscription/plans returns 200")
    
    def test_subscription_plans_has_plans_list(self):
        """Response should contain 'plans' key with list"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        assert "plans" in data, "Response should have 'plans' key"
        assert isinstance(data["plans"], list), "'plans' should be a list"
        assert len(data["plans"]) >= 2, "Should have at least 2 plans (premium, vip)"
        print(f"✓ 'plans' is a list with {len(data['plans'])} plans")
    
    def test_subscription_plans_premium_plan(self):
        """Premium plan should have correct structure"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plans = data.get("plans", [])
        
        premium = next((p for p in plans if p.get("id") == "premium"), None)
        assert premium is not None, "Premium plan should exist"
        
        assert premium.get("name") == "Premium", "Premium plan name should be 'Premium'"
        assert "features" in premium, "Premium plan should have 'features'"
        assert isinstance(premium["features"], list), "'features' should be a list"
        
        pricing = premium.get("pricing", {})
        assert "weekly" in pricing, "Premium should have weekly pricing"
        assert "monthly" in pricing, "Premium should have monthly pricing"
        assert "yearly" in pricing, "Premium should have yearly pricing"
        
        print(f"✓ Premium plan: ${pricing.get('weekly')}/wk, ${pricing.get('monthly')}/mo, ${pricing.get('yearly')}/yr")
    
    def test_subscription_plans_vip_plan(self):
        """VIP plan should have correct structure"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        data = response.json()
        plans = data.get("plans", [])
        
        vip = next((p for p in plans if p.get("id") == "vip"), None)
        assert vip is not None, "VIP plan should exist"
        
        assert vip.get("name") == "VIP", "VIP plan name should be 'VIP'"
        assert "features" in vip, "VIP plan should have 'features'"
        assert isinstance(vip["features"], list), "'features' should be a list"
        
        pricing = vip.get("pricing", {})
        assert "weekly" in pricing, "VIP should have weekly pricing"
        assert "monthly" in pricing, "VIP should have monthly pricing"
        assert "yearly" in pricing, "VIP should have yearly pricing"
        
        print(f"✓ VIP plan: ${pricing.get('weekly')}/wk, ${pricing.get('monthly')}/mo, ${pricing.get('yearly')}/yr")


class TestSubscriptionStatus:
    """Tests for /api/subscription/status endpoint - backend-authoritative"""
    
    @pytest.fixture
    def test_user_token(self):
        """Get auth token for test user"""
        response = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Failed to get test user token: {response.status_code}")
        return response.json().get("access_token")
    
    @pytest.fixture
    def admin_user_token(self):
        """Get auth token for admin user"""
        response = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            json={"email": ADMIN_USER_EMAIL, "password": ADMIN_USER_PASSWORD}
        )
        if response.status_code != 200:
            pytest.skip(f"Failed to get admin user token: {response.status_code}")
        return response.json().get("access_token")
    
    def test_subscription_status_requires_auth(self):
        """Subscription status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/subscription/status")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ /api/subscription/status requires authentication")
    
    def test_subscription_status_returns_200_with_auth(self, test_user_token):
        """Subscription status returns 200 with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ /api/subscription/status returns 200 with auth")
    
    def test_subscription_status_has_entitlement(self, test_user_token):
        """Response should have 'entitlement' field (from IAP transactions)"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        data = response.json()
        
        assert "entitlement" in data, "Response should have 'entitlement' key"
        entitlement = data["entitlement"]
        assert entitlement in ["free", "premium", "vip"], f"Invalid entitlement: {entitlement}"
        print(f"✓ User entitlement: {entitlement}")
    
    def test_subscription_status_has_features(self, test_user_token):
        """Response should have 'features' object with proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        data = response.json()
        
        assert "features" in data, "Response should have 'features' key"
        features = data["features"]
        
        required_keys = ["signals_access", "ai_analyzer", "ai_limit", "ai_used", 
                         "ai_remaining", "fund_management", "academy", "image_uploads"]
        for key in required_keys:
            assert key in features, f"features missing '{key}'"
        
        print("✓ All required feature keys present")
    
    def test_subscription_status_admin_has_is_admin_true(self, admin_user_token):
        """Admin user should have is_admin=true"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {admin_user_token}"}
        )
        data = response.json()
        
        assert data.get("is_admin") == True, "Admin user should have is_admin=true"
        print("✓ Admin user has is_admin=true")
    
    def test_subscription_status_admin_entitlement_from_iap_only(self, admin_user_token):
        """Admin entitlement should be derived from IAP transactions only"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {admin_user_token}"}
        )
        data = response.json()
        
        # Admin entitlement should be 'free' if no IAP transactions,
        # not auto-elevated to 'vip' just because they are admin
        entitlement = data.get("entitlement")
        assert entitlement in ["free", "premium", "vip"], f"Invalid entitlement: {entitlement}"
        
        # If admin has no IAP transactions, entitlement should be 'free'
        if not data.get("subscription_active"):
            assert entitlement == "free", "Admin without IAP should have 'free' entitlement"
            print("✓ Admin without IAP transactions has 'free' entitlement (correct)")
        else:
            print(f"✓ Admin has active IAP subscription: {entitlement}")
    
    def test_subscription_status_admin_has_fund_management_access(self, admin_user_token):
        """Admin should have fund_management access regardless of entitlement"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {admin_user_token}"}
        )
        data = response.json()
        features = data.get("features", {})
        
        assert features.get("fund_management") == True, "Admin should have fund_management access"
        assert features.get("academy") == True, "Admin should have academy access"
        print("✓ Admin has fund_management and academy access")
    
    def test_subscription_status_regular_user_is_admin_false(self, test_user_token):
        """Regular user should have is_admin=false"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        data = response.json()
        
        assert data.get("is_admin") == False, "Regular user should have is_admin=false"
        print("✓ Regular user has is_admin=false")
    
    def test_subscription_status_platform_and_product_id(self, test_user_token):
        """Response should include platform and product_id if subscribed"""
        response = requests.get(
            f"{BASE_URL}/api/subscription/status",
            headers={"Authorization": f"Bearer {test_user_token}"}
        )
        data = response.json()
        
        # These fields should exist even if null
        assert "subscription_platform" in data, "Should have 'subscription_platform'"
        assert "subscription_product_id" in data, "Should have 'subscription_product_id'"
        assert "subscription_expiry" in data, "Should have 'subscription_expiry'"
        assert "auto_renew" in data, "Should have 'auto_renew'"
        
        if data.get("subscription_active"):
            assert data.get("subscription_platform") in ["ios", "android", None], "Invalid platform"
            print(f"✓ Active subscription: {data.get('subscription_platform')}, product: {data.get('subscription_product_id')}")
        else:
            print("✓ Subscription fields present (no active subscription)")


class TestSignalsRegression:
    """Regression tests for /api/signals - ensure it still works"""
    
    def test_signals_returns_200(self):
        """Signals endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ /api/signals returns 200")
    
    def test_signals_returns_list(self):
        """Signals should return a list"""
        response = requests.get(f"{BASE_URL}/api/signals")
        data = response.json()
        assert isinstance(data, list), "Signals should return a list"
        print(f"✓ Signals returns list with {len(data)} items")
    
    def test_signals_have_required_fields(self):
        """Each signal should have required fields"""
        response = requests.get(f"{BASE_URL}/api/signals")
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No signals to test")
        
        signal = data[0]
        required_fields = ["signal_id", "pair", "signal_type", "visibility"]
        for field in required_fields:
            assert field in signal, f"Signal missing '{field}'"
        
        print("✓ Signals have required fields")
    
    def test_signals_have_state_field(self):
        """Signals should use 'state' field (not just 'status')"""
        response = requests.get(f"{BASE_URL}/api/signals")
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No signals to test")
        
        signal = data[0]
        # Signal should have either 'state' or 'locked' (for locked signals)
        if not signal.get("locked"):
            assert "state" in signal, "Signal should have 'state' field"
            valid_states = ["pending", "active", "tp1", "tp2", "tp3", "closed"]
            assert signal["state"] in valid_states, f"Invalid state: {signal['state']}"
        
        print("✓ Signals use 'state' field correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
