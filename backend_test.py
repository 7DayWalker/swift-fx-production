#!/usr/bin/env python3
"""
Backend Subscription Enforcement System Test Suite
Tests all subscription-related endpoints and access control
"""

import requests
import json
import sys
from typing import Dict, Optional

# Backend URL from environment
BACKEND_URL = "https://signallifecycle.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@swiftfx.com"
ADMIN_PASSWORD = "adminpassword"
FREE_USER_EMAIL = "freeuser_test@example.com"
FREE_USER_PASSWORD = "test123"

class TestRunner:
    def __init__(self):
        self.admin_token = None
        self.free_user_token = None
        self.test_user_id = None
        self.results = []
        
    def log(self, message: str, status: str = "INFO"):
        print(f"[{status}] {message}")
        self.results.append(f"[{status}] {message}")
    
    def test_login(self, email: str, password: str) -> Optional[str]:
        """Test login and return token"""
        try:
            response = requests.post(f"{BACKEND_URL}/auth/login", json={
                "email": email,
                "password": password
            })
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                user_info = data.get("user", {})
                self.log(f"✅ Login successful for {email} - Role: {user_info.get('role', 'unknown')}")
                return token
            else:
                self.log(f"❌ Login failed for {email}: {response.status_code} - {response.text}", "ERROR")
                return None
                
        except Exception as e:
            self.log(f"❌ Login error for {email}: {str(e)}", "ERROR")
            return None
    
    def make_request(self, method: str, endpoint: str, token: str = None, data: dict = None) -> requests.Response:
        """Make authenticated request"""
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        url = f"{BACKEND_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                return requests.get(url, headers=headers)
            elif method.upper() == "POST":
                return requests.post(url, headers=headers, json=data)
            elif method.upper() == "PUT":
                return requests.put(url, headers=headers, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")
        except Exception as e:
            self.log(f"❌ Request error: {str(e)}", "ERROR")
            raise
    
    def test_subscription_status(self):
        """Test GET /api/subscription/status endpoint"""
        self.log("\n=== Testing Subscription Status Endpoint ===")
        
        # Test with admin token
        self.log("Testing with admin user...")
        response = self.make_request("GET", "/subscription/status", self.admin_token)
        
        if response.status_code == 200:
            data = response.json()
            subscription = data.get("subscription")
            features = data.get("features", {})
            
            self.log(f"✅ Admin subscription status: {subscription}")
            self.log(f"✅ Admin fund_management access: {features.get('fund_management')}")
            
            # Verify admin has VIP features
            if subscription == "vip" and features.get("fund_management") == True:
                self.log("✅ Admin has correct VIP subscription and fund management access")
            else:
                self.log(f"❌ Admin subscription issue - Expected VIP with fund_management=True, got {subscription} with fund_management={features.get('fund_management')}", "ERROR")
        else:
            self.log(f"❌ Admin subscription status failed: {response.status_code} - {response.text}", "ERROR")
        
        # Test with free user token
        self.log("Testing with free user...")
        response = self.make_request("GET", "/subscription/status", self.free_user_token)
        
        if response.status_code == 200:
            data = response.json()
            subscription = data.get("subscription")
            features = data.get("features", {})
            
            self.log(f"✅ Free user subscription status: {subscription}")
            self.log(f"✅ Free user AI limit: {features.get('ai_limit')}")
            
            # Verify free user has correct limits
            if subscription == "free" and features.get("ai_limit") == 3:
                self.log("✅ Free user has correct subscription and AI limit")
            else:
                self.log(f"❌ Free user subscription issue - Expected free with ai_limit=3, got {subscription} with ai_limit={features.get('ai_limit')}", "ERROR")
        else:
            self.log(f"❌ Free user subscription status failed: {response.status_code} - {response.text}", "ERROR")
    
    def test_admin_user_management(self):
        """Test admin user management endpoints"""
        self.log("\n=== Testing Admin User Management ===")
        
        # First get list of users to find a user_id
        self.log("Getting user list...")
        response = self.make_request("GET", "/admin/users", self.admin_token)
        
        if response.status_code == 200:
            users = response.json()
            self.log(f"✅ Retrieved {len(users)} users")
            
            # Find the free user
            free_user = None
            for user in users:
                if user.get("email") == FREE_USER_EMAIL:
                    free_user = user
                    self.test_user_id = user.get("user_id")
                    break
            
            if not free_user:
                self.log("❌ Could not find free test user", "ERROR")
                return
            
            self.log(f"✅ Found free test user: {self.test_user_id}")
            
            # Test user details endpoint
            self.test_user_details()
            
            # Test subscription update
            self.test_subscription_update()
            
            # Test AI usage reset
            self.test_ai_usage_reset()
            
        else:
            self.log(f"❌ Failed to get user list: {response.status_code} - {response.text}", "ERROR")
    
    def test_user_details(self):
        """Test GET /api/admin/users/{user_id}/details"""
        self.log("Testing user details endpoint...")
        
        response = self.make_request("GET", f"/admin/users/{self.test_user_id}/details", self.admin_token)
        
        if response.status_code == 200:
            data = response.json()
            effective_subscription = data.get("effective_subscription")
            ai_limit = data.get("ai_limit")
            
            self.log(f"✅ User details retrieved - Effective subscription: {effective_subscription}, AI limit: {ai_limit}")
        else:
            self.log(f"❌ User details failed: {response.status_code} - {response.text}", "ERROR")
    
    def test_subscription_update(self):
        """Test PUT /api/admin/users/{user_id}/subscription"""
        self.log("Testing subscription update...")
        
        # Update user to premium for 30 days
        update_data = {
            "subscription": "premium",
            "expiry_days": 30
        }
        
        response = self.make_request("PUT", f"/admin/users/{self.test_user_id}/subscription", self.admin_token, update_data)
        
        if response.status_code == 200:
            data = response.json()
            self.log(f"✅ Subscription updated: {data.get('message')}")
            
            # Verify the update by checking user details
            details_response = self.make_request("GET", f"/admin/users/{self.test_user_id}/details", self.admin_token)
            if details_response.status_code == 200:
                details = details_response.json()
                if details.get("effective_subscription") == "premium":
                    self.log("✅ Subscription update verified - user is now premium")
                else:
                    self.log(f"❌ Subscription update verification failed - expected premium, got {details.get('effective_subscription')}", "ERROR")
        else:
            self.log(f"❌ Subscription update failed: {response.status_code} - {response.text}", "ERROR")
    
    def test_ai_usage_reset(self):
        """Test POST /api/admin/users/{user_id}/reset-ai-usage"""
        self.log("Testing AI usage reset...")
        
        response = self.make_request("POST", f"/admin/users/{self.test_user_id}/reset-ai-usage", self.admin_token)
        
        if response.status_code == 200:
            data = response.json()
            self.log(f"✅ AI usage reset: {data.get('message')}")
        else:
            self.log(f"❌ AI usage reset failed: {response.status_code} - {response.text}", "ERROR")
    
    def test_vip_feature_access(self):
        """Test VIP feature access endpoints"""
        self.log("\n=== Testing VIP Feature Access ===")
        
        # Test fund management access with admin (should have access)
        self.log("Testing fund management access with admin...")
        response = self.make_request("GET", "/features/fund-management/access", self.admin_token)
        
        if response.status_code == 200:
            data = response.json()
            has_access = data.get("has_access")
            if has_access:
                self.log("✅ Admin has fund management access")
            else:
                self.log(f"❌ Admin should have fund management access but doesn't: {data}", "ERROR")
        else:
            self.log(f"❌ Fund management access check failed for admin: {response.status_code} - {response.text}", "ERROR")
        
        # Test fund management access with free user (should not have access)
        self.log("Testing fund management access with free user...")
        response = self.make_request("GET", "/features/fund-management/access", self.free_user_token)
        
        if response.status_code == 200:
            data = response.json()
            has_access = data.get("has_access")
            if not has_access:
                self.log("✅ Free user correctly denied fund management access")
            else:
                self.log(f"❌ Free user should not have fund management access: {data}", "ERROR")
        else:
            self.log(f"❌ Fund management access check failed for free user: {response.status_code} - {response.text}", "ERROR")
        
        # Test academy access with admin
        self.log("Testing academy access with admin...")
        response = self.make_request("GET", "/features/academy/access", self.admin_token)
        
        if response.status_code == 200:
            data = response.json()
            has_access = data.get("has_access")
            if has_access:
                self.log("✅ Admin has academy access")
            else:
                self.log(f"❌ Admin should have academy access but doesn't: {data}", "ERROR")
        else:
            self.log(f"❌ Academy access check failed for admin: {response.status_code} - {response.text}", "ERROR")
        
        # Test academy access with free user
        self.log("Testing academy access with free user...")
        response = self.make_request("GET", "/features/academy/access", self.free_user_token)
        
        if response.status_code == 200:
            data = response.json()
            has_access = data.get("has_access")
            if not has_access:
                self.log("✅ Free user correctly denied academy access")
            else:
                self.log(f"❌ Free user should not have academy access: {data}", "ERROR")
        else:
            self.log(f"❌ Academy access check failed for free user: {response.status_code} - {response.text}", "ERROR")
    
    def test_ai_usage_endpoint(self):
        """Test GET /api/ai/usage endpoint"""
        self.log("\n=== Testing AI Usage Endpoint ===")
        
        # Test with free user
        self.log("Testing AI usage with free user...")
        response = self.make_request("GET", "/ai/usage", self.free_user_token)
        
        if response.status_code == 200:
            data = response.json()
            weekly_limit = data.get("weekly_limit")
            has_access = data.get("has_access")
            
            self.log(f"✅ Free user AI usage - Limit: {weekly_limit}, Has access: {has_access}")
            
            if weekly_limit == 3 and has_access == True:
                self.log("✅ Free user has correct AI usage limits")
            else:
                self.log(f"❌ Free user AI usage incorrect - Expected limit=3, has_access=True, got limit={weekly_limit}, has_access={has_access}", "ERROR")
        else:
            self.log(f"❌ AI usage check failed for free user: {response.status_code} - {response.text}", "ERROR")
        
        # Test with admin/VIP user
        self.log("Testing AI usage with admin...")
        response = self.make_request("GET", "/ai/usage", self.admin_token)
        
        if response.status_code == 200:
            data = response.json()
            weekly_limit = data.get("weekly_limit")
            
            self.log(f"✅ Admin AI usage - Limit: {weekly_limit}")
            
            if weekly_limit == "unlimited":
                self.log("✅ Admin has unlimited AI usage")
            else:
                self.log(f"❌ Admin should have unlimited AI usage, got: {weekly_limit}", "ERROR")
        else:
            self.log(f"❌ AI usage check failed for admin: {response.status_code} - {response.text}", "ERROR")
    
    def test_signals_filtering(self):
        """Test GET /api/signals with subscription filtering"""
        self.log("\n=== Testing Signals Filtering ===")
        
        # Test signals access without authentication
        self.log("Testing signals without authentication...")
        response = self.make_request("GET", "/signals")
        
        if response.status_code == 200:
            signals = response.json()
            self.log(f"✅ Retrieved {len(signals)} signals without auth")
            
            # Check if locked signals are present
            locked_signals = [s for s in signals if s.get("locked") == True]
            self.log(f"✅ Found {len(locked_signals)} locked signals for unauthenticated users")
        else:
            self.log(f"❌ Signals retrieval failed without auth: {response.status_code} - {response.text}", "ERROR")
        
        # Test signals access with free user
        self.log("Testing signals with free user...")
        response = self.make_request("GET", "/signals", self.free_user_token)
        
        if response.status_code == 200:
            signals = response.json()
            self.log(f"✅ Retrieved {len(signals)} signals for free user")
            
            # Check signal access levels
            free_signals = [s for s in signals if s.get("visibility") == "free" and not s.get("locked")]
            locked_signals = [s for s in signals if s.get("locked") == True]
            
            self.log(f"✅ Free user can access {len(free_signals)} free signals, {len(locked_signals)} are locked")
        else:
            self.log(f"❌ Signals retrieval failed for free user: {response.status_code} - {response.text}", "ERROR")
        
        # Test signals access with admin
        self.log("Testing signals with admin...")
        response = self.make_request("GET", "/signals", self.admin_token)
        
        if response.status_code == 200:
            signals = response.json()
            self.log(f"✅ Retrieved {len(signals)} signals for admin")
            
            # Admin should see all signals without locks
            locked_signals = [s for s in signals if s.get("locked") == True]
            self.log(f"✅ Admin sees {len(locked_signals)} locked signals (should be 0 or very few)")
        else:
            self.log(f"❌ Signals retrieval failed for admin: {response.status_code} - {response.text}", "ERROR")
    
    def run_all_tests(self):
        """Run all subscription enforcement tests"""
        self.log("🚀 Starting Backend Subscription Enforcement System Tests")
        self.log(f"Backend URL: {BACKEND_URL}")
        
        # Step 1: Login with both accounts
        self.log("\n=== Authentication Tests ===")
        self.admin_token = self.test_login(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.free_user_token = self.test_login(FREE_USER_EMAIL, FREE_USER_PASSWORD)
        
        if not self.admin_token or not self.free_user_token:
            self.log("❌ Authentication failed - cannot continue tests", "ERROR")
            return False
        
        # Step 2: Test all subscription endpoints
        try:
            self.test_subscription_status()
            self.test_admin_user_management()
            self.test_vip_feature_access()
            self.test_ai_usage_endpoint()
            self.test_signals_filtering()
            
            self.log("\n🎉 All subscription enforcement tests completed!")
            return True
            
        except Exception as e:
            self.log(f"❌ Test suite failed with error: {str(e)}", "ERROR")
            return False

def main():
    """Main test runner"""
    runner = TestRunner()
    success = runner.run_all_tests()
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    error_count = len([r for r in runner.results if "[ERROR]" in r])
    success_count = len([r for r in runner.results if "✅" in r])
    
    print(f"Total Tests: {len(runner.results)}")
    print(f"Successful: {success_count}")
    print(f"Errors: {error_count}")
    
    if error_count > 0:
        print("\nERRORS FOUND:")
        for result in runner.results:
            if "[ERROR]" in result:
                print(result)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())