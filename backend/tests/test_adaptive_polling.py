"""
tests/test_adaptive_polling.py — Adaptive Polling Tests

Tests:
  1. get_polling_interval returns FAST when near any trigger
  2. get_polling_interval returns SLOW when far from all triggers
  3. Multi-signal: ANY near → FAST
  4. Correct distance calculation
  5. Constants are correct
  6. Rate-limit cooldown in engine code

Run:  cd /app/backend && python -m pytest tests/test_adaptive_polling.py -v -s
"""
import sys
import os
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.signal_engine import (
    get_polling_interval,
    NEAR_THRESHOLD,
    FAST_POLL,
    SLOW_POLL,
    RATE_LIMIT_COOLDOWN,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [TEST] %(message)s")
log = logging.getLogger("adaptive_test")


def make_price_map(pair: str, price: float) -> dict:
    return {pair: {"price": price, "source": "test"}}


def make_sig(
    signal_id="ap-001", pair="XAUUSD", signal_type="buy", state="active",
    entry=2650.0, stop_loss=2600.0, tp1=2700.0, tp2=None, tp3=None,
):
    return {
        "signal_id": signal_id, "pair": pair, "signal_type": signal_type,
        "state": state, "entry": entry, "stop_loss": stop_loss,
        "tp1": tp1, "tp2": tp2, "tp3": tp3,
    }


# ====================================================================
# CONSTANTS
# ====================================================================

class TestConstants:
    def test_near_threshold(self):
        assert NEAR_THRESHOLD == 1.0

    def test_fast_poll(self):
        assert FAST_POLL == 1

    def test_slow_poll(self):
        assert SLOW_POLL == 8

    def test_rate_limit_cooldown(self):
        assert RATE_LIMIT_COOLDOWN == 30


# ====================================================================
# NEAR SL → FAST
# ====================================================================

class TestNearSL:
    """When price is within NEAR_THRESHOLD of SL → FAST poll."""

    def test_buy_near_sl(self):
        """BUY: price=2600.5, SL=2600 → distance=0.5 <= 1.0 → FAST"""
        signals = [make_sig(state="active", stop_loss=2600.0)]
        prices = make_price_map("XAUUSD", 2600.5)
        interval, mode, reasons = get_polling_interval(signals, prices)
        assert interval == FAST_POLL
        assert mode == "FAST"
        log.info(f"BUY near SL: {mode} ({interval}s) — {reasons}")

    def test_sell_near_sl(self):
        """SELL: price=2699.5, SL=2700 → distance=0.5 <= 1.0 → FAST"""
        signals = [make_sig(
            signal_type="sell", state="active",
            stop_loss=2700.0, tp1=2600.0
        )]
        prices = make_price_map("XAUUSD", 2699.5)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == FAST_POLL

    def test_far_from_sl(self):
        """BUY: price=2650, SL=2600 → distance=50 >> 1.0 → not FAST from SL alone"""
        signals = [make_sig(state="active", stop_loss=2600.0, tp1=2700.0)]
        prices = make_price_map("XAUUSD", 2650.0)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == SLOW_POLL
        assert mode == "SLOW"


# ====================================================================
# NEAR TP → FAST
# ====================================================================

class TestNearTP:
    """When price is within NEAR_THRESHOLD of current TP → FAST poll."""

    def test_buy_near_tp1(self):
        """BUY active: price=2699.5, TP1=2700 → distance=0.5 → FAST"""
        signals = [make_sig(state="active", tp1=2700.0)]
        prices = make_price_map("XAUUSD", 2699.5)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == FAST_POLL

    def test_buy_near_tp2_in_tp1_state(self):
        """BUY in tp1 state: price=2749.5, TP2=2750 → distance=0.5 → FAST"""
        signals = [make_sig(state="tp1", tp1=2700.0, tp2=2750.0, tp3=2800.0)]
        prices = make_price_map("XAUUSD", 2749.5)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == FAST_POLL

    def test_far_from_tp(self):
        """BUY active: price=2650, TP1=2700 → distance=50 → SLOW"""
        signals = [make_sig(state="active", stop_loss=2600.0, tp1=2700.0)]
        prices = make_price_map("XAUUSD", 2650.0)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == SLOW_POLL


# ====================================================================
# NEAR ENTRY → FAST (pending signals)
# ====================================================================

class TestNearEntry:
    """When pending signal has price near entry → FAST poll."""

    def test_pending_near_entry(self):
        """Pending: price=2650.5, entry=2650 → distance=0.5 → FAST"""
        signals = [make_sig(state="pending", entry=2650.0)]
        prices = make_price_map("XAUUSD", 2650.5)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == FAST_POLL

    def test_pending_far_from_entry(self):
        """Pending: price=2670, entry=2650 → distance=20 → SLOW"""
        signals = [make_sig(state="pending", entry=2650.0)]
        prices = make_price_map("XAUUSD", 2670.0)
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == SLOW_POLL


# ====================================================================
# MULTI-SIGNAL: ANY near → FAST
# ====================================================================

class TestMultiSignal:
    """If multiple signals exist, ANY near → FAST."""

    def test_one_near_one_far(self):
        """Signal A far from all levels, Signal B near SL → FAST"""
        sig_a = make_sig(signal_id="far-001", state="active", stop_loss=2500.0, tp1=2800.0)
        sig_b = make_sig(signal_id="near-001", state="active", stop_loss=2600.0, tp1=2700.0)
        prices = make_price_map("XAUUSD", 2600.8)  # 0.8 from sig_b SL
        interval, mode, _ = get_polling_interval([sig_a, sig_b], prices)
        assert interval == FAST_POLL

    def test_all_far(self):
        """Both signals far from all levels → SLOW"""
        sig_a = make_sig(signal_id="far-001", state="active", stop_loss=2500.0, tp1=2800.0)
        sig_b = make_sig(signal_id="far-002", state="active", stop_loss=2550.0, tp1=2750.0)
        prices = make_price_map("XAUUSD", 2650.0)  # 100+ from all levels
        interval, mode, _ = get_polling_interval([sig_a, sig_b], prices)
        assert interval == SLOW_POLL

    def test_no_price_data(self):
        """No price data → SLOW"""
        signals = [make_sig(state="active")]
        interval, mode, _ = get_polling_interval(signals, {})
        assert interval == SLOW_POLL

    def test_no_signals(self):
        """No signals → SLOW"""
        prices = make_price_map("XAUUSD", 2650.0)
        interval, mode, _ = get_polling_interval([], prices)
        assert interval == SLOW_POLL


# ====================================================================
# EXACT BOUNDARY
# ====================================================================

class TestBoundary:
    """Test exact boundary at NEAR_THRESHOLD."""

    def test_exactly_at_threshold(self):
        """Distance = 1.0 (exactly threshold) → FAST"""
        signals = [make_sig(state="active", stop_loss=2600.0, tp1=2700.0)]
        prices = make_price_map("XAUUSD", 2601.0)  # distance to SL = 1.0
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == FAST_POLL

    def test_just_outside_threshold(self):
        """Distance = 1.1 (just outside) → might be SLOW (if TP also far)"""
        signals = [make_sig(state="active", stop_loss=2600.0, tp1=2700.0)]
        prices = make_price_map("XAUUSD", 2601.1)  # 1.1 from SL, 98.9 from TP
        interval, mode, _ = get_polling_interval(signals, prices)
        assert interval == SLOW_POLL


# ====================================================================
# ENGINE CODE INTEGRATION
# ====================================================================

class TestEngineIntegration:
    """Verify adaptive polling is correctly integrated in the engine loop."""

    def test_rate_limit_cooldown_in_engine(self):
        import inspect
        from services.signal_engine import run_price_automation
        source = inspect.getsource(run_price_automation)
        assert "rate_limit_until" in source
        assert "RATE_LIMIT_COOLDOWN" in source
        assert "rate-limit cooldown" in source.lower()

    def test_get_polling_interval_called_in_engine(self):
        import inspect
        from services.signal_engine import run_price_automation
        source = inspect.getsource(run_price_automation)
        assert "get_polling_interval" in source

    def test_adaptive_sleep_replaces_fixed(self):
        """Engine must NOT use fixed ACTIVE_SLEEP for the main cycle sleep."""
        import inspect
        from services.signal_engine import run_price_automation
        source = inspect.getsource(run_price_automation)
        # The final sleep should use poll_interval from get_polling_interval
        assert "await asyncio.sleep(poll_interval)" in source


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
