#!/usr/bin/env python3
"""
Supabase Admin Signals CRUD Testing for Swift FX Signals App
Testing the exact CRUD operations as requested in the review.

Test Sequence:
1. LOGIN → Admin authentication with access_token
2. READ signals → Should return 11 signals
3. CREATE signal → Create new signal and get ID
4. UPDATE signal → Update signal state to active  
5. DELETE signal → Delete signal and verify count back to 11
"""

import requests
import json
from typing import Dict, Any, Optional
from datetime import datetime


class SupabaseSignalsCrudTester:
    def __init__(self):
        # Supabase Configuration from review request
        self.base_url = "https://hrzghlqcfccnmgcipxxo.supabase.co"
        self.anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"
        
        # Admin credentials from review request
        self.admin_email = "admin@swiftfx.app"
        self.admin_password = "Admin123!@#"
        self.admin_user_id = "e87eb3a8-0b34-420f-96bc-903f8b9a921d"
        
        # Session tracking
        self.access_token = None
        self.new_signal_id = None
        
        # Test results
        self.results = []
        
    def log_result(self, test_name: str, success: bool, details: str, response_data: Any = None):
        """Log test results"""
        result = {
            "test_name": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        
        if response_data and not success:
            print(f"   Response: {json.dumps(response_data, indent=2)}")

    def make_request(self, method: str, endpoint: str, headers: Dict[str, str] = None, data: Dict[str, Any] = None) -> tuple[bool, Dict[str, Any], int]:
        """Make HTTP request and handle errors"""
        try:
            url = f"{self.base_url}{endpoint}"
            
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=10)
            elif method.upper() == "PATCH":
                response = requests.patch(url, headers=headers, json=data, timeout=10)
            elif method.upper() == "DELETE":
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                return False, {"error": f"Unsupported method: {method}"}, 0
            
            # Handle response
            if response.headers.get('content-type', '').startswith('application/json'):
                try:
                    response_data = response.json()
                except:
                    response_data = {"text": response.text, "status_code": response.status_code}
            else:
                response_data = {"text": response.text, "status_code": response.status_code}
            
            success = response.status_code in [200, 201, 204]
            return success, response_data, response.status_code
            
        except requests.exceptions.Timeout:
            return False, {"error": "Request timeout"}, 0
        except requests.exceptions.ConnectionError:
            return False, {"error": "Connection error"}, 0
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_1_admin_login(self):
        """Test 1: LOGIN → Admin authentication"""
        print("\n🔐 Testing Admin Login...")
        
        headers = {
            "apikey": self.anon_key,
            "Content-Type": "application/json"
        }
        
        data = {
            "email": self.admin_email,
            "password": self.admin_password
        }
        
        success, response_data, status_code = self.make_request(
            "POST", 
            "/auth/v1/token?grant_type=password", 
            headers, 
            data
        )
        
        if success and "access_token" in response_data:
            self.access_token = response_data["access_token"]
            self.log_result(
                "Admin Login", 
                True, 
                f"Successfully authenticated admin. Status: {status_code}",
                {"token_preview": self.access_token[:20] + "...", "user_id": self.admin_user_id}
            )
        else:
            self.log_result(
                "Admin Login", 
                False, 
                f"Failed to authenticate admin. Status: {status_code}",
                response_data
            )

    def test_2_read_signals(self):
        """Test 2: READ signals → Should return 11 signals"""
        print("\n📊 Testing Read Signals...")
        
        if not self.access_token:
            self.log_result(
                "Read Signals",
                False,
                "No access token available. Login must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}"
        }
        
        success, response_data, status_code = self.make_request(
            "GET",
            "/rest/v1/signals?select=*&order=created_at.desc",
            headers
        )
        
        if success:
            signals = response_data if isinstance(response_data, list) else []
            signal_count = len(signals)
            
            if signal_count == 11:
                self.log_result(
                    "Read Signals",
                    True,
                    f"Successfully retrieved {signal_count} signals (expected 11). Status: {status_code}",
                    {"signals_count": signal_count}
                )
            else:
                self.log_result(
                    "Read Signals",
                    False,
                    f"Retrieved {signal_count} signals, expected 11. Status: {status_code}",
                    {"signals_count": signal_count, "signals": signals[:2]}  # Show first 2 for debugging
                )
        else:
            self.log_result(
                "Read Signals",
                False,
                f"Failed to retrieve signals. Status: {status_code}",
                response_data
            )

    def test_3_create_signal(self):
        """Test 3: CREATE signal → Create new test signal"""
        print("\n➕ Testing Create Signal...")
        
        if not self.access_token:
            self.log_result(
                "Create Signal",
                False,
                "No access token available. Login must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        # Create signal data as specified in review request
        signal_data = {
            "pair": "BTC/USD",
            "signal_type": "buy",
            "entry_price": 65000,
            "stop_loss": 64000,
            "take_profit_1": 66000,
            "take_profit_2": 67000,
            "take_profit_3": 68000,
            "risk_reward": 1.5,
            "state": "pending",
            "visibility": "premium",
            "analysis": "Test signal from CRUD verification",
            "created_by": self.admin_user_id
        }
        
        success, response_data, status_code = self.make_request(
            "POST",
            "/rest/v1/signals",
            headers,
            signal_data
        )
        
        if success and status_code == 201:
            # Extract new signal ID
            if isinstance(response_data, list) and len(response_data) > 0:
                new_signal = response_data[0]
                self.new_signal_id = new_signal.get("id")
                
                self.log_result(
                    "Create Signal",
                    True,
                    f"Successfully created new signal. Status: {status_code}, ID: {self.new_signal_id}",
                    {"signal_id": self.new_signal_id, "pair": signal_data["pair"]}
                )
            else:
                self.log_result(
                    "Create Signal",
                    False,
                    f"Signal created but no ID returned. Status: {status_code}",
                    response_data
                )
        else:
            self.log_result(
                "Create Signal",
                False,
                f"Failed to create signal. Status: {status_code}",
                response_data
            )

    def test_4_update_signal(self):
        """Test 4: UPDATE signal → Update signal state to active"""
        print("\n✏️ Testing Update Signal...")
        
        if not self.access_token:
            self.log_result(
                "Update Signal",
                False,
                "No access token available. Login must pass first.",
                None
            )
            return
            
        if not self.new_signal_id:
            self.log_result(
                "Update Signal",
                False,
                "No signal ID available. Create signal test must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        # Update data as specified in review request
        update_data = {
            "state": "active",
            "activated_at": "2025-02-06T00:00:00Z"
        }
        
        success, response_data, status_code = self.make_request(
            "PATCH",
            f"/rest/v1/signals?id=eq.{self.new_signal_id}",
            headers,
            update_data
        )
        
        if success and status_code == 200:
            self.log_result(
                "Update Signal",
                True,
                f"Successfully updated signal to active state. Status: {status_code}",
                {"signal_id": self.new_signal_id, "new_state": "active"}
            )
        elif status_code == 204:
            # No content response is also valid for PATCH
            self.log_result(
                "Update Signal",
                True,
                f"Successfully updated signal to active state. Status: {status_code} (No Content)",
                {"signal_id": self.new_signal_id, "new_state": "active"}
            )
        else:
            self.log_result(
                "Update Signal",
                False,
                f"Failed to update signal. Status: {status_code}",
                response_data
            )

    def test_5_delete_signal(self):
        """Test 5: DELETE signal → Delete test signal"""
        print("\n🗑️ Testing Delete Signal...")
        
        if not self.access_token:
            self.log_result(
                "Delete Signal",
                False,
                "No access token available. Login must pass first.",
                None
            )
            return
            
        if not self.new_signal_id:
            self.log_result(
                "Delete Signal",
                False,
                "No signal ID available. Create signal test must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}"
        }
        
        success, response_data, status_code = self.make_request(
            "DELETE",
            f"/rest/v1/signals?id=eq.{self.new_signal_id}",
            headers
        )
        
        if success and status_code == 204:
            self.log_result(
                "Delete Signal",
                True,
                f"Successfully deleted signal. Status: {status_code}",
                {"signal_id": self.new_signal_id}
            )
        else:
            self.log_result(
                "Delete Signal",
                False,
                f"Failed to delete signal. Status: {status_code}",
                response_data
            )

    def test_6_verify_signal_count(self):
        """Test 6: Verify signal count is back to 11 after deletion"""
        print("\n🔍 Testing Verify Signal Count...")
        
        if not self.access_token:
            self.log_result(
                "Verify Signal Count",
                False,
                "No access token available. Login must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}"
        }
        
        success, response_data, status_code = self.make_request(
            "GET",
            "/rest/v1/signals?select=*&order=created_at.desc",
            headers
        )
        
        if success:
            signals = response_data if isinstance(response_data, list) else []
            signal_count = len(signals)
            
            if signal_count == 11:
                self.log_result(
                    "Verify Signal Count",
                    True,
                    f"Signal count correctly returned to {signal_count} after deletion. Status: {status_code}",
                    {"signals_count": signal_count}
                )
            else:
                self.log_result(
                    "Verify Signal Count",
                    False,
                    f"Signal count is {signal_count}, expected 11 after deletion. Status: {status_code}",
                    {"signals_count": signal_count}
                )
        else:
            self.log_result(
                "Verify Signal Count",
                False,
                f"Failed to retrieve signals for count verification. Status: {status_code}",
                response_data
            )

    def run_all_tests(self):
        """Run all Supabase Admin Signals CRUD tests in sequence"""
        print("🚀 Starting Supabase Admin Signals CRUD Tests")
        print("=" * 60)
        
        # Test sequence as specified in review request
        self.test_1_admin_login()
        self.test_2_read_signals()
        self.test_3_create_signal()
        self.test_4_update_signal()
        self.test_5_delete_signal()
        self.test_6_verify_signal_count()
        
        # Summary
        print("\n" + "=" * 60)
        print("📋 SUPABASE ADMIN SIGNALS CRUD TEST SUMMARY")
        print("=" * 60)
        
        passed_tests = [r for r in self.results if r["success"]]
        failed_tests = [r for r in self.results if not r["success"]]
        
        print(f"Total Tests: {len(self.results)}")
        print(f"✅ Passed: {len(passed_tests)}")
        print(f"❌ Failed: {len(failed_tests)}")
        print(f"Success Rate: {len(passed_tests)/len(self.results)*100:.1f}%" if self.results else "0%")
        
        if failed_tests:
            print("\n🔍 FAILED TESTS DETAILS:")
            for test in failed_tests:
                print(f"  • {test['test_name']}: {test['details']}")
        
        return len(passed_tests), len(failed_tests)


def main():
    """Main test execution function"""
    tester = SupabaseSignalsCrudTester()
    passed, failed = tester.run_all_tests()
    
    # Return appropriate exit code
    exit_code = 0 if failed == 0 else 1
    return exit_code


if __name__ == "__main__":
    import sys
    sys.exit(main())