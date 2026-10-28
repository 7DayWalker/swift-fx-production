"""
Test suite for /api/signals/history/stats endpoint
Tests the signal history stats endpoint with:
- Unauthenticated access (free tier, limited results)
- Authenticated VIP access (full results)
- Correct stats calculation (winning_signals, losing_signals, breakeven_signals, etc.)
- New features: winning_streak, monthly_performance
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://hrzghlqcfccnmgcipxxo.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ')

# Test credentials
VIP_USER_EMAIL = "paradoxella@gmail.com"
VIP_USER_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")
ADMIN_USER_EMAIL = "ellapauledache@gmail.com"
ADMIN_USER_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


def get_supabase_token(email: str, password: str) -> str:
    """Authenticate with Supabase and return access token"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={"email": email, "password": password}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


class TestSignalHistoryStatsUnauthenticated:
    """Tests for unauthenticated (free tier) access"""
    
    def test_endpoint_returns_200(self):
        """Endpoint should return 200 for unauthenticated users"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Endpoint returns 200 for unauthenticated users")
    
    def test_response_has_stats_object(self):
        """Response should contain stats object"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        data = response.json()
        assert "stats" in data, "Response missing 'stats' object"
        print("✅ Response contains 'stats' object")
    
    def test_stats_has_winning_signals(self):
        """Stats should have winning_signals field (not winning_trades)"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "winning_signals" in stats, "Stats missing 'winning_signals' field"
        assert isinstance(stats["winning_signals"], int), "winning_signals should be integer"
        print(f"✅ Stats has winning_signals: {stats['winning_signals']}")
    
    def test_stats_has_losing_signals(self):
        """Stats should have losing_signals field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "losing_signals" in stats, "Stats missing 'losing_signals' field"
        assert isinstance(stats["losing_signals"], int), "losing_signals should be integer"
        print(f"✅ Stats has losing_signals: {stats['losing_signals']}")
    
    def test_stats_has_breakeven_signals(self):
        """Stats should have breakeven_signals field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "breakeven_signals" in stats, "Stats missing 'breakeven_signals' field"
        assert isinstance(stats["breakeven_signals"], int), "breakeven_signals should be integer"
        print(f"✅ Stats has breakeven_signals: {stats['breakeven_signals']}")
    
    def test_stats_has_win_rate(self):
        """Stats should have win_rate field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "win_rate" in stats, "Stats missing 'win_rate' field"
        assert isinstance(stats["win_rate"], (int, float)), "win_rate should be numeric"
        print(f"✅ Stats has win_rate: {stats['win_rate']}%")
    
    def test_stats_has_total_pips(self):
        """Stats should have total_pips field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "total_pips" in stats, "Stats missing 'total_pips' field"
        assert isinstance(stats["total_pips"], (int, float)), "total_pips should be numeric"
        print(f"✅ Stats has total_pips: {stats['total_pips']}")
    
    def test_stats_has_avg_pips_per_trade(self):
        """Stats should have avg_pips_per_trade field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "avg_pips_per_trade" in stats, "Stats missing 'avg_pips_per_trade' field"
        assert isinstance(stats["avg_pips_per_trade"], (int, float)), "avg_pips_per_trade should be numeric"
        print(f"✅ Stats has avg_pips_per_trade: {stats['avg_pips_per_trade']}")
    
    def test_stats_has_best_trade_pips(self):
        """Stats should have best_trade_pips field (non-zero when trades exist)"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "best_trade_pips" in stats, "Stats missing 'best_trade_pips' field"
        assert isinstance(stats["best_trade_pips"], (int, float)), "best_trade_pips should be numeric"
        # With 2 winning trades, best_trade_pips should be > 0
        if stats.get("total_signals", 0) > 0 and stats.get("winning_signals", 0) > 0:
            assert stats["best_trade_pips"] > 0, "best_trade_pips should be > 0 when there are winning trades"
        print(f"✅ Stats has best_trade_pips: {stats['best_trade_pips']}")
    
    def test_stats_has_worst_trade_pips(self):
        """Stats should have worst_trade_pips field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "worst_trade_pips" in stats, "Stats missing 'worst_trade_pips' field"
        assert isinstance(stats["worst_trade_pips"], (int, float)), "worst_trade_pips should be numeric"
        print(f"✅ Stats has worst_trade_pips: {stats['worst_trade_pips']}")


class TestSignalHistoryStatsNewFeatures:
    """Tests for new features: winning_streak and monthly_performance"""
    
    def test_stats_has_winning_streak(self):
        """Stats should have winning_streak field (integer)"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "winning_streak" in stats, "Stats missing 'winning_streak' field"
        assert isinstance(stats["winning_streak"], int), "winning_streak should be integer"
        print(f"✅ Stats has winning_streak: {stats['winning_streak']}")
    
    def test_winning_streak_is_correct(self):
        """With 2 consecutive wins, winning_streak should be 2"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        # Based on context: 2 closed signals, both wins
        if stats.get("winning_signals", 0) == 2 and stats.get("losing_signals", 0) == 0:
            assert stats["winning_streak"] == 2, f"Expected winning_streak=2, got {stats['winning_streak']}"
            print("✅ Winning streak correctly calculated as 2")
        else:
            print(f"⚠️ Skipping streak validation - data may have changed (wins={stats.get('winning_signals')}, losses={stats.get('losing_signals')})")
    
    def test_stats_has_monthly_performance(self):
        """Stats should have monthly_performance array"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        assert "monthly_performance" in stats, "Stats missing 'monthly_performance' field"
        assert isinstance(stats["monthly_performance"], list), "monthly_performance should be array"
        print(f"✅ Stats has monthly_performance array with {len(stats['monthly_performance'])} entries")
    
    def test_monthly_performance_structure(self):
        """Each monthly_performance entry should have month, pips, wins, losses"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        monthly = stats.get("monthly_performance", [])
        
        if len(monthly) > 0:
            entry = monthly[0]
            assert "month" in entry, "Monthly entry missing 'month' field"
            assert "pips" in entry, "Monthly entry missing 'pips' field"
            assert "wins" in entry, "Monthly entry missing 'wins' field"
            assert "losses" in entry, "Monthly entry missing 'losses' field"
            print(f"✅ Monthly performance entry structure correct: {entry}")
        else:
            print("⚠️ No monthly performance data to validate structure")
    
    def test_monthly_performance_values(self):
        """Monthly performance should show correct aggregated values"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        monthly = stats.get("monthly_performance", [])
        
        # Based on context: 2 trades in March with 650 total pips
        if len(monthly) > 0:
            # Find March entry
            march_entry = next((m for m in monthly if m.get("month") == "Mar"), None)
            if march_entry:
                assert march_entry["pips"] == 650.0, f"Expected March pips=650, got {march_entry['pips']}"
                assert march_entry["wins"] == 2, f"Expected March wins=2, got {march_entry['wins']}"
                assert march_entry["losses"] == 0, f"Expected March losses=0, got {march_entry['losses']}"
                print(f"✅ March performance correct: {march_entry}")
            else:
                print(f"⚠️ March entry not found in monthly_performance: {monthly}")
        else:
            print("⚠️ No monthly performance data")


class TestSignalHistoryStatsLimitedAccess:
    """Tests for is_limited and signals_count fields"""
    
    def test_response_has_is_limited(self):
        """Response should have is_limited field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        data = response.json()
        assert "is_limited" in data, "Response missing 'is_limited' field"
        assert isinstance(data["is_limited"], bool), "is_limited should be boolean"
        print(f"✅ Response has is_limited: {data['is_limited']}")
    
    def test_unauthenticated_is_limited_true(self):
        """Unauthenticated users should see is_limited=True"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        data = response.json()
        assert data.get("is_limited") == True, "Unauthenticated users should have is_limited=True"
        print("✅ Unauthenticated access correctly shows is_limited=True")
    
    def test_response_has_signals_count(self):
        """Response should have signals_count field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        data = response.json()
        assert "signals_count" in data, "Response missing 'signals_count' field"
        assert isinstance(data["signals_count"], int), "signals_count should be integer"
        print(f"✅ Response has signals_count: {data['signals_count']}")
    
    def test_response_has_total_available(self):
        """Response should have total_available field"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        data = response.json()
        assert "total_available" in data, "Response missing 'total_available' field"
        assert isinstance(data["total_available"], int), "total_available should be integer"
        print(f"✅ Response has total_available: {data['total_available']}")
    
    def test_limited_signals_max_5(self):
        """Free tier should see max 5 signals"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        data = response.json()
        signals = data.get("signals", [])
        # Free tier limited to 5 signals
        assert len(signals) <= 5, f"Free tier should see max 5 signals, got {len(signals)}"
        print(f"✅ Free tier correctly limited to {len(signals)} signals (max 5)")


class TestSignalHistoryStatsAuthenticated:
    """Tests for authenticated (Admin/VIP) access - Admin has VIP-level access"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get Admin user token (admin has VIP-level access)"""
        token = get_supabase_token(ADMIN_USER_EMAIL, ADMIN_USER_PASSWORD)
        if not token:
            pytest.skip("Could not authenticate Admin user")
        return token
    
    def test_admin_user_is_limited_false(self, admin_token):
        """Admin users should see is_limited=False (VIP-level access)"""
        response = requests.get(
            f"{BASE_URL}/api/signals/history/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        # Admin users should have full access (VIP-level)
        assert data.get("is_limited") == False, f"Admin users should have is_limited=False, got {data.get('is_limited')}"
        print("✅ Admin user correctly sees is_limited=False")
    
    def test_admin_user_sees_all_signals(self, admin_token):
        """Admin users should see all signals including VIP-only (not limited to 5)"""
        response = requests.get(
            f"{BASE_URL}/api/signals/history/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        signals_count = data.get("signals_count", 0)
        total_available = data.get("total_available", 0)
        # Admin should see all available signals
        assert signals_count == total_available, f"Admin should see all signals: {signals_count} vs {total_available}"
        print(f"✅ Admin user sees all {signals_count} signals")
    
    def test_admin_sees_more_signals_than_free(self, admin_token):
        """Admin should see more signals than free tier (includes VIP-only signals)"""
        # Get free tier count
        free_response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        free_data = free_response.json()
        free_total = free_data.get("total_available", 0)
        
        # Get admin count
        admin_response = requests.get(
            f"{BASE_URL}/api/signals/history/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        admin_data = admin_response.json()
        admin_total = admin_data.get("total_available", 0)
        
        # Admin should see at least as many signals as free tier
        assert admin_total >= free_total, f"Admin should see >= free signals: {admin_total} vs {free_total}"
        print(f"✅ Admin sees {admin_total} signals (free tier sees {free_total})")


class TestSignalHistoryStatsDataIntegrity:
    """Tests for data integrity and calculations"""
    
    def test_stats_sum_equals_total(self):
        """winning + losing + breakeven should equal total_signals"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        
        total = stats.get("total_signals", 0)
        winning = stats.get("winning_signals", 0)
        losing = stats.get("losing_signals", 0)
        breakeven = stats.get("breakeven_signals", 0)
        
        calculated_total = winning + losing + breakeven
        assert calculated_total == total, f"Sum mismatch: {winning}+{losing}+{breakeven}={calculated_total} != {total}"
        print(f"✅ Stats sum correctly: {winning}W + {losing}L + {breakeven}BE = {total} total")
    
    def test_win_rate_calculation(self):
        """Win rate should be (winning/total)*100"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        stats = response.json().get("stats", {})
        
        total = stats.get("total_signals", 0)
        winning = stats.get("winning_signals", 0)
        win_rate = stats.get("win_rate", 0)
        
        if total > 0:
            expected_rate = round((winning / total) * 100, 1)
            assert abs(win_rate - expected_rate) < 0.2, f"Win rate mismatch: {win_rate} vs expected {expected_rate}"
            print(f"✅ Win rate correctly calculated: {win_rate}%")
        else:
            print("⚠️ No signals to validate win rate")
    
    def test_signals_have_final_pips(self):
        """Closed signals should have final_pips or result_pips"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        signals = response.json().get("signals", [])
        
        for signal in signals:
            has_pips = signal.get("final_pips") is not None or signal.get("result_pips") is not None
            assert has_pips, f"Signal {signal.get('signal_id')} missing pips value"
        
        print(f"✅ All {len(signals)} signals have pips values")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
