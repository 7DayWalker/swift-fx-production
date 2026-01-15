#!/usr/bin/env python3
"""
Fund Management Application System End-to-End Testing
Testing the complete fund management workflow as specified in the review request.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BASE_URL = "https://fundadmin-1.preview.emergentagent.com/api"

# Test credentials from review request
ADMIN_CREDENTIALS = {"email": "admin@swiftfx.com", "password": "adminpassword"}
VIP_CREDENTIALS = {"email": "fundtest@test.com", "password": "password"}
FREE_CREDENTIALS = {"email": "freetestuser@test.com", "password": "password"}

class FundManagementTester:
    def __init__(self):
        self.admin_token = None
        self.vip_token = None
        self.free_token = None
        self.test_application_id = None
        self.results = []
        
    def log_result(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.results.append(f"{status}: {test_name}")
        if details:
            self.results.append(f"    Details: {details}")
        print(f"{status}: {test_name}")
        if details:
            print(f"    Details: {details}")
    
    def login_user(self, credentials, user_type):
        """Login and get JWT token"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=credentials)
            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                user_info = data.get("user", {})
                self.log_result(f"Login {user_type}", True, f"User: {user_info.get('name', 'Unknown')}, Role: {user_info.get('role', 'Unknown')}")
                return token
            else:
                self.log_result(f"Login {user_type}", False, f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            self.log_result(f"Login {user_type}", False, f"Exception: {str(e)}")
            return None
    
    def get_headers(self, token):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def step1_setup_and_login(self):
        """Step 1: Login all test users"""
        print("\n=== STEP 1: Setup and Login ===")
        
        # Login Admin
        self.admin_token = self.login_user(ADMIN_CREDENTIALS, "Admin")
        
        # Login VIP User
        self.vip_token = self.login_user(VIP_CREDENTIALS, "VIP User")
        
        # Login Free User
        self.free_token = self.login_user(FREE_CREDENTIALS, "Free User")
        
        return all([self.admin_token, self.vip_token, self.free_token])
    
    def step2_test_admin_dashboard_format(self):
        """Step 2: Test Admin Dashboard Response Format"""
        print("\n=== STEP 2: Test Admin Dashboard Response Format ===")
        
        if not self.admin_token:
            self.log_result("Admin Dashboard Format Test", False, "No admin token available")
            return False
        
        try:
            response = requests.get(
                f"{BASE_URL}/admin/fund/applications",
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if response has expected format: { "applications": [...], "total": N }
                if isinstance(data, dict) and "applications" in data and "total" in data:
                    applications = data["applications"]
                    total = data["total"]
                    
                    self.log_result("Admin Dashboard Format", True, f"Found {total} applications in correct format")
                    
                    # Check structure of each application
                    if applications:
                        app = applications[0]
                        required_fields = ["application_id", "user_id", "full_name", "email", "investment_tier", "intended_amount", "status", "source", "created_at"]
                        missing_fields = [field for field in required_fields if field not in app]
                        
                        if not missing_fields:
                            self.log_result("Application Structure", True, "All required fields present")
                        else:
                            self.log_result("Application Structure", False, f"Missing fields: {missing_fields}")
                    
                    return True
                else:
                    # Check if it's the old format (direct array)
                    if isinstance(data, list):
                        self.log_result("Admin Dashboard Format", False, "Response is array format, expected object with 'applications' and 'total' fields")
                    else:
                        self.log_result("Admin Dashboard Format", False, f"Unexpected response format: {type(data)}")
                    return False
            else:
                self.log_result("Admin Dashboard Format", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Admin Dashboard Format", False, f"Exception: {str(e)}")
            return False
    
    def step3_test_vip_application_creation(self):
        """Step 3: Test New Application Creation (VIP User)"""
        print("\n=== STEP 3: Test New Application Creation (VIP User) ===")
        
        if not self.vip_token:
            self.log_result("VIP Application Creation", False, "No VIP token available")
            return False
        
        application_data = {
            "full_name": "Fund Test VIP",
            "email": "fundtest@test.com",
            "phone": "WhatsApp",
            "country": "Nigeria",
            "investment_tier": "professional",
            "intended_amount": 10000,
            "trading_experience": "intermediate",
            "risk_agreement": True,
            "source": "whatsapp"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/fund/apply",
                json=application_data,
                headers=self.get_headers(self.vip_token)
            )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                application_id = data.get("application_id")
                
                if application_id:
                    self.test_application_id = application_id
                    self.log_result("VIP Application Creation", True, f"Application ID: {application_id}")
                    return True
                else:
                    self.log_result("VIP Application Creation", False, "No application_id in response")
                    return False
            else:
                self.log_result("VIP Application Creation", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("VIP Application Creation", False, f"Exception: {str(e)}")
            return False
    
    def step4_verify_application_in_admin_dashboard(self):
        """Step 4: Verify Application Appears in Admin Dashboard"""
        print("\n=== STEP 4: Verify Application in Admin Dashboard ===")
        
        if not self.admin_token or not self.test_application_id:
            self.log_result("Application in Admin Dashboard", False, "Missing admin token or application ID")
            return False
        
        try:
            response = requests.get(
                f"{BASE_URL}/admin/fund/applications",
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Handle both old and new response formats
                if isinstance(data, dict) and "applications" in data:
                    applications = data["applications"]
                elif isinstance(data, list):
                    applications = data
                else:
                    self.log_result("Application in Admin Dashboard", False, "Unexpected response format")
                    return False
                
                # Look for our test application
                found_application = None
                for app in applications:
                    if app.get("application_id") == self.test_application_id:
                        found_application = app
                        break
                
                if found_application:
                    source = found_application.get("source", "unknown")
                    self.log_result("Application in Admin Dashboard", True, f"Found application with source: {source}")
                    
                    # Verify source field is "whatsapp"
                    if source == "whatsapp":
                        self.log_result("WhatsApp Source Verification", True, "Source field correctly set to 'whatsapp'")
                    else:
                        self.log_result("WhatsApp Source Verification", False, f"Expected 'whatsapp', got '{source}'")
                    
                    return True
                else:
                    self.log_result("Application in Admin Dashboard", False, f"Application {self.test_application_id} not found")
                    return False
            else:
                self.log_result("Application in Admin Dashboard", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Application in Admin Dashboard", False, f"Exception: {str(e)}")
            return False
    
    def step5_test_duplicate_prevention(self):
        """Step 5: Test Duplicate Prevention (Per-Tier)"""
        print("\n=== STEP 5: Test Duplicate Prevention (Per-Tier) ===")
        
        if not self.vip_token:
            self.log_result("Duplicate Prevention Test", False, "No VIP token available")
            return False
        
        # Try to create another application with same tier "professional"
        duplicate_data = {
            "full_name": "Fund Test VIP Duplicate",
            "email": "fundtest@test.com",
            "phone": "WhatsApp",
            "country": "Nigeria",
            "investment_tier": "professional",  # Same tier as before
            "intended_amount": 15000,
            "trading_experience": "advanced",
            "risk_agreement": True,
            "source": "whatsapp"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/fund/apply",
                json=duplicate_data,
                headers=self.get_headers(self.vip_token)
            )
            
            if response.status_code == 400:
                response_text = response.text.lower()
                if "already have an active application" in response_text or "duplicate" in response_text:
                    self.log_result("Duplicate Prevention Test", True, "Correctly blocked duplicate application")
                    return True
                else:
                    self.log_result("Duplicate Prevention Test", False, f"400 error but wrong message: {response.text}")
                    return False
            else:
                self.log_result("Duplicate Prevention Test", False, f"Expected 400, got {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Duplicate Prevention Test", False, f"Exception: {str(e)}")
            return False
    
    def step6_test_different_tier_application(self):
        """Step 6: Test Different Tier Application (Should Work)"""
        print("\n=== STEP 6: Test Different Tier Application (Should Work) ===")
        
        if not self.vip_token:
            self.log_result("Different Tier Application", False, "No VIP token available")
            return False
        
        # Try to create application with different tier "elite"
        different_tier_data = {
            "full_name": "Fund Test VIP Elite",
            "email": "fundtest@test.com",
            "phone": "WhatsApp",
            "country": "Nigeria",
            "investment_tier": "elite",  # Different tier
            "intended_amount": 25000,
            "trading_experience": "advanced",
            "risk_agreement": True,
            "source": "whatsapp"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/fund/apply",
                json=different_tier_data,
                headers=self.get_headers(self.vip_token)
            )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                application_id = data.get("application_id")
                
                if application_id:
                    self.log_result("Different Tier Application", True, f"Elite tier application created: {application_id}")
                    return True
                else:
                    self.log_result("Different Tier Application", False, "No application_id in response")
                    return False
            else:
                self.log_result("Different Tier Application", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Different Tier Application", False, f"Exception: {str(e)}")
            return False
    
    def step7_test_admin_status_update(self):
        """Step 7: Test Admin Status Update"""
        print("\n=== STEP 7: Test Admin Status Update ===")
        
        if not self.admin_token or not self.test_application_id:
            self.log_result("Admin Status Update", False, "Missing admin token or application ID")
            return False
        
        try:
            response = requests.put(
                f"{BASE_URL}/admin/fund/applications/{self.test_application_id}?status=contacted",
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                self.log_result("Admin Status Update", True, "Status updated to 'contacted'")
                return True
            else:
                self.log_result("Admin Status Update", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Admin Status Update", False, f"Exception: {str(e)}")
            return False
    
    def step8_test_free_user_blocked(self):
        """Step 8: Test Free User Blocked"""
        print("\n=== STEP 8: Test Free User Blocked ===")
        
        if not self.free_token:
            self.log_result("Free User Blocked Test", False, "No free user token available")
            return False
        
        free_user_data = {
            "full_name": "Free User Test",
            "email": "freetestuser@test.com",
            "phone": "123456789",
            "country": "USA",
            "investment_tier": "starter",
            "intended_amount": 5000,
            "trading_experience": "beginner",
            "risk_agreement": True,
            "source": "app"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/fund/apply",
                json=free_user_data,
                headers=self.get_headers(self.free_token)
            )
            
            if response.status_code == 403:
                self.log_result("Free User Blocked Test", True, "Free user correctly blocked with 403 Forbidden")
                return True
            else:
                self.log_result("Free User Blocked Test", False, f"Expected 403, got {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_result("Free User Blocked Test", False, f"Exception: {str(e)}")
            return False
    
    def step9_final_admin_dashboard_check(self):
        """Step 9: Final Admin Dashboard Check"""
        print("\n=== STEP 9: Final Admin Dashboard Check ===")
        
        if not self.admin_token:
            self.log_result("Final Admin Dashboard Check", False, "No admin token available")
            return False
        
        try:
            response = requests.get(
                f"{BASE_URL}/admin/fund/applications",
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Handle both response formats
                if isinstance(data, dict) and "applications" in data:
                    applications = data["applications"]
                    total = data.get("total", len(applications))
                elif isinstance(data, list):
                    applications = data
                    total = len(applications)
                else:
                    self.log_result("Final Admin Dashboard Check", False, "Unexpected response format")
                    return False
                
                self.log_result("Final Admin Dashboard Check", True, f"Total applications visible: {total}")
                
                # Show summary of applications
                for app in applications:
                    app_id = app.get("application_id", "unknown")
                    tier = app.get("investment_tier", "unknown")
                    status = app.get("status", "unknown")
                    source = app.get("source", "unknown")
                    print(f"    App {app_id}: {tier} tier, status: {status}, source: {source}")
                
                return True
            else:
                self.log_result("Final Admin Dashboard Check", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Final Admin Dashboard Check", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all test steps in sequence"""
        print("🚀 Starting Fund Management Application System End-to-End Testing")
        print(f"Backend URL: {BASE_URL}")
        print(f"Test Time: {datetime.now().isoformat()}")
        
        test_steps = [
            self.step1_setup_and_login,
            self.step2_test_admin_dashboard_format,
            self.step3_test_vip_application_creation,
            self.step4_verify_application_in_admin_dashboard,
            self.step5_test_duplicate_prevention,
            self.step6_test_different_tier_application,
            self.step7_test_admin_status_update,
            self.step8_test_free_user_blocked,
            self.step9_final_admin_dashboard_check
        ]
        
        passed = 0
        total = len(test_steps)
        
        for step in test_steps:
            try:
                if step():
                    passed += 1
            except Exception as e:
                print(f"❌ CRITICAL ERROR in {step.__name__}: {str(e)}")
        
        print(f"\n📊 TEST SUMMARY")
        print(f"Passed: {passed}/{total}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - Fund Management System is working correctly!")
        else:
            print("⚠️  SOME TESTS FAILED - Review the failures above")
        
        return passed == total

if __name__ == "__main__":
    tester = FundManagementTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)