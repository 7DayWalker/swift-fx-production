"""
tests/test_signal_engine_v3.py — Comprehensive Signal Engine Validation Suite

Tests ALL critical execution rules:
  1. No crossing detection — absolute threshold checks only
  2. SL priority — evaluated FIRST, no buffer, immediate breach
  3. Single-TP handling — closes trade immediately as profit
  4. Cache validation — TTL is 3 seconds
  5. Controlled test scenarios A-E
  6. Detailed logging per test

Run:  cd /app/backend && python -m pytest tests/test_signal_engine_v3.py -v -s
"""
import sys
import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure backend is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.signal_engine import (
    DeterministicPriceTrigger,
    SignalLifecycleController,
    ExitReason,
    calculate_signal_pips,
    calculate_signal_pips_with_trace,
)
from services.market_data import CACHE_TTL_SECONDS, _get_cached, _set_cache, _price_cache

# ────────────────────────────────────────────────────────────────────
# Logging setup — structured output per the user's requirement
# ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [TEST] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("engine_test")

BUFFER = DeterministicPriceTrigger.BUFFER  # 0.5

# Convenience
trigger = DeterministicPriceTrigger()


def log_result(scenario: str, symbol: str, price: float, entry: float,
               stop_loss: float, tp: float, state_from: str, state_to: str,
               passed: bool):
    """Mandatory structured log per user requirement #6."""
    status = "PASS" if passed else "FAIL"
    log.info(
        f"[{status}] {scenario} | symbol={symbol} price={price} entry={entry} "
        f"stop_loss={stop_loss} TP={tp} state: {state_from} -> {state_to}"
    )


# ====================================================================
# 1. UNIT TESTS — DeterministicPriceTrigger absolute thresholds
# ====================================================================

class TestTriggerSL:
    """Rule 2: SL must trigger immediately on breach. NO buffer."""

    # --- BUY signals: SL triggers when price <= stop_loss ---
    def test_buy_sl_exact(self):
        triggered, price = trigger.check_sl_triggered(2600.0, 2600.0, "buy")
        assert triggered is True
        assert price == 2600.0
        log_result("BUY SL exact", "XAUUSD", 2600.0, 0, 2600.0, 0, "active", "closed", triggered)

    def test_buy_sl_below(self):
        triggered, _ = trigger.check_sl_triggered(2599.0, 2600.0, "buy")
        assert triggered is True
        log_result("BUY SL below", "XAUUSD", 2599.0, 0, 2600.0, 0, "active", "closed", triggered)

    def test_buy_sl_above_no_trigger(self):
        triggered, _ = trigger.check_sl_triggered(2600.1, 2600.0, "buy")
        assert triggered is False
        log_result("BUY SL above (no trigger)", "XAUUSD", 2600.1, 0, 2600.0, 0, "active", "active", not triggered)

    def test_buy_sl_no_buffer(self):
        """SL must NOT use buffer — price 2600.4 with SL 2600.0 must NOT trigger."""
        triggered, _ = trigger.check_sl_triggered(2600.4, 2600.0, "buy")
        assert triggered is False, "SL must have NO buffer — 2600.4 > 2600.0 should NOT trigger"

    # --- SELL signals: SL triggers when price >= stop_loss ---
    def test_sell_sl_exact(self):
        triggered, price = trigger.check_sl_triggered(2700.0, 2700.0, "sell")
        assert triggered is True
        assert price == 2700.0
        log_result("SELL SL exact", "XAUUSD", 2700.0, 0, 2700.0, 0, "active", "closed", triggered)

    def test_sell_sl_above(self):
        triggered, _ = trigger.check_sl_triggered(2701.0, 2700.0, "sell")
        assert triggered is True
        log_result("SELL SL above", "XAUUSD", 2701.0, 0, 2700.0, 0, "active", "closed", triggered)

    def test_sell_sl_below_no_trigger(self):
        triggered, _ = trigger.check_sl_triggered(2699.9, 2700.0, "sell")
        assert triggered is False
        log_result("SELL SL below (no trigger)", "XAUUSD", 2699.9, 0, 2700.0, 0, "active", "active", not triggered)

    def test_sell_sl_no_buffer(self):
        """SL must NOT use buffer — price 2699.6 with SL 2700.0 must NOT trigger."""
        triggered, _ = trigger.check_sl_triggered(2699.6, 2700.0, "sell")
        assert triggered is False, "SL must have NO buffer — 2699.6 < 2700.0 should NOT trigger"


class TestTriggerTP:
    """Rule 1: TP uses 0.5 buffer. BUY: price >= TP - 0.5, SELL: price <= TP + 0.5"""

    def test_buy_tp_exact(self):
        triggered, _ = trigger.check_tp_triggered(2700.0, 2700.0, "buy")
        assert triggered is True

    def test_buy_tp_within_buffer(self):
        """price = 2699.6 vs TP = 2700.0 → 2699.6 >= 2700.0 - 0.5 = 2699.5 → TRUE"""
        triggered, _ = trigger.check_tp_triggered(2699.6, 2700.0, "buy")
        assert triggered is True

    def test_buy_tp_outside_buffer(self):
        """price = 2699.4 vs TP = 2700.0 → 2699.4 >= 2699.5 → FALSE"""
        triggered, _ = trigger.check_tp_triggered(2699.4, 2700.0, "buy")
        assert triggered is False

    def test_sell_tp_exact(self):
        triggered, _ = trigger.check_tp_triggered(2600.0, 2600.0, "sell")
        assert triggered is True

    def test_sell_tp_within_buffer(self):
        """price = 2600.4 vs TP = 2600.0 → 2600.4 <= 2600.0 + 0.5 = 2600.5 → TRUE"""
        triggered, _ = trigger.check_tp_triggered(2600.4, 2600.0, "sell")
        assert triggered is True

    def test_sell_tp_outside_buffer(self):
        """price = 2600.6 vs TP = 2600.0 → 2600.6 <= 2600.5 → FALSE"""
        triggered, _ = trigger.check_tp_triggered(2600.6, 2600.0, "sell")
        assert triggered is False


class TestTriggerEntry:
    """Entry uses 0.5 buffer. BUY: price >= entry - 0.5, SELL: price <= entry + 0.5"""

    def test_buy_entry_exact(self):
        triggered, _ = trigger.check_entry_triggered(2650.0, 2650.0, "buy")
        assert triggered is True

    def test_buy_entry_within_buffer(self):
        triggered, _ = trigger.check_entry_triggered(2649.6, 2650.0, "buy")
        assert triggered is True

    def test_buy_entry_outside_buffer(self):
        triggered, _ = trigger.check_entry_triggered(2649.4, 2650.0, "buy")
        assert triggered is False

    def test_sell_entry_exact(self):
        triggered, _ = trigger.check_entry_triggered(2650.0, 2650.0, "sell")
        assert triggered is True

    def test_sell_entry_within_buffer(self):
        triggered, _ = trigger.check_entry_triggered(2650.4, 2650.0, "sell")
        assert triggered is True

    def test_sell_entry_outside_buffer(self):
        triggered, _ = trigger.check_entry_triggered(2650.6, 2650.0, "sell")
        assert triggered is False


class TestNoCrossingDetection:
    """Rule 1 (Critical): last_price must NEVER influence trigger outcome."""

    def test_sl_ignores_last_price(self):
        """Even if last_price was far above SL, current breach must trigger."""
        t1, _ = trigger.check_sl_triggered(2599.0, 2600.0, "buy", last_price=2700.0)
        t2, _ = trigger.check_sl_triggered(2599.0, 2600.0, "buy", last_price=None)
        assert t1 == t2 == True, "SL must not consider last_price"

    def test_tp_ignores_last_price(self):
        t1, _ = trigger.check_tp_triggered(2700.0, 2700.0, "buy", last_price=2500.0)
        t2, _ = trigger.check_tp_triggered(2700.0, 2700.0, "buy", last_price=None)
        assert t1 == t2 == True, "TP must not consider last_price"

    def test_entry_ignores_last_price(self):
        t1, _ = trigger.check_entry_triggered(2650.0, 2650.0, "buy", last_price=2500.0)
        t2, _ = trigger.check_entry_triggered(2650.0, 2650.0, "buy", last_price=None)
        assert t1 == t2 == True, "Entry must not consider last_price"


# ====================================================================
# 2. LIFECYCLE CONTROLLER — Signal processing with mock DB
# ====================================================================

def make_mock_db():
    """Create a mock database with async update/find methods."""
    mock_db = MagicMock()
    mock_db.signals = MagicMock()
    mock_db.signals.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    return mock_db


def make_signal(
    signal_id="test-001",
    pair="XAUUSD",
    signal_type="buy",
    state="active",
    entry=2650.0,
    stop_loss=2600.0,
    tp1=2700.0,
    tp2=None,
    tp3=None,
    last_price=None,
    entry_price_actual=None,
    visibility="free",
):
    return {
        "signal_id": signal_id,
        "pair": pair,
        "signal_type": signal_type,
        "state": state,
        "status": state if state != "closed" else "closed",
        "entry": entry,
        "entry_price_actual": entry_price_actual or entry,
        "stop_loss": stop_loss,
        "tp1": tp1,
        "tp2": tp2,
        "tp3": tp3,
        "last_price": last_price,
        "visibility": visibility,
        "tp_hit": 0,
    }


class TestSLPriority:
    """Rule 2: SL evaluated FIRST. Even if TP is also triggered, SL wins."""

    @pytest.mark.asyncio
    async def test_sl_overrides_tp_buy(self):
        """Scenario A: BUY signal — price drops below SL. Must close as SL even if TP also met."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        # Price = 2599 triggers both SL (<=2600) and would also be checked against TP
        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0, state="active"
        )

        result = await ctrl.process_signal(signal, 2599.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        log_result("A: BUY SL priority", "XAUUSD", 2599.0, 2650.0, 2600.0, 2700.0,
                    "active", "closed/sl", True)

    @pytest.mark.asyncio
    async def test_sl_overrides_tp_sell(self):
        """Scenario B: SELL signal — price rises above SL. Must close as SL."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=2550.0, tp3=2500.0, state="active"
        )

        result = await ctrl.process_signal(signal, 2701.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        log_result("B: SELL SL priority", "XAUUSD", 2701.0, 2650.0, 2700.0, 2600.0,
                    "active", "closed/sl", True)


class TestSingleTPHandling:
    """Rule 3: If tp2 and tp3 do NOT exist, TP hit must CLOSE trade immediately."""

    @pytest.mark.asyncio
    async def test_single_tp_buy_closes_immediately(self):
        """Scenario D: BUY with only tp1. Hitting TP1 → state=closed, exit_reason=tp1."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=None, tp3=None, state="active"
        )

        result = await ctrl.process_signal(signal, 2700.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP1)
        log_result("D: Single-TP BUY close", "XAUUSD", 2700.0, 2650.0, 2600.0, 2700.0,
                    "active", "closed/tp1", True)

    @pytest.mark.asyncio
    async def test_single_tp_sell_closes_immediately(self):
        """SELL with only tp1. Hitting TP1 → state=closed, exit_reason=tp1."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=None, tp3=None, state="active"
        )

        result = await ctrl.process_signal(signal, 2600.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP1)
        log_result("D: Single-TP SELL close", "XAUUSD", 2600.0, 2650.0, 2700.0, 2600.0,
                    "active", "closed/tp1", True)

    def test_get_next_tp_single_tp(self):
        """Direct unit test: get_next_tp_target returns 'closed' for single-TP."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(tp1=2700.0, tp2=None, tp3=None, state="active")
        tp_price, reason, new_state = ctrl.get_next_tp_target(signal)

        assert new_state == "closed"
        assert reason == ExitReason.TP1
        assert tp_price == 2700.0

    def test_get_next_tp_multi_tp_advances(self):
        """Multi-TP: active → tp1 (not closed)."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(tp1=2700.0, tp2=2750.0, tp3=2800.0, state="active")
        _, _, new_state = ctrl.get_next_tp_target(signal)
        assert new_state == "tp1", "Multi-TP should advance to tp1, not close"

    def test_get_next_tp_two_tp_closes_on_tp2(self):
        """Two-TP signal (tp1, tp2 but no tp3): tp1 state → hitting tp2 should close."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(tp1=2700.0, tp2=2750.0, tp3=None, state="tp1")
        _, reason, new_state = ctrl.get_next_tp_target(signal)
        assert new_state == "closed"
        assert reason == ExitReason.TP2


class TestGapProtection:
    """Scenario C: Fast price jump — price skips over TP. TP must still trigger."""

    @pytest.mark.asyncio
    async def test_buy_price_gaps_through_tp(self):
        """BUY: Price jumps from 2680 directly to 2720 (skipping TP1 at 2700).
        Must still trigger TP1."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0, state="active",
            last_price=2680.0,
        )

        # Price gapped to 2720 — past TP1
        result = await ctrl.process_signal(signal, 2720.0, "test", datetime.now(timezone.utc))

        assert result is not None
        # Should hit TP1 (advance, not close, because tp2/tp3 exist)
        assert result["action"] == "tp_hit"
        assert result["level"] == 1
        log_result("C: BUY gap through TP", "XAUUSD", 2720.0, 2650.0, 2600.0, 2700.0,
                    "active", "tp1", True)

    @pytest.mark.asyncio
    async def test_sell_price_gaps_through_tp(self):
        """SELL: Price drops from 2620 to 2580 (skipping TP1 at 2600).
        Must still trigger."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=2550.0, tp3=2500.0, state="active",
            last_price=2620.0,
        )

        result = await ctrl.process_signal(signal, 2580.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "tp_hit"
        assert result["level"] == 1
        log_result("C: SELL gap through TP", "XAUUSD", 2580.0, 2650.0, 2700.0, 2600.0,
                    "active", "tp1", True)

    @pytest.mark.asyncio
    async def test_buy_price_gaps_through_sl(self):
        """BUY: Price gaps from 2610 to 2590 (below SL at 2600). Must trigger SL."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=None, tp3=None, state="active",
            last_price=2610.0,
        )

        result = await ctrl.process_signal(signal, 2590.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        # Gap protection: exit at DEFINED SL (2600), not gapped price (2590)
        assert result["exit_price"] == 2600.0
        log_result("C: BUY gap through SL", "XAUUSD", 2590.0, 2650.0, 2600.0, 2700.0,
                    "active", "closed/sl", True)


class TestPendingActivation:
    """Entry triggers for pending signals with buffer."""

    @pytest.mark.asyncio
    async def test_buy_entry_activates(self):
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, state="pending",
        )

        result = await ctrl.process_signal(signal, 2650.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "activated"
        log_result("Entry BUY", "XAUUSD", 2650.0, 2650.0, 2600.0, 2700.0,
                    "pending", "active", True)

    @pytest.mark.asyncio
    async def test_sell_entry_activates(self):
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, state="pending",
        )

        result = await ctrl.process_signal(signal, 2650.0, "test", datetime.now(timezone.utc))

        assert result is not None
        assert result["action"] == "activated"

    @pytest.mark.asyncio
    async def test_pending_not_triggered_yet(self):
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, state="pending",
        )
        # Price far below entry - buffer
        result = await ctrl.process_signal(signal, 2640.0, "test", datetime.now(timezone.utc))
        assert result is None


class TestClosedSignalImmutable:
    """Closed signals must NEVER be reprocessed."""

    @pytest.mark.asyncio
    async def test_closed_signal_ignored(self):
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(state="closed")
        result = await ctrl.process_signal(signal, 2700.0, "test", datetime.now(timezone.utc))
        assert result is None


# ====================================================================
# 3. CACHE VALIDATION
# ====================================================================

class TestCacheValidation:
    """Rule 4: TTL must be 3 seconds. Fresh price used during active signals."""

    def test_cache_ttl_is_3(self):
        assert CACHE_TTL_SECONDS == 3, f"Cache TTL must be 3s, got {CACHE_TTL_SECONDS}"

    def test_cache_returns_fresh_data(self):
        """Data just cached should be returned."""
        _price_cache.clear()
        data = {"symbol": "XAUUSD", "price": 2650.0, "source": "test"}
        _set_cache("XAUUSD", data)
        cached = _get_cached("XAUUSD")
        assert cached is not None
        assert cached["price"] == 2650.0

    def test_cache_expired_returns_none(self):
        """Data older than TTL should NOT be returned."""
        import time
        _price_cache.clear()
        data = {"symbol": "XAUUSD", "price": 2650.0, "source": "test"}
        _set_cache("XAUUSD", data)
        # Manually set timestamp to expire
        _price_cache["XAUUSD"]["_ts"] = time.monotonic() - (CACHE_TTL_SECONDS + 1)
        cached = _get_cached("XAUUSD")
        assert cached is None, "Expired cache entry must return None"


# ====================================================================
# 4. PIP CALCULATION VALIDATION
# ====================================================================

class TestPipCalculation:
    """Verify pip math for XAUUSD (pip_multiplier=10)."""

    def test_buy_profit(self):
        pips = calculate_signal_pips(2650.0, 2700.0, "buy", "XAUUSD")
        assert pips == 500.0, f"BUY: (2700-2650)*10 = 500, got {pips}"

    def test_buy_loss(self):
        pips = calculate_signal_pips(2650.0, 2600.0, "buy", "XAUUSD")
        assert pips == -500.0, f"BUY SL: (2600-2650)*10 = -500, got {pips}"

    def test_sell_profit(self):
        pips = calculate_signal_pips(2650.0, 2600.0, "sell", "XAUUSD")
        assert pips == 500.0, f"SELL: (2650-2600)*10 = 500, got {pips}"

    def test_sell_loss(self):
        pips = calculate_signal_pips(2650.0, 2700.0, "sell", "XAUUSD")
        assert pips == -500.0, f"SELL SL: (2650-2700)*10 = -500, got {pips}"

    def test_audit_trace_included(self):
        result = calculate_signal_pips_with_trace(2650.0, 2700.0, "buy", "XAUUSD")
        assert "math_trace" in result
        assert "2700" in result["math_trace"]
        assert result["pip_multiplier"] == 10
        assert result["pip_size"] == 0.1


# ====================================================================
# 5. MULTI-TP PROGRESSION
# ====================================================================

class TestMultiTPProgression:
    """Verify correct state progression through multiple TP levels."""

    @pytest.mark.asyncio
    async def test_active_to_tp1_to_tp2_to_closed(self):
        """Full 3-TP progression: active → tp1 → tp2 → closed."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        # Step 1: active → tp1
        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0, state="active"
        )
        result = await ctrl.process_signal(signal, 2700.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "tp_hit"
        assert result["level"] == 1

        # Step 2: tp1 → tp2
        signal["state"] = "tp1"
        signal["tp_hit"] = 1
        result = await ctrl.process_signal(signal, 2750.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "tp_hit"
        assert result["level"] == 2

        # Step 3: tp2 → closed (tp3 hit)
        signal["state"] = "tp2"
        signal["tp_hit"] = 2
        result = await ctrl.process_signal(signal, 2800.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP3)

    @pytest.mark.asyncio
    async def test_sl_during_tp1_state(self):
        """Signal in tp1 state — SL still has priority and closes."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0, state="tp1",
        )
        signal["tp_hit"] = 1

        result = await ctrl.process_signal(signal, 2599.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        log_result("SL during TP1", "XAUUSD", 2599.0, 2650.0, 2600.0, 2700.0,
                    "tp1", "closed/sl", True)


# ====================================================================
# 6. EDGE CASES
# ====================================================================

class TestEdgeCases:
    """Boundary and edge case validation."""

    def test_null_stop_loss(self):
        triggered, _ = trigger.check_sl_triggered(2600.0, None, "buy")
        assert triggered is False

    def test_null_price(self):
        triggered, _ = trigger.check_sl_triggered(None, 2600.0, "buy")
        assert triggered is False

    def test_null_tp(self):
        triggered, _ = trigger.check_tp_triggered(2700.0, None, "buy")
        assert triggered is False

    def test_null_entry(self):
        triggered, _ = trigger.check_entry_triggered(2650.0, None, "buy")
        assert triggered is False

    @pytest.mark.asyncio
    async def test_tp3_state_auto_closes(self):
        """Signals in tp3 state auto-close immediately."""
        db = make_mock_db()
        ctrl = SignalLifecycleController(db)

        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0, state="tp3"
        )
        result = await ctrl.process_signal(signal, 2810.0, "test", datetime.now(timezone.utc))
        assert result is not None
        assert result["action"] == "closed"
        assert result["reason"] == "tp3"


# ====================================================================
# SUMMARY RUNNER (if executed directly)
# ====================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
