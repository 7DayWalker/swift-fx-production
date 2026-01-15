#!/usr/bin/env python3
"""
Manual Signal Mode Testing Suite
Tests the manual signal mode where auto-engine is DISABLED.
Covers all requirements from the review request:
1. Verify Manual Mode Status
2. Admin State Authority (Still Works)
3. Manual State Control Works
4. Pip Calculation on Manual Close
5. Closed Signal Immutability (Still Enforced)
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
        self.created_signals = []
        
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
                self.log_test("Admin Authentication", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Exception: {str(e)}")
            return False
    
    def get_headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_automation_status(self) -> bool:
        """TEST 1: Verify Manual Mode Status"""
        try:
            response = requests.get(f"{BACKEND_URL}/automation/status", headers=self.get_headers())
            
            if response.status_code == 200:
                data = response.json()
                mode = data.get("mode")
                auto_engine_running = data.get("auto_engine_running")
                
                if mode == "MANUAL" and auto_engine_running == False:
                    self.log_test("Automation Status Check", True, f"Mode: {mode}, Auto Engine: {auto_engine_running}")
                    return True
                else:
                    self.log_test("Automation Status Check", False, f"Expected MANUAL mode with auto_engine_running=false, got mode={mode}, auto_engine_running={auto_engine_running}")
                    return False
            else:
                self.log_test("Automation Status Check", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Automation Status Check", False, f"Exception: {str(e)}")
            return False
    
    def test_create_active_signal(self) -> Optional[str]:
        """TEST 2A: Create ACTIVE signal directly (Admin State Authority)"""
        try:
            signal_data = {
                "pair": "EURUSD",
                "signal_type": "buy",
                "entry": 1.0800,
                "stop_loss": 1.0750,
                "tp1": 1.0850,
                "state": "active",
                "visibility": "free"
            }
            
            response = requests.post(f"{BACKEND_URL}/admin/signals", 
                                   json=signal_data, 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                data = response.json()
                signal_id = data.get("signal_id")
                
                # Verify signal was created as active
                verify_response = requests.get(f"{BACKEND_URL}/signals/{signal_id}", headers=self.get_headers())
                if verify_response.status_code == 200:
                    signal = verify_response.json()
                    state = signal.get("state")
                    
                    if state == "active":
                        self.created_signals.append(signal_id)
                        self.log_test("Create ACTIVE Signal", True, f"Signal {signal_id} created with state: {state}")
                        return signal_id
                    else:
                        self.log_test("Create ACTIVE Signal", False, f"Signal created but state is {state}, expected 'active'")
                        return None
                else:
                    self.log_test("Create ACTIVE Signal", False, f"Failed to verify signal: {verify_response.status_code}")
                    return None
            else:
                self.log_test("Create ACTIVE Signal", False, f"Status: {response.status_code}, Response: {response.text}")
                return None
                
        except Exception as e:
            self.log_test("Create ACTIVE Signal", False, f"Exception: {str(e)}")
            return None
    
    def test_create_pending_signal(self) -> Optional[str]:
        """TEST 2B: Create PENDING signal"""
        try:
            signal_data = {
                "pair": "GBPUSD",
                "signal_type": "sell",
                "entry": 1.2700,
                "stop_loss": 1.2750,
                "tp1": 1.2650,
                "visibility": "free"
            }
            
            response = requests.post(f"{BACKEND_URL}/admin/signals", 
                                   json=signal_data, 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                data = response.json()
                signal_id = data.get("signal_id")
                
                # Verify signal stays pending
                verify_response = requests.get(f"{BACKEND_URL}/signals/{signal_id}", headers=self.get_headers())
                if verify_response.status_code == 200:
                    signal = verify_response.json()
                    state = signal.get("state")
                    
                    if state == "pending":
                        self.created_signals.append(signal_id)
                        self.log_test("Create PENDING Signal", True, f"Signal {signal_id} created with state: {state}")
                        return signal_id
                    else:
                        self.log_test("Create PENDING Signal", False, f"Signal created but state is {state}, expected 'pending'")
                        return None
                else:
                    self.log_test("Create PENDING Signal", False, f"Failed to verify signal: {verify_response.status_code}")
                    return None
            else:
                self.log_test("Create PENDING Signal", False, f"Status: {response.status_code}, Response: {response.text}")
                return None
                
        except Exception as e:
            self.log_test("Create PENDING Signal", False, f"Exception: {str(e)}")
            return None
    
    def test_manual_activate(self, pending_signal_id: str) -> bool:
        """TEST 3A: Manually activate a pending signal"""
        try:
            response = requests.post(f"{BACKEND_URL}/admin/signals/{pending_signal_id}/activate", 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                # Verify signal changed to active
                verify_response = requests.get(f"{BACKEND_URL}/signals/{pending_signal_id}", headers=self.get_headers())
                if verify_response.status_code == 200:
                    signal = verify_response.json()
                    state = signal.get("state")
                    
                    if state == "active":
                        self.log_test("Manual Activate Signal", True, f"Signal {pending_signal_id} activated: pending → active")
                        return True
                    else:
                        self.log_test("Manual Activate Signal", False, f"Signal state is {state}, expected 'active'")
                        return False
                else:
                    self.log_test("Manual Activate Signal", False, f"Failed to verify activation: {verify_response.status_code}")
                    return False
            else:
                self.log_test("Manual Activate Signal", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Manual Activate Signal", False, f"Exception: {str(e)}")
            return False
    
    def test_manual_mark_tp(self, active_signal_id: str) -> bool:
        """TEST 3B: Manually mark TP1 hit"""
        try:
            response = requests.post(f"{BACKEND_URL}/admin/signals/{active_signal_id}/mark-tp?tp_level=1", 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                # Verify signal changed to tp1
                verify_response = requests.get(f"{BACKEND_URL}/signals/{active_signal_id}", headers=self.get_headers())
                if verify_response.status_code == 200:
                    signal = verify_response.json()
                    state = signal.get("state")
                    tp_hit = signal.get("tp_hit")
                    
                    if state == "tp1" and tp_hit == 1:
                        self.log_test("Manual Mark TP1", True, f"Signal {active_signal_id}: active → tp1, tp_hit: {tp_hit}")
                        return True
                    else:
                        self.log_test("Manual Mark TP1", False, f"Signal state: {state}, tp_hit: {tp_hit}, expected state='tp1', tp_hit=1")
                        return False
                else:
                    self.log_test("Manual Mark TP1", False, f"Failed to verify TP1: {verify_response.status_code}")
                    return False
            else:
                self.log_test("Manual Mark TP1", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Manual Mark TP1", False, f"Exception: {str(e)}")
            return False
    
    def test_manual_force_close(self, signal_id: str) -> bool:
        """TEST 3C: Manually close a signal"""
        try:
            response = requests.post(f"{BACKEND_URL}/admin/signals/{signal_id}/force-close?close_price=1.0830&exit_reason=manual", 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                data = response.json()
                # Verify signal changed to closed
                verify_response = requests.get(f"{BACKEND_URL}/signals/{signal_id}", headers=self.get_headers())
                if verify_response.status_code == 200:
                    signal = verify_response.json()
                    state = signal.get("state")
                    exit_price = signal.get("exit_price")
                    final_pips = signal.get("final_pips")
                    closed_at = signal.get("closed_at")
                    
                    if state == "closed" and exit_price and closed_at:
                        self.log_test("Manual Force Close", True, f"Signal {signal_id} closed: state={state}, exit_price={exit_price}, final_pips={final_pips}")
                        return True
                    else:
                        self.log_test("Manual Force Close", False, f"Signal state: {state}, exit_price: {exit_price}, closed_at: {closed_at}")
                        return False
                else:
                    self.log_test("Manual Force Close", False, f"Failed to verify close: {verify_response.status_code}")
                    return False
            else:
                self.log_test("Manual Force Close", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Manual Force Close", False, f"Exception: {str(e)}")
            return False
    
    def test_pip_calculation_buy(self) -> bool:
        """TEST 4A: Pip calculation on manual close - BUY signal"""
        try:
            # Create BUY signal with entry=100
            signal_data = {
                "pair": "EURUSD",
                "signal_type": "buy",
                "entry": 1.0000,
                "stop_loss": 0.9950,
                "tp1": 1.0050,
                "state": "active",
                "visibility": "free"
            }
            
            response = requests.post(f"{BACKEND_URL}/admin/signals", 
                                   json=signal_data, 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                data = response.json()
                signal_id = data.get("signal_id")
                self.created_signals.append(signal_id)
                
                # Force close with close_price=105 (profit)
                close_response = requests.post(f"{BACKEND_URL}/admin/signals/{signal_id}/force-close?close_price=1.0050&exit_reason=test", 
                                             headers=self.get_headers())
                
                if close_response.status_code == 200:
                    # Verify final_pips is positive
                    verify_response = requests.get(f"{BACKEND_URL}/signals/{signal_id}", headers=self.get_headers())
                    if verify_response.status_code == 200:
                        signal = verify_response.json()
                        final_pips = signal.get("final_pips")
                        
                        if final_pips and final_pips > 0:
                            self.log_test("Pip Calculation BUY (Profit)", True, f"BUY signal: entry=1.0000, close=1.0050, final_pips={final_pips} (positive)")
                            return True
                        else:
                            self.log_test("Pip Calculation BUY (Profit)", False, f"Expected positive pips, got: {final_pips}")
                            return False
                    else:
                        self.log_test("Pip Calculation BUY (Profit)", False, f"Failed to verify pips: {verify_response.status_code}")
                        return False
                else:
                    self.log_test("Pip Calculation BUY (Profit)", False, f"Failed to close signal: {close_response.status_code}")
                    return False
            else:
                self.log_test("Pip Calculation BUY (Profit)", False, f"Failed to create signal: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Pip Calculation BUY (Profit)", False, f"Exception: {str(e)}")
            return False
    
    def test_pip_calculation_sell(self) -> bool:
        """TEST 4B: Pip calculation on manual close - SELL signal"""
        try:
            # Create SELL signal with entry=100
            signal_data = {
                "pair": "EURUSD",
                "signal_type": "sell",
                "entry": 1.0000,
                "stop_loss": 1.0050,
                "tp1": 0.9950,
                "state": "active",
                "visibility": "free"
            }
            
            response = requests.post(f"{BACKEND_URL}/admin/signals", 
                                   json=signal_data, 
                                   headers=self.get_headers())
            
            if response.status_code == 200:
                data = response.json()
                signal_id = data.get("signal_id")
                self.created_signals.append(signal_id)
                
                # Force close with close_price=95 (profit for SELL)
                close_response = requests.post(f"{BACKEND_URL}/admin/signals/{signal_id}/force-close?close_price=0.9950&exit_reason=test", 
                                             headers=self.get_headers())
                
                if close_response.status_code == 200:
                    # Verify final_pips is positive
                    verify_response = requests.get(f"{BACKEND_URL}/signals/{signal_id}", headers=self.get_headers())
                    if verify_response.status_code == 200:
                        signal = verify_response.json()
                        final_pips = signal.get("final_pips")
                        
                        if final_pips and final_pips > 0:
                            self.log_test("Pip Calculation SELL (Profit)", True, f"SELL signal: entry=1.0000, close=0.9950, final_pips={final_pips} (positive)")
                            return True
                        else:
                            self.log_test("Pip Calculation SELL (Profit)", False, f"Expected positive pips, got: {final_pips}")
                            return False
                    else:
                        self.log_test("Pip Calculation SELL (Profit)", False, f"Failed to verify pips: {verify_response.status_code}")
                        return False
                else:
                    self.log_test("Pip Calculation SELL (Profit)", False, f"Failed to close signal: {close_response.status_code}")
                    return False
            else:
                self.log_test("Pip Calculation SELL (Profit)", False, f"Failed to create signal: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Pip Calculation SELL (Profit)", False, f"Exception: {str(e)}")
            return False
    
    def test_closed_signal_immutability(self) -> bool:
        """TEST 5: Closed Signal Immutability"""
        try:
            # Get a closed signal (use one we created and closed)
            if not self.created_signals:
                self.log_test("Closed Signal Immutability", False, "No closed signals available for testing")
                return False
            
            # Find a closed signal
            closed_signal_id = None
            for signal_id in self.created_signals:
                verify_response = requests.get(f"{BACKEND_URL}/signals/{signal_id}", headers=self.get_headers())
                if verify_response.status_code == 200:
                    signal = verify_response.json()
                    if signal.get("state") == "closed":
                        closed_signal_id = signal_id
                        break
            
            if not closed_signal_id:
                self.log_test("Closed Signal Immutability", False, "No closed signals found for immutability testing")
                return False
            
            # Test 1: Try to activate closed signal
            activate_response = requests.post(f"{BACKEND_URL}/admin/signals/{closed_signal_id}/activate", 
                                            headers=self.get_headers())
            
            # Test 2: Try to mark-tp on closed signal
            mark_tp_response = requests.post(f"{BACKEND_URL}/admin/signals/{closed_signal_id}/mark-tp?tp_level=1", 
                                           headers=self.get_headers())
            
            # Test 3: Try to force-close closed signal
            force_close_response = requests.post(f"{BACKEND_URL}/admin/signals/{closed_signal_id}/force-close", 
                                               headers=self.get_headers())
            
            # All should fail with 400 status
            activate_blocked = activate_response.status_code == 400 and "immutable" in activate_response.text.lower()
            mark_tp_blocked = mark_tp_response.status_code == 400 and "immutable" in mark_tp_response.text.lower()
            force_close_blocked = force_close_response.status_code == 400 and "immutable" in force_close_response.text.lower()
            
            if activate_blocked and mark_tp_blocked and force_close_blocked:
                self.log_test("Closed Signal Immutability", True, f"All operations on closed signal {closed_signal_id} correctly blocked")
                return True
            else:
                details = f"Activate blocked: {activate_blocked}, Mark-TP blocked: {mark_tp_blocked}, Force-close blocked: {force_close_blocked}"
                self.log_test("Closed Signal Immutability", False, details)
                return False
                
        except Exception as e:
            self.log_test("Closed Signal Immutability", False, f"Exception: {str(e)}")
            return False
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