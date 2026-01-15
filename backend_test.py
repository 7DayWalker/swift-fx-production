#!/usr/bin/env python3
"""
Admin RBAC (Role-Based Access Control) System Testing
Test the complete RBAC system with all endpoints and permission enforcement.
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://fundadmin-1.preview.emergentagent.com/api"

# Test credentials - using actual super admin account
SUPER_ADMIN_EMAIL = "ellaniswell@gmail.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin_c4e25774!"

class RBACTester:
    def __init__(self):
        self.session = requests.Session()
        self.super_admin_token = None
        self.signal_admin_token = None
        self.created_admin_id = None
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    def make_request(self, method: str, endpoint: str, token: str = None, **kwargs) -> requests.Response:
        """Make HTTP request with optional auth token"""
        url = f"{BASE_URL}{endpoint}"
        headers = kwargs.get('headers', {})
        
        if token:
            headers['Authorization'] = f"Bearer {token}"
            
        kwargs['headers'] = headers
        
        try:
            response = self.session.request(method, url, **kwargs)
            return response
        except Exception as e:
            print(f"Request failed: {e}")
            return None
            
    def test_1_super_admin_login(self):
        """Step 1: Test Super Admin Login"""
        print("\n=== Step 1: Super Admin Login ===")
        
        response = self.make_request(
            'POST', 
            '/auth/login',
            json={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            }
        )
        
        if response and response.status_code == 200:
            data = response.json()
            self.super_admin_token = data.get('token')
            user_info = data.get('user', {})
            
            if self.super_admin_token and user_info.get('role') == 'admin':
                self.log_test("Super Admin Login", True, f"Logged in as {user_info.get('email')}")
                return True
            else:
                self.log_test("Super Admin Login", False, "Invalid token or role")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Super Admin Login", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_2_rbac_me_endpoint(self):
        """Step 2: Test RBAC Me Endpoint"""
        print("\n=== Step 2: Test RBAC Me Endpoint ===")
        
        response = self.make_request('GET', '/admin/rbac/me', token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            
            # Verify required fields
            required_fields = ['admin_role', 'is_super_admin', 'permissions']
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                admin_role = data.get('admin_role')
                is_super_admin = data.get('is_super_admin')
                permissions = data.get('permissions', {})
                
                if admin_role == 'super_admin' and is_super_admin and permissions:
                    self.log_test("RBAC Me Endpoint", True, 
                                f"Role: {admin_role}, Super Admin: {is_super_admin}, Permissions: {len(permissions)} resources")
                    return True
                else:
                    self.log_test("RBAC Me Endpoint", False, 
                                f"Invalid data - Role: {admin_role}, Super Admin: {is_super_admin}")
                    return False
            else:
                self.log_test("RBAC Me Endpoint", False, f"Missing fields: {missing_fields}")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("RBAC Me Endpoint", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_3_roles_list(self):
        """Step 3: Test Roles List"""
        print("\n=== Step 3: Test Roles List ===")
        
        response = self.make_request('GET', '/admin/rbac/roles', token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            roles = data.get('roles', [])
            
            expected_roles = ['super_admin', 'signal_admin', 'fund_admin', 'account_manager', 'customer_support']
            found_roles = [role.get('role') for role in roles]
            
            if len(roles) == 5 and all(role in found_roles for role in expected_roles):
                # Verify each role has permissions
                all_have_permissions = all(role.get('permissions') is not None for role in roles)
                
                if all_have_permissions:
                    self.log_test("Roles List", True, f"Found all 5 roles: {found_roles}")
                    return True
                else:
                    self.log_test("Roles List", False, "Some roles missing permissions")
                    return False
            else:
                self.log_test("Roles List", False, f"Expected 5 roles, found {len(roles)}: {found_roles}")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Roles List", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_4_list_admins(self):
        """Step 4: Test List Admins (Super Admin Only)"""
        print("\n=== Step 4: Test List Admins ===")
        
        response = self.make_request('GET', '/admin/rbac/admins', token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            admins = data.get('admins', [])
            total = data.get('total', 0)
            
            if isinstance(admins, list) and total >= 0:
                # Check if our super admin is in the list
                super_admin_found = any(admin.get('email') == SUPER_ADMIN_EMAIL for admin in admins)
                
                if super_admin_found:
                    self.log_test("List Admins", True, f"Found {total} admin(s), including super admin")
                    return True
                else:
                    self.log_test("List Admins", False, f"Super admin not found in list of {total} admins")
                    return False
            else:
                self.log_test("List Admins", False, "Invalid response format")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("List Admins", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_5_create_new_admin(self):
        """Step 5: Test Create New Admin"""
        print("\n=== Step 5: Test Create New Admin ===")
        
        # Use a unique email with timestamp to avoid conflicts
        import time
        timestamp = int(time.time())
        
        admin_data = {
            "email": f"signaltest{timestamp}@swiftfx.com",
            "name": "Signal Admin Test",
            "password": "TestPassword123!",
            "admin_role": "signal_admin"
        }
        
        try:
            response = self.make_request('POST', '/admin/rbac/admins', token=self.super_admin_token, 
                                       json=admin_data, timeout=30)
            
            if response and response.status_code == 200:
                data = response.json()
                
                if data.get('success') and data.get('user_id'):
                    self.created_admin_id = data.get('user_id')
                    self.log_test("Create New Admin", True, f"Created admin with ID: {self.created_admin_id}")
                    return True
                else:
                    self.log_test("Create New Admin", False, f"Success: {data.get('success')}, User ID: {data.get('user_id')}")
                    return False
            else:
                error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
                self.log_test("Create New Admin", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
                return False
        except Exception as e:
            self.log_test("Create New Admin", False, f"Exception: {str(e)}")
            return False
            
    def test_6_update_admin_role(self):
        """Step 6: Test Update Admin Role"""
        print("\n=== Step 6: Test Update Admin Role ===")
        
        if not self.created_admin_id:
            self.log_test("Update Admin Role", False, "No admin ID from previous test")
            return False
            
        update_data = {
            "admin_role": "fund_admin"
        }
        
        response = self.make_request('PUT', f'/admin/rbac/admins/{self.created_admin_id}', 
                                   token=self.super_admin_token, json=update_data)
        
        if response and response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                self.log_test("Update Admin Role", True, "Successfully updated admin role to fund_admin")
                return True
            else:
                self.log_test("Update Admin Role", False, f"Success: {data.get('success')}")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Update Admin Role", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_7_audit_logs(self):
        """Step 7: Test Audit Logs (Super Admin Only)"""
        print("\n=== Step 7: Test Audit Logs ===")
        
        response = self.make_request('GET', '/admin/rbac/audit-logs', token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            logs = data.get('logs', [])
            total = data.get('total', 0)
            
            if isinstance(logs, list):
                # Check if we have logs from previous actions
                admin_actions = [log for log in logs if log.get('resource_type') == 'admin']
                
                self.log_test("Audit Logs", True, f"Retrieved {total} audit logs, {len(admin_actions)} admin actions")
                return True
            else:
                self.log_test("Audit Logs", False, "Invalid response format")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Audit Logs", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_8_admin_notifications(self):
        """Step 8: Test Admin Notifications"""
        print("\n=== Step 8: Test Admin Notifications ===")
        
        response = self.make_request('GET', '/admin/notifications', token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            notifications = data.get('notifications', [])
            total = data.get('total', 0)
            
            if isinstance(notifications, list):
                self.log_test("Admin Notifications", True, f"Retrieved {total} notifications")
                return True
            else:
                self.log_test("Admin Notifications", False, "Invalid response format")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Admin Notifications", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_9_permission_enforcement(self):
        """Step 9: Test Permission Enforcement"""
        print("\n=== Step 9: Test Permission Enforcement ===")
        
        # First, login as the signal admin we created
        if not self.created_admin_id:
            self.log_test("Permission Enforcement - Login", False, "No signal admin created")
            return False
            
        # Login as signal admin
        response = self.make_request(
            'POST', 
            '/auth/login',
            json={
                "email": "signaltest@swiftfx.com",
                "password": "TestPassword123!"
            }
        )
        
        if response and response.status_code == 200:
            data = response.json()
            signal_admin_token = data.get('token')
            
            if signal_admin_token:
                self.log_test("Permission Enforcement - Login", True, "Signal admin logged in successfully")
                
                # Test 1: Try to access fund applications (should be blocked)
                fund_response = self.make_request('GET', '/admin/fund/applications', token=signal_admin_token)
                
                if fund_response and fund_response.status_code == 403:
                    self.log_test("Permission Enforcement - Fund Access Blocked", True, "Signal admin correctly blocked from fund applications")
                    fund_blocked = True
                else:
                    self.log_test("Permission Enforcement - Fund Access Blocked", False, 
                                f"Expected 403, got {fund_response.status_code if fund_response else 'None'}")
                    fund_blocked = False
                
                # Test 2: Try to access signals (should work)
                signals_response = self.make_request('GET', '/signals', token=signal_admin_token)
                
                if signals_response and signals_response.status_code == 200:
                    self.log_test("Permission Enforcement - Signal Access Allowed", True, "Signal admin can access signals")
                    signal_allowed = True
                else:
                    self.log_test("Permission Enforcement - Signal Access Allowed", False, 
                                f"Expected 200, got {signals_response.status_code if signals_response else 'None'}")
                    signal_allowed = False
                
                return fund_blocked and signal_allowed
            else:
                self.log_test("Permission Enforcement - Login", False, "No token received")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Permission Enforcement - Login", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def test_10_protected_super_admin(self):
        """Step 10: Test Protected Super Admin"""
        print("\n=== Step 10: Test Protected Super Admin ===")
        
        # Try to change role of protected super admin to non-super admin
        # First, get the super admin's user ID
        response = self.make_request('GET', '/admin/rbac/admins', token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            admins = data.get('admins', [])
            
            # Find the super admin
            super_admin = None
            for admin in admins:
                if admin.get('email') == SUPER_ADMIN_EMAIL and admin.get('admin_role') == 'super_admin':
                    super_admin = admin
                    break
            
            if super_admin:
                super_admin_id = super_admin.get('user_id')
                
                # Try to downgrade the super admin
                update_data = {
                    "admin_role": "signal_admin"
                }
                
                downgrade_response = self.make_request('PUT', f'/admin/rbac/admins/{super_admin_id}', 
                                                     token=self.super_admin_token, json=update_data)
                
                if downgrade_response and downgrade_response.status_code == 403:
                    self.log_test("Protected Super Admin", True, "Protected super admin cannot be downgraded (403 Forbidden)")
                    return True
                else:
                    self.log_test("Protected Super Admin", False, 
                                f"Expected 403, got {downgrade_response.status_code if downgrade_response else 'None'}")
                    return False
            else:
                self.log_test("Protected Super Admin", False, "Super admin not found in admin list")
                return False
        else:
            self.log_test("Protected Super Admin", False, "Could not retrieve admin list")
            return False
            
    def test_11_delete_admin(self):
        """Step 11: Test Delete Admin"""
        print("\n=== Step 11: Test Delete Admin ===")
        
        if not self.created_admin_id:
            self.log_test("Delete Admin", False, "No admin ID to delete")
            return False
            
        response = self.make_request('DELETE', f'/admin/rbac/admins/{self.created_admin_id}', 
                                   token=self.super_admin_token)
        
        if response and response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                self.log_test("Delete Admin", True, "Successfully deleted admin account")
                return True
            else:
                self.log_test("Delete Admin", False, f"Success: {data.get('success')}")
                return False
        else:
            error_msg = response.json().get('detail', 'Unknown error') if response else "No response"
            self.log_test("Delete Admin", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
            return False
            
    def run_all_tests(self):
        """Run all RBAC tests in sequence"""
        print("🚀 Starting Admin RBAC System Testing")
        print("=" * 50)
        
        tests = [
            self.test_1_super_admin_login,
            self.test_2_rbac_me_endpoint,
            self.test_3_roles_list,
            self.test_4_list_admins,
            self.test_5_create_new_admin,
            self.test_6_update_admin_role,
            self.test_7_audit_logs,
            self.test_8_admin_notifications,
            self.test_9_permission_enforcement,
            self.test_10_protected_super_admin,
            self.test_11_delete_admin,
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed += 1
            except Exception as e:
                print(f"❌ FAIL: {test.__name__} - Exception: {e}")
        
        print("\n" + "=" * 50)
        print(f"🏁 RBAC Testing Complete: {passed}/{total} tests passed")
        
        if passed == total:
            print("✅ ALL TESTS PASSED - Admin RBAC System is working correctly!")
        else:
            print(f"❌ {total - passed} TESTS FAILED - Issues found in RBAC system")
            
        return passed == total

def main():
    """Main test execution"""
    tester = RBACTester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 Admin RBAC System: FULLY FUNCTIONAL")
        sys.exit(0)
    else:
        print("\n💥 Admin RBAC System: ISSUES DETECTED")
        sys.exit(1)

if __name__ == "__main__":
    main()