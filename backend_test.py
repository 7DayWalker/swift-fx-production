#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Swift FX Signals - Referral Program
Tests all referral program endpoints with proper authentication and role-based access control.
"""

import requests
import json
import sys
from datetime import datetime
import time

# Backend URL from frontend .env
BASE_URL = "https://friendboost.preview.emergentagent.com/api"

# Test credentials from review request
TEST_CREDENTIALS = {
    "super_admin": {
        "email": "ellapauledache@gmail.com",
        "password": "SuperAdmin2025!"
    },
    "vip_user": {
        "email": "fundtest@test.com", 
        "password": "password"
    },
    "free_user": {
        "email": "freeuser@test.com",
        "password": "password"
    }
}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def success(self, test_name):
        print(f"✅ {test_name}")
        self.passed += 1
        
    def failure(self, test_name, error):
        print(f"❌ {test_name}: {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"REFERRAL PROGRAM BACKEND TEST RESULTS")
        print(f"{'='*60}")
        print(f"✅ Passed: {self.passed}/{total}")
        print(f"❌ Failed: {self.failed}/{total}")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")

def login_user(email, password):
    """Login and return auth token"""
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("token")
        else:
            print(f"Login failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login error for {email}: {e}")
        return None

def register_new_user(name, email, password, referral_code=None):
    """Register a new user with optional referral code"""
    try:
        payload = {
            "name": name,
            "email": email,
            "password": password
        }
        
        url = f"{BASE_URL}/auth/register"
        if referral_code:
            url += f"?referral_code={referral_code}"
            
        response = requests.post(url, json=payload)
        return response
    except Exception as e:
        print(f"Registration error: {e}")
        return None

def make_authenticated_request(method, endpoint, token, data=None, params=None):
    """Make authenticated API request"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{BASE_URL}{endpoint}"
        
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=data, params=params)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=data, params=params)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        return response
    except Exception as e:
        print(f"Request error: {e}")
        return None

def test_referral_program():
    """Main test function for referral program"""
    results = TestResults()
    
    print("🚀 Starting Referral Program Backend Tests...")
    print(f"Backend URL: {BASE_URL}")
    
    # Step 1: Login all test users
    print("\n📋 Step 1: Authentication Tests")
    
    super_admin_token = login_user(TEST_CREDENTIALS["super_admin"]["email"], 
                                 TEST_CREDENTIALS["super_admin"]["password"])
    if super_admin_token:
        results.success("Super Admin Login")
    else:
        results.failure("Super Admin Login", "Failed to authenticate")
        return results
    
    vip_token = login_user(TEST_CREDENTIALS["vip_user"]["email"], 
                          TEST_CREDENTIALS["vip_user"]["password"])
    if vip_token:
        results.success("VIP User Login")
    else:
        results.failure("VIP User Login", "Failed to authenticate")
        return results
    
    free_token = login_user(TEST_CREDENTIALS["free_user"]["email"], 
                           TEST_CREDENTIALS["free_user"]["password"])
    if free_token:
        results.success("Free User Login")
    else:
        results.failure("Free User Login", "Failed to authenticate")
        return results
    
    # Step 2: Test User Referral Code Endpoint
    print("\n📋 Step 2: User Referral Code Tests")
    
    # Test GET /api/referral/my-code with VIP user
    response = make_authenticated_request("GET", "/referral/my-code", vip_token)
    if response and response.status_code == 200:
        data = response.json()
        required_fields = ["referral_code", "referral_link", "stats", "referrals"]
        stats_fields = ["total_referrals", "successful_referrals", "pending_rewards", "total_reward_days"]
        
        if all(field in data for field in required_fields):
            if all(field in data["stats"] for field in stats_fields):
                if isinstance(data["referral_code"], str) and len(data["referral_code"]) > 0:
                    results.success("GET /api/referral/my-code - VIP User")
                    vip_referral_code = data["referral_code"]
                    print(f"   VIP Referral Code: {vip_referral_code}")
                else:
                    results.failure("GET /api/referral/my-code - VIP User", "Invalid referral code format")
            else:
                results.failure("GET /api/referral/my-code - VIP User", f"Missing stats fields: {stats_fields}")
        else:
            results.failure("GET /api/referral/my-code - VIP User", f"Missing required fields: {required_fields}")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response:
            error_msg += f", Response: {response.text}"
        results.failure("GET /api/referral/my-code - VIP User", error_msg)
        return results
    
    # Step 3: Test Validate Referral Code
    print("\n📋 Step 3: Referral Code Validation Tests")
    
    # Test valid code
    response = make_authenticated_request("GET", f"/referral/validate/{vip_referral_code}", None)
    if response and response.status_code == 200:
        data = response.json()
        if data.get("valid") == True:
            results.success("GET /api/referral/validate/{code} - Valid Code")
        else:
            results.failure("GET /api/referral/validate/{code} - Valid Code", f"Expected valid=true, got {data}")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        results.failure("GET /api/referral/validate/{code} - Valid Code", error_msg)
    
    # Test invalid code
    response = make_authenticated_request("GET", "/referral/validate/INVALID123", None)
    if response and response.status_code == 200:
        data = response.json()
        if data.get("valid") == False:
            results.success("GET /api/referral/validate/{code} - Invalid Code")
        else:
            results.failure("GET /api/referral/validate/{code} - Invalid Code", f"Expected valid=false, got {data}")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        results.failure("GET /api/referral/validate/{code} - Invalid Code", error_msg)
    
    # Step 4: Test Registration with Referral Code
    print("\n📋 Step 4: Registration with Referral Code Tests")
    
    # Generate unique email for new user
    timestamp = int(time.time())
    new_user_email = f"testuser{timestamp}@test.com"
    
    response = register_new_user("Test User", new_user_email, "password123", vip_referral_code)
    if response and response.status_code == 200:
        data = response.json()
        if "user" in data and "token" in data:
            results.success("Registration with Referral Code")
            new_user_token = data["token"]
            new_user_id = data["user"]["user_id"]
            print(f"   New User ID: {new_user_id}")
        else:
            results.failure("Registration with Referral Code", f"Missing user/token in response: {data}")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response:
            error_msg += f", Response: {response.text}"
        results.failure("Registration with Referral Code", error_msg)
        return results
    
    # Verify referral record was created
    time.sleep(1)  # Allow time for referral record creation
    response = make_authenticated_request("GET", "/referral/my-code", vip_token)
    if response and response.status_code == 200:
        data = response.json()
        if data["stats"]["total_referrals"] > 0:
            results.success("Referral Record Creation Verification")
        else:
            results.failure("Referral Record Creation Verification", "No referrals found after registration")
    else:
        results.failure("Referral Record Creation Verification", "Failed to fetch referral stats")
    
    # Step 5: Test Admin List Referrals
    print("\n📋 Step 5: Admin Referral Management Tests")
    
    # Test GET /api/admin/referrals
    response = make_authenticated_request("GET", "/admin/referrals", super_admin_token)
    if response and response.status_code == 200:
        data = response.json()
        required_fields = ["referrals", "stats"]
        stats_fields = ["total", "pending", "completed", "expired", "flagged"]
        
        if all(field in data for field in required_fields):
            if all(field in data["stats"] for field in stats_fields):
                results.success("GET /api/admin/referrals - Super Admin")
                referrals_list = data["referrals"]
                print(f"   Total Referrals: {len(referrals_list)}")
                
                # Find a referral to test with
                test_referral_id = None
                if referrals_list:
                    test_referral_id = referrals_list[0]["referral_id"]
                    print(f"   Test Referral ID: {test_referral_id}")
            else:
                results.failure("GET /api/admin/referrals - Super Admin", f"Missing stats fields: {stats_fields}")
        else:
            results.failure("GET /api/admin/referrals - Super Admin", f"Missing required fields: {required_fields}")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        if response:
            error_msg += f", Response: {response.text}"
        results.failure("GET /api/admin/referrals - Super Admin", error_msg)
        return results
    
    # Test filtering with status parameter
    response = make_authenticated_request("GET", "/admin/referrals", super_admin_token, params={"status": "pending"})
    if response and response.status_code == 200:
        data = response.json()
        if "referrals" in data:
            results.success("GET /api/admin/referrals?status=pending - Filter Test")
        else:
            results.failure("GET /api/admin/referrals?status=pending - Filter Test", "Missing referrals field")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        results.failure("GET /api/admin/referrals?status=pending - Filter Test", error_msg)
    
    # Step 6: Test Admin Approve Referral
    print("\n📋 Step 6: Admin Referral Actions Tests")
    
    if test_referral_id:
        # Test approve referral
        response = make_authenticated_request("PUT", f"/admin/referrals/{test_referral_id}/approve", super_admin_token)
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data:
                results.success("PUT /api/admin/referrals/{id}/approve - Super Admin")
            else:
                results.failure("PUT /api/admin/referrals/{id}/approve - Super Admin", f"Unexpected response: {data}")
        else:
            error_msg = f"Status: {response.status_code if response else 'No response'}"
            if response:
                error_msg += f", Response: {response.text}"
            results.failure("PUT /api/admin/referrals/{id}/approve - Super Admin", error_msg)
        
        # Test revoke referral
        response = make_authenticated_request("PUT", f"/admin/referrals/{test_referral_id}/revoke", 
                                            super_admin_token, data={"reason": "Test revocation"})
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data:
                results.success("PUT /api/admin/referrals/{id}/revoke - Super Admin")
            else:
                results.failure("PUT /api/admin/referrals/{id}/revoke - Super Admin", f"Unexpected response: {data}")
        else:
            error_msg = f"Status: {response.status_code if response else 'No response'}"
            if response:
                error_msg += f", Response: {response.text}"
            results.failure("PUT /api/admin/referrals/{id}/revoke - Super Admin", error_msg)
        
        # Test flag referral
        response = make_authenticated_request("PUT", f"/admin/referrals/{test_referral_id}/flag", 
                                            super_admin_token, data={"reason": "Test flagging"})
        if response and response.status_code == 200:
            data = response.json()
            if "message" in data:
                results.success("PUT /api/admin/referrals/{id}/flag - Super Admin")
            else:
                results.failure("PUT /api/admin/referrals/{id}/flag - Super Admin", f"Unexpected response: {data}")
        else:
            error_msg = f"Status: {response.status_code if response else 'No response'}"
            if response:
                error_msg += f", Response: {response.text}"
            results.failure("PUT /api/admin/referrals/{id}/flag - Super Admin", error_msg)
    else:
        results.failure("Admin Referral Actions", "No test referral ID available")
    
    # Step 7: Test Role-Based Access Control
    print("\n📋 Step 7: Role-Based Access Control Tests")
    
    # Test VIP user trying to access admin endpoints (should fail)
    response = make_authenticated_request("GET", "/admin/referrals", vip_token)
    if response and response.status_code == 403:
        results.success("RBAC Test - VIP User Blocked from Admin Referrals")
    else:
        error_msg = f"Expected 403, got {response.status_code if response else 'No response'}"
        results.failure("RBAC Test - VIP User Blocked from Admin Referrals", error_msg)
    
    # Test Free user trying to access admin endpoints (should fail)
    response = make_authenticated_request("GET", "/admin/referrals", free_token)
    if response and response.status_code == 403:
        results.success("RBAC Test - Free User Blocked from Admin Referrals")
    else:
        error_msg = f"Expected 403, got {response.status_code if response else 'No response'}"
        results.failure("RBAC Test - Free User Blocked from Admin Referrals", error_msg)
    
    # Test Free user can access their own referral code
    response = make_authenticated_request("GET", "/referral/my-code", free_token)
    if response and response.status_code == 200:
        data = response.json()
        if "referral_code" in data:
            results.success("RBAC Test - Free User Can Access Own Referral Code")
        else:
            results.failure("RBAC Test - Free User Can Access Own Referral Code", "Missing referral_code")
    else:
        error_msg = f"Status: {response.status_code if response else 'No response'}"
        results.failure("RBAC Test - Free User Can Access Own Referral Code", error_msg)
    
    return results

if __name__ == "__main__":
    print("🔧 Swift FX Signals - Referral Program Backend Testing")
    print("=" * 60)
    
    try:
        results = test_referral_program()
        results.summary()
        
        # Exit with appropriate code
        sys.exit(0 if results.failed == 0 else 1)
        
    except KeyboardInterrupt:
        print("\n⚠️  Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
        sys.exit(1)