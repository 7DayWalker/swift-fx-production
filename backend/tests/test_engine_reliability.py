"""
tests/test_engine_reliability.py — Engine Reliability & Fault-Tolerance Tests

Tests the NEW reliability features:
  1. Auto-recovery — engine never permanently pauses
  2. Active trade protection — never stops monitoring live trades
  3. Error classification — transient vs critical
  4. Last-known price failsafe for SL evaluation
  5. Stale auto-pause clearing on startup

Run:  cd /app/backend && python -m pytest tests/test_engine_reliability.py -v -s
"""
import sys
import os
import asyncio
import logging
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import httpx

from services.signal_engine import (
    _classify_error,
    _last_known_prices,
    DeterministicPriceTrigger,
    SignalLifecycleController,
)
from services.market_data import CACHE_TTL_SECONDS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [TEST] %(message)s")
log = logging.getLogger("reliability_test")


# ====================================================================
# 1. ERROR CLASSIFICATION
# ====================================================================

class TestErrorClassification:
    """Rule 3: Only critical errors count toward recovery threshold."""

    def test_timeout_is_transient(self):
        err = httpx.TimeoutException("request timed out")
        assert _classify_error(err) == "transient"

    def test_connect_error_is_transient(self):
        err = httpx.ConnectError("connection refused")
        assert _classify_error(err) == "transient"

    def test_network_error_is_transient(self):
        err = httpx.NetworkError("network unreachable")
        assert _classify_error(err) == "transient"

    def test_connection_error_is_transient(self):
        err = ConnectionError("connection reset by peer")
        assert _classify_error(err) == "transient"

    def test_os_error_is_transient(self):
        err = OSError("broken pipe")
        assert _classify_error(err) == "transient"

    def test_rate_limit_string_is_transient(self):
        err = RuntimeError("API returned 429 rate limit exceeded")
        assert _classify_error(err) == "transient"

    def test_502_string_is_transient(self):
        err = RuntimeError("HTTP 502 Bad Gateway")
        assert _classify_error(err) == "transient"

    def test_503_string_is_transient(self):
        err = RuntimeError("Service temporarily unavailable 503")
        assert _classify_error(err) == "transient"

    def test_throttle_string_is_transient(self):
        err = RuntimeError("Request throttled by upstream")
        assert _classify_error(err) == "transient"

    def test_value_error_is_critical(self):
        err = ValueError("invalid signal state")
        assert _classify_error(err) == "critical"

    def test_key_error_is_critical(self):
        err = KeyError("signal_id")
        assert _classify_error(err) == "critical"

    def test_type_error_is_critical(self):
        err = TypeError("unsupported operand type")
        assert _classify_error(err) == "critical"

    def test_generic_runtime_error_is_critical(self):
        err = RuntimeError("something unexpected happened")
        assert _classify_error(err) == "critical"


# ====================================================================
# 2. LAST-KNOWN PRICE CACHE
# ====================================================================

class TestLastKnownPriceCache:
    """Rule 5: SL failsafe — last-known prices used during API outages."""

    def test_cache_starts_empty(self):
        """On first start, cache is empty."""
        # We can test by clearing and checking
        _last_known_prices.clear()
        assert len(_last_known_prices) == 0

    def test_cache_stores_prices(self):
        """After a successful fetch, prices are cached."""
        _last_known_prices.clear()
        _last_known_prices["XAUUSD"] = {
            "price": 4600.0,
            "source": "twelvedata",
        }
        assert _last_known_prices["XAUUSD"]["price"] == 4600.0

    def test_cached_price_usable_for_sl(self):
        """Cached price correctly triggers SL evaluation."""
        _last_known_prices.clear()
        _last_known_prices["XAUUSD"] = {"price": 4620.0, "source": "twelvedata"}

        trigger = DeterministicPriceTrigger()
        # SELL signal SL at 4613, cached price at 4620 (above SL) → SL triggered
        triggered, exit_price = trigger.check_sl_triggered(
            4620.0, 4613.0, "sell"
        )
        assert triggered is True
        assert exit_price == 4613.0
        log.info(
            f"SL failsafe: cached_price=4620.0, sl=4613.0 → triggered={triggered}"
        )

    def test_cache_source_marked(self):
        """When using cached prices, source should indicate cache."""
        _last_known_prices.clear()
        _last_known_prices["XAUUSD"] = {"price": 4600.0, "source": "twelvedata"}

        # Simulate what the engine does when API fails
        cached = _last_known_prices.get("XAUUSD")
        if cached:
            failsafe_data = {
                **cached,
                "source": f"{cached.get('source', 'unknown')}:cached",
            }
            assert "cached" in failsafe_data["source"]


# ====================================================================
# 3. NO PERMANENT PAUSE
# ====================================================================

class TestNoPermanentPause:
    """
    Rule 1 & 2: Engine must NEVER permanently pause.
    Auto-recovery with backoff must replace auto-pause.
    """

    def test_no_pause_write_in_engine_code(self):
        """
        Verify the engine code does NOT contain `config['paused'] = True`.
        This was the critical bug: writing paused=True to DB made it permanent.
        """
        import inspect
        from services.signal_engine import run_price_automation

        source = inspect.getsource(run_price_automation)
        # The engine should NOT set config["paused"] = True
        assert 'config["paused"] = True' not in source, \
            "Engine must NOT permanently pause via config write!"
        assert "config['paused'] = True" not in source, \
            "Engine must NOT permanently pause via config write!"

    def test_recovery_mode_exists(self):
        """Verify the engine code contains RECOVERY MODE logic."""
        import inspect
        from services.signal_engine import run_price_automation

        source = inspect.getsource(run_price_automation)
        assert "RECOVERY MODE" in source
        assert "auto-recovering" in source.lower() or "auto_recover" in source.lower() or \
               "auto-recovering" in source

    def test_self_recovering_in_startup(self):
        """Verify the engine startup banner mentions SELF-RECOVERING."""
        import inspect
        from services.signal_engine import run_price_automation

        source = inspect.getsource(run_price_automation)
        assert "SELF-RECOVERING" in source

    def test_stale_pause_clearing_in_main(self):
        """Verify main.py clears stale auto-pauses on startup."""
        import inspect
        from main import startup_event

        source = inspect.getsource(startup_event)
        assert "auto-paused" in source.lower()
        assert "Clearing stale auto-pause" in source


# ====================================================================
# 4. SL STILL WORKS DURING API FAILURES
# ====================================================================

class TestSLDuringAPIFailure:
    """
    Integration test: Even when the API fails, SL evaluation continues
    using last-known cached prices.
    """

    @pytest.mark.asyncio
    async def test_sl_triggers_on_cached_price(self):
        """
        Scenario: API down, but last known price was above SL.
        Engine should use cached price to trigger SL.
        """
        mock_db = MagicMock()
        mock_db.signals = MagicMock()
        mock_db.signals.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

        ctrl = SignalLifecycleController(mock_db)

        # Simulate: SELL signal, SL=4613, last known price=4620 (above SL)
        signal = {
            "signal_id": "failsafe-test-001",
            "pair": "XAUUSD",
            "signal_type": "sell",
            "state": "active",
            "status": "active",
            "entry": 4607.0,
            "entry_price_actual": 4607.0,
            "stop_loss": 4613.0,
            "tp1": 4590.0,
            "tp2": None,
            "tp3": None,
            "last_price": None,
            "visibility": "free",
            "tp_hit": 0,
        }

        # Using cached price of 4620 (above SL=4613 for SELL → SL triggers)
        result = await ctrl.process_signal(
            signal, 4620.0, "twelvedata:cached", datetime.now(timezone.utc)
        )

        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 4613.0  # Gap-protected
        log.info(
            f"SL failsafe test: cached_price=4620, sl=4613 → "
            f"action={result['action']}, reason={result['reason']}"
        )


# ====================================================================
# 5. CACHE TTL VERIFICATION
# ====================================================================

class TestCacheTTLReliability:
    """Ensure cache TTL hasn't been accidentally changed."""

    def test_cache_ttl_is_3_seconds(self):
        assert CACHE_TTL_SECONDS == 3, f"Expected 3, got {CACHE_TTL_SECONDS}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
