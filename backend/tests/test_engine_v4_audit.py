"""
tests/test_engine_v4_audit.py — Signal Engine v4.0 Full Audit Test Suite

REAL-MARKET SCENARIO TESTS (Step 8):
  A. BUY signal: Price drops below SL → must close immediately
  B. SELL signal: Price rises above SL → must close immediately
  C. Fast price jump: Price skips over TP → TP must still trigger
  D. Single TP signal: TP hit → must close (not transition to "tp1" state)
  E. Price oscillates around entry → must trigger on correct condition
  F. Price hits TP then reverses → TP captured before reversal
  G. High volatility spikes → SL has priority over everything

ALSO TESTS:
  - v4.0 CORRECTED entry rules (BUY = limit, SELL = limit)
  - PRICE_EPSILON = 0.5 applied ONLY to Entry + TP
  - No crossing detection
  - Trace logging structure

Run:  cd /app/backend && python -m pytest tests/test_engine_v4_audit.py -v -s
"""
import sys
import os
import asyncio
import logging
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from services.signal_engine import (
    DeterministicPriceTrigger,
    SignalLifecycleController,
    ExitReason,
    calculate_signal_pips,
)
from services.market_data import CACHE_TTL_SECONDS, get_price_fresh

logging.basicConfig(level=logging.INFO, format="%(asctime)s [TEST] %(message)s")
log = logging.getLogger("audit_test")

trigger = DeterministicPriceTrigger()
EPS = DeterministicPriceTrigger.PRICE_EPSILON  # 0.5


def make_db():
    db = MagicMock()
    db.signals = MagicMock()
    db.signals.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    return db


def make_signal(
    signal_id="audit-001", pair="XAUUSD", signal_type="buy", state="active",
    entry=2650.0, stop_loss=2600.0, tp1=2700.0, tp2=None, tp3=None,
    last_price=None, visibility="free",
):
    return {
        "signal_id": signal_id, "pair": pair, "signal_type": signal_type,
        "state": state, "status": state if state != "closed" else "closed",
        "entry": entry, "entry_price_actual": entry, "stop_loss": stop_loss,
        "tp1": tp1, "tp2": tp2, "tp3": tp3, "last_price": last_price,
        "visibility": visibility, "tp_hit": 0,
    }


# ====================================================================
# STEP 2: CORRECTED ENTRY TRIGGER RULES (v4.0)
# ====================================================================

class TestEntryV4Rules:
    """
    v4.0 AUDIT: Entry trigger rules were INVERTED in v3.0.
    
    CORRECT rules (limit orders):
      BUY:  price <= entry + EPSILON  (buy limit — price drops to entry)
      SELL: price >= entry - EPSILON  (sell limit — price rises to entry)
    """

    # --- BUY ENTRY (limit: buy when price drops to entry) ---
    def test_buy_entry_price_at_entry(self):
        """BUY: price = entry → 2650 <= 2650 + 0.5 = 2650.5 → TRUE"""
        t, _ = trigger.check_entry_triggered(2650.0, 2650.0, "buy")
        assert t is True

    def test_buy_entry_price_below_entry(self):
        """BUY: price = 2640 → 2640 <= 2650.5 → TRUE (price dropped to entry)"""
        t, _ = trigger.check_entry_triggered(2640.0, 2650.0, "buy")
        assert t is True

    def test_buy_entry_price_slightly_above_with_epsilon(self):
        """BUY: price = 2650.4 → 2650.4 <= 2650.5 → TRUE (within epsilon)"""
        t, _ = trigger.check_entry_triggered(2650.4, 2650.0, "buy")
        assert t is True

    def test_buy_entry_price_above_epsilon(self):
        """BUY: price = 2651 → 2651 <= 2650.5 → FALSE (too far above)"""
        t, _ = trigger.check_entry_triggered(2651.0, 2650.0, "buy")
        assert t is False

    def test_buy_entry_price_way_above(self):
        """BUY: price = 2670 → FALSE (market is above entry, not yet dropped)"""
        t, _ = trigger.check_entry_triggered(2670.0, 2650.0, "buy")
        assert t is False

    # --- SELL ENTRY (limit: sell when price rises to entry) ---
    def test_sell_entry_price_at_entry(self):
        """SELL: price = entry → 2650 >= 2650 - 0.5 = 2649.5 → TRUE"""
        t, _ = trigger.check_entry_triggered(2650.0, 2650.0, "sell")
        assert t is True

    def test_sell_entry_price_above_entry(self):
        """SELL: price = 2660 → 2660 >= 2649.5 → TRUE (price rose to entry)"""
        t, _ = trigger.check_entry_triggered(2660.0, 2650.0, "sell")
        assert t is True

    def test_sell_entry_price_slightly_below_with_epsilon(self):
        """SELL: price = 2649.6 → 2649.6 >= 2649.5 → TRUE (within epsilon)"""
        t, _ = trigger.check_entry_triggered(2649.6, 2650.0, "sell")
        assert t is True

    def test_sell_entry_price_below_epsilon(self):
        """SELL: price = 2649 → 2649 >= 2649.5 → FALSE (not yet risen)"""
        t, _ = trigger.check_entry_triggered(2649.0, 2650.0, "sell")
        assert t is False

    def test_sell_entry_price_way_below(self):
        """SELL: price = 2630 → FALSE (market hasn't risen to entry)"""
        t, _ = trigger.check_entry_triggered(2630.0, 2650.0, "sell")
        assert t is False


# ====================================================================
# STEP 2: SL RULES (NO EPSILON)
# ====================================================================

class TestSLNoEpsilon:
    """SL must have NO epsilon. Triggers immediately on breach."""

    def test_buy_sl_exact(self):
        t, p = trigger.check_sl_triggered(2600.0, 2600.0, "buy")
        assert t is True and p == 2600.0

    def test_buy_sl_below(self):
        t, _ = trigger.check_sl_triggered(2599.0, 2600.0, "buy")
        assert t is True

    def test_buy_sl_above_no_trigger(self):
        t, _ = trigger.check_sl_triggered(2600.1, 2600.0, "buy")
        assert t is False

    def test_buy_sl_no_epsilon(self):
        """SL must NOT use epsilon. 2600.4 > 2600.0 → NOT triggered."""
        t, _ = trigger.check_sl_triggered(2600.4, 2600.0, "buy")
        assert t is False

    def test_sell_sl_exact(self):
        t, p = trigger.check_sl_triggered(2700.0, 2700.0, "sell")
        assert t is True and p == 2700.0

    def test_sell_sl_above(self):
        t, _ = trigger.check_sl_triggered(2701.0, 2700.0, "sell")
        assert t is True

    def test_sell_sl_below_no_trigger(self):
        t, _ = trigger.check_sl_triggered(2699.9, 2700.0, "sell")
        assert t is False

    def test_sell_sl_no_epsilon(self):
        """SL must NOT use epsilon. 2699.6 < 2700.0 → NOT triggered."""
        t, _ = trigger.check_sl_triggered(2699.6, 2700.0, "sell")
        assert t is False


# ====================================================================
# STEP 2: TP RULES (WITH EPSILON)
# ====================================================================

class TestTPWithEpsilon:
    """TP uses PRICE_EPSILON = 0.5."""

    def test_buy_tp_exact(self):
        t, _ = trigger.check_tp_triggered(2700.0, 2700.0, "buy")
        assert t is True

    def test_buy_tp_within_epsilon(self):
        """BUY: 2699.6 >= 2700.0 - 0.5 = 2699.5 → TRUE"""
        t, _ = trigger.check_tp_triggered(2699.6, 2700.0, "buy")
        assert t is True

    def test_buy_tp_outside_epsilon(self):
        """BUY: 2699.4 >= 2699.5 → FALSE"""
        t, _ = trigger.check_tp_triggered(2699.4, 2700.0, "buy")
        assert t is False

    def test_sell_tp_exact(self):
        t, _ = trigger.check_tp_triggered(2600.0, 2600.0, "sell")
        assert t is True

    def test_sell_tp_within_epsilon(self):
        """SELL: 2600.4 <= 2600.5 → TRUE"""
        t, _ = trigger.check_tp_triggered(2600.4, 2600.0, "sell")
        assert t is True

    def test_sell_tp_outside_epsilon(self):
        """SELL: 2600.6 <= 2600.5 → FALSE"""
        t, _ = trigger.check_tp_triggered(2600.6, 2600.0, "sell")
        assert t is False


# ====================================================================
# STEP 2: NO CROSSING DETECTION
# ====================================================================

class TestNoCrossingDetection:
    """last_price must NEVER influence trigger outcome."""

    def test_sl_ignores_last_price(self):
        t1, _ = trigger.check_sl_triggered(2599.0, 2600.0, "buy", last_price=2700.0)
        t2, _ = trigger.check_sl_triggered(2599.0, 2600.0, "buy", last_price=None)
        assert t1 == t2 == True

    def test_tp_ignores_last_price(self):
        t1, _ = trigger.check_tp_triggered(2700.0, 2700.0, "buy", last_price=2500.0)
        t2, _ = trigger.check_tp_triggered(2700.0, 2700.0, "buy", last_price=None)
        assert t1 == t2 == True

    def test_entry_ignores_last_price(self):
        t1, _ = trigger.check_entry_triggered(2650.0, 2650.0, "buy", last_price=2800.0)
        t2, _ = trigger.check_entry_triggered(2650.0, 2650.0, "buy", last_price=None)
        assert t1 == t2 == True


# ====================================================================
# STEP 4: SL PRIORITY (MANDATORY)
# ====================================================================

class TestSLPriority:
    """SL must be evaluated FIRST. Even if TP also triggers, SL wins."""

    @pytest.mark.asyncio
    async def test_scenario_a_buy_sl_breach(self):
        """A: BUY signal — price drops below SL → MUST close immediately."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(signal_type="buy", stop_loss=2600.0, tp1=2700.0, tp2=2750.0, tp3=2800.0)
        result = await ctrl.process_signal(signal, 2595.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 2600.0  # gap-protected
        log.info(f"A: BUY SL at 2600, price=2595 → {result['action']}/{result['reason']}")

    @pytest.mark.asyncio
    async def test_scenario_b_sell_sl_breach(self):
        """B: SELL signal — price rises above SL → MUST close immediately."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=2550.0, tp3=2500.0
        )
        result = await ctrl.process_signal(signal, 2705.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 2700.0
        log.info(f"B: SELL SL at 2700, price=2705 → {result['action']}/{result['reason']}")


# ====================================================================
# STEP 5: SINGLE-TP HANDLING
# ====================================================================

class TestSingleTP:
    """If tp2/tp3 do NOT exist, TP hit MUST CLOSE trade immediately."""

    @pytest.mark.asyncio
    async def test_scenario_d_single_tp_buy(self):
        """D: BUY with only tp1 at 2700. Price hits 2700 → MUST close."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="buy", tp1=2700.0, tp2=None, tp3=None
        )
        result = await ctrl.process_signal(signal, 2700.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP1)
        log.info(f"D: Single-TP BUY → {result['action']}/{result['reason']}")

    @pytest.mark.asyncio
    async def test_scenario_d_single_tp_sell(self):
        """D: SELL with only tp1 at 2600. Price hits 2600 → MUST close."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=None, tp3=None
        )
        result = await ctrl.process_signal(signal, 2600.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP1)
        log.info(f"D: Single-TP SELL → {result['action']}/{result['reason']}")

    def test_single_tp_returns_closed_state(self):
        """get_next_tp_target must return 'closed' for single-TP, NOT 'tp1'."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(tp1=2700.0, tp2=None, tp3=None, state="active")
        _, reason, new_state = ctrl.get_next_tp_target(signal)
        assert new_state == "closed", f"Expected 'closed', got '{new_state}'"
        assert reason == ExitReason.TP1


# ====================================================================
# STEP 8: REAL-MARKET SCENARIO SIMULATIONS
# ====================================================================

class TestGapProtection:
    """C: Fast price jump — price skips over TP → TP must still trigger."""

    @pytest.mark.asyncio
    async def test_scenario_c_buy_gap_over_tp(self):
        """BUY: Price jumps from 2680 to 2720, skipping TP1=2700. Must trigger."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="buy", tp1=2700.0, tp2=2750.0, tp3=2800.0,
            last_price=2680.0
        )
        result = await ctrl.process_signal(signal, 2720.0, "test", datetime.now(timezone.utc))
        assert result is not None
        assert result["action"] == "tp_hit"
        log.info(f"C: BUY gap through TP1 → {result}")

    @pytest.mark.asyncio
    async def test_scenario_c_sell_gap_over_tp(self):
        """SELL: Price drops from 2620 to 2580, skipping TP1=2600. Must trigger."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=2550.0, tp3=2500.0, last_price=2620.0
        )
        result = await ctrl.process_signal(signal, 2580.0, "test", datetime.now(timezone.utc))
        assert result is not None
        assert result["action"] == "tp_hit"
        log.info(f"C: SELL gap through TP1 → {result}")

    @pytest.mark.asyncio
    async def test_buy_gap_over_sl(self):
        """BUY: Price gaps from 2610 to 2590 (below SL=2600). Must trigger SL."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="buy", stop_loss=2600.0, tp1=2700.0, last_price=2610.0
        )
        result = await ctrl.process_signal(signal, 2590.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 2600.0
        log.info(f"C: BUY gap through SL → {result}")

    @pytest.mark.asyncio
    async def test_sell_gap_over_sl(self):
        """SELL: Price gaps from 2690 to 2710 (above SL=2700). Must trigger SL."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, last_price=2690.0
        )
        result = await ctrl.process_signal(signal, 2710.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 2700.0


class TestEntryOscillation:
    """E: Price oscillates around entry — must trigger on correct condition."""

    @pytest.mark.asyncio
    async def test_buy_entry_oscillation(self):
        """BUY entry at 2650. Price oscillates: 2660, 2655, 2650, 2645.
        Should trigger when price DROPS to 2650 (buy limit)."""
        ctrl = SignalLifecycleController(make_db())
        
        # Tick 1: price = 2660 → 2660 <= 2650.5 → FALSE (above entry)
        sig = make_signal(signal_type="buy", entry=2650.0, state="pending")
        r = await ctrl.process_signal(sig, 2660.0, "test", datetime.now(timezone.utc))
        assert r is None, "BUY entry should NOT trigger at 2660 (above entry)"
        
        # Tick 2: price = 2655 → 2655 <= 2650.5 → FALSE
        r = await ctrl.process_signal(sig, 2655.0, "test", datetime.now(timezone.utc))
        assert r is None, "BUY entry should NOT trigger at 2655"
        
        # Tick 3: price = 2650 → 2650 <= 2650.5 → TRUE (at entry!)
        r = await ctrl.process_signal(sig, 2650.0, "test", datetime.now(timezone.utc))
        assert r is not None and r["action"] == "activated"
        log.info("E: BUY entry oscillation → triggered at 2650")

    @pytest.mark.asyncio
    async def test_sell_entry_oscillation(self):
        """SELL entry at 2650. Price oscillates: 2640, 2645, 2650, 2655.
        Should trigger when price RISES to 2650 (sell limit)."""
        ctrl = SignalLifecycleController(make_db())
        
        # Tick 1: price = 2640 → 2640 >= 2649.5 → FALSE (below entry)
        sig = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, state="pending"
        )
        r = await ctrl.process_signal(sig, 2640.0, "test", datetime.now(timezone.utc))
        assert r is None, "SELL entry should NOT trigger at 2640 (below entry)"
        
        # Tick 2: price = 2645 → 2645 >= 2649.5 → FALSE
        r = await ctrl.process_signal(sig, 2645.0, "test", datetime.now(timezone.utc))
        assert r is None, "SELL entry should NOT trigger at 2645"
        
        # Tick 3: price = 2650 → 2650 >= 2649.5 → TRUE (at entry!)
        r = await ctrl.process_signal(sig, 2650.0, "test", datetime.now(timezone.utc))
        assert r is not None and r["action"] == "activated"
        log.info("E: SELL entry oscillation → triggered at 2650")


class TestTPThenReversal:
    """F: Price hits TP then reverses quickly → TP must be captured."""

    @pytest.mark.asyncio
    async def test_buy_tp_captured_before_reversal(self):
        """BUY: Price spikes to TP1, then reverses. Tick at TP1 must capture."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(signal_type="buy", tp1=2700.0, tp2=None, tp3=None)
        
        # Tick at TP1
        result = await ctrl.process_signal(signal, 2700.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP1)
        log.info("F: BUY TP captured before reversal")

    @pytest.mark.asyncio
    async def test_sell_tp_captured_before_reversal(self):
        """SELL: Price dips to TP1, then reverses. Tick at TP1 must capture."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=None, tp3=None
        )
        result = await ctrl.process_signal(signal, 2600.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == str(ExitReason.TP1)
        log.info("F: SELL TP captured before reversal")


class TestHighVolatilitySpike:
    """G: High volatility — SL always has priority over everything."""

    @pytest.mark.asyncio
    async def test_extreme_spike_sl_priority(self):
        """Price crashes 100+ points in one tick — SL must trigger, not TP."""
        ctrl = SignalLifecycleController(make_db())
        # BUY signal: entry=2650, SL=2600, TP1=2700
        signal = make_signal(
            signal_type="buy", entry=2650.0, stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0
        )
        # Massive crash: price drops to 2500 (below SL=2600)
        result = await ctrl.process_signal(signal, 2500.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 2600.0  # gap-protected at SL level
        log.info(f"G: Extreme spike → SL triggered at 2600 despite price=2500")

    @pytest.mark.asyncio
    async def test_sell_spike_sl_priority(self):
        """SELL: Price spikes up 100+ points — SL must trigger."""
        ctrl = SignalLifecycleController(make_db())
        signal = make_signal(
            signal_type="sell", entry=2650.0, stop_loss=2700.0,
            tp1=2600.0, tp2=2550.0, tp3=2500.0
        )
        # Massive spike: price jumps to 2800 (above SL=2700)
        result = await ctrl.process_signal(signal, 2800.0, "test", datetime.now(timezone.utc))
        assert result["action"] == "closed"
        assert result["reason"] == "sl"
        assert result["exit_price"] == 2700.0
        log.info(f"G: SELL spike → SL triggered at 2700 despite price=2800")


# ====================================================================
# STEP 3: CACHE VALIDATION
# ====================================================================

class TestCacheConfig:
    """Cache TTL must be 3s. get_price_fresh must exist."""

    def test_cache_ttl_is_3(self):
        assert CACHE_TTL_SECONDS == 3

    def test_get_price_fresh_exists(self):
        """get_price_fresh must be importable — engine uses it to bypass cache."""
        assert callable(get_price_fresh)

    def test_price_epsilon_is_0_5(self):
        assert DeterministicPriceTrigger.PRICE_EPSILON == 0.5


# ====================================================================
# STEP 7: ENGINE CODE AUDIT
# ====================================================================

class TestEngineCodeAudit:
    """Verify engine code structure matches audit requirements."""

    def test_no_permanent_pause_in_engine(self):
        import inspect
        from services.signal_engine import run_price_automation
        source = inspect.getsource(run_price_automation)
        assert 'config["paused"] = True' not in source

    def test_trace_logging_present(self):
        import inspect
        from services.signal_engine import SignalLifecycleController
        source = inspect.getsource(SignalLifecycleController.process_signal)
        assert "[TRACE]" in source

    def test_fresh_price_fetch(self):
        """Engine must use get_price_fresh, not get_price."""
        import inspect
        from services.signal_engine import fetch_live_prices
        source = inspect.getsource(fetch_live_prices)
        assert "get_price_fresh" in source

    def test_cycle_timing_logged(self):
        import inspect
        from services.signal_engine import run_price_automation
        source = inspect.getsource(run_price_automation)
        assert "cycle_start" in source
        assert "cycle_duration" in source or "cycle_end" in source

    def test_entry_rule_buy_is_limit(self):
        """BUY entry must use <= (price drops to entry)."""
        import inspect
        source = inspect.getsource(DeterministicPriceTrigger.check_entry_triggered)
        assert "current_price <= entry_price + eps" in source

    def test_entry_rule_sell_is_limit(self):
        """SELL entry must use >= (price rises to entry)."""
        import inspect
        source = inspect.getsource(DeterministicPriceTrigger.check_entry_triggered)
        assert "current_price >= entry_price - eps" in source


# ====================================================================
# MULTI-TP PROGRESSION (regression)
# ====================================================================

class TestMultiTPRegression:
    """Verify multi-TP still works correctly after v4.0 changes."""

    @pytest.mark.asyncio
    async def test_full_progression(self):
        """active → tp1 → tp2 → closed (all 3 TPs)."""
        ctrl = SignalLifecycleController(make_db())

        sig = make_signal(signal_type="buy", tp1=2700.0, tp2=2750.0, tp3=2800.0)
        r = await ctrl.process_signal(sig, 2700.0, "test", datetime.now(timezone.utc))
        assert r["action"] == "tp_hit" and r["level"] == 1

        sig["state"] = "tp1"
        sig["tp_hit"] = 1
        r = await ctrl.process_signal(sig, 2750.0, "test", datetime.now(timezone.utc))
        assert r["action"] == "tp_hit" and r["level"] == 2

        sig["state"] = "tp2"
        sig["tp_hit"] = 2
        r = await ctrl.process_signal(sig, 2800.0, "test", datetime.now(timezone.utc))
        assert r["action"] == "closed" and r["reason"] == str(ExitReason.TP3)

    @pytest.mark.asyncio
    async def test_sl_during_tp1(self):
        """SL during tp1 state still has priority."""
        ctrl = SignalLifecycleController(make_db())
        sig = make_signal(
            signal_type="buy", stop_loss=2600.0,
            tp1=2700.0, tp2=2750.0, tp3=2800.0, state="tp1"
        )
        sig["tp_hit"] = 1
        r = await ctrl.process_signal(sig, 2599.0, "test", datetime.now(timezone.utc))
        assert r["action"] == "closed" and r["reason"] == "sl"


# ====================================================================
# EDGE CASES
# ====================================================================

class TestEdgeCases:
    def test_null_sl(self):
        t, _ = trigger.check_sl_triggered(2600.0, None, "buy")
        assert t is False

    def test_null_tp(self):
        t, _ = trigger.check_tp_triggered(2700.0, None, "buy")
        assert t is False

    def test_null_entry(self):
        t, _ = trigger.check_entry_triggered(2650.0, None, "buy")
        assert t is False

    @pytest.mark.asyncio
    async def test_closed_signal_immutable(self):
        ctrl = SignalLifecycleController(make_db())
        sig = make_signal(state="closed")
        r = await ctrl.process_signal(sig, 2700.0, "test", datetime.now(timezone.utc))
        assert r is None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
