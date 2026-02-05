#!/usr/bin/env python3
"""
Admin Withdrawal Management System Testing
Testing the complete withdrawal management flow as requested in the review.
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://postgres-transition.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@swiftfx.com"
ADMIN_PASSWORD = "adminpassword"

class WithdrawalManagementTester:
    def __init__(self):
        self.admin_token = None
        self.test_results = []
        self.withdrawal_id = None
        self.investor_user_id = None
        self.investor_token = None
        
    def log_test(self, test_name, success, message, response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if message:
            print(f"   {message}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "response": response_data
        })
    
    def admin_login(self):
        """Step 0: Login as Admin"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                is_admin = data.get("user", {}).get("is_admin", False)
                
                if self.admin_token and is_admin:
                    self.log_test("Admin Login", True, f"Admin logged in successfully")
                    return True
                else:
                    self.log_test("Admin Login", False, f"User is not admin or no token received", data)
                    return False
            else:
                self.log_test("Admin Login", False, f"Login failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Admin Login", False, f"Exception during login: {str(e)}")
            return False
    
    def test_list_all_withdrawals(self):
        """Step 1: List All Withdrawals"""
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{BASE_URL}/admin/investor/withdrawals", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                withdrawals = data.get("withdrawals", [])
                total = data.get("total", 0)
                
                self.log_test("List All Withdrawals", True, 
                             f"Retrieved {total} withdrawals successfully. Response contains 'withdrawals' array.")
                
                # Store a withdrawal ID for later testing if available
                if withdrawals:
                    self.withdrawal_id = withdrawals[0].get("withdrawal_id")
                    self.investor_user_id = withdrawals[0].get("user_id")
                    print(f"   Found withdrawal ID: {self.withdrawal_id} for user: {self.investor_user_id}")
                
                return True
            else:
                self.log_test("List All Withdrawals", False, 
                             f"Failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("List All Withdrawals", False, f"Exception: {str(e)}")
            return False
    
    def test_filter_by_status_pending(self):
        """Step 2: Filter by Status - Pending"""
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{BASE_URL}/admin/investor/withdrawals?status=pending", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                withdrawals = data.get("withdrawals", [])
                
                # Verify all returned withdrawals have pending status
                all_pending = all(w.get("status") == "pending" for w in withdrawals)
                
                if all_pending:
                    self.log_test("Filter by Status (Pending)", True, 
                                 f"Retrieved {len(withdrawals)} pending withdrawals. All have status='pending'.")
                    
                    # Update withdrawal_id to a pending one if available
                    if withdrawals:
                        self.withdrawal_id = withdrawals[0].get("withdrawal_id")
                        self.investor_user_id = withdrawals[0].get("user_id")
                        print(f"   Using pending withdrawal ID: {self.withdrawal_id}")
                else:
                    self.log_test("Filter by Status (Pending)", False, 
                                 "Some withdrawals don't have pending status", withdrawals)
                
                return True
            else:
                self.log_test("Filter by Status (Pending)", False, 
                             f"Failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Filter by Status (Pending)", False, f"Exception: {str(e)}")
            return False
    
    def test_filter_by_status_approved(self):
        """Step 2b: Filter by Status - Approved"""
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            response = requests.get(f"{BASE_URL}/admin/investor/withdrawals?status=approved", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                withdrawals = data.get("withdrawals", [])
                
                # Verify all returned withdrawals have approved status
                all_approved = all(w.get("status") == "approved" for w in withdrawals)
                
                if all_approved:
                    self.log_test("Filter by Status (Approved)", True, 
                                 f"Retrieved {len(withdrawals)} approved withdrawals. Filtering works correctly.")
                else:
                    self.log_test("Filter by Status (Approved)", False, 
                                 "Some withdrawals don't have approved status", withdrawals)
                
                return True
            else:
                self.log_test("Filter by Status (Approved)", False, 
                             f"Failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Filter by Status (Approved)", False, f"Exception: {str(e)}")
            return False
    
    def test_process_withdrawal_approve(self):
        """Step 3: Process a Withdrawal (Approve)"""
        if not self.withdrawal_id:
            self.log_test("Process Withdrawal (Approve)", False, 
                         "No withdrawal ID available for testing. Skipping.")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            url = f"{BASE_URL}/admin/investor/withdrawal/{self.withdrawal_id}?status=approved&admin_notes=Test%20approval"
            response = requests.put(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success", False)
                message = data.get("message", "")
                
                if success and "approved" in message.lower():
                    self.log_test("Process Withdrawal (Approve)", True, 
                                 f"Withdrawal approved successfully. Message: {message}")
                    return True
                else:
                    self.log_test("Process Withdrawal (Approve)", False, 
                                 f"Unexpected response format", data)
                    return False
            else:
                self.log_test("Process Withdrawal (Approve)", False, 
                             f"Failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Process Withdrawal (Approve)", False, f"Exception: {str(e)}")
            return False
    
    def test_mark_as_paid(self):
        """Step 4: Mark as Paid"""
        if not self.withdrawal_id:
            self.log_test("Mark as Paid", False, 
                         "No withdrawal ID available for testing. Skipping.")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.admin_token}"}
            url = f"{BASE_URL}/admin/investor/withdrawal/{self.withdrawal_id}?status=paid"
            response = requests.put(url, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success", False)
                message = data.get("message", "")
                
                if success and "paid" in message.lower():
                    self.log_test("Mark as Paid", True, 
                                 f"Withdrawal marked as paid successfully. Message: {message}")
                    return True
                else:
                    self.log_test("Mark as Paid", False, 
                                 f"Unexpected response format", data)
                    return False
            else:
                self.log_test("Mark as Paid", False, 
                             f"Failed with status {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Mark as Paid", False, f"Exception: {str(e)}")
            return False
    
    def get_investor_token(self):
        """Get investor token for dashboard sync verification"""
        if not self.investor_user_id:
            return False
        
        # Try to find a VIP test user to login as
        try:
            # Try common VIP test credentials
            test_credentials = [
                {"email": "vip@test.com", "password": "password"},
                {"email": "investor@test.com", "password": "password"},
                {"email": "test@vip.com", "password": "password"},
                {"email": "fundtest@test.com", "password": "password"}
            ]
            
            for creds in test_credentials:
                response = requests.post(f"{BASE_URL}/auth/login", json=creds)
                if response.status_code == 200:
                    data = response.json()
                    token = data.get("token")
                    user_id = data.get("user", {}).get("user_id")
                    
                    if token and user_id == self.investor_user_id:
                        self.investor_token = token
                        print(f"   Found matching investor token for user {user_id}")
                        return True
            
            return False
            
        except Exception as e:
            print(f"   Could not get investor token: {str(e)}")
            return False
    
    def test_verify_dashboard_sync(self):
        """Step 5: Verify User Dashboard Sync"""
        if not self.investor_user_id:
            self.log_test("Verify Dashboard Sync", False, 
                         "No investor user ID available. Cannot verify dashboard sync.")
            return False
        
        try:
            # Check if the user is an admin user (who can access investor dashboard)
            if "admin" in self.investor_user_id:
                # Admin users can access investor dashboard directly
                headers = {"Authorization": f"Bearer {self.admin_token}"}
                response = requests.get(f"{BASE_URL}/investor/dashboard", headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    withdrawals = data.get("withdrawals", [])
                    
                    # Find our withdrawal in the dashboard
                    our_withdrawal = None
                    for w in withdrawals:
                        if w.get("withdrawal_id") == self.withdrawal_id:
                            our_withdrawal = w
                            break
                    
                    if our_withdrawal:
                        status = our_withdrawal.get("status")
                        if status == "paid":
                            self.log_test("Verify Dashboard Sync", True, 
                                         f"Dashboard sync verified. Withdrawal {self.withdrawal_id} shows status: {status}")
                            return True
                        else:
                            self.log_test("Verify Dashboard Sync", False, 
                                         f"Withdrawal status not updated. Expected: paid, Got: {status}")
                            return False
                    else:
                        self.log_test("Verify Dashboard Sync", False, 
                                     f"Withdrawal {self.withdrawal_id} not found in dashboard withdrawals array")
                        return False
                else:
                    self.log_test("Verify Dashboard Sync", False, 
                                 f"Dashboard request failed with status {response.status_code}", response.text)
                    return False
            else:
                # Try to get investor token for regular users
                if not self.get_investor_token():
                    self.log_test("Verify Dashboard Sync", False, 
                                 "Could not authenticate as the investor user. Skipping dashboard sync verification.")
                    return False
                
                headers = {"Authorization": f"Bearer {self.investor_token}"}
                response = requests.get(f"{BASE_URL}/investor/dashboard", headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    withdrawals = data.get("withdrawals", [])
                    
                    # Find our withdrawal in the dashboard
                    our_withdrawal = None
                    for w in withdrawals:
                        if w.get("withdrawal_id") == self.withdrawal_id:
                            our_withdrawal = w
                            break
                    
                    if our_withdrawal:
                        status = our_withdrawal.get("status")
                        if status == "paid":
                            self.log_test("Verify Dashboard Sync", True, 
                                         f"Dashboard sync verified. Withdrawal {self.withdrawal_id} shows status: {status}")
                            return True
                        else:
                            self.log_test("Verify Dashboard Sync", False, 
                                         f"Withdrawal status not updated. Expected: paid, Got: {status}")
                            return False
                    else:
                        self.log_test("Verify Dashboard Sync", False, 
                                     f"Withdrawal {self.withdrawal_id} not found in dashboard withdrawals array")
                        return False
                else:
                    self.log_test("Verify Dashboard Sync", False, 
                                 f"Dashboard request failed with status {response.status_code}", response.text)
                    return False
                
        except Exception as e:
            self.log_test("Verify Dashboard Sync", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run the complete test sequence"""
        print("=" * 80)
        print("ADMIN WITHDRAWAL MANAGEMENT SYSTEM - BACKEND TESTING")
        print("=" * 80)
        print()
        
        # Step 0: Admin Login
        if not self.admin_login():
            print("❌ CRITICAL: Admin login failed. Cannot proceed with tests.")
            return False
        
        # Step 1: List All Withdrawals
        self.test_list_all_withdrawals()
        
        # Step 2: Filter by Status
        self.test_filter_by_status_pending()
        self.test_filter_by_status_approved()
        
        # Step 3: Process a Withdrawal (if any pending exist)
        self.test_process_withdrawal_approve()
        
        # Step 4: Mark as Paid (if any approved exist)
        self.test_mark_as_paid()
        
        # Step 5: Verify User Dashboard Sync
        self.test_verify_dashboard_sync()
        
        # Summary
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Tests Passed: {passed}/{total}")
        print()
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - Admin Withdrawal Management System is working correctly!")
        else:
            print("⚠️  SOME TESTS FAILED - Issues found in Admin Withdrawal Management System")
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return passed == total

if __name__ == "__main__":
    tester = WithdrawalManagementTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)