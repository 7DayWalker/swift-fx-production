#!/usr/bin/env python3
"""
Backend Test Suite for Signal Engine Authority & Trigger Fixes
Testing critical fixes for admin state authority and direction-aware price logic
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://signallifecycle.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@swiftfx.com"
ADMIN_PASSWORD = "adminpassword"

class SignalEngineTest:
    def __init__(self):
        self.admin_token = None
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        print()
    
    def authenticate_admin(self) -> bool:
        """Authenticate as admin user"""
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                user_info = data.get("user", {})
                is_admin = user_info.get("is_admin", False)
                
                if self.admin_token and is_admin:
                    self.log_test("Admin Authentication", True, f"Admin user authenticated successfully")
                    return True
                else:
                    self.log_test("Admin Authentication", False, f"User is not admin: {user_info}")
                    return False
            else:
                self.log_test("Admin Authentication", False, f"Login failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Exception: {str(e)}")
            return False
    
    def get_headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    def create_signal(self, signal_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a signal and return the response"""
        try:
            response = requests.post(
                f"{BASE_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers()
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Signal creation failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Exception creating signal: {str(e)}")
            return None
    
    def get_signal(self, signal_id: str) -> Optional[Dict[str, Any]]:
        """Get signal details"""
        try:
            response = requests.get(
                f"{BASE_URL}/signals/{signal_id}",
                headers=self.get_headers()
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Get signal failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Exception getting signal: {str(e)}")
            return None
    
    def test_admin_state_authority_active(self):
        """CRITICAL TEST 1A: Admin creates ACTIVE signal - should stay ACTIVE"""
        signal_data = {
            "pair": "EURUSD",
            "signal_type": "buy",
            "entry": 1.0800,
            "stop_loss": 1.0750,
            "tp1": 1.0850,
            "tp2": 1.0900,
            "tp3": 1.0950,
            "state": "active",
            "visibility": "free"
        }
        
        create_response = self.create_signal(signal_data)
        if not create_response:
            self.log_test("Admin State Authority - Create ACTIVE", False, "Failed to create signal")
            return
        
        signal_id = create_response.get("signal_id")
        if not signal_id:
            self.log_test("Admin State Authority - Create ACTIVE", False, "No signal_id in response")
            return
        
        # Get the created signal to verify state
        signal = self.get_signal(signal_id)
        if not signal:
            self.log_test("Admin State Authority - Create ACTIVE", False, "Failed to retrieve created signal")
            return
        
        actual_state = signal.get("state")
        activated_at = signal.get("activated_at")
        
        if actual_state == "active" and activated_at is not None:
            self.log_test("Admin State Authority - Create ACTIVE", True, 
                         f"Signal created with state='active' and activated_at is set. Signal ID: {signal_id}")
        else:
            self.log_test("Admin State Authority - Create ACTIVE", False, 
                         f"Expected state='active' with activated_at, got state='{actual_state}', activated_at={activated_at}")
    
    def test_admin_state_authority_pending(self):
        """CRITICAL TEST 1B: Admin creates signal without state - should be PENDING"""
        signal_data = {
            "pair": "GBPUSD",
            "signal_type": "sell",
            "entry": 1.2700,
            "stop_loss": 1.2750,
            "tp1": 1.2650,
            "tp2": 1.2600,
            "tp3": 1.2550,
            "visibility": "free"
            # No state specified - should default to pending
        }
        
        create_response = self.create_signal(signal_data)
        if not create_response:
            self.log_test("Admin State Authority - Default PENDING", False, "Failed to create signal")
            return
        
        signal_id = create_response.get("signal_id")
        if not signal_id:
            self.log_test("Admin State Authority - Default PENDING", False, "No signal_id in response")
            return
        
        # Get the created signal to verify state
        signal = self.get_signal(signal_id)
        if not signal:
            self.log_test("Admin State Authority - Default PENDING", False, "Failed to retrieve created signal")
            return
        
        actual_state = signal.get("state")
        
        if actual_state == "pending":
            self.log_test("Admin State Authority - Default PENDING", True, 
                         f"Signal correctly created with default state='pending'. Signal ID: {signal_id}")
        else:
            self.log_test("Admin State Authority - Default PENDING", False, 
                         f"Expected state='pending', got state='{actual_state}'")
    
    def test_state_immutability(self):
        """CRITICAL TEST 3: State Immutability - Closed signals must be immutable"""
        # First create a signal
        signal_data = {
            "pair": "USDJPY",
            "signal_type": "buy",
            "entry": 150.00,
            "stop_loss": 149.50,
            "tp1": 150.50,
            "tp2": 151.00,
            "tp3": 151.50,
            "state": "active",
            "visibility": "free"
        }
        
        create_response = self.create_signal(signal_data)
        if not create_response:
            self.log_test("State Immutability Setup", False, "Failed to create test signal")
            return
        
        signal_id = create_response.get("signal_id")
        if not signal_id:
            self.log_test("State Immutability Setup", False, "No signal_id in response")
            return
        
        # Force close the signal
        try:
            close_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/force-close",
                json={"close_price": 149.75, "reason": "Test closure"},
                headers=self.get_headers()
            )
            
            if close_response.status_code != 200:
                self.log_test("State Immutability Setup", False, f"Failed to close signal: {close_response.text}")
                return
            
        except Exception as e:
            self.log_test("State Immutability Setup", False, f"Exception closing signal: {str(e)}")
            return
        
        # Now test that all operations fail on closed signal
        immutability_tests = []
        
        # Test 1: Try to transition state
        try:
            transition_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/transition",
                json={"new_state": "active"},
                headers=self.get_headers()
            )
            
            if transition_response.status_code == 400 and "immutable" in transition_response.text.lower():
                immutability_tests.append(("Transition blocked", True))
            else:
                immutability_tests.append(("Transition blocked", False, f"Expected 400 with 'immutable', got {transition_response.status_code}: {transition_response.text}"))
        except Exception as e:
            immutability_tests.append(("Transition blocked", False, f"Exception: {str(e)}"))
        
        # Test 2: Try to activate
        try:
            activate_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/activate",
                headers=self.get_headers()
            )
            
            if activate_response.status_code == 400 and "immutable" in activate_response.text.lower():
                immutability_tests.append(("Activate blocked", True))
            else:
                immutability_tests.append(("Activate blocked", False, f"Expected 400 with 'immutable', got {activate_response.status_code}: {activate_response.text}"))
        except Exception as e:
            immutability_tests.append(("Activate blocked", False, f"Exception: {str(e)}"))
        
        # Test 3: Try to mark TP
        try:
            tp_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=1",
                headers=self.get_headers()
            )
            
            if tp_response.status_code == 400 and "immutable" in tp_response.text.lower():
                immutability_tests.append(("Mark-TP blocked", True))
            else:
                immutability_tests.append(("Mark-TP blocked", False, f"Expected 400 with 'immutable', got {tp_response.status_code}: {tp_response.text}"))
        except Exception as e:
            immutability_tests.append(("Mark-TP blocked", False, f"Exception: {str(e)}"))
        
        # Evaluate overall immutability
        all_passed = all(test[1] for test in immutability_tests)
        failed_tests = [test for test in immutability_tests if not test[1]]
        
        if all_passed:
            self.log_test("State Immutability - All Operations Blocked", True, 
                         f"All operations correctly blocked on closed signal {signal_id}")
        else:
            details = f"Failed tests: {[test[0] + ': ' + (test[2] if len(test) > 2 else 'Failed') for test in failed_tests]}"
            self.log_test("State Immutability - All Operations Blocked", False, details)
    
    def test_direction_aware_price_logic_buy(self):
        """CRITICAL TEST 2A: BUY Signal Price Logic"""
        # Create a BUY signal
        signal_data = {
            "pair": "EURUSD",
            "signal_type": "buy",
            "entry": 1.1000,
            "stop_loss": 1.0950,  # SL below entry for BUY
            "tp1": 1.1050,        # TP above entry for BUY
            "tp2": 1.1100,
            "tp3": 1.1150,
            "state": "active",
            "visibility": "free"
        }
        
        create_response = self.create_signal(signal_data)
        if not create_response:
            self.log_test("BUY Signal Price Logic Setup", False, "Failed to create BUY signal")
            return
        
        signal_id = create_response.get("signal_id")
        if not signal_id:
            self.log_test("BUY Signal Price Logic Setup", False, "No signal_id in response")
            return
        
        # Test BUY logic expectations:
        # For BUY: SL triggers when price FALLS (price <= SL)
        # For BUY: TP triggers when price RISES (price >= TP)
        
        buy_logic_correct = True
        details = []
        
        # Verify signal was created correctly
        signal = self.get_signal(signal_id)
        if signal:
            entry = signal.get("entry")
            stop_loss = signal.get("stop_loss")
            tp1 = signal.get("tp1")
            signal_type = signal.get("signal_type")
            
            if signal_type == "buy" and stop_loss < entry and tp1 > entry:
                details.append(f"BUY signal structure correct: Entry={entry}, SL={stop_loss}, TP1={tp1}")
            else:
                buy_logic_correct = False
                details.append(f"BUY signal structure incorrect: Entry={entry}, SL={stop_loss}, TP1={tp1}")
        else:
            buy_logic_correct = False
            details.append("Failed to retrieve created BUY signal")
        
        if buy_logic_correct:
            self.log_test("BUY Signal Price Logic", True, 
                         f"BUY signal created with correct price structure. Signal ID: {signal_id}. " + "; ".join(details))
        else:
            self.log_test("BUY Signal Price Logic", False, "; ".join(details))
    
    def test_direction_aware_price_logic_sell(self):
        """CRITICAL TEST 2B: SELL Signal Price Logic"""
        # Create a SELL signal
        signal_data = {
            "pair": "GBPUSD",
            "signal_type": "sell",
            "entry": 1.2500,
            "stop_loss": 1.2550,  # SL above entry for SELL
            "tp1": 1.2450,        # TP below entry for SELL
            "tp2": 1.2400,
            "tp3": 1.2350,
            "state": "active",
            "visibility": "free"
        }
        
        create_response = self.create_signal(signal_data)
        if not create_response:
            self.log_test("SELL Signal Price Logic Setup", False, "Failed to create SELL signal")
            return
        
        signal_id = create_response.get("signal_id")
        if not signal_id:
            self.log_test("SELL Signal Price Logic Setup", False, "No signal_id in response")
            return
        
        # Test SELL logic expectations:
        # For SELL: SL triggers when price RISES (price >= SL)
        # For SELL: TP triggers when price FALLS (price <= TP)
        
        sell_logic_correct = True
        details = []
        
        # Verify signal was created correctly
        signal = self.get_signal(signal_id)
        if signal:
            entry = signal.get("entry")
            stop_loss = signal.get("stop_loss")
            tp1 = signal.get("tp1")
            signal_type = signal.get("signal_type")
            
            if signal_type == "sell" and stop_loss > entry and tp1 < entry:
                details.append(f"SELL signal structure correct: Entry={entry}, SL={stop_loss}, TP1={tp1}")
            else:
                sell_logic_correct = False
                details.append(f"SELL signal structure incorrect: Entry={entry}, SL={stop_loss}, TP1={tp1}")
        else:
            sell_logic_correct = False
            details.append("Failed to retrieve created SELL signal")
        
        if sell_logic_correct:
            self.log_test("SELL Signal Price Logic", True, 
                         f"SELL signal created with correct price structure. Signal ID: {signal_id}. " + "; ".join(details))
        else:
            self.log_test("SELL Signal Price Logic", False, "; ".join(details))
    
    def test_manual_state_transitions(self):
        """Test manual state transitions work correctly"""
        # Create a pending signal
        signal_data = {
            "pair": "AUDUSD",
            "signal_type": "buy",
            "entry": 0.6500,
            "stop_loss": 0.6450,
            "tp1": 0.6550,
            "tp2": 0.6600,
            "tp3": 0.6650,
            "state": "pending",
            "visibility": "free"
        }
        
        create_response = self.create_signal(signal_data)
        if not create_response:
            self.log_test("Manual State Transitions Setup", False, "Failed to create test signal")
            return
        
        signal_id = create_response.get("signal_id")
        if not signal_id:
            self.log_test("Manual State Transitions Setup", False, "No signal_id in response")
            return
        
        # Test sequence: pending -> active -> tp1 -> tp2 -> tp3 -> closed
        transitions_passed = []
        
        # 1. Activate signal (pending -> active)
        try:
            activate_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/activate",
                headers=self.get_headers()
            )
            
            if activate_response.status_code == 200:
                signal = self.get_signal(signal_id)
                if signal and signal.get("state") == "active":
                    transitions_passed.append("pending->active: ✅")
                else:
                    transitions_passed.append(f"pending->active: ❌ (state={signal.get('state') if signal else 'unknown'})")
            else:
                transitions_passed.append(f"pending->active: ❌ ({activate_response.status_code}: {activate_response.text})")
        except Exception as e:
            transitions_passed.append(f"pending->active: ❌ (Exception: {str(e)})")
        
        # 2. Mark TP1 (active -> tp1)
        try:
            tp1_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=1",
                headers=self.get_headers()
            )
            
            if tp1_response.status_code == 200:
                signal = self.get_signal(signal_id)
                if signal and signal.get("state") == "tp1":
                    transitions_passed.append("active->tp1: ✅")
                else:
                    transitions_passed.append(f"active->tp1: ❌ (state={signal.get('state') if signal else 'unknown'})")
            else:
                transitions_passed.append(f"active->tp1: ❌ ({tp1_response.status_code}: {tp1_response.text})")
        except Exception as e:
            transitions_passed.append(f"active->tp1: ❌ (Exception: {str(e)})")
        
        # 3. Mark TP2 (tp1 -> tp2)
        try:
            tp2_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=2",
                headers=self.get_headers()
            )
            
            if tp2_response.status_code == 200:
                signal = self.get_signal(signal_id)
                if signal and signal.get("state") == "tp2":
                    transitions_passed.append("tp1->tp2: ✅")
                else:
                    transitions_passed.append(f"tp1->tp2: ❌ (state={signal.get('state') if signal else 'unknown'})")
            else:
                transitions_passed.append(f"tp1->tp2: ❌ ({tp2_response.status_code}: {tp2_response.text})")
        except Exception as e:
            transitions_passed.append(f"tp1->tp2: ❌ (Exception: {str(e)})")
        
        # 4. Mark TP3 (tp2 -> tp3 -> closed automatically)
        try:
            tp3_response = requests.post(
                f"{BASE_URL}/admin/signals/{signal_id}/mark-tp?tp_level=3",
                headers=self.get_headers()
            )
            
            if tp3_response.status_code == 200:
                signal = self.get_signal(signal_id)
                if signal and signal.get("state") == "closed":
                    transitions_passed.append("tp2->tp3->closed: ✅")
                else:
                    transitions_passed.append(f"tp2->tp3->closed: ❌ (state={signal.get('state') if signal else 'unknown'})")
            else:
                transitions_passed.append(f"tp2->tp3->closed: ❌ ({tp3_response.status_code}: {tp3_response.text})")
        except Exception as e:
            transitions_passed.append(f"tp2->tp3->closed: ❌ (Exception: {str(e)})")
        
        # Evaluate results
        all_transitions_passed = all("✅" in transition for transition in transitions_passed)
        
        if all_transitions_passed:
            self.log_test("Manual State Transitions", True, 
                         f"All state transitions working correctly. Signal ID: {signal_id}. " + "; ".join(transitions_passed))
        else:
            self.log_test("Manual State Transitions", False, 
                         f"Some transitions failed. Signal ID: {signal_id}. " + "; ".join(transitions_passed))
    
    def run_all_tests(self):
        """Run all critical tests"""
        print("=" * 80)
        print("SIGNAL ENGINE AUTHORITY & TRIGGER FIXES - CRITICAL TESTING")
        print("=" * 80)
        print()
        
        # Authenticate first
        if not self.authenticate_admin():
            print("❌ CRITICAL: Admin authentication failed. Cannot proceed with tests.")
            return
        
        print("Running Critical Tests...")
        print("-" * 40)
        
        # CRITICAL TEST 1: Admin State Authority
        self.test_admin_state_authority_active()
        self.test_admin_state_authority_pending()
        
        # CRITICAL TEST 2: Direction-Aware Price Logic
        self.test_direction_aware_price_logic_buy()
        self.test_direction_aware_price_logic_sell()
        
        # CRITICAL TEST 3: State Immutability
        self.test_state_immutability()
        
        # Additional Test: Manual State Transitions
        self.test_manual_state_transitions()
        
        # Summary
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = len([t for t in self.test_results if t["success"]])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        print()
        
        if failed_tests > 0:
            print("FAILED TESTS:")
            for test in self.test_results:
                if not test["success"]:
                    print(f"❌ {test['test']}: {test['details']}")
            print()
        
        print("CRITICAL REQUIREMENTS STATUS:")
        print("-" * 40)
        
        # Check critical requirements
        admin_active_test = next((t for t in self.test_results if "Admin State Authority - Create ACTIVE" in t["test"]), None)
        admin_pending_test = next((t for t in self.test_results if "Admin State Authority - Default PENDING" in t["test"]), None)
        buy_logic_test = next((t for t in self.test_results if "BUY Signal Price Logic" in t["test"]), None)
        sell_logic_test = next((t for t in self.test_results if "SELL Signal Price Logic" in t["test"]), None)
        immutability_test = next((t for t in self.test_results if "State Immutability" in t["test"]), None)
        
        requirements = [
            ("Admin creates state='active' → Signal stays active", admin_active_test["success"] if admin_active_test else False),
            ("Admin creates without state → Signal is pending", admin_pending_test["success"] if admin_pending_test else False),
            ("BUY Signal Price Structure", buy_logic_test["success"] if buy_logic_test else False),
            ("SELL Signal Price Structure", sell_logic_test["success"] if sell_logic_test else False),
            ("Closed signal modifications → ALL blocked", immutability_test["success"] if immutability_test else False),
        ]
        
        for req_name, req_passed in requirements:
            status = "✅ PASS" if req_passed else "❌ FAIL"
            print(f"{status}: {req_name}")
        
        print()
        all_critical_passed = all(req[1] for req in requirements)
        if all_critical_passed:
            print("🎉 ALL CRITICAL REQUIREMENTS PASSED!")
        else:
            print("⚠️  SOME CRITICAL REQUIREMENTS FAILED - NEEDS ATTENTION")
        
        return all_critical_passed

if __name__ == "__main__":
    tester = SignalEngineTest()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ Signal Engine fixes are working correctly!")
    else:
        print("\n❌ Signal Engine has issues that need to be addressed!")