#!/usr/bin/env python3
"""
Signal Lifecycle Engine v2.0 Testing Suite
Tests the completely rebuilt signal engine with focus on:
1. Admin State Authority
2. Pip Calculation Logic  
3. State Immutability
4. Exit Handling
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL from environment
BACKEND_URL = "https://signallifecycle.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@swiftfx.com"
ADMIN_PASSWORD = "adminpassword"

class TestRunner:
    def __init__(self):
        self.admin_token = None
        self.test_results = []
        
    def log_test(self, test_name: str, passed: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "details": details
        })
        
    def setup_admin_auth(self) -> bool:
        """Authenticate as admin"""
        try:
            response = requests.post(f"{BACKEND_URL}/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("token")
                self.log_test("Admin Authentication", True, f"Token obtained")
                return True
            else:
                self.log_test("Admin Authentication", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Exception: {str(e)}")
            return False
    
    def get_headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    def create_signal(self, signal_data: Dict[str, Any]) -> Optional[str]:
        """Create a signal and return signal_id"""
        try:
            response = requests.post(
                f"{BACKEND_URL}/admin/signals",
                json=signal_data,
                headers=self.get_headers()
            )
            
            if response.status_code == 200:
                return response.json().get("signal_id")
            else:
                print(f"Failed to create signal: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"Exception creating signal: {str(e)}")
            return None
    
    def get_signal(self, signal_id: str) -> Optional[Dict[str, Any]]:
        """Get signal details"""
        try:
            response = requests.get(
                f"{BACKEND_URL}/signals/{signal_id}",
                headers=self.get_headers()
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return None
                
        except Exception as e:
            print(f"Exception getting signal: {str(e)}")
            return None
    
    def test_admin_state_authority(self):
        """CRITICAL TEST 1: Admin State Authority"""
        print("\n=== CRITICAL TEST 1: Admin State Authority ===")
        
        # Test 1A: Create ACTIVE signal directly
        active_signal_data = {
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
        
        signal_id = self.create_signal(active_signal_data)
        if signal_id:
            signal = self.get_signal(signal_id)
            if signal and signal.get("state") == "active":
                self.log_test("Admin creates ACTIVE signal", True, f"Signal {signal_id} created with state='active'")
            else:
                self.log_test("Admin creates ACTIVE signal", False, f"Signal state is '{signal.get('state') if signal else 'None'}', expected 'active'")
        else:
            self.log_test("Admin creates ACTIVE signal", False, "Failed to create signal")
        
        # Test 1B: Create default PENDING signal
        pending_signal_data = {
            "pair": "GBPUSD",
            "signal_type": "sell",
            "entry": 1.2700,
            "stop_loss": 1.2750,
            "tp1": 1.2650,
            "visibility": "free"
        }
        
        signal_id = self.create_signal(pending_signal_data)
        if signal_id:
            signal = self.get_signal(signal_id)
            if signal and signal.get("state") == "pending":
                self.log_test("Default signal is PENDING", True, f"Signal {signal_id} created with state='pending'")
            else:
                self.log_test("Default signal is PENDING", False, f"Signal state is '{signal.get('state') if signal else 'None'}', expected 'pending'")
        else:
            self.log_test("Default signal is PENDING", False, "Failed to create signal")
    
    def test_pip_calculation_logic(self):
        """CRITICAL TEST 2: Pip Calculation Logic"""
        print("\n=== CRITICAL TEST 2: Pip Calculation Logic ===")
        
        # Test 2A: SELL signal - profit when price goes DOWN
        sell_signal_data = {
            "pair": "EURUSD",
            "signal_type": "sell",
            "entry": 1.1000,
            "stop_loss": 1.1050,
            "tp1": 1.0950,
            "tp2": 1.0900,
            "tp3": 1.0850,
            "state": "active",
            "visibility": "free"
        }
        
        sell_signal_id = self.create_signal(sell_signal_data)
        if sell_signal_id:
            # Test SELL TP hit (price goes DOWN = profit)
            try:
                response = requests.post(
                    f"{BACKEND_URL}/admin/signals/{sell_signal_id}/force-close?close_price=1.0950",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    result = response.json()
                    final_pips = result.get("final_pips")
                    # SELL: entry=1.1000, exit=1.0950 → pips = (1.1000 - 1.0950) * 10000 = +50 pips
                    if final_pips and final_pips > 0:
                        self.log_test("SELL TP pips calculation", True, f"SELL signal: entry=1.1000, exit=1.0950 → pips={final_pips} (positive)")
                    else:
                        self.log_test("SELL TP pips calculation", False, f"Expected positive pips, got {final_pips}")
                else:
                    self.log_test("SELL TP pips calculation", False, f"Force close failed: {response.status_code}")
            except Exception as e:
                self.log_test("SELL TP pips calculation", False, f"Exception: {str(e)}")
            
            # Test SELL SL hit (price goes UP = loss)
            sell_sl_signal_data = {
                "pair": "EURUSD",
                "signal_type": "sell",
                "entry": 1.1000,
                "stop_loss": 1.1050,
                "tp1": 1.0950,
                "state": "active",
                "visibility": "free"
            }
            
            sell_sl_signal_id = self.create_signal(sell_sl_signal_data)
            if sell_sl_signal_id:
                try:
                    response = requests.post(
                        f"{BACKEND_URL}/admin/signals/{sell_sl_signal_id}/force-close?close_price=1.1050",
                        headers=self.get_headers()
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        final_pips = result.get("final_pips")
                        # SELL: entry=1.1000, exit=1.1050 → pips = (1.1000 - 1.1050) * 10000 = -50 pips
                        if final_pips and final_pips < 0:
                            self.log_test("SELL SL pips calculation", True, f"SELL signal: entry=1.1000, exit=1.1050 → pips={final_pips} (negative)")
                        else:
                            self.log_test("SELL SL pips calculation", False, f"Expected negative pips, got {final_pips}")
                    else:
                        self.log_test("SELL SL pips calculation", False, f"Force close failed: {response.status_code}")
                except Exception as e:
                    self.log_test("SELL SL pips calculation", False, f"Exception: {str(e)}")
        
        # Test 2B: BUY signal - profit when price goes UP
        buy_signal_data = {
            "pair": "EURUSD",
            "signal_type": "buy",
            "entry": 1.1000,
            "stop_loss": 1.0950,
            "tp1": 1.1050,
            "tp2": 1.1100,
            "tp3": 1.1150,
            "state": "active",
            "visibility": "free"
        }
        
        buy_signal_id = self.create_signal(buy_signal_data)
        if buy_signal_id:
            # Test BUY TP hit (price goes UP = profit)
            try:
                response = requests.post(
                    f"{BACKEND_URL}/admin/signals/{buy_signal_id}/force-close?close_price=1.1050",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    result = response.json()
                    final_pips = result.get("final_pips")
                    # BUY: entry=1.1000, exit=1.1050 → pips = (1.1050 - 1.1000) * 10000 = +50 pips
                    if final_pips and final_pips > 0:
                        self.log_test("BUY TP pips calculation", True, f"BUY signal: entry=1.1000, exit=1.1050 → pips={final_pips} (positive)")
                    else:
                        self.log_test("BUY TP pips calculation", False, f"Expected positive pips, got {final_pips}")
                else:
                    self.log_test("BUY TP pips calculation", False, f"Force close failed: {response.status_code}")
            except Exception as e:
                self.log_test("BUY TP pips calculation", False, f"Exception: {str(e)}")
            
            # Test BUY SL hit (price goes DOWN = loss)
            buy_sl_signal_data = {
                "pair": "EURUSD",
                "signal_type": "buy",
                "entry": 1.1000,
                "stop_loss": 1.0950,
                "tp1": 1.1050,
                "state": "active",
                "visibility": "free"
            }
            
            buy_sl_signal_id = self.create_signal(buy_sl_signal_data)
            if buy_sl_signal_id:
                try:
                    response = requests.post(
                        f"{BACKEND_URL}/admin/signals/{buy_sl_signal_id}/force-close?close_price=1.0950",
                        headers=self.get_headers()
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        final_pips = result.get("final_pips")
                        # BUY: entry=1.1000, exit=1.0950 → pips = (1.0950 - 1.1000) * 10000 = -50 pips
                        if final_pips and final_pips < 0:
                            self.log_test("BUY SL pips calculation", True, f"BUY signal: entry=1.1000, exit=1.0950 → pips={final_pips} (negative)")
                        else:
                            self.log_test("BUY SL pips calculation", False, f"Expected negative pips, got {final_pips}")
                    else:
                        self.log_test("BUY SL pips calculation", False, f"Force close failed: {response.status_code}")
                except Exception as e:
                    self.log_test("BUY SL pips calculation", False, f"Exception: {str(e)}")
    
    def test_state_immutability(self):
        """CRITICAL TEST 3: State Immutability"""
        print("\n=== CRITICAL TEST 3: State Immutability ===")
        
        # Create and close a signal
        signal_data = {
            "pair": "EURUSD",
            "signal_type": "buy",
            "entry": 1.1000,
            "stop_loss": 1.0950,
            "tp1": 1.1050,
            "state": "active",
            "visibility": "free"
        }
        
        signal_id = self.create_signal(signal_data)
        if signal_id:
            # Close the signal
            try:
                response = requests.post(
                    f"{BACKEND_URL}/admin/signals/{signal_id}/force-close?close_price=1.1050",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    # Verify signal is closed
                    signal = self.get_signal(signal_id)
                    if signal and signal.get("state") == "closed":
                        self.log_test("Signal successfully closed", True, f"Signal {signal_id} state is 'closed'")
                        
                        # Test 3A: Try transition (should fail)
                        try:
                            transition_response = requests.post(
                                f"{BACKEND_URL}/admin/signals/{signal_id}/transition",
                                json={"new_state": "active"},
                                headers=self.get_headers()
                            )
                            
                            if transition_response.status_code == 400 and "immutable" in transition_response.text.lower():
                                self.log_test("Closed signal blocks transitions", True, "Transition correctly blocked with 'immutable' error")
                            else:
                                self.log_test("Closed signal blocks transitions", False, f"Expected 400 with 'immutable', got {transition_response.status_code}: {transition_response.text}")
                        except Exception as e:
                            self.log_test("Closed signal blocks transitions", False, f"Exception: {str(e)}")
                        
                        # Test 3B: Try activate (should fail)
                        try:
                            activate_response = requests.post(
                                f"{BACKEND_URL}/admin/signals/{signal_id}/activate",
                                headers=self.get_headers()
                            )
                            
                            if activate_response.status_code == 400 and "immutable" in activate_response.text.lower():
                                self.log_test("Closed signal blocks activation", True, "Activation correctly blocked with 'immutable' error")
                            else:
                                self.log_test("Closed signal blocks activation", False, f"Expected 400 with 'immutable', got {activate_response.status_code}: {activate_response.text}")
                        except Exception as e:
                            self.log_test("Closed signal blocks activation", False, f"Exception: {str(e)}")
                        
                        # Test 3C: Try mark-tp (should fail)
                        try:
                            tp_response = requests.post(
                                f"{BACKEND_URL}/admin/signals/{signal_id}/mark-tp?tp_level=1",
                                headers=self.get_headers()
                            )
                            
                            if tp_response.status_code == 400 and "immutable" in tp_response.text.lower():
                                self.log_test("Closed signal blocks TP marking", True, "TP marking correctly blocked with 'immutable' error")
                            else:
                                self.log_test("Closed signal blocks TP marking", False, f"Expected 400 with 'immutable', got {tp_response.status_code}: {tp_response.text}")
                        except Exception as e:
                            self.log_test("Closed signal blocks TP marking", False, f"Exception: {str(e)}")
                        
                        # Test 3D: Try force-close again (should fail)
                        try:
                            close_response = requests.post(
                                f"{BACKEND_URL}/admin/signals/{signal_id}/force-close?close_price=1.1000",
                                headers=self.get_headers()
                            )
                            
                            if close_response.status_code == 400 and ("immutable" in close_response.text.lower() or "already closed" in close_response.text.lower()):
                                self.log_test("Closed signal blocks re-closing", True, "Re-closing correctly blocked")
                            else:
                                self.log_test("Closed signal blocks re-closing", False, f"Expected 400 with 'immutable/already closed', got {close_response.status_code}: {close_response.text}")
                        except Exception as e:
                            self.log_test("Closed signal blocks re-closing", False, f"Exception: {str(e)}")
                    else:
                        self.log_test("Signal successfully closed", False, f"Signal state is '{signal.get('state') if signal else 'None'}', expected 'closed'")
                else:
                    self.log_test("Signal successfully closed", False, f"Force close failed: {response.status_code}")
            except Exception as e:
                self.log_test("Signal successfully closed", False, f"Exception: {str(e)}")
    
    def test_exit_handling(self):
        """CRITICAL TEST 4: Exit Handling"""
        print("\n=== CRITICAL TEST 4: Exit Handling ===")
        
        # Create and close a signal to test exit field population
        signal_data = {
            "pair": "EURUSD",
            "signal_type": "buy",
            "entry": 1.1000,
            "stop_loss": 1.0950,
            "tp1": 1.1050,
            "tp2": 1.1100,
            "tp3": 1.1150,
            "state": "active",
            "visibility": "free"
        }
        
        signal_id = self.create_signal(signal_data)
        if signal_id:
            try:
                # Close with specific price
                close_price = 1.1075
                response = requests.post(
                    f"{BACKEND_URL}/admin/signals/{signal_id}/force-close?close_price={close_price}",
                    headers=self.get_headers()
                )
                
                if response.status_code == 200:
                    # Get updated signal
                    signal = self.get_signal(signal_id)
                    if signal:
                        # Check all required exit fields
                        state = signal.get("state")
                        exit_price = signal.get("exit_price")
                        final_pips = signal.get("final_pips")
                        closed_at = signal.get("closed_at")
                        
                        # Test state is closed
                        if state == "closed":
                            self.log_test("Exit handling: state set to closed", True, f"State is 'closed'")
                        else:
                            self.log_test("Exit handling: state set to closed", False, f"State is '{state}', expected 'closed'")
                        
                        # Test exit_price is set
                        if exit_price == close_price:
                            self.log_test("Exit handling: exit_price set", True, f"exit_price={exit_price}")
                        else:
                            self.log_test("Exit handling: exit_price set", False, f"exit_price={exit_price}, expected {close_price}")
                        
                        # Test final_pips is calculated
                        if final_pips is not None:
                            expected_pips = (close_price - 1.1000) * 10000  # BUY signal
                            if abs(final_pips - expected_pips) < 0.1:
                                self.log_test("Exit handling: final_pips calculated", True, f"final_pips={final_pips}")
                            else:
                                self.log_test("Exit handling: final_pips calculated", False, f"final_pips={final_pips}, expected ~{expected_pips}")
                        else:
                            self.log_test("Exit handling: final_pips calculated", False, "final_pips is None")
                        
                        # Test closed_at is set
                        if closed_at:
                            self.log_test("Exit handling: closed_at timestamp set", True, f"closed_at={closed_at}")
                        else:
                            self.log_test("Exit handling: closed_at timestamp set", False, "closed_at is None")
                    else:
                        self.log_test("Exit handling: signal retrieval", False, "Could not retrieve closed signal")
                else:
                    self.log_test("Exit handling: force close", False, f"Force close failed: {response.status_code}")
            except Exception as e:
                self.log_test("Exit handling: force close", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all critical tests"""
        print("🚀 Starting Signal Lifecycle Engine v2.0 Testing Suite")
        print("=" * 60)
        
        # Setup
        if not self.setup_admin_auth():
            print("❌ Cannot proceed without admin authentication")
            return False
        
        # Run all critical tests
        self.test_admin_state_authority()
        self.test_pip_calculation_logic()
        self.test_state_immutability()
        self.test_exit_handling()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["passed"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        # List failed tests
        failed_tests = [result for result in self.test_results if not result["passed"]]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test']}: {test['details']}")
        else:
            print(f"\n✅ ALL TESTS PASSED!")
        
        return len(failed_tests) == 0

if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all_tests()
    sys.exit(0 if success else 1)