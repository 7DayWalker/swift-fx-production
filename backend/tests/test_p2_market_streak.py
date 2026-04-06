"""
test_p2_market_streak.py — Tests for P2 Features:
1. New market symbols (EURUSD, GBPUSD, BTCUSD) with correct providers
2. Streak reminder background task verification
3. Regression tests for XAUUSD (no regression)
4. Symbol alias resolution

Tests verify:
- EURUSD returns valid price with source 'twelvedata'
- GBPUSD returns valid price with source 'twelvedata'
- BTCUSD returns valid price with source 'coingecko'
- XAUUSD still works with source 'gold-api.com'
- Aliases work: EUR/USD → EURUSD, BITCOIN → BTCUSD, GOLD → XAUUSD
- Invalid symbol returns proper error
- Streak reminder module loads correctly
"""
import pytest
import requests
import os
import importlib
from datetime import datetime

# Use the public URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com')


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ===================== MARKET DATA - NEW SYMBOLS =====================

class TestMarketSymbolsP2:
    """Tests for new market symbols added in P2"""
    
    def test_market_symbols_includes_all_four(self, api_client):
        """GET /api/market/symbols should return all 4 symbols"""
        response = api_client.get(f"{BASE_URL}/api/market/symbols")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "symbols" in data, "Response should contain 'symbols' key"
        symbols = data["symbols"]
        
        # Verify all 4 symbols are present
        expected_symbols = ["XAUUSD", "EURUSD", "GBPUSD", "BTCUSD"]
        for sym in expected_symbols:
            assert sym in symbols, f"{sym} should be in supported symbols. Got: {symbols}"
        
        print(f"✓ All 4 market symbols present: {symbols}")


class TestEURUSDPrice:
    """Tests for EURUSD price endpoint"""
    
    def test_eurusd_returns_valid_price(self, api_client):
        """GET /api/market/price?symbol=EURUSD should return valid price with source 'twelvedata'"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "EURUSD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "symbol" in data, "Response should contain 'symbol'"
        assert "price" in data, "Response should contain 'price'"
        assert "source" in data, "Response should contain 'source'"
        
        assert data["symbol"] == "EURUSD", f"Symbol should be EURUSD, got {data['symbol']}"
        assert isinstance(data["price"], (int, float)), f"Price should be numeric, got {type(data['price'])}"
        assert data["price"] > 0, f"Price should be positive, got {data['price']}"
        
        # EURUSD should come from TwelveData (primary) or Finnhub (fallback)
        assert data["source"] in ["twelvedata", "finnhub"], \
            f"EURUSD source should be 'twelvedata' or 'finnhub', got '{data['source']}'"
        
        print(f"✓ EURUSD: price={data['price']}, source={data['source']}")


class TestGBPUSDPrice:
    """Tests for GBPUSD price endpoint"""
    
    def test_gbpusd_returns_valid_price(self, api_client):
        """GET /api/market/price?symbol=GBPUSD should return valid price with source 'twelvedata'"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "GBPUSD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "symbol" in data, "Response should contain 'symbol'"
        assert "price" in data, "Response should contain 'price'"
        assert "source" in data, "Response should contain 'source'"
        
        assert data["symbol"] == "GBPUSD", f"Symbol should be GBPUSD, got {data['symbol']}"
        assert isinstance(data["price"], (int, float)), f"Price should be numeric, got {type(data['price'])}"
        assert data["price"] > 0, f"Price should be positive, got {data['price']}"
        
        # GBPUSD should come from TwelveData (primary) or Finnhub (fallback)
        assert data["source"] in ["twelvedata", "finnhub"], \
            f"GBPUSD source should be 'twelvedata' or 'finnhub', got '{data['source']}'"
        
        print(f"✓ GBPUSD: price={data['price']}, source={data['source']}")


class TestBTCUSDPrice:
    """Tests for BTCUSD price endpoint"""
    
    def test_btcusd_returns_valid_price(self, api_client):
        """GET /api/market/price?symbol=BTCUSD should return valid price with source 'coingecko'"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "BTCUSD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "symbol" in data, "Response should contain 'symbol'"
        assert "price" in data, "Response should contain 'price'"
        assert "source" in data, "Response should contain 'source'"
        
        assert data["symbol"] == "BTCUSD", f"Symbol should be BTCUSD, got {data['symbol']}"
        assert isinstance(data["price"], (int, float)), f"Price should be numeric, got {type(data['price'])}"
        assert data["price"] > 0, f"Price should be positive, got {data['price']}"
        
        # BTCUSD should come from CoinGecko (primary) or TwelveData (fallback)
        assert data["source"] in ["coingecko", "twelvedata"], \
            f"BTCUSD source should be 'coingecko' or 'twelvedata', got '{data['source']}'"
        
        print(f"✓ BTCUSD: price={data['price']}, source={data['source']}")


class TestXAUUSDRegression:
    """Regression tests for XAUUSD (no regression)"""
    
    def test_xauusd_still_works(self, api_client):
        """GET /api/market/price?symbol=XAUUSD should still return valid price with source 'gold-api.com'"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "XAUUSD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "symbol" in data, "Response should contain 'symbol'"
        assert "price" in data, "Response should contain 'price'"
        assert "source" in data, "Response should contain 'source'"
        
        assert data["symbol"] == "XAUUSD", f"Symbol should be XAUUSD, got {data['symbol']}"
        assert isinstance(data["price"], (int, float)), f"Price should be numeric, got {type(data['price'])}"
        assert data["price"] > 0, f"Price should be positive, got {data['price']}"
        
        # XAUUSD should come from gold-api.com (primary) or other fallbacks
        valid_sources = ["gold-api.com", "twelvedata", "metals-api", "goldapi", "finnhub", "alphavantage"]
        assert data["source"] in valid_sources, \
            f"XAUUSD source should be one of {valid_sources}, got '{data['source']}'"
        
        print(f"✓ XAUUSD (regression): price={data['price']}, source={data['source']}")


# ===================== SYMBOL ALIASES =====================

class TestSymbolAliases:
    """Tests for symbol alias resolution"""
    
    def test_eur_usd_alias_resolves_to_eurusd(self, api_client):
        """GET /api/market/price?symbol=EUR/USD should resolve to EURUSD"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "EUR/USD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["symbol"] == "EURUSD", f"EUR/USD should resolve to EURUSD, got {data['symbol']}"
        print(f"✓ EUR/USD alias resolves to EURUSD: price={data['price']}")
    
    def test_bitcoin_alias_resolves_to_btcusd(self, api_client):
        """GET /api/market/price?symbol=BITCOIN should resolve to BTCUSD"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "BITCOIN"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["symbol"] == "BTCUSD", f"BITCOIN should resolve to BTCUSD, got {data['symbol']}"
        print(f"✓ BITCOIN alias resolves to BTCUSD: price={data['price']}")
    
    def test_gold_alias_resolves_to_xauusd(self, api_client):
        """GET /api/market/price?symbol=GOLD should resolve to XAUUSD"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "GOLD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["symbol"] == "XAUUSD", f"GOLD should resolve to XAUUSD, got {data['symbol']}"
        print(f"✓ GOLD alias resolves to XAUUSD: price={data['price']}")
    
    def test_btc_usd_alias_resolves_to_btcusd(self, api_client):
        """GET /api/market/price?symbol=BTC/USD should resolve to BTCUSD"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "BTC/USD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["symbol"] == "BTCUSD", f"BTC/USD should resolve to BTCUSD, got {data['symbol']}"
        print(f"✓ BTC/USD alias resolves to BTCUSD: price={data['price']}")
    
    def test_gbp_usd_alias_resolves_to_gbpusd(self, api_client):
        """GET /api/market/price?symbol=GBP/USD should resolve to GBPUSD"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "GBP/USD"})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["symbol"] == "GBPUSD", f"GBP/USD should resolve to GBPUSD, got {data['symbol']}"
        print(f"✓ GBP/USD alias resolves to GBPUSD: price={data['price']}")


# ===================== INVALID SYMBOL =====================

class TestInvalidSymbol:
    """Tests for invalid symbol handling"""
    
    def test_invalid_symbol_returns_400(self, api_client):
        """GET /api/market/price?symbol=INVALID should return 400 with proper error"""
        response = api_client.get(f"{BASE_URL}/api/market/price", params={"symbol": "INVALID"})
        
        assert response.status_code == 400, f"Expected 400 for invalid symbol, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain 'detail' key"
        
        # Error should mention unsupported symbol and available symbols
        detail_lower = data["detail"].lower()
        assert "unsupported" in detail_lower or "invalid" in detail_lower or "available" in detail_lower, \
            f"Error message should indicate unsupported symbol: {data['detail']}"
        
        print(f"✓ Invalid symbol correctly returns 400: {data['detail']}")
    
    def test_empty_symbol_returns_error(self, api_client):
        """GET /api/market/price without symbol should return error"""
        response = api_client.get(f"{BASE_URL}/api/market/price")
        
        # Should return 422 (validation error) for missing required parameter
        assert response.status_code == 422, f"Expected 422 for missing symbol, got {response.status_code}: {response.text}"
        print(f"✓ Missing symbol correctly returns 422")


# ===================== STREAK REMINDERS MODULE =====================

class TestStreakRemindersModule:
    """Tests for streak reminders background task"""
    
    def test_streak_reminders_module_imports(self):
        """Verify services.streak_reminders module loads correctly"""
        import sys
        import os
        backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
        
        try:
            from services import streak_reminders
            assert hasattr(streak_reminders, 'streak_reminder_loop'), \
                "streak_reminders should have streak_reminder_loop function"
            assert hasattr(streak_reminders, '_check_and_send_streak_reminders'), \
                "streak_reminders should have _check_and_send_streak_reminders function"
            print("✓ streak_reminders module imports successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import streak_reminders: {e}")
    
    def test_streak_reminder_loop_is_async(self):
        """Verify streak_reminder_loop is an async function"""
        import sys
        import os
        import asyncio
        backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
        
        from services.streak_reminders import streak_reminder_loop
        
        assert asyncio.iscoroutinefunction(streak_reminder_loop), \
            "streak_reminder_loop should be an async function"
        print("✓ streak_reminder_loop is async")
    
    def test_streak_reminder_interval_is_6_hours(self):
        """Verify reminder interval is 6 hours"""
        import sys
        import os
        backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
        
        from services.streak_reminders import REMINDER_INTERVAL_SECONDS
        
        expected_interval = 6 * 60 * 60  # 6 hours in seconds
        assert REMINDER_INTERVAL_SECONDS == expected_interval, \
            f"Reminder interval should be {expected_interval}s (6h), got {REMINDER_INTERVAL_SECONDS}s"
        print(f"✓ Reminder interval is 6 hours ({REMINDER_INTERVAL_SECONDS}s)")


# ===================== SIGNAL ENGINE STARTUP =====================

class TestSignalEngineStartup:
    """Tests for signal engine startup verification"""
    
    def test_automation_status_endpoint(self, api_client):
        """GET /api/automation/status should return engine running"""
        response = api_client.get(f"{BASE_URL}/api/automation/status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "mode" in data, "Response should contain 'mode'"
        assert "auto_engine_running" in data, "Response should contain 'auto_engine_running'"
        
        print(f"✓ Signal engine status: mode={data['mode']}, running={data['auto_engine_running']}")


# ===================== HEALTH CHECK =====================

class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self, api_client):
        """GET /api/health should return 200"""
        response = api_client.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] in ["healthy", "degraded"], f"Status should be healthy or degraded, got {data['status']}"
        print(f"✓ Health check: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
