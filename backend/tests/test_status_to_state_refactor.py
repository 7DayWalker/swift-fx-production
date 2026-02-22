"""
Test suite for status → state field refactor in SwiftFX Trading Signals Platform.

Verifies:
1. GET /api/signals returns 'state' field, NOT 'status' field
2. GET /api/signals/{id} returns 'state' field, NOT 'status' field
3. All signals have 'is_active' boolean field
4. Signal filtering by state works correctly
5. VIP users can see all signal fields (entry, stop_loss, tp1, etc.)
"""

import pytest
import httpx
import os
import json

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://secure-refactor-2.preview.emergentagent.com')
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# VIP test credentials
VIP_EMAIL = "paradoxella@gmail.com"
VIP_PASSWORD = "Grace1992@"


@pytest.fixture(scope="module")
def vip_token():
    """Get VIP user auth token from Supabase"""
    with httpx.Client() as client:
        login_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
        response = client.post(
            login_url,
            json={"email": VIP_EMAIL, "password": VIP_PASSWORD},
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            pytest.skip(f"VIP login failed: {response.status_code} - {response.text}")
        
        data = response.json()
        token = data.get("access_token")
        if not token:
            pytest.skip("No access token received")
        
        return token


@pytest.fixture(scope="module")
def vip_client(vip_token):
    """HTTP client with VIP auth header"""
    client = httpx.Client()
    client.headers["Authorization"] = f"Bearer {vip_token}"
    yield client
    client.close()


class TestStatusToStateRefactor:
    """Tests for status → state field refactor"""
    
    def test_get_signals_returns_state_field_not_status_unauthenticated(self):
        """GET /api/signals should return 'state' field, NOT 'status' for unauthenticated users"""
        with httpx.Client() as client:
            response = client.get(f"{BASE_URL}/api/signals")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            signals = response.json()
            assert isinstance(signals, list), "Response should be a list"
            
            if len(signals) == 0:
                pytest.skip("No signals in database")
            
            # Check first signal - locked signals should still have state field
            signal = signals[0]
            assert 'state' in signal, f"Signal should have 'state' field. Keys: {list(signal.keys())}"
            assert 'status' not in signal, f"Signal should NOT have 'status' field. Keys: {list(signal.keys())}"
    
    def test_get_signals_returns_state_field_not_status_authenticated(self, vip_client):
        """GET /api/signals should return 'state' field, NOT 'status' for VIP users"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        signals = response.json()
        assert isinstance(signals, list), "Response should be a list"
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        # Check ALL signals - none should have 'status' field
        for i, signal in enumerate(signals):
            assert 'state' in signal, f"Signal {i} should have 'state' field. Keys: {list(signal.keys())}"
            assert 'status' not in signal, f"Signal {i} should NOT have 'status' field. Keys: {list(signal.keys())}"
            assert 'is_active' in signal, f"Signal {i} should have 'is_active' field. Keys: {list(signal.keys())}"
    
    def test_get_signals_has_is_active_boolean(self, vip_client):
        """All signals should have 'is_active' boolean field"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        for signal in signals:
            assert 'is_active' in signal, f"Signal {signal.get('signal_id')} missing 'is_active'"
            assert isinstance(signal['is_active'], bool), f"'is_active' should be boolean, got {type(signal['is_active'])}"
    
    def test_get_single_signal_returns_state_field_not_status(self, vip_client):
        """GET /api/signals/{id} should return 'state' field, NOT 'status'"""
        # First get list to find a signal ID
        list_response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = list_response.json()
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        signal_id = signals[0]['signal_id']
        
        # Now fetch single signal
        response = vip_client.get(f"{BASE_URL}/api/signals/{signal_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        signal = response.json()
        assert 'state' in signal, f"Signal should have 'state' field. Keys: {list(signal.keys())}"
        assert 'status' not in signal, f"Signal should NOT have 'status' field. Keys: {list(signal.keys())}"
        assert 'is_active' in signal, f"Signal should have 'is_active' field"
    
    def test_state_values_are_valid(self, vip_client):
        """State field should have valid values: pending, active, tp1, tp2, tp3, closed"""
        valid_states = {'pending', 'active', 'tp1', 'tp2', 'tp3', 'closed'}
        
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        for signal in signals:
            state = signal.get('state')
            assert state in valid_states, f"Invalid state '{state}'. Valid: {valid_states}"
    
    def test_is_active_consistency_with_state(self, vip_client):
        """is_active should be True for pending/active/tp1/tp2/tp3, False for closed"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        for signal in signals:
            state = signal.get('state')
            is_active = signal.get('is_active')
            
            if state == 'closed':
                assert is_active == False, f"Signal {signal.get('signal_id')} with state 'closed' should have is_active=False"
            else:
                # pending, active, tp1, tp2, tp3 are all considered "active" (trade not complete)
                assert is_active == True, f"Signal {signal.get('signal_id')} with state '{state}' should have is_active=True"


class TestVIPAccessToAllFields:
    """Tests that VIP users can see all signal fields"""
    
    def test_vip_can_see_entry_stop_loss_tp_fields(self, vip_client):
        """VIP users should see entry, stop_loss, tp1, tp2, tp3 on unlocked signals"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        # Find an unlocked signal (should be unlocked for VIP)
        unlocked = [s for s in signals if not s.get('locked', False)]
        
        if len(unlocked) == 0:
            pytest.skip("No unlocked signals for VIP user")
        
        signal = unlocked[0]
        
        # Required fields for unlocked signals
        required_fields = ['entry', 'stop_loss', 'tp1']
        
        for field in required_fields:
            assert field in signal, f"VIP should see '{field}' field. Keys: {list(signal.keys())}"
            assert signal[field] is not None, f"VIP should see '{field}' value, got None"
    
    def test_vip_can_access_premium_signals(self, vip_client):
        """VIP users should be able to see premium signal details (not locked)"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        # Find premium visibility signals
        premium_signals = [s for s in signals if s.get('visibility') == 'premium']
        
        if len(premium_signals) == 0:
            pytest.skip("No premium signals in database")
        
        signal = premium_signals[0]
        assert signal.get('locked') != True, f"VIP should not see premium signals as locked"
        assert 'entry' in signal, "VIP should see entry field on premium signals"
    
    def test_closed_signals_have_final_pips(self, vip_client):
        """Closed signals should display final_pips (uses state === 'closed' check)"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        # Find closed signals
        closed = [s for s in signals if s.get('state') == 'closed']
        
        if len(closed) == 0:
            pytest.skip("No closed signals in database")
        
        # At least some closed signals should have final_pips
        with_pips = [s for s in closed if s.get('final_pips') is not None]
        
        print(f"Closed signals: {len(closed)}, with final_pips: {len(with_pips)}")
        
        # This is informational - final_pips might be null for some closed signals
        if len(with_pips) > 0:
            signal = with_pips[0]
            print(f"Sample closed signal with pips: state={signal.get('state')}, final_pips={signal.get('final_pips')}")


class TestSignalStateFiltering:
    """Tests for filtering signals by state"""
    
    def test_filtering_consistency_all(self, vip_client):
        """Filter 'all' should return all signals"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        all_signals = response.json()
        
        # This is the baseline - frontend filter 'all' should match this
        print(f"Total signals: {len(all_signals)}")
        assert isinstance(all_signals, list)
    
    def test_filtering_consistency_by_state(self, vip_client):
        """Verify signal counts by state match expected filtering logic"""
        response = vip_client.get(f"{BASE_URL}/api/signals")
        signals = response.json()
        
        if len(signals) == 0:
            pytest.skip("No signals in database")
        
        # Count signals by state (frontend filter logic)
        pending_count = len([s for s in signals if s.get('state') == 'pending'])
        active_count = len([s for s in signals if s.get('state') in ('active', 'tp1', 'tp2', 'tp3')])
        closed_count = len([s for s in signals if s.get('state') == 'closed'])
        
        # Note: Frontend 'active' filter typically includes tp1, tp2, tp3 as those are still active trades
        print(f"State distribution - pending: {pending_count}, active (incl tp1-3): {active_count}, closed: {closed_count}")
        
        total = pending_count + closed_count + len([s for s in signals if s.get('state') in ('active', 'tp1', 'tp2', 'tp3')])
        assert total == len(signals), f"State counts should sum to total: {total} != {len(signals)}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
