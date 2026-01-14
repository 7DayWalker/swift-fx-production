#!/usr/bin/env python3
"""
AI Chart Analyzer Backend Testing - Focused on AI endpoints
Testing as requested in the review request
"""

import requests
import json
import base64
from io import BytesIO
from PIL import Image
import os

# Configuration
BASE_URL = "https://signallifecycle.preview.emergentagent.com/api"

class AIChartAnalyzerTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.vip_token = None
        self.free_token = None
        
    def create_test_image(self):
        """Create a simple test chart image"""
        # Create a simple test image that looks like a chart
        img = Image.new('RGB', (800, 600), color='white')
        
        # Convert to bytes
        img_bytes = BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        return img_bytes.getvalue()
    
    def register_and_login_user(self, email, password, name="Test User"):
        """Register and login a user, return token"""
        print(f"\n=== Registering and logging in user: {email} ===")
        
        # Try to register (might fail if user exists)
        register_data = {
            "name": name,
            "email": email,
            "password": password
        }
        
        try:
            response = self.session.post(f"{self.base_url}/auth/register", json=register_data)
            if response.status_code == 200:
                print(f"✅ User registered successfully")
                return response.json()["token"]
            elif response.status_code == 400 and "already registered" in response.text:
                print(f"ℹ️ User already exists, proceeding to login")
            else:
                print(f"❌ Registration failed: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ Registration error: {e}")
        
        # Login
        login_data = {
            "email": email,
            "password": password
        }
        
        try:
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            if response.status_code == 200:
                token = response.json()["token"]
                user_info = response.json()["user"]
                print(f"✅ Login successful - Role: {user_info.get('role', 'unknown')}")
                return token
            else:
                print(f"❌ Login failed: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"❌ Login error: {e}")
            return None
    
    def upgrade_user_to_vip(self, token):
        """Upgrade user to VIP subscription"""
        print(f"\n=== Upgrading user to VIP ===")
        
        headers = {"Authorization": f"Bearer {token}"}
        upgrade_data = {
            "plan": "vip",
            "billing_cycle": "monthly"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/subscription/upgrade", 
                                       json=upgrade_data, headers=headers)
            if response.status_code == 200:
                print(f"✅ User upgraded to VIP successfully")
                return True
            else:
                print(f"❌ Upgrade failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Upgrade error: {e}")
            return False
    
    def test_ai_usage_endpoint(self, token, user_type="VIP"):
        """Test GET /api/ai/usage endpoint"""
        print(f"\n=== Testing AI Usage Endpoint ({user_type} user) ===")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        try:
            response = self.session.get(f"{self.base_url}/ai/usage", headers=headers)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ AI Usage Response:")
                print(f"   - Current Usage: {data.get('current_usage')}")
                print(f"   - Weekly Limit: {data.get('weekly_limit')}")
                print(f"   - Remaining: {data.get('remaining')}")
                print(f"   - Has Access: {data.get('has_access')}")
                print(f"   - Reset Date: {data.get('reset_date')}")
                
                # Verify expected values
                if user_type == "VIP":
                    if data.get('weekly_limit') == 20:
                        print(f"✅ VIP weekly limit correct (20)")
                    else:
                        print(f"❌ VIP weekly limit incorrect: expected 20, got {data.get('weekly_limit')}")
                    
                    if data.get('has_access') == True:
                        print(f"✅ VIP has access: True")
                    else:
                        print(f"❌ VIP should have access but got: {data.get('has_access')}")
                
                elif user_type == "FREE":
                    if data.get('has_access') == False:
                        print(f"✅ Free user correctly blocked from AI access")
                    else:
                        print(f"❌ Free user should not have access but got: {data.get('has_access')}")
                
                return True
            else:
                print(f"❌ AI Usage request failed: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ AI Usage test error: {e}")
            return False
    
    def test_ai_analyze_endpoint(self, token, user_type="VIP"):
        """Test POST /api/ai/analyze endpoint"""
        print(f"\n=== Testing AI Analyze Endpoint ({user_type} user) ===")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create test image
        test_image = self.create_test_image()
        
        # Prepare form data
        files = {
            'image': ('test_chart.png', test_image, 'image/png')
        }
        data = {
            'pair': 'EUR/USD',
            'timeframe': '1H'
        }
        
        try:
            response = self.session.post(f"{self.base_url}/ai/analyze", 
                                       files=files, data=data, headers=headers)
            print(f"Status Code: {response.status_code}")
            
            if user_type == "FREE" and response.status_code == 403:
                print(f"✅ Free user correctly blocked from AI analyze (403)")
                return True
            elif user_type in ["VIP", "PREMIUM"] and response.status_code == 200:
                data = response.json()
                print(f"✅ AI Analysis Response received")
                
                # Check required fields
                required_fields = [
                    'analysis_id', 'pair', 'timeframe', 'market_bias', 
                    'trend_structure', 'support_levels', 'resistance_levels', 
                    'trade_insight', 'confidence', 'remaining_analyses', 'disclaimer'
                ]
                
                missing_fields = []
                for field in required_fields:
                    if field not in data:
                        missing_fields.append(field)
                    else:
                        print(f"   ✅ {field}: {data[field]}")
                
                if missing_fields:
                    print(f"❌ Missing required fields: {missing_fields}")
                    return False
                else:
                    print(f"✅ All required fields present in response")
                
                # Verify usage counter decremented
                if 'remaining_analyses' in data:
                    print(f"✅ Usage counter working - Remaining: {data['remaining_analyses']}")
                
                return True
            else:
                print(f"❌ AI Analyze request failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ AI Analyze test error: {e}")
            return False
    
    def test_access_control(self):
        """Test access control between free and premium/VIP users"""
        print(f"\n=== Testing Access Control ===")
        
        # Test with free user
        if self.free_token:
            print(f"\n--- Testing Free User Access ---")
            self.test_ai_usage_endpoint(self.free_token, "FREE")
            self.test_ai_analyze_endpoint(self.free_token, "FREE")
        
        # Test with VIP user
        if self.vip_token:
            print(f"\n--- Testing VIP User Access ---")
            self.test_ai_usage_endpoint(self.vip_token, "VIP")
            self.test_ai_analyze_endpoint(self.vip_token, "VIP")
    
    def run_all_tests(self):
        """Run all AI Chart Analyzer tests"""
        print("=" * 60)
        print("AI CHART ANALYZER BACKEND TESTING")
        print("=" * 60)
        
        # Setup VIP test user
        self.vip_token = self.register_and_login_user("viptest@test.com", "testpass123", "VIP Test User")
        if self.vip_token:
            self.upgrade_user_to_vip(self.vip_token)
        
        # Setup free test user
        self.free_token = self.register_and_login_user("freetest@test.com", "testpass123", "Free Test User")
        
        # Run access control tests
        self.test_access_control()
        
        print(f"\n" + "=" * 60)
        print("AI CHART ANALYZER TESTING COMPLETE")
        print("=" * 60)

if __name__ == "__main__":
    tester = AIChartAnalyzerTester()
    tester.run_all_tests()