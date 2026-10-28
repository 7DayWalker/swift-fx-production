#!/usr/bin/env python3
"""
Supabase Backend Integration Testing for Swift FX Signals App
Testing the migration from FastAPI/MongoDB to Supabase/PostgreSQL

Test Scenarios:
1. Auth - Login
2. Profile Fetch (authenticated)  
3. Signals Fetch (authenticated admin)
4. Plans Fetch (anon/public)
5. Signals Fetch (anon)
6. Subscriptions Fetch (authenticated)
"""

import os
import requests
import json
from typing import Dict, Any, Optional
from datetime import datetime


class SupabaseBackendTester:
    def __init__(self):
        # Supabase Configuration (read from environment — never hardcode service_role keys)
        self.base_url = os.environ.get("SUPABASE_URL", "https://hrzghlqcfccnmgcipxxo.supabase.co")
        self.anon_key = os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY", "")
        self.service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        
        # Test credentials
        self.admin_email = os.environ.get("TEST_ADMIN_EMAIL", "admin@swiftfx.app")
        self.admin_password = os.environ.get("TEST_ADMIN_PASSWORD", "")
        
        # Session tracking
        self.access_token = None
        self.user_id = None
        
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

    def make_request(self, method: str, endpoint: str, headers: Dict[str, str] = None, data: Dict[str, Any] = None) -> tuple[bool, Dict[str, Any]]:
        """Make HTTP request and handle errors"""
        try:
            url = f"{self.base_url}{endpoint}"
            
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=10)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=10)
            else:
                return False, {"error": f"Unsupported method: {method}"}
            
            # Handle response
            if response.headers.get('content-type', '').startswith('application/json'):
                response_data = response.json()
            else:
                response_data = {"text": response.text, "status_code": response.status_code}
            
            success = response.status_code in [200, 201]
            return success, response_data
            
        except requests.exceptions.Timeout:
            return False, {"error": "Request timeout"}
        except requests.exceptions.ConnectionError:
            return False, {"error": "Connection error"}
        except Exception as e:
            return False, {"error": str(e)}

    def test_1_auth_login(self):
        """Test 1: Auth - Login with email/password"""
        print("\n🔐 Testing Auth - Login...")
        
        headers = {
            "apikey": self.anon_key,
            "Content-Type": "application/json"
        }
        
        data = {
            "email": self.admin_email,
            "password": self.admin_password,
            "gotrue_meta_security": {}
        }
        
        success, response_data = self.make_request(
            "POST", 
            "/auth/v1/token?grant_type=password", 
            headers, 
            data
        )
        
        if success and "access_token" in response_data:
            self.access_token = response_data["access_token"]
            self.user_id = response_data.get("user", {}).get("id")
            self.log_result(
                "Auth Login", 
                True, 
                f"Successfully logged in admin user. Token obtained.",
                {"token_preview": self.access_token[:20] + "...", "user_id": self.user_id}
            )
        else:
            self.log_result(
                "Auth Login", 
                False, 
                "Failed to login admin user or get access token",
                response_data
            )

    def test_2_profile_fetch_authenticated(self):
        """Test 2: Profile Fetch (authenticated) - Get user profile with admin role"""
        print("\n👤 Testing Profile Fetch (Authenticated)...")
        
        if not self.access_token:
            self.log_result(
                "Profile Fetch (Authenticated)",
                False,
                "No access token available. Login test must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}"
        }
        
        success, response_data = self.make_request(
            "GET",
            f"/rest/v1/profiles?id=eq.{self.user_id}&select=*",
            headers
        )
        
        if success:
            profiles = response_data if isinstance(response_data, list) else []
            if profiles and len(profiles) > 0:
                profile = profiles[0]
                role = profile.get("role", "unknown")
                if role == "admin":
                    self.log_result(
                        "Profile Fetch (Authenticated)",
                        True,
                        f"Successfully fetched admin profile. Role: {role}",
                        {"profile_id": profile.get("id"), "role": role, "email": profile.get("email")}
                    )
                else:
                    self.log_result(
                        "Profile Fetch (Authenticated)",
                        False,
                        f"Profile fetched but role is not admin. Found role: {role}",
                        profile
                    )
            else:
                self.log_result(
                    "Profile Fetch (Authenticated)",
                    False,
                    "No profile found for authenticated user",
                    response_data
                )
        else:
            self.log_result(
                "Profile Fetch (Authenticated)",
                False,
                "Failed to fetch authenticated user profile",
                response_data
            )

    def test_3_signals_fetch_authenticated_admin(self):
        """Test 3: Signals Fetch (authenticated admin) - Admin should see ALL signals"""
        print("\n📊 Testing Signals Fetch (Authenticated Admin)...")
        
        if not self.access_token:
            self.log_result(
                "Signals Fetch (Authenticated Admin)",
                False,
                "No access token available. Login test must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}"
        }
        
        success, response_data = self.make_request(
            "GET",
            "/rest/v1/signals?select=*&order=created_at.desc",
            headers
        )
        
        if success:
            signals = response_data if isinstance(response_data, list) else []
            self.log_result(
                "Signals Fetch (Authenticated Admin)",
                True,
                f"Admin successfully fetched {len(signals)} signals",
                {"signals_count": len(signals), "sample_signal": signals[0] if signals else None}
            )
        else:
            self.log_result(
                "Signals Fetch (Authenticated Admin)",
                False,
                "Failed to fetch signals as authenticated admin",
                response_data
            )

    def test_4_plans_fetch_public(self):
        """Test 4: Plans Fetch (anon/public) - Should return active plans without auth"""
        print("\n💰 Testing Plans Fetch (Public/Anonymous)...")
        
        headers = {
            "apikey": self.anon_key
        }
        
        success, response_data = self.make_request(
            "GET",
            "/rest/v1/plans?select=*&is_active=eq.true",
            headers
        )
        
        if success:
            plans = response_data if isinstance(response_data, list) else []
            self.log_result(
                "Plans Fetch (Public)",
                True,
                f"Successfully fetched {len(plans)} active plans without authentication",
                {"plans_count": len(plans), "sample_plan": plans[0] if plans else None}
            )
        else:
            self.log_result(
                "Plans Fetch (Public)",
                False,
                "Failed to fetch plans as anonymous user",
                response_data
            )

    def test_5_signals_fetch_anonymous(self):
        """Test 5: Signals Fetch (anon) - Should return only FREE visibility signals"""
        print("\n📡 Testing Signals Fetch (Anonymous)...")
        
        headers = {
            "apikey": self.anon_key
        }
        
        success, response_data = self.make_request(
            "GET",
            "/rest/v1/signals?select=*",
            headers
        )
        
        if success:
            signals = response_data if isinstance(response_data, list) else []
            # Check if signals are filtered to FREE visibility only
            free_signals = [s for s in signals if s.get("visibility") == "free" or s.get("visibility") is None]
            all_signals_count = len(signals)
            free_signals_count = len(free_signals)
            
            # For anonymous users, we should only see FREE signals
            if all_signals_count == free_signals_count or all_signals_count == 0:
                self.log_result(
                    "Signals Fetch (Anonymous)",
                    True,
                    f"Anonymous user correctly sees only {free_signals_count} FREE visibility signals",
                    {"total_signals": all_signals_count, "free_signals": free_signals_count}
                )
            else:
                self.log_result(
                    "Signals Fetch (Anonymous)",
                    False,
                    f"Anonymous user sees non-FREE signals. Total: {all_signals_count}, FREE: {free_signals_count}",
                    {"signals_sample": signals[:3]}  # Show first 3 for debugging
                )
        else:
            self.log_result(
                "Signals Fetch (Anonymous)",
                False,
                "Failed to fetch signals as anonymous user",
                response_data
            )

    def test_6_subscriptions_fetch_authenticated(self):
        """Test 6: Subscriptions Fetch (authenticated) - Get user subscriptions"""
        print("\n🎫 Testing Subscriptions Fetch (Authenticated)...")
        
        if not self.access_token or not self.user_id:
            self.log_result(
                "Subscriptions Fetch (Authenticated)",
                False,
                "No access token or user_id available. Login test must pass first.",
                None
            )
            return
        
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.access_token}"
        }
        
        success, response_data = self.make_request(
            "GET",
            f"/rest/v1/subscriptions?user_id=eq.{self.user_id}&status=eq.active&select=*,plans(tier)",
            headers
        )
        
        if success:
            subscriptions = response_data if isinstance(response_data, list) else []
            self.log_result(
                "Subscriptions Fetch (Authenticated)",
                True,
                f"Successfully fetched {len(subscriptions)} active subscriptions for authenticated user",
                {"subscriptions_count": len(subscriptions), "sample_subscription": subscriptions[0] if subscriptions else None}
            )
        else:
            self.log_result(
                "Subscriptions Fetch (Authenticated)",
                False,
                "Failed to fetch subscriptions for authenticated user",
                response_data
            )

    def run_all_tests(self):
        """Run all Supabase backend tests in sequence"""
        print("🚀 Starting Supabase Backend Integration Tests")
        print("=" * 60)
        
        # Test sequence as specified in review request
        self.test_1_auth_login()
        self.test_2_profile_fetch_authenticated()
        self.test_3_signals_fetch_authenticated_admin()
        self.test_4_plans_fetch_public()
        self.test_5_signals_fetch_anonymous()
        self.test_6_subscriptions_fetch_authenticated()
        
        # Summary
        print("\n" + "=" * 60)
        print("📋 SUPABASE BACKEND TEST SUMMARY")
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
    tester = SupabaseBackendTester()
    passed, failed = tester.run_all_tests()
    
    # Return appropriate exit code
    exit_code = 0 if failed == 0 else 1
    return exit_code


if __name__ == "__main__":
    import sys
    sys.exit(main())