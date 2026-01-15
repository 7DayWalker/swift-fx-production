#!/usr/bin/env python3
"""
Backend API Testing for Fund Management WhatsApp Apply Flow
Testing the specific WhatsApp application flow as requested.
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
FREE_CREDENTIALS = {"email": "freeuser@test.com", "password": "password"}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        self.test_application_id = None
        
    def log_pass(self, test_name):
        print(f"✅ PASS: {test_name}")
        self.passed += 1
        
    def log_fail(self, test_name, error):
        print(f"❌ FAIL: {test_name} - {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        
    def log_info(self, message):
        print(f"ℹ️  INFO: {message}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"WHATSAPP FUND MANAGEMENT TEST SUMMARY: {self.passed}/{total} PASSED")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")
        return self.failed == 0

def login_user(credentials):
    """Login and return auth token"""
    try:
        response = requests.post(f"{BACKEND_URL}/auth/login", json=credentials, timeout=10)
        if response.status_code == 200:
            return response.json().get("token")
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def test_whatsapp_fund_management_flow():
    """Test the complete WhatsApp fund management flow"""
    results = TestResults()
    
    print("🚀 STARTING FUND MANAGEMENT WHATSAPP APPLY FLOW TESTS")
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 60)
    
    # Step 1: Login all users
    print("1️⃣  AUTHENTICATION SETUP")
    admin_token = login_user(ADMIN_CREDENTIALS)
    vip_token = login_user(VIP_CREDENTIALS)
    free_token = login_user(FREE_CREDENTIALS)
    
    if not all([admin_token, vip_token, free_token]):
        results.log_fail("Authentication Setup", "Failed to login one or more users")
        return results.summary()
    
    results.log_pass("Authentication Setup - All users logged in successfully")
    
    # Step 2: Clear existing VIP application (optional check)
    print("\n2️⃣  CHECKING EXISTING VIP APPLICATION")
    try:
        headers = {"Authorization": f"Bearer {vip_token}"}
        response = requests.get(f"{BACKEND_URL}/fund/my-application", headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("has_application"):
                results.log_info(f"VIP user already has application: {data.get('application', {}).get('application_id')}")
            else:
                results.log_info("VIP user has no existing application")
    except Exception as e:
        results.log_info(f"Could not check existing application: {e}")
    
    # Step 3: VIP User WhatsApp Application Submission
    print("\n3️⃣  VIP USER WHATSAPP APPLICATION SUBMISSION")
    
    headers = {"Authorization": f"Bearer {vip_token}"}
    whatsapp_payload = {
        "full_name": "Test VIP User",
        "email": "fundtest@test.com",
        "phone": "WhatsApp",
        "country": "Nigeria",
        "investment_tier": "starter",
        "intended_amount": 500,
        "trading_experience": "intermediate",
        "risk_agreement": True,
        "source": "whatsapp"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/fund/apply", json=whatsapp_payload, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            data = response.json()
            if "application_id" in data:
                results.test_application_id = data["application_id"]
                source = data.get("source", "not_found")
                if source == "whatsapp":
                    results.log_pass(f"VIP WhatsApp Application - ID: {results.test_application_id}, Source: {source}")
                else:
                    results.log_fail("VIP WhatsApp Application", f"Source field incorrect. Expected 'whatsapp', got: {source}")
            else:
                results.log_fail("VIP WhatsApp Application", f"No application_id in response: {data}")
        elif response.status_code == 400:
            # Check if it's a duplicate application error
            error_msg = response.json().get("detail", "")
            if "already has" in error_msg.lower():
                results.log_info(f"VIP user already has application: {error_msg}")
                # Try to get existing application and check source
                try:
                    response = requests.get(f"{BACKEND_URL}/fund/my-application", headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        if data.get("has_application"):
                            app_data = data.get("application", {})
                            results.test_application_id = app_data.get("application_id")
                            source = app_data.get("source", "not_found")
                            if source == "whatsapp":
                                results.log_pass(f"VIP WhatsApp Application (Existing) - ID: {results.test_application_id}, Source: {source}")
                            else:
                                results.log_fail("VIP WhatsApp Application", f"Existing application has wrong source: {source}")
                        else:
                            results.log_fail("VIP WhatsApp Application", "User has no application despite duplicate error")
                except Exception as e:
                    results.log_fail("VIP WhatsApp Application", f"Error checking existing application: {e}")
            else:
                results.log_fail("VIP WhatsApp Application", f"400 error: {error_msg}")
        else:
            results.log_fail("VIP WhatsApp Application", f"HTTP {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("VIP WhatsApp Application", f"Request error: {e}")
    
    # Step 4: Admin Can See WhatsApp Applications
    print("\n4️⃣  ADMIN VIEW WHATSAPP APPLICATIONS")
    
    headers = {"Authorization": f"Bearer {admin_token}"}
    try:
        response = requests.get(f"{BACKEND_URL}/admin/fund/applications", headers=headers, timeout=10)
        
        if response.status_code == 200:
            applications = response.json()
            
            # Find VIP user's application
            vip_app = None
            for app in applications:
                if app.get("email") == VIP_CREDENTIALS["email"]:
                    vip_app = app
                    break
            
            if vip_app:
                source = vip_app.get("source", "not_found")
                if source == "whatsapp":
                    results.log_pass(f"Admin View WhatsApp Applications - Found VIP app with source: {source}")
                    if not results.test_application_id:
                        results.test_application_id = vip_app.get("application_id")
                else:
                    results.log_fail("Admin View WhatsApp Applications", f"VIP application has wrong source: {source}")
            else:
                results.log_fail("Admin View WhatsApp Applications", f"VIP application not found in {len(applications)} applications")
        else:
            results.log_fail("Admin View WhatsApp Applications", f"HTTP {response.status_code}: {response.text}")
    except Exception as e:
        results.log_fail("Admin View WhatsApp Applications", f"Request error: {e}")
    
    # Step 5: Admin Can Update Status
    print("\n5️⃣  ADMIN UPDATE APPLICATION STATUS")
    
    if results.test_application_id:
        headers = {"Authorization": f"Bearer {admin_token}"}
        try:
            response = requests.put(
                f"{BACKEND_URL}/admin/fund/applications/{results.test_application_id}?status=contacted",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                results.log_pass(f"Admin Status Update - {data.get('message', 'Updated successfully')}")
                
                # Verify the status was updated
                response = requests.get(f"{BACKEND_URL}/admin/fund/applications", headers=headers, timeout=10)
                if response.status_code == 200:
                    applications = response.json()
                    updated_app = None
                    for app in applications:
                        if app.get("application_id") == results.test_application_id:
                            updated_app = app
                            break
                    
                    if updated_app and updated_app.get("status") == "contacted":
                        results.log_pass("Admin Status Verification - Status correctly updated to 'contacted'")
                    else:
                        results.log_fail("Admin Status Verification", f"Status not updated. Current: {updated_app.get('status') if updated_app else 'not_found'}")
            else:
                results.log_fail("Admin Status Update", f"HTTP {response.status_code}: {response.text}")
        except Exception as e:
            results.log_fail("Admin Status Update", f"Request error: {e}")
    else:
        results.log_fail("Admin Status Update", "No application ID available for testing")
    
    # Step 6: Free User Cannot Apply
    print("\n6️⃣  FREE USER ACCESS CONTROL")
    
    headers = {"Authorization": f"Bearer {free_token}"}
    free_payload = {
        "full_name": "Test Free User",
        "email": "freeuser@test.com",
        "phone": "WhatsApp",
        "country": "Nigeria",
        "investment_tier": "starter",
        "intended_amount": 500,
        "trading_experience": "intermediate",
        "risk_agreement": True,
        "source": "whatsapp"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/fund/apply", json=free_payload, headers=headers, timeout=10)
        
        if response.status_code == 403:
            error_msg = response.json().get("detail", "")
            results.log_pass(f"Free User Access Control - Correctly blocked with 403: {error_msg}")
        else:
            results.log_fail("Free User Access Control", f"Free user not blocked. Status: {response.status_code}, Response: {response.text}")
    except Exception as e:
        results.log_fail("Free User Access Control", f"Request error: {e}")
    
    return results.summary()

if __name__ == "__main__":
    success = test_whatsapp_fund_management_flow()
    sys.exit(0 if success else 1)