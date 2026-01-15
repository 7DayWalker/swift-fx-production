#!/usr/bin/env python3
"""
Investor Dashboard System End-to-End Testing
Tests the complete investor dashboard functionality including:
- Fund application status checking
- Investor status verification
- Dashboard data retrieval
- Withdrawal requests
- Admin portfolio management
- Performance tracking
- Notice system
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Backend URL from environment
BACKEND_URL = "https://fundadmin-1.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@swiftfx.com"
ADMIN_PASSWORD = "adminpassword"
VIP_EMAIL = "fundtest@test.com"
VIP_PASSWORD = "password"

class InvestorDashboardTester:
    def __init__(self):
        self.admin_token = None
        self.vip_token = None
        self.test_results = []
        self.portfolio_id = None
        self.withdrawal_id = None
        self.notice_id = None
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "status": status,
            "success": success,
            "details": details
        })
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
    
    def make_request(self, method: str, endpoint: str, token: str = None, data: Dict = None, files: Dict = None) -> tuple:
        """Make HTTP request with error handling"""
        url = f"{BACKEND_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        try:
            if method == "GET":
                response = requests.get(url, headers=headers)
            elif method == "POST":
                if files:
                    # Remove Content-Type for multipart
                    headers.pop("Content-Type", None)
                    response = requests.post(url, headers=headers, files=files, data=data)
                else:
                    response = requests.post(url, headers=headers, json=data)
            elif method == "PUT":
                response = requests.put(url, headers=headers, json=data)
            elif method == "DELETE":
                response = requests.delete(url, headers=headers)
            else:
                return False, f"Unsupported method: {method}"
            
            return True, response
        except Exception as e:
            return False, f"Request failed: {str(e)}"
    
    def login_admin(self) -> bool:
        """Login as admin user"""
        success, response = self.make_request("POST", "/auth/login", data={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if not success:
            self.log_test("Admin Login", False, f"Request failed: {response}")
            return False
        
        if response.status_code == 200:
            data = response.json()
            self.admin_token = data.get("token")
            self.log_test("Admin Login", True, f"Logged in as {data.get('user', {}).get('email')}")
            return True
        else:
            self.log_test("Admin Login", False, f"Status {response.status_code}: {response.text}")
            return False
    
    def login_vip_user(self) -> bool:
        """Login as VIP user"""
        success, response = self.make_request("POST", "/auth/login", data={
            "email": VIP_EMAIL,
            "password": VIP_PASSWORD
        })
        
        if not success:
            self.log_test("VIP User Login", False, f"Request failed: {response}")
            return False
        
        if response.status_code == 200:
            data = response.json()
            self.vip_token = data.get("token")
            self.log_test("VIP User Login", True, f"Logged in as {data.get('user', {}).get('email')}")
            return True
        else:
            self.log_test("VIP User Login", False, f"Status {response.status_code}: {response.text}")
            return False
    
    def test_fund_application_status(self) -> bool:
        """Step 1: Check Fund Application Status"""
        print("\n=== STEP 1: Check Fund Application Status ===")
        
        if not self.admin_token:
            self.log_test("Fund Application Status Check", False, "Admin not logged in")
            return False
        
        # Get all fund applications
        success, response = self.make_request("GET", "/admin/fund/applications", self.admin_token)
        
        if not success:
            self.log_test("Get Fund Applications", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Get Fund Applications", False, f"Status {response.status_code}: {response.text}")
            return False
        
        applications = response.json()
        self.log_test("Get Fund Applications", True, f"Retrieved {len(applications)} applications")
        
        # Look for VIP user application
        vip_application = None
        for app in applications:
            if isinstance(app, dict) and app.get("email") == VIP_EMAIL:
                vip_application = app
                break
        
        if not vip_application:
            self.log_test("Find VIP Application", False, f"No application found for {VIP_EMAIL}")
            return False
        
        self.log_test("Find VIP Application", True, f"Found application with status: {vip_application.get('status')}")
        
        # If not approved, approve it
        if vip_application.get("status") != "approved":
            app_id = vip_application.get("application_id")
            success, response = self.make_request("PUT", f"/admin/fund/applications/{app_id}?status=approved", self.admin_token)
            
            if success and response.status_code == 200:
                self.log_test("Approve VIP Application", True, "Application approved successfully")
                return True
            else:
                self.log_test("Approve VIP Application", False, f"Failed to approve: {response.text if success else response}")
                return False
        else:
            self.log_test("VIP Application Already Approved", True, "Application is already approved")
            return True
    
    def test_investor_status_check(self) -> bool:
        """Step 2: Test Investor Status Check"""
        print("\n=== STEP 2: Test Investor Status Check ===")
        
        if not self.vip_token:
            self.log_test("Investor Status Check", False, "VIP user not logged in")
            return False
        
        success, response = self.make_request("GET", "/investor/status", self.vip_token)
        
        if not success:
            self.log_test("Investor Status Check", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Investor Status Check", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        is_investor = data.get("is_investor", False)
        
        if is_investor:
            self.log_test("Investor Status Check", True, "User is confirmed as approved investor")
            return True
        else:
            self.log_test("Investor Status Check", False, f"User is not an approved investor: {data}")
            return False
    
    def test_investor_dashboard(self) -> bool:
        """Step 3: Test Investor Dashboard"""
        print("\n=== STEP 3: Test Investor Dashboard ===")
        
        if not self.vip_token:
            self.log_test("Investor Dashboard", False, "VIP user not logged in")
            return False
        
        success, response = self.make_request("GET", "/investor/dashboard", self.vip_token)
        
        if not success:
            self.log_test("Investor Dashboard", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Investor Dashboard", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Verify required fields
        required_fields = ["portfolio", "performance_history", "withdrawals", "notices"]
        missing_fields = []
        
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        if missing_fields:
            self.log_test("Investor Dashboard Structure", False, f"Missing fields: {missing_fields}")
            return False
        
        # Verify portfolio structure
        portfolio = data.get("portfolio", {})
        portfolio_fields = ["portfolio_id", "invested_capital", "current_equity", "total_return_pct", "account_status"]
        missing_portfolio_fields = []
        
        for field in portfolio_fields:
            if field not in portfolio:
                missing_portfolio_fields.append(field)
        
        if missing_portfolio_fields:
            self.log_test("Portfolio Structure", False, f"Missing portfolio fields: {missing_portfolio_fields}")
            return False
        
        # Store portfolio_id for later tests
        self.portfolio_id = portfolio.get("portfolio_id")
        
        self.log_test("Investor Dashboard", True, f"Dashboard retrieved with portfolio_id: {self.portfolio_id}")
        self.log_test("Portfolio Structure", True, "All required portfolio fields present")
        
        return True
    
    def test_withdrawal_request(self) -> bool:
        """Step 4: Test Withdrawal Request"""
        print("\n=== STEP 4: Test Withdrawal Request ===")
        
        if not self.vip_token:
            self.log_test("Withdrawal Request", False, "VIP user not logged in")
            return False
        
        withdrawal_data = {
            "amount": 100,
            "notes": "Test withdrawal request"
        }
        
        success, response = self.make_request("POST", "/investor/withdraw", self.vip_token, withdrawal_data)
        
        if not success:
            self.log_test("Withdrawal Request", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Withdrawal Request", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Verify response structure
        if "withdrawal_id" not in data:
            self.log_test("Withdrawal Response", False, "Missing withdrawal_id in response")
            return False
        
        if "whatsapp_notify_url" not in data:
            self.log_test("Withdrawal Response", False, "Missing whatsapp_notify_url in response")
            return False
        
        self.withdrawal_id = data.get("withdrawal_id")
        self.log_test("Withdrawal Request", True, f"Withdrawal created with ID: {self.withdrawal_id}")
        
        return True
    
    def test_admin_portfolio_management(self) -> bool:
        """Step 5: Test Admin Portfolio Management"""
        print("\n=== STEP 5: Test Admin Portfolio Management ===")
        
        if not self.admin_token:
            self.log_test("Admin Portfolio Management", False, "Admin not logged in")
            return False
        
        success, response = self.make_request("GET", "/admin/investor/portfolios", self.admin_token)
        
        if not success:
            self.log_test("Get All Portfolios", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Get All Portfolios", False, f"Status {response.status_code}: {response.text}")
            return False
        
        portfolios = response.json()
        self.log_test("Get All Portfolios", True, f"Retrieved {len(portfolios)} portfolios")
        
        # Find our test portfolio
        if not self.portfolio_id and portfolios:
            self.portfolio_id = portfolios[0].get("portfolio_id")
        
        if not self.portfolio_id:
            self.log_test("Find Test Portfolio", False, "No portfolio_id available for testing")
            return False
        
        self.log_test("Find Test Portfolio", True, f"Using portfolio_id: {self.portfolio_id}")
        return True
    
    def test_admin_performance_entry(self) -> bool:
        """Step 6: Test Admin Performance Entry"""
        print("\n=== STEP 6: Test Admin Performance Entry ===")
        
        if not self.admin_token or not self.portfolio_id:
            self.log_test("Admin Performance Entry", False, "Admin not logged in or no portfolio_id")
            return False
        
        performance_data = {
            "month": "2025-01",
            "return_percentage": 5.5,
            "notes": "January performance"
        }
        
        success, response = self.make_request("POST", f"/admin/investor/portfolio/{self.portfolio_id}/performance", 
                                            self.admin_token, performance_data)
        
        if not success:
            self.log_test("Add Performance Entry", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Add Performance Entry", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        self.log_test("Add Performance Entry", True, f"Performance entry added: {data.get('message', 'Success')}")
        
        return True
    
    def test_admin_withdrawal_management(self) -> bool:
        """Step 7: Test Admin Withdrawal Management"""
        print("\n=== STEP 7: Test Admin Withdrawal Management ===")
        
        if not self.admin_token:
            self.log_test("Admin Withdrawal Management", False, "Admin not logged in")
            return False
        
        # Get all withdrawals
        success, response = self.make_request("GET", "/admin/investor/withdrawals", self.admin_token)
        
        if not success:
            self.log_test("Get All Withdrawals", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Get All Withdrawals", False, f"Status {response.status_code}: {response.text}")
            return False
        
        withdrawals = response.json()
        self.log_test("Get All Withdrawals", True, f"Retrieved {len(withdrawals)} withdrawals")
        
        # Find our test withdrawal
        test_withdrawal = None
        if self.withdrawal_id:
            for withdrawal in withdrawals:
                if withdrawal.get("withdrawal_id") == self.withdrawal_id:
                    test_withdrawal = withdrawal
                    break
        
        if not test_withdrawal and withdrawals:
            # Use the first withdrawal if we can't find our specific one
            test_withdrawal = withdrawals[0]
            self.withdrawal_id = test_withdrawal.get("withdrawal_id")
        
        if not test_withdrawal:
            self.log_test("Find Test Withdrawal", False, "No withdrawal found for testing")
            return False
        
        self.log_test("Find Test Withdrawal", True, f"Found withdrawal with status: {test_withdrawal.get('status')}")
        
        # Approve the withdrawal
        success, response = self.make_request("PUT", f"/admin/investor/withdrawal/{self.withdrawal_id}?status=approved", 
                                            self.admin_token)
        
        if not success:
            self.log_test("Approve Withdrawal", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Approve Withdrawal", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        self.log_test("Approve Withdrawal", True, f"Withdrawal approved: {data.get('message', 'Success')}")
        
        return True
    
    def test_fund_notice_creation(self) -> bool:
        """Step 8: Test Fund Notice Creation"""
        print("\n=== STEP 8: Test Fund Notice Creation ===")
        
        if not self.admin_token:
            self.log_test("Fund Notice Creation", False, "Admin not logged in")
            return False
        
        notice_data = {
            "title": "Test Notice",
            "content": "This is a test announcement for investors.",
            "notice_type": "general"
        }
        
        success, response = self.make_request("POST", "/admin/investor/notice", self.admin_token, notice_data)
        
        if not success:
            self.log_test("Create Fund Notice", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Create Fund Notice", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        self.notice_id = data.get("notice_id")
        self.log_test("Create Fund Notice", True, f"Notice created with ID: {self.notice_id}")
        
        return True
    
    def test_dashboard_shows_updates(self) -> bool:
        """Step 9: Verify Dashboard Shows Updates"""
        print("\n=== STEP 9: Verify Dashboard Shows Updates ===")
        
        if not self.vip_token:
            self.log_test("Dashboard Updates Verification", False, "VIP user not logged in")
            return False
        
        success, response = self.make_request("GET", "/investor/dashboard", self.vip_token)
        
        if not success:
            self.log_test("Dashboard Updates Check", False, f"Request failed: {response}")
            return False
        
        if response.status_code != 200:
            self.log_test("Dashboard Updates Check", False, f"Status {response.status_code}: {response.text}")
            return False
        
        data = response.json()
        
        # Check if performance_history is populated
        performance_history = data.get("performance_history", [])
        if len(performance_history) > 0:
            self.log_test("Performance History Updated", True, f"Found {len(performance_history)} performance entries")
        else:
            self.log_test("Performance History Updated", False, "No performance history found")
        
        # Check if withdrawals are populated
        withdrawals = data.get("withdrawals", [])
        if len(withdrawals) > 0:
            self.log_test("Withdrawals Updated", True, f"Found {len(withdrawals)} withdrawal entries")
        else:
            self.log_test("Withdrawals Updated", False, "No withdrawals found")
        
        # Check if notices are populated
        notices = data.get("notices", [])
        if len(notices) > 0:
            self.log_test("Notices Updated", True, f"Found {len(notices)} notice entries")
        else:
            self.log_test("Notices Updated", False, "No notices found")
        
        # Overall verification
        updates_found = len(performance_history) > 0 or len(withdrawals) > 0 or len(notices) > 0
        self.log_test("Dashboard Shows Updates", updates_found, 
                     f"Performance: {len(performance_history)}, Withdrawals: {len(withdrawals)}, Notices: {len(notices)}")
        
        return updates_found
    
    def run_all_tests(self):
        """Run all investor dashboard tests in sequence"""
        print("🚀 Starting Investor Dashboard System End-to-End Testing")
        print("=" * 60)
        
        # Login both users first
        admin_login_success = self.login_admin()
        vip_login_success = self.login_vip_user()
        
        if not admin_login_success or not vip_login_success:
            print("\n❌ CRITICAL: Login failed. Cannot proceed with tests.")
            return False
        
        # Run all test steps
        test_methods = [
            self.test_fund_application_status,
            self.test_investor_status_check,
            self.test_investor_dashboard,
            self.test_withdrawal_request,
            self.test_admin_portfolio_management,
            self.test_admin_performance_entry,
            self.test_admin_withdrawal_management,
            self.test_fund_notice_creation,
            self.test_dashboard_shows_updates
        ]
        
        all_passed = True
        for test_method in test_methods:
            try:
                result = test_method()
                if not result:
                    all_passed = False
            except Exception as e:
                self.log_test(test_method.__name__, False, f"Exception: {str(e)}")
                all_passed = False
        
        # Print summary
        self.print_summary()
        return all_passed
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        print("\n📋 DETAILED RESULTS:")
        for result in self.test_results:
            print(f"{result['status']}: {result['test']}")
            if result['details']:
                print(f"   └─ {result['details']}")
        
        if passed == total:
            print("\n🎉 ALL TESTS PASSED! Investor Dashboard System is working correctly.")
        else:
            print(f"\n⚠️  {total - passed} TESTS FAILED. Please review the failures above.")

def main():
    """Main test execution"""
    tester = InvestorDashboardTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()