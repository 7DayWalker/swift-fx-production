#!/usr/bin/env python3
"""
Trade Lifecycle Engine Testing Suite
Tests the state machine implementation for trading signals
"""

import requests
import json
import uuid
from datetime import datetime

# Configuration
BASE_URL = "https://signallifecycle.preview.emergentagent.com/api"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "admin@swiftfx.com",
    "password": "adminpassword"
}

FREE_USER_CREDENTIALS = {
    "email": "freeuser_test@example.com", 
    "password": "test123"
}

class TradeLifecycleTest:
    def __init__(self):
        self.admin_token = None
        self.free_user_token = None
        self.test_signals = []
        self.results = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "message": message,
            "details": details or {}
        }
        self.results.append(result)
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def authenticate(self):
        """Authenticate admin and free user"""
        print("\n=== AUTHENTICATION ===")
        
        # Admin login
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=ADMIN_CREDENTIALS)
            if response.status_code == 200:
                self.admin_token = response.json()["token"]
                self.log_result("Admin Authentication", True, "Admin login successful")
            else:
                self.log_result("Admin Authentication", False, f"Admin login failed: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Admin Authentication", False, f"Admin login error: {str(e)}")
            return False
            
        # Free user login
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=FREE_USER_CREDENTIALS)
            if response.status_code == 200:
                self.free_user_token = response.json()["token"]
                self.log_result("Free User Authentication", True, "Free user login successful")
            else:
                self.log_result("Free User Authentication", False, f"Free user login failed: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Free User Authentication", False, f"Free user login error: {str(e)}")
            
        return self.admin_token is not None
    
    def get_headers(self, token):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_signal_creation(self):
        """Test creating signals with different initial states"""
        print("\n=== SIGNAL CREATION TESTS ===")
        
        # Test 1: Create signal with pending state (default)
        signal_data = {
            "pair": "EURUSD",
            "signal_type": "buy",
            "entry": 1.0850,
            "stop_loss": 1.0800,
            "tp1": 1.0900,
            "tp2": 1.0950,
            "tp3": 1.1000,
            "visibility": "free",
            "analysis": "Test signal for lifecycle testing"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                signal_id = response.json()["signal_id"]
                self.test_signals.append(signal_id)
                self.log_result("Create Pending Signal", True, f"Signal created with ID: {signal_id}")
                
                # Verify signal state
                signal_response = requests.get(
                    f"{BASE_URL}/signals/{signal_id}",
                    headers=self.get_headers(self.admin_token)
                )
                if signal_response.status_code == 200:
                    signal = signal_response.json()
                    if signal.get("state") == "pending":
                        self.log_result("Verify Pending State", True, "Signal created with pending state")
                    else:
                        self.log_result("Verify Pending State", False, f"Expected pending, got {signal.get('state')}")
                        
            else:
                self.log_result("Create Pending Signal", False, f"Failed to create signal: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Create Pending Signal", False, f"Error creating signal: {str(e)}")
        
        # Test 2: Create signal with active state
        signal_data["state"] = "active"
        signal_data["pair"] = "GBPUSD"  # Different pair
        
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                signal_id = response.json()["signal_id"]
                self.test_signals.append(signal_id)
                self.log_result("Create Active Signal", True, f"Signal created with ID: {signal_id}")
                
                # Verify signal state and activated_at
                signal_response = requests.get(
                    f"{BASE_URL}/signals/{signal_id}",
                    headers=self.get_headers(self.admin_token)
                )
                if signal_response.status_code == 200:
                    signal = signal_response.json()
                    if signal.get("state") == "active" and signal.get("activated_at"):
                        self.log_result("Verify Active State", True, "Signal created with active state and activated_at timestamp")
                    else:
                        self.log_result("Verify Active State", False, f"State: {signal.get('state')}, activated_at: {signal.get('activated_at')}")
                        
            else:
                self.log_result("Create Active Signal", False, f"Failed to create active signal: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Create Active Signal", False, f"Error creating active signal: {str(e)}")
    
    def test_valid_transitions(self):
        """Test valid state transitions"""
        print("\n=== VALID TRANSITION TESTS ===")
        
        if not self.test_signals:
            self.log_result("Valid Transitions", False, "No test signals available")
            return
            
        # Use first signal (should be pending)
        signal_id = self.test_signals[0]
        
        # Test: pending → active
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/transition",
                json={"new_state": "active"},
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                self.log_result("Transition pending→active", True, "Successfully transitioned to active")
            else:
                self.log_result("Transition pending→active", False, f"Failed: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Transition pending→active", False, f"Error: {str(e)}")
        
        # Test: active → tp1
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/transition",
                json={"new_state": "tp1"},
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                self.log_result("Transition active→tp1", True, "Successfully transitioned to tp1")
            else:
                self.log_result("Transition active→tp1", False, f"Failed: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Transition active→tp1", False, f"Error: {str(e)}")
        
        # Test: tp1 → tp2
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/transition",
                json={"new_state": "tp2"},
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                self.log_result("Transition tp1→tp2", True, "Successfully transitioned to tp2")
            else:
                self.log_result("Transition tp1→tp2", False, f"Failed: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Transition tp1→tp2", False, f"Error: {str(e)}")
        
        # Test: tp2 → tp3
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/transition",
                json={"new_state": "tp3"},
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                self.log_result("Transition tp2→tp3", True, "Successfully transitioned to tp3")
            else:
                self.log_result("Transition tp2→tp3", False, f"Failed: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Transition tp2→tp3", False, f"Error: {str(e)}")
        
        # Test: tp3 → closed
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/transition",
                json={"new_state": "closed", "close_price": 1.0950},
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                result = response.json()
                self.log_result("Transition tp3→closed", True, f"Successfully closed signal. Final pips: {result.get('final_pips')}")
            else:
                self.log_result("Transition tp3→closed", False, f"Failed: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Transition tp3→closed", False, f"Error: {str(e)}")
    
    def test_invalid_transitions(self):
        """Test invalid state transitions"""
        print("\n=== INVALID TRANSITION TESTS ===")
        
        # Create a new pending signal for testing
        signal_data = {
            "pair": "USDJPY",
            "signal_type": "sell",
            "entry": 150.50,
            "stop_loss": 151.00,
            "tp1": 150.00,
            "tp2": 149.50,
            "tp3": 149.00,
            "visibility": "free"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                signal_id = response.json()["signal_id"]
                self.test_signals.append(signal_id)
                
                # Test invalid transition: pending → tp1 (should skip active)
                response = requests.post(
                    f"{BASE_URL}/admin/signals/{signal_id}/transition",
                    json={"new_state": "tp1"},
                    headers=self.get_headers(self.admin_token)
                )
                
                if response.status_code == 400:
                    self.log_result("Invalid pending→tp1", True, "Correctly blocked invalid transition")
                else:
                    self.log_result("Invalid pending→tp1", False, f"Should have blocked transition: {response.status_code}")
                
                # Activate the signal first
                requests.post(
                    f"{BASE_URL}/admin/signals/{signal_id}/activate",
                    headers=self.get_headers(self.admin_token)
                )
                
                # Test invalid transition: active → tp2 (should go through tp1)
                response = requests.post(
                    f"{BASE_URL}/admin/signals/{signal_id}/transition",
                    json={"new_state": "tp2"},
                    headers=self.get_headers(self.admin_token)
                )
                
                if response.status_code == 400:
                    self.log_result("Invalid active→tp2", True, "Correctly blocked skipping tp1")
                else:
                    self.log_result("Invalid active→tp2", False, f"Should have blocked transition: {response.status_code}")
                    
            else:
                self.log_result("Create Test Signal for Invalid Transitions", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Invalid Transition Tests", False, f"Error: {str(e)}")
    
    def test_immutability(self):
        """Test that closed signals are immutable"""
        print("\n=== IMMUTABILITY TESTS ===")
        
        # Create and close a signal
        signal_data = {
            "pair": "AUDUSD",
            "signal_type": "buy",
            "entry": 0.6750,
            "stop_loss": 0.6700,
            "tp1": 0.6800,
            "tp2": 0.6850,
            "tp3": 0.6900,
            "visibility": "free"
        }
        
        try:
            # Create signal
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                signal_id = response.json()["signal_id"]
                self.test_signals.append(signal_id)
                
                # Force close the signal
                close_response = requests.post(
                    f"{BASE_URL}/admin/signals/{signal_id}/force-close",
                    json={"close_price": 0.6720, "reason": "Test immutability"},
                    headers=self.get_headers(self.admin_token)
                )
                
                if close_response.status_code == 200:
                    self.log_result("Force Close Signal", True, "Signal successfully closed")
                    
                    # Now test immutability - try to transition
                    transition_response = requests.post(
                        f"{BASE_URL}/admin/signals/{signal_id}/transition",
                        json={"new_state": "active"},
                        headers=self.get_headers(self.admin_token)
                    )
                    
                    if transition_response.status_code == 400 and "immutable" in transition_response.text.lower():
                        self.log_result("Immutable Transition Test", True, "Correctly blocked transition on closed signal")
                    else:
                        self.log_result("Immutable Transition Test", False, f"Should block transitions: {transition_response.status_code}")
                    
                    # Test activate on closed signal
                    activate_response = requests.post(
                        f"{BASE_URL}/admin/signals/{signal_id}/activate",
                        headers=self.get_headers(self.admin_token)
                    )
                    
                    if activate_response.status_code == 400 and "immutable" in activate_response.text.lower():
                        self.log_result("Immutable Activate Test", True, "Correctly blocked activate on closed signal")
                    else:
                        self.log_result("Immutable Activate Test", False, f"Should block activate: {activate_response.status_code}")
                    
                    # Test mark-tp on closed signal
                    tp_response = requests.post(
                        f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=1",
                        headers=self.get_headers(self.admin_token)
                    )
                    
                    if tp_response.status_code == 400 and "immutable" in tp_response.text.lower():
                        self.log_result("Immutable Mark-TP Test", True, "Correctly blocked mark-tp on closed signal")
                    else:
                        self.log_result("Immutable Mark-TP Test", False, f"Should block mark-tp: {tp_response.status_code}")
                    
                    # Test force-close on already closed signal
                    close2_response = requests.post(
                        f"{BASE_URL}/admin/signals/{signal_id}/force-close",
                        headers=self.get_headers(self.admin_token)
                    )
                    
                    if close2_response.status_code == 400 and "immutable" in close2_response.text.lower():
                        self.log_result("Immutable Force-Close Test", True, "Correctly blocked force-close on closed signal")
                    else:
                        self.log_result("Immutable Force-Close Test", False, f"Should block force-close: {close2_response.status_code}")
                        
                else:
                    self.log_result("Force Close Signal", False, f"Failed to close signal: {close_response.status_code}")
                    
            else:
                self.log_result("Create Signal for Immutability Test", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Immutability Tests", False, f"Error: {str(e)}")
    
    def test_quick_actions(self):
        """Test quick action endpoints"""
        print("\n=== QUICK ACTION TESTS ===")
        
        # Test activate endpoint
        signal_data = {
            "pair": "NZDUSD",
            "signal_type": "sell",
            "entry": 0.6200,
            "stop_loss": 0.6250,
            "tp1": 0.6150,
            "visibility": "free"
        }
        
        try:
            # Create pending signal
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                signal_id = response.json()["signal_id"]
                self.test_signals.append(signal_id)
                
                # Test activate
                activate_response = requests.post(
                    f"{BASE_URL}/admin/signals/{signal_id}/activate",
                    headers=self.get_headers(self.admin_token)
                )
                
                if activate_response.status_code == 200:
                    self.log_result("Quick Activate", True, "Successfully activated pending signal")
                    
                    # Test mark-tp endpoints
                    tp1_response = requests.post(
                        f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=1",
                        headers=self.get_headers(self.admin_token)
                    )
                    
                    if tp1_response.status_code == 200:
                        self.log_result("Mark TP1", True, "Successfully marked TP1")
                        
                        # Try to mark TP3 (should fail - must go through TP2)
                        tp3_response = requests.post(
                            f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=3",
                            headers=self.get_headers(self.admin_token)
                        )
                        
                        if tp3_response.status_code == 400:
                            self.log_result("Invalid TP3 Skip", True, "Correctly blocked skipping TP2")
                        else:
                            self.log_result("Invalid TP3 Skip", False, f"Should block TP3 skip: {tp3_response.status_code}")
                        
                        # Mark TP2
                        tp2_response = requests.post(
                            f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=2",
                            headers=self.get_headers(self.admin_token)
                        )
                        
                        if tp2_response.status_code == 200:
                            self.log_result("Mark TP2", True, "Successfully marked TP2")
                            
                            # Mark TP3 (should auto-close)
                            tp3_response = requests.post(
                                f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=3",
                                headers=self.get_headers(self.admin_token)
                            )
                            
                            if tp3_response.status_code == 200:
                                result = tp3_response.json()
                                if result.get("auto_closed"):
                                    self.log_result("Mark TP3 Auto-Close", True, f"TP3 auto-closed signal. Final pips: {result.get('final_pips')}")
                                else:
                                    self.log_result("Mark TP3 Auto-Close", False, "TP3 should auto-close signal")
                            else:
                                self.log_result("Mark TP3", False, f"Failed to mark TP3: {tp3_response.status_code}")
                        else:
                            self.log_result("Mark TP2", False, f"Failed to mark TP2: {tp2_response.status_code}")
                    else:
                        self.log_result("Mark TP1", False, f"Failed to mark TP1: {tp1_response.status_code}")
                else:
                    self.log_result("Quick Activate", False, f"Failed to activate: {activate_response.status_code}")
                    
            else:
                self.log_result("Create Signal for Quick Actions", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Quick Action Tests", False, f"Error: {str(e)}")
    
    def test_legacy_endpoint(self):
        """Test legacy PUT endpoint compatibility"""
        print("\n=== LEGACY ENDPOINT TESTS ===")
        
        # Create a signal for legacy testing
        signal_data = {
            "pair": "USDCAD",
            "signal_type": "buy",
            "entry": 1.3500,
            "stop_loss": 1.3450,
            "tp1": 1.3550,
            "visibility": "free"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers(self.admin_token)
            )
            
            if response.status_code == 200:
                signal_id = response.json()["signal_id"]
                self.test_signals.append(signal_id)
                
                # Test legacy activate (pending → active)
                legacy_response = requests.put(
                    f"{BASE_URL}/admin/signals/{signal_id}?status=active",
                    headers=self.get_headers(self.admin_token)
                )
                
                if legacy_response.status_code == 200:
                    self.log_result("Legacy Activate", True, "Legacy endpoint activated signal")
                    
                    # Test legacy close
                    close_response = requests.put(
                        f"{BASE_URL}/admin/signals/{signal_id}",
                        json={"status": "closed", "final_pips": 25.5},
                        headers=self.get_headers(self.admin_token)
                    )
                    
                    if close_response.status_code == 200:
                        self.log_result("Legacy Close", True, "Legacy endpoint closed signal")
                        
                        # Test immutability with legacy endpoint
                        immutable_response = requests.put(
                            f"{BASE_URL}/admin/signals/{signal_id}",
                            json={"status": "active"},
                            headers=self.get_headers(self.admin_token)
                        )
                        
                        if immutable_response.status_code == 400 and "immutable" in immutable_response.text.lower():
                            self.log_result("Legacy Immutability", True, "Legacy endpoint respects immutability")
                        else:
                            self.log_result("Legacy Immutability", False, f"Legacy should respect immutability: {immutable_response.status_code}")
                    else:
                        self.log_result("Legacy Close", False, f"Failed to close via legacy: {close_response.status_code}")
                else:
                    self.log_result("Legacy Activate", False, f"Failed to activate via legacy: {legacy_response.status_code}")
                    
            else:
                self.log_result("Create Signal for Legacy Test", False, f"Failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Legacy Endpoint Tests", False, f"Error: {str(e)}")
    
    def test_state_field_consistency(self):
        """Test that state field is properly set in responses"""
        print("\n=== STATE FIELD CONSISTENCY TESTS ===")
        
        if not self.test_signals:
            self.log_result("State Field Consistency", False, "No test signals available")
            return
            
        # Check a few signals for proper state field
        for i, signal_id in enumerate(self.test_signals[:3]):
            try:
                response = requests.get(
                    f"{BASE_URL}/signals/{signal_id}",
                    headers=self.get_headers(self.admin_token)
                )
                
                if response.status_code == 200:
                    signal = response.json()
                    state = signal.get("state")
                    status = signal.get("status")
                    tp_hit = signal.get("tp_hit")
                    
                    if state and status is not None and tp_hit is not None:
                        self.log_result(f"State Fields Signal {i+1}", True, f"State: {state}, Status: {status}, TP Hit: {tp_hit}")
                    else:
                        self.log_result(f"State Fields Signal {i+1}", False, f"Missing fields - State: {state}, Status: {status}, TP Hit: {tp_hit}")
                else:
                    self.log_result(f"Get Signal {i+1}", False, f"Failed to get signal: {response.status_code}")
                    
            except Exception as e:
                self.log_result(f"State Field Test {i+1}", False, f"Error: {str(e)}")
    
    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Trade Lifecycle Engine Tests")
        print("=" * 50)
        
        if not self.authenticate():
            print("❌ Authentication failed - cannot continue tests")
            return False
            
        self.test_signal_creation()
        self.test_valid_transitions()
        self.test_invalid_transitions()
        self.test_quick_actions()
        self.test_immutability()
        self.test_legacy_endpoint()
        self.test_state_field_consistency()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
        passed = sum(1 for r in self.results if "✅ PASS" in r["status"])
        failed = sum(1 for r in self.results if "❌ FAIL" in r["status"])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.results:
                if "❌ FAIL" in result["status"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return failed == 0

if __name__ == "__main__":
    tester = TradeLifecycleTest()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed! Trade Lifecycle Engine is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Please review the issues above.")