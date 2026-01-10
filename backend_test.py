#!/usr/bin/env python3
"""
Swift FX Signals Backend API Testing Suite
Tests all core endpoints with role-based access control
"""

import requests
import json
import time
import base64
from datetime import datetime

# Configuration
BASE_URL = "https://fxtrader-app-2.preview.emergentagent.com/api"
TEST_USERS = {
    "admin": {"email": "admin@swiftfx.com", "password": "admin123"},
    "test_user": {"email": "test@example.com", "password": "test123"},
    "new_user": {"email": f"testuser_{int(time.time())}@example.com", "password": "test123", "name": "Test User"}
}

class APITester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.test_results = []
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def test_user_registration(self):
        """Test user registration endpoint"""
        print("🔐 Testing User Registration...")
        
        try:
            response = self.session.post(
                f"{BASE_URL}/auth/register",
                json=TEST_USERS["new_user"]
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    self.tokens["new_user"] = data["token"]
                    self.log_result("User Registration", True, f"User created with ID: {data['user']['user_id']}")
                    return True
                else:
                    self.log_result("User Registration", False, "Missing token or user in response", data)
            else:
                self.log_result("User Registration", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("User Registration", False, f"Exception: {str(e)}")
        
        return False
    
    def test_user_login(self):
        """Test user login endpoint"""
        print("🔐 Testing User Login...")
        
        try:
            # Test with existing user
            response = self.session.post(
                f"{BASE_URL}/auth/login",
                json=TEST_USERS["test_user"]
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    self.tokens["test_user"] = data["token"]
                    self.log_result("User Login", True, f"Login successful for {data['user']['email']}")
                    return True
                else:
                    self.log_result("User Login", False, "Missing token or user in response", data)
            else:
                self.log_result("User Login", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("User Login", False, f"Exception: {str(e)}")
        
        return False
    
    def test_admin_login(self):
        """Test admin login"""
        print("👑 Testing Admin Login...")
        
        try:
            response = self.session.post(
                f"{BASE_URL}/auth/login",
                json=TEST_USERS["admin"]
            )
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data:
                    self.tokens["admin"] = data["token"]
                    self.log_result("Admin Login", True, f"Admin login successful")
                    return True
                else:
                    self.log_result("Admin Login", False, "Missing token in response", data)
            else:
                self.log_result("Admin Login", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Admin Login", False, f"Exception: {str(e)}")
        
        return False
    
    def test_signals_without_auth(self):
        """Test signals endpoint without authentication"""
        print("📊 Testing Signals (No Auth)...")
        
        try:
            response = self.session.get(f"{BASE_URL}/signals")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    locked_signals = [s for s in data if s.get("locked", False)]
                    self.log_result("Signals Without Auth", True, 
                                  f"Retrieved {len(data)} signals, {len(locked_signals)} locked for premium/vip")
                    return True
                else:
                    self.log_result("Signals Without Auth", False, "Response is not a list", data)
            else:
                self.log_result("Signals Without Auth", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Signals Without Auth", False, f"Exception: {str(e)}")
        
        return False
    
    def test_signals_with_auth(self):
        """Test signals endpoint with authentication"""
        print("📊 Testing Signals (With Auth)...")
        
        if "test_user" not in self.tokens:
            self.log_result("Signals With Auth", False, "No test user token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.tokens['test_user']}"}
            response = self.session.get(f"{BASE_URL}/signals", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    free_signals = [s for s in data if s.get("visibility") == "free" and not s.get("locked")]
                    locked_signals = [s for s in data if s.get("locked", False)]
                    self.log_result("Signals With Auth", True, 
                                  f"Retrieved {len(data)} signals, {len(free_signals)} free accessible, {len(locked_signals)} locked")
                    return True
                else:
                    self.log_result("Signals With Auth", False, "Response is not a list", data)
            else:
                self.log_result("Signals With Auth", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Signals With Auth", False, f"Exception: {str(e)}")
        
        return False
    
    def test_dashboard(self):
        """Test dashboard endpoint"""
        print("📈 Testing Dashboard...")
        
        try:
            # Test without auth first
            response = self.session.get(f"{BASE_URL}/dashboard")
            
            if response.status_code == 200:
                data = response.json()
                required_keys = ["recent_signals", "performance", "watchlist"]
                if all(key in data for key in required_keys):
                    self.log_result("Dashboard", True, 
                                  f"Dashboard data retrieved with {len(data['recent_signals'])} recent signals")
                    return True
                else:
                    missing_keys = [key for key in required_keys if key not in data]
                    self.log_result("Dashboard", False, f"Missing keys: {missing_keys}", data)
            else:
                self.log_result("Dashboard", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Dashboard", False, f"Exception: {str(e)}")
        
        return False
    
    def test_subscription_plans(self):
        """Test subscription plans endpoint"""
        print("💳 Testing Subscription Plans...")
        
        try:
            response = self.session.get(f"{BASE_URL}/subscription/plans")
            
            if response.status_code == 200:
                data = response.json()
                if "plans" in data and isinstance(data["plans"], list):
                    plans = data["plans"]
                    plan_names = [p.get("name") for p in plans]
                    self.log_result("Subscription Plans", True, 
                                  f"Retrieved {len(plans)} plans: {', '.join(plan_names)}")
                    return True
                else:
                    self.log_result("Subscription Plans", False, "Invalid plans structure", data)
            else:
                self.log_result("Subscription Plans", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Subscription Plans", False, f"Exception: {str(e)}")
        
        return False
    
    def test_admin_signal_creation(self):
        """Test admin signal creation"""
        print("👑 Testing Admin Signal Creation...")
        
        if "admin" not in self.tokens:
            self.log_result("Admin Signal Creation", False, "No admin token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.tokens['admin']}"}
            signal_data = {
                "pair": "EUR/USD",
                "signal_type": "buy",
                "entry": 1.0850,
                "stop_loss": 1.0800,
                "take_profit": 1.0950,
                "visibility": "premium",
                "analysis": "Test signal created by automated testing"
            }
            
            response = self.session.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                if "signal_id" in data:
                    self.log_result("Admin Signal Creation", True, 
                                  f"Signal created with ID: {data['signal_id']}")
                    return True
                else:
                    self.log_result("Admin Signal Creation", False, "Missing signal_id in response", data)
            else:
                self.log_result("Admin Signal Creation", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Admin Signal Creation", False, f"Exception: {str(e)}")
        
        return False
    
    def test_community_posts(self):
        """Test community posts endpoints"""
        print("💬 Testing Community Posts...")
        
        try:
            # Test getting posts (no auth required)
            response = self.session.get(f"{BASE_URL}/community/posts")
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Community Posts - Get", True, 
                                  f"Retrieved {len(data)} community posts")
                    
                    # Test creating a post (auth required)
                    if "test_user" in self.tokens:
                        headers = {"Authorization": f"Bearer {self.tokens['test_user']}"}
                        post_data = {
                            "content": "Test post from automated testing",
                            "post_type": "analysis"
                        }
                        
                        create_response = self.session.post(
                            f"{BASE_URL}/community/posts",
                            json=post_data,
                            headers=headers
                        )
                        
                        if create_response.status_code == 200:
                            create_data = create_response.json()
                            if "post_id" in create_data:
                                self.log_result("Community Posts - Create", True, 
                                              f"Post created with ID: {create_data['post_id']}")
                                return True
                            else:
                                self.log_result("Community Posts - Create", False, 
                                              "Missing post_id in response", create_data)
                        else:
                            self.log_result("Community Posts - Create", False, 
                                          f"Status: {create_response.status_code}", create_response.text)
                    else:
                        self.log_result("Community Posts - Create", False, "No test user token available")
                        return False
                else:
                    self.log_result("Community Posts - Get", False, "Response is not a list", data)
            else:
                self.log_result("Community Posts - Get", False, f"Status: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Community Posts", False, f"Exception: {str(e)}")
        
        return False
    
    def test_ai_analyzer_access(self):
        """Test AI Chart Analyzer access control"""
        print("🤖 Testing AI Chart Analyzer Access...")
        
        if "test_user" not in self.tokens:
            self.log_result("AI Analyzer Access", False, "No test user token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.tokens['test_user']}"}
            
            # Test usage endpoint first
            usage_response = self.session.get(f"{BASE_URL}/ai/usage", headers=headers)
            
            if usage_response.status_code == 200:
                usage_data = usage_response.json()
                has_access = usage_data.get("has_access", False)
                
                if not has_access:
                    self.log_result("AI Analyzer Access", True, 
                                  "Free user correctly blocked from AI analyzer")
                    return True
                else:
                    self.log_result("AI Analyzer Access", False, 
                                  "Free user should not have AI access", usage_data)
            else:
                self.log_result("AI Analyzer Access", False, 
                              f"Usage endpoint status: {usage_response.status_code}", usage_response.text)
                
        except Exception as e:
            self.log_result("AI Analyzer Access", False, f"Exception: {str(e)}")
        
        return False
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Swift FX Signals Backend API Tests")
        print("=" * 60)
        
        # Authentication tests
        self.test_user_registration()
        self.test_user_login()
        self.test_admin_login()
        
        # Core functionality tests
        self.test_signals_without_auth()
        self.test_signals_with_auth()
        self.test_dashboard()
        self.test_subscription_plans()
        
        # Admin and premium features
        self.test_admin_signal_creation()
        self.test_community_posts()
        self.test_ai_analyzer_access()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed == total

if __name__ == "__main__":
    tester = APITester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed!")
    else:
        print("\n⚠️  Some tests failed. Check the details above.")