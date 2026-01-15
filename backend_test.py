#!/usr/bin/env python3
"""
Backend API Testing for Fund Management Feature
Tests all fund management endpoints with proper authentication and access control
"""

import requests
import json
import sys
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = "https://fundadmin-1.preview.emergentagent.com/api"

# Test credentials from review request
ADMIN_CREDENTIALS = {"email": "admin@swiftfx.com", "password": "adminpassword"}
VIP_CREDENTIALS = {"email": "fundtest@test.com", "password": "password"}
FREE_CREDENTIALS = {"email": "freetestuser@test.com", "password": "password"}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def log_pass(self, test_name):
        print(f"✅ PASS: {test_name}")
        self.passed += 1
        
    def log_fail(self, test_name, error):
        print(f"❌ FAIL: {test_name} - {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} PASSED")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")
        return self.failed == 0

def login_user(credentials):
    """Login and return auth token"""
    try:
        response = requests.post(f"{BACKEND_URL}/auth/login", json=credentials)
        if response.status_code == 200:
            return response.json().get("token")
        else:
            print(f"Login failed for {credentials['email']}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login error for {credentials['email']}: {e}")
        return None

def make_request(method, endpoint, token=None, json_data=None, params=None):
    """Make authenticated API request"""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, json=json_data, params=params)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        return response
    except Exception as e:
        print(f"Request error: {e}")
        return None

def test_fund_management_endpoints():
    """Test all fund management endpoints according to review request"""
    results = TestResults()
    
    print("🚀 STARTING FUND MANAGEMENT API TESTS")
    print(f"Backend URL: {BACKEND_URL}")
    print("="*60)
    
    # Step 1: Login all users
    print("\n📋 STEP 1: User Authentication")
    admin_token = login_user(ADMIN_CREDENTIALS)
    vip_token = login_user(VIP_CREDENTIALS)
    free_token = login_user(FREE_CREDENTIALS)
    
    if not admin_token:
        results.log_fail("Admin Login", "Failed to authenticate admin user")
        return results.summary()
    else:
        results.log_pass("Admin Login")
        
    if not vip_token:
        results.log_fail("VIP User Login", "Failed to authenticate VIP user")
        return results.summary()
    else:
        results.log_pass("VIP User Login")
        
    if not free_token:
        results.log_fail("Free User Login", "Failed to authenticate free user")
        return results.summary()
    else:
        results.log_pass("Free User Login")
    
    # Step 2: Test Free User Cannot Apply (Should get 403)
    print("\n📋 STEP 2: Free User Access Control")
    
    application_data = {
        "full_name": "Free Test User",
        "email": "freetestuser@test.com",
        "phone": "+1234567890",
        "country": "Nigeria",
        "investment_tier": "starter",
        "intended_amount": 1000,
        "trading_experience": "intermediate",
        "risk_agreement": True
    }
    
    response = make_request("POST", "/fund/apply", free_token, application_data)
    if response and response.status_code == 403:
        results.log_pass("Free User Blocked from Fund Application")
    else:
        results.log_fail("Free User Blocked from Fund Application", 
                        f"Expected 403, got {response.status_code if response else 'No response'}")
    
    # Step 3: Test VIP User Can Apply Successfully
    print("\n📋 STEP 3: VIP User Fund Application")
    
    vip_application_data = {
        "full_name": "Test VIP User",
        "email": "fundtest@test.com",
        "phone": "+1234567890",
        "country": "Nigeria",
        "investment_tier": "starter",
        "intended_amount": 1000,
        "trading_experience": "intermediate",
        "risk_agreement": True
    }
    
    response = make_request("POST", "/fund/apply", vip_token, vip_application_data)
    if response and response.status_code == 200:
        results.log_pass("VIP User Fund Application Submission")
        application_id = response.json().get("application_id")
        print(f"   Application ID: {application_id}")
    else:
        results.log_fail("VIP User Fund Application Submission", 
                        f"Expected 200, got {response.status_code if response else 'No response'}: {response.text if response else 'No response'}")
        application_id = None
    
    # Step 4: Test Duplicate Application (VIP user should get error)
    print("\n📋 STEP 4: Duplicate Application Prevention")
    
    response = make_request("POST", "/fund/apply", vip_token, vip_application_data)
    if response and response.status_code in [400, 409]:  # Either bad request or conflict
        results.log_pass("Duplicate Application Prevention")
    else:
        results.log_fail("Duplicate Application Prevention", 
                        f"Expected 400/409, got {response.status_code if response else 'No response'}")
    
    # Step 5: Test VIP User Can Check Application Status
    print("\n📋 STEP 5: VIP User Application Status Check")
    
    response = make_request("GET", "/fund/my-application", vip_token)
    if response and response.status_code == 200:
        app_data = response.json()
        if app_data.get("has_application") or app_data.get("application_id"):
            results.log_pass("VIP User Application Status Retrieval")
            print(f"   Status: {app_data.get('status', 'N/A')}")
        else:
            results.log_fail("VIP User Application Status Retrieval", "No application found for VIP user")
    else:
        results.log_fail("VIP User Application Status Retrieval", 
                        f"Expected 200, got {response.status_code if response else 'No response'}")
    
    # Step 6: Test Free User Application Status (should show no application)
    print("\n📋 STEP 6: Free User Application Status Check")
    
    response = make_request("GET", "/fund/my-application", free_token)
    if response and response.status_code == 200:
        app_data = response.json()
        if app_data.get("has_application") == False or not app_data.get("application_id"):
            results.log_pass("Free User No Application Status")
        else:
            results.log_fail("Free User No Application Status", "Free user should not have application")
    else:
        results.log_fail("Free User No Application Status", 
                        f"Expected 200, got {response.status_code if response else 'No response'}")
    
    # Step 7: Test Admin Can List All Applications
    print("\n📋 STEP 7: Admin List All Applications")
    
    response = make_request("GET", "/admin/fund/applications", admin_token)
    if response and response.status_code == 200:
        applications = response.json()
        if isinstance(applications, list):
            results.log_pass("Admin List All Applications")
            print(f"   Found {len(applications)} applications")
            # Find the VIP user's application for next test
            vip_app_id = None
            for app in applications:
                if app.get("email") == "fundtest@test.com":
                    vip_app_id = app.get("application_id")
                    break
        else:
            results.log_fail("Admin List All Applications", "Response is not a list")
    else:
        results.log_fail("Admin List All Applications", 
                        f"Expected 200, got {response.status_code if response else 'No response'}")
        vip_app_id = None
    
    # Step 8: Test VIP User Cannot Access Admin Endpoint
    print("\n📋 STEP 8: VIP User Admin Access Control")
    
    response = make_request("GET", "/admin/fund/applications", vip_token)
    if response and response.status_code == 403:
        results.log_pass("VIP User Blocked from Admin Endpoint")
    else:
        results.log_fail("VIP User Blocked from Admin Endpoint", 
                        f"Expected 403, got {response.status_code if response else 'No response'}")
    
    # Step 9: Test Admin Can Update Application Status
    print("\n📋 STEP 9: Admin Update Application Status")
    
    if vip_app_id:
        response = make_request("PUT", f"/admin/fund/applications/{vip_app_id}", 
                              admin_token, params={"status": "contacted"})
        if response and response.status_code == 200:
            results.log_pass("Admin Update Application Status")
        else:
            results.log_fail("Admin Update Application Status", 
                            f"Expected 200, got {response.status_code if response else 'No response'}")
    else:
        results.log_fail("Admin Update Application Status", "No VIP application ID found")
    
    # Step 10: Test VIP User Cannot Update Application Status
    print("\n📋 STEP 10: VIP User Update Access Control")
    
    if vip_app_id:
        response = make_request("PUT", f"/admin/fund/applications/{vip_app_id}", 
                              vip_token, params={"status": "approved"})
        if response and response.status_code == 403:
            results.log_pass("VIP User Blocked from Update Endpoint")
        else:
            results.log_fail("VIP User Blocked from Update Endpoint", 
                            f"Expected 403, got {response.status_code if response else 'No response'}")
    else:
        results.log_fail("VIP User Blocked from Update Endpoint", "No VIP application ID found")
    
    # Step 11: Verify Status Update (VIP user checks status again)
    print("\n📋 STEP 11: Verify Status Update")
    
    response = make_request("GET", "/fund/my-application", vip_token)
    if response and response.status_code == 200:
        app_data = response.json()
        current_status = app_data.get("status")
        if current_status == "contacted":
            results.log_pass("Status Update Verification")
            print(f"   Updated status: {current_status}")
        else:
            results.log_fail("Status Update Verification", 
                            f"Expected 'contacted', got '{current_status}'")
    else:
        results.log_fail("Status Update Verification", 
                        f"Expected 200, got {response.status_code if response else 'No response'}")
    
    return results.summary()

if __name__ == "__main__":
    success = test_fund_management_endpoints()
    sys.exit(0 if success else 1)