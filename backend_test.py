#!/usr/bin/env python3
"""
Backend Testing Suite for User Settings System
Tests all User Settings System endpoints with proper authentication
"""

import requests
import json
import sys
from typing import Dict, Optional

# Backend URL from frontend .env
BASE_URL = "https://friendboost.preview.emergentagent.com/api"

# Test credentials
SUPER_ADMIN_EMAIL = "ellapauledache@gmail.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin2025!"
VIP_USER_EMAIL = "fundtest@test.com"
VIP_USER_PASSWORD = "password"

class TestRunner:
    def __init__(self):
        self.super_admin_token = None
        self.vip_user_token = None
        self.vip_user_id = None
        self.test_user_id = None  # For deactivate/restore tests
        self.passed_tests = 0
        self.failed_tests = 0
        
    def log(self, message: str, level: str = "INFO"):
        """Log test messages"""
        print(f"[{level}] {message}")
        
    def login_user(self, email: str, password: str) -> Optional[Dict]:
        """Login and return token + user info"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": email,
                "password": password
            })
            
            if response.status_code == 200:
                data = response.json()
                self.log(f"✅ Login successful for {email}")
                return {
                    "token": data["token"],
                    "user": data["user"]
                }
            else:
                self.log(f"❌ Login failed for {email}: {response.status_code} - {response.text}", "ERROR")
                return None
        except Exception as e:
            self.log(f"❌ Login error for {email}: {str(e)}", "ERROR")
            return None
    
    def make_request(self, method: str, endpoint: str, token: str = None, data: dict = None, params: dict = None) -> requests.Response:
        """Make authenticated API request"""
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        url = f"{BASE_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                return requests.get(url, headers=headers, params=params)
            elif method.upper() == "POST":
                return requests.post(url, headers=headers, json=data, params=params)
            elif method.upper() == "PUT":
                return requests.put(url, headers=headers, json=data, params=params)
            elif method.upper() == "DELETE":
                return requests.delete(url, headers=headers, params=params)
        except Exception as e:
            self.log(f"❌ Request error: {str(e)}", "ERROR")
            raise
    
    def assert_response(self, response: requests.Response, expected_status: int, test_name: str) -> bool:
        """Assert response status and log result"""
        if response.status_code == expected_status:
            self.log(f"✅ {test_name}: PASSED (Status: {response.status_code})")
            self.passed_tests += 1
            return True
        else:
            self.log(f"❌ {test_name}: FAILED (Expected: {expected_status}, Got: {response.status_code})", "ERROR")
            self.log(f"   Response: {response.text}", "ERROR")
            self.failed_tests += 1
            return False
    
    def test_get_user_profile(self):
        """Test 1: Get User Profile (GET /api/settings/profile)"""
        self.log("\n=== Test 1: Get User Profile ===")
        
        response = self.make_request("GET", "/settings/profile", self.vip_user_token)
        
        if self.assert_response(response, 200, "Get User Profile"):
            data = response.json()
            required_fields = ["user_id", "name", "email", "phone", "role", "subscription", "account_status", "created_at", "last_login"]
            
            missing_fields = []
            for field in required_fields:
                if field not in data:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log(f"❌ Missing required fields: {missing_fields}", "ERROR")
                self.failed_tests += 1
                self.passed_tests -= 1
            else:
                self.log(f"✅ All required fields present: {list(data.keys())}")
                self.log(f"   User: {data.get('name')} ({data.get('email')})")
                self.log(f"   Role: {data.get('role')}, Subscription: {data.get('subscription')}")
    
    def test_update_profile(self):
        """Test 2: Update Profile (PUT /api/settings/profile)"""
        self.log("\n=== Test 2: Update Profile ===")
        
        # Update name
        new_name = "Fund Test Updated"
        response = self.make_request("PUT", "/settings/profile", self.vip_user_token, {
            "name": new_name
        })
        
        if self.assert_response(response, 200, "Update Profile"):
            # Verify the update by getting profile again
            verify_response = self.make_request("GET", "/settings/profile", self.vip_user_token)
            if verify_response.status_code == 200:
                data = verify_response.json()
                if data.get("name") == new_name:
                    self.log(f"✅ Profile update verified: name changed to '{new_name}'")
                else:
                    self.log(f"❌ Profile update failed: name is '{data.get('name')}', expected '{new_name}'", "ERROR")
                    self.failed_tests += 1
                    self.passed_tests -= 1
    
    def test_change_password(self):
        """Test 3: Change Password (PUT /api/settings/password)"""
        self.log("\n=== Test 3: Change Password ===")
        
        # Test with wrong current password
        response = self.make_request("PUT", "/settings/password", self.vip_user_token, {
            "current_password": "wrongpassword",
            "new_password": "newpassword123"
        })
        
        if self.assert_response(response, 400, "Change Password - Wrong Current Password"):
            data = response.json()
            if "Current password is incorrect" in data.get("detail", ""):
                self.log("✅ Correct error message for wrong password")
            else:
                self.log(f"❌ Unexpected error message: {data.get('detail')}", "ERROR")
        
        # Test with correct current password
        response = self.make_request("PUT", "/settings/password", self.vip_user_token, {
            "current_password": VIP_USER_PASSWORD,
            "new_password": "newpassword123"
        })
        
        if self.assert_response(response, 200, "Change Password - Correct Current Password"):
            self.log("✅ Password change successful")
            
            # Change it back for other tests
            self.make_request("PUT", "/settings/password", self.vip_user_token, {
                "current_password": "newpassword123",
                "new_password": VIP_USER_PASSWORD
            })
    
    def test_get_notification_preferences(self):
        """Test 4: Get Notification Preferences (GET /api/settings/notifications)"""
        self.log("\n=== Test 4: Get Notification Preferences ===")
        
        response = self.make_request("GET", "/settings/notifications", self.vip_user_token)
        
        if self.assert_response(response, 200, "Get Notification Preferences"):
            data = response.json()
            
            # Check if preferences object exists
            if "preferences" not in data:
                self.log("❌ Missing 'preferences' object in response", "ERROR")
                self.failed_tests += 1
                self.passed_tests -= 1
                return
            
            preferences = data["preferences"]
            required_fields = ["push_enabled", "email_enabled", "signals", "fund_updates", "referral_rewards", "support_replies"]
            
            missing_fields = []
            for field in required_fields:
                if field not in preferences:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log(f"❌ Missing notification preference fields: {missing_fields}", "ERROR")
                self.failed_tests += 1
                self.passed_tests -= 1
            else:
                self.log(f"✅ All notification preference fields present")
                self.log(f"   Preferences: {preferences}")
    
    def test_update_notification_preferences(self):
        """Test 5: Update Notification Preferences (PUT /api/settings/notifications)"""
        self.log("\n=== Test 5: Update Notification Preferences ===")
        
        # Update signals to false
        response = self.make_request("PUT", "/settings/notifications", self.vip_user_token, {
            "signals": False
        })
        
        if self.assert_response(response, 200, "Update Notification Preferences"):
            # Verify the update
            verify_response = self.make_request("GET", "/settings/notifications", self.vip_user_token)
            if verify_response.status_code == 200:
                data = verify_response.json()
                if data.get("signals") == False:
                    self.log("✅ Notification preferences update verified: signals set to false")
                else:
                    self.log(f"❌ Notification update failed: signals is {data.get('signals')}, expected False", "ERROR")
                    self.failed_tests += 1
                    self.passed_tests -= 1
    
    def test_get_legal_documents(self):
        """Test 6: Get Legal Documents (GET /api/settings/legal/{doc_type})"""
        self.log("\n=== Test 6: Get Legal Documents ===")
        
        # Test privacy_policy
        response = self.make_request("GET", "/settings/legal/privacy_policy", self.vip_user_token)
        if self.assert_response(response, 200, "Get Privacy Policy"):
            data = response.json()
            required_fields = ["title", "last_updated", "content"]
            if all(field in data for field in required_fields):
                self.log("✅ Privacy policy has all required fields")
            else:
                self.log(f"❌ Privacy policy missing fields: {[f for f in required_fields if f not in data]}", "ERROR")
        
        # Test terms_of_service
        response = self.make_request("GET", "/settings/legal/terms_of_service", self.vip_user_token)
        if self.assert_response(response, 200, "Get Terms of Service"):
            data = response.json()
            if "content" in data:
                self.log("✅ Terms of service has content")
            else:
                self.log("❌ Terms of service missing content", "ERROR")
        
        # Test risk_disclaimer
        response = self.make_request("GET", "/settings/legal/risk_disclaimer", self.vip_user_token)
        if self.assert_response(response, 200, "Get Risk Disclaimer"):
            data = response.json()
            if "content" in data and "trading" in data["content"].lower():
                self.log("✅ Risk disclaimer has trading warnings")
            else:
                self.log("❌ Risk disclaimer missing trading warnings", "ERROR")
        
        # Test invalid doc type
        response = self.make_request("GET", "/settings/legal/invalid_doc", self.vip_user_token)
        self.assert_response(response, 404, "Get Invalid Document Type")
    
    def test_get_sessions_info(self):
        """Test 7: Get Sessions Info (GET /api/settings/sessions)"""
        self.log("\n=== Test 7: Get Sessions Info ===")
        
        response = self.make_request("GET", "/settings/sessions", self.vip_user_token)
        
        if self.assert_response(response, 200, "Get Sessions Info"):
            data = response.json()
            if "current_session" in data and "last_login" in data["current_session"]:
                self.log("✅ Sessions info contains current_session with last_login")
            else:
                self.log("❌ Sessions info missing required fields", "ERROR")
                self.failed_tests += 1
                self.passed_tests -= 1
    
    def test_admin_get_user_settings(self):
        """Test 8: Admin Get User Settings (GET /api/admin/users/{user_id}/settings)"""
        self.log("\n=== Test 8: Admin Get User Settings ===")
        
        response = self.make_request("GET", f"/admin/users/{self.vip_user_id}/settings", self.super_admin_token)
        
        if self.assert_response(response, 200, "Admin Get User Settings"):
            data = response.json()
            if "user" in data and "password_hash" not in str(data):
                self.log("✅ Admin user settings returned without password_hash")
            else:
                self.log("❌ Admin user settings contains sensitive data or missing user info", "ERROR")
                self.failed_tests += 1
                self.passed_tests -= 1
    
    def test_admin_deactivate_user(self):
        """Test 9: Admin Deactivate User (POST /api/admin/users/{user_id}/deactivate?reason=test)"""
        self.log("\n=== Test 9: Admin Deactivate User ===")
        
        # First create a test user to deactivate
        test_user_response = requests.post(f"{BASE_URL}/auth/register", json={
            "name": "Test User for Deactivation",
            "email": f"testuser_{hash('test')}@test.com",
            "password": "testpassword123"
        })
        
        if test_user_response.status_code == 200:
            self.test_user_id = test_user_response.json()["user"]["user_id"]
            self.log(f"✅ Created test user: {self.test_user_id}")
            
            # Now deactivate the user
            response = self.make_request("POST", f"/admin/users/{self.test_user_id}/deactivate", 
                                       self.super_admin_token, params={"reason": "test"})
            
            if self.assert_response(response, 200, "Admin Deactivate User"):
                # Verify account_status changed
                settings_response = self.make_request("GET", f"/admin/users/{self.test_user_id}/settings", 
                                                    self.super_admin_token)
                if settings_response.status_code == 200:
                    data = settings_response.json()
                    if data.get("account_status") == "deactivated":
                        self.log("✅ User account status changed to deactivated")
                    else:
                        self.log(f"❌ Account status is {data.get('account_status')}, expected 'deactivated'", "ERROR")
        else:
            self.log("❌ Failed to create test user for deactivation test", "ERROR")
            self.failed_tests += 1
    
    def test_admin_restore_user(self):
        """Test 10: Admin Restore User (POST /api/admin/users/{user_id}/restore)"""
        self.log("\n=== Test 10: Admin Restore User ===")
        
        if self.test_user_id:
            response = self.make_request("POST", f"/admin/users/{self.test_user_id}/restore", 
                                       self.super_admin_token)
            
            if self.assert_response(response, 200, "Admin Restore User"):
                # Verify account_status changed back to active
                settings_response = self.make_request("GET", f"/admin/users/{self.test_user_id}/settings", 
                                                    self.super_admin_token)
                if settings_response.status_code == 200:
                    data = settings_response.json()
                    if data.get("account_status") == "active":
                        self.log("✅ User account status restored to active")
                    else:
                        self.log(f"❌ Account status is {data.get('account_status')}, expected 'active'", "ERROR")
        else:
            self.log("❌ No test user available for restore test", "ERROR")
            self.failed_tests += 1
    
    def run_all_tests(self):
        """Run all User Settings System tests"""
        self.log("🚀 Starting User Settings System Backend Tests")
        self.log(f"Backend URL: {BASE_URL}")
        
        # Login users
        self.log("\n=== Authentication Setup ===")
        
        # Login Super Admin
        super_admin_auth = self.login_user(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
        if not super_admin_auth:
            self.log("❌ Failed to login Super Admin. Aborting tests.", "ERROR")
            return
        self.super_admin_token = super_admin_auth["token"]
        
        # Login VIP User
        vip_user_auth = self.login_user(VIP_USER_EMAIL, VIP_USER_PASSWORD)
        if not vip_user_auth:
            self.log("❌ Failed to login VIP User. Aborting tests.", "ERROR")
            return
        self.vip_user_token = vip_user_auth["token"]
        self.vip_user_id = vip_user_auth["user"]["user_id"]
        
        # Run all tests
        self.test_get_user_profile()
        self.test_update_profile()
        self.test_change_password()
        self.test_get_notification_preferences()
        self.test_update_notification_preferences()
        self.test_get_legal_documents()
        self.test_get_sessions_info()
        self.test_admin_get_user_settings()
        self.test_admin_deactivate_user()
        self.test_admin_restore_user()
        
        # Final results
        self.log(f"\n🏁 Test Results Summary:")
        self.log(f"✅ Passed: {self.passed_tests}")
        self.log(f"❌ Failed: {self.failed_tests}")
        self.log(f"📊 Success Rate: {(self.passed_tests / (self.passed_tests + self.failed_tests) * 100):.1f}%")
        
        if self.failed_tests == 0:
            self.log("🎉 All User Settings System tests PASSED!")
            return True
        else:
            self.log("⚠️  Some tests FAILED. Check logs above for details.")
            return False

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)