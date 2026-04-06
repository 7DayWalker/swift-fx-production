"""
services/signal_engine.py — Signal lifecycle engine (price polling, auto TP/SL).
This is the background task engine, NOT HTTP routes.
"""
import os
import uuid
import asyncio
import logging
from enum import Enum
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional

import httpx

from core.database import db
from core.config import PRICE_POLL_INTERVAL, SYMBOL_MAP, get_instrument_info
from models.enums import SignalState, SignalVisibility, SignalType

import core.engine_state as engine_state

logger = logging.getLogger(__name__)


# Lazy-import wrappers for notification functions
# Using centralized push_notifications service
async def send_signal_notification(signal_id, pair, signal_type, visibility):
    from services.push_notifications import notify_new_signal
    sig_type = signal_type.value if hasattr(signal_type, 'value') else str(signal_type)
    await notify_new_signal(signal_id, pair, sig_type)


async def send_signal_close_notification(signal_id, pair, signal_type, pips, visibility):
    from services.push_notifications import notify_signal_closed
    sig_type = signal_type if isinstance(signal_type, str) else signal_type.value
    await notify_signal_closed(signal_id, pair, sig_type, pips)


async def send_tp_hit_notification(signal_id, pair, signal_type, tp_level, running_pips=None):
    from services.push_notifications import notify_tp_hit
    sig_type = signal_type if isinstance(signal_type, str) else signal_type.value
    await notify_tp_hit(signal_id, pair, sig_type, tp_level, running_pips)

# ==============================================================================
# SIGNAL LIFECYCLE ENGINE v4.0 - AUDITED ABSOLUTE THRESHOLD ENGINE
# ==============================================================================
#
# AUDIT DATE: March 31, 2026
#
# ROOT CAUSES FIXED:
# 1. Entry trigger was INVERTED (BUY/SELL conditions were swapped)
# 2. Cache served stale prices 2/3 ticks (3s TTL with 1s polling)
# 3. No trace-level logging made issues invisible
#
# EXECUTION RULES (FINAL — VERIFIED):
#   BUY:
#     Entry:  price <= entry + EPSILON     (buy limit: price drops to entry)
#     SL:     price <= stop_loss           (NO epsilon)
#     TP:     price >= tp - EPSILON
#
#   SELL:
#     Entry:  price >= entry - EPSILON     (sell limit: price rises to entry)
#     SL:     price >= stop_loss           (NO epsilon)
#     TP:     price <= tp + EPSILON
#
# PRICE_EPSILON = 0.5 — applied ONLY to Entry and TP, NEVER to SL
#
# EVALUATION HIERARCHY (per tick):
#   1. Stop Loss — HIGHEST priority, NO epsilon, immediate on breach
#   2. Take Profit — second priority, with epsilon
#   3. Entry — for pending signals, with epsilon
#
# SINGLE-TP: If tp2/tp3 are null, hitting tp1 → state="closed", outcome=profit
#
# CACHE: Engine always fetches FRESH prices (bypasses TTL cache).
#        Cache only used by HTTP API endpoints.
#
# ==============================================================================


async def fetch_live_prices(symbols: List[str]) -> Dict[str, dict]:
    """
    Fetch live prices using the multi-asset market data service.
    
    Returns dict with price AND source for each symbol:
    {
        "XAUUSD": {"price": 2650.50, "source": "metals-api"},
        "EURUSD": {"price": 1.0850, "source": "frankfurter.app"}
    }
    
    CRITICAL: NO HARDCODED FALLBACK PRICES.
    If API fails, symbol is omitted from results.
    """
    from services.market_data import get_price_fresh, _normalize_symbol, SYMBOL_PROVIDERS
    
    prices = {}
    
    # Group symbols by type for efficient fetching
    forex_symbols = []
    crypto_symbols = []
    market_data_symbols = []  # Symbols handled by market_data service
    
    for symbol in symbols:
        normalized = symbol.replace("/", "").upper()
        mapping = SYMBOL_MAP.get(symbol) or SYMBOL_MAP.get(normalized)
        if not mapping:
            continue
        
        # Check if the market_data service supports this symbol
        md_normalized = _normalize_symbol(symbol)
        if md_normalized in SYMBOL_PROVIDERS:
            market_data_symbols.append((symbol, md_normalized))
        elif mapping["type"] == "forex":
            forex_symbols.append((symbol, mapping["symbol"]))
        elif mapping["type"] == "crypto":
            crypto_symbols.append((symbol, mapping["symbol"]))
    
    # Fetch from market_data service — ALWAYS FRESH (bypass TTL cache)
    for orig_symbol, md_symbol in market_data_symbols:
        try:
            result = await get_price_fresh(md_symbol)
            prices[orig_symbol] = {
                "price": result["price"],
                "source": result["source"],
                "fresh": True,
            }
        except Exception as e:
            logger.warning(f"[PriceFetch] {orig_symbol} via market_data FAILED: {e}")
    
    # Fetch remaining forex from frankfurter.app (free, no API key needed)
    if forex_symbols:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for orig_symbol, api_symbol in forex_symbols:
                base = api_symbol[:3]
                quote_ccy = api_symbol[3:]
                try:
                    resp = await client.get(
                        f"https://api.frankfurter.app/latest?from={base}&to={quote_ccy}"
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        rate = data.get("rates", {}).get(quote_ccy)
                        if rate:
                            prices[orig_symbol] = {
                                "price": float(rate),
                                "source": "frankfurter.app"
                            }
                except Exception as e:
                    logger.warning(f"[PriceFetch] Forex {orig_symbol} FAILED: {e}")
    
    # Fetch remaining crypto from CoinGecko (free, no API key)
    if crypto_symbols:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                ids = ",".join([s[1] for s in crypto_symbols])
                resp = await client.get(
                    f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd"
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for orig_symbol, api_id in crypto_symbols:
                        if api_id in data and "usd" in data[api_id]:
                            prices[orig_symbol] = {
                                "price": float(data[api_id]["usd"]),
                                "source": "coingecko"
                            }
            except Exception as e:
                logger.error(f"[PriceFetch] Crypto FAILED: {e}")
    
    return prices


# ==============================================================================
# SIGNAL LIFECYCLE ENGINE v3.0 - DETERMINISTIC AUDITABLE MODE
# ==============================================================================


class ExitReason(str, Enum):
    """Exit reason for closed signals"""
    TP1 = "tp1"
    TP2 = "tp2"
    TP3 = "tp3"
    SL = "sl"
    MANUAL = "manual"


# ==============================================================================
# CORE CALCULATION: PIP CALCULATOR v3.0 - WITH FULL AUDIT TRACE
# ==============================================================================

def calculate_signal_pips_with_trace(
    entry_price: float,
    exit_price: float,
    signal_type: str,
    pair: str
) -> dict:
    """
    Calculate pips EXACTLY ONCE at closure with full audit trace.
    
    FORMULA:
    - SELL: pips = (entry_price - exit_price) * pip_multiplier (profit when price goes DOWN)
    - BUY: pips = (exit_price - entry_price) * pip_multiplier (profit when price goes UP)
    
    Returns dict with:
    - calculated_pips: The final pip value
    - pip_multiplier: Multiplier used
    - pip_size: Size of one pip
    - math_trace: Full calculation string for audit
    """
    if not entry_price or not exit_price:
        return {
            "calculated_pips": 0.0,
            "pip_multiplier": 0,
            "pip_size": 0,
            "math_trace": "INVALID: missing entry or exit price"
        }
    
    # Get instrument info
    info = get_instrument_info(pair)
    pip_multiplier = info["pip_multiplier"]
    pip_size = info["pip_size"]
    
    # Calculate based on signal type
    sig_type = signal_type.lower()
    
    if sig_type == "sell":
        # SELL profits when price goes DOWN
        raw_diff = entry_price - exit_price
        pips = raw_diff * pip_multiplier
        math_trace = f"SELL: ({entry_price} - {exit_price}) * {pip_multiplier} = {pips}"
    else:
        # BUY profits when price goes UP
        raw_diff = exit_price - entry_price
        pips = raw_diff * pip_multiplier
        math_trace = f"BUY: ({exit_price} - {entry_price}) * {pip_multiplier} = {pips}"
    
    final_pips = round(pips, 1)
    
    logger.info(f"[PipCalc] {pair} {sig_type.upper()}: {math_trace} → {final_pips} pips")
    
    return {
        "calculated_pips": final_pips,
        "pip_multiplier": pip_multiplier,
        "pip_size": pip_size,
        "math_trace": math_trace
    }


def calculate_signal_pips(entry_price: float, exit_price: float, signal_type: str, pair: str) -> float:
    """Legacy wrapper - returns just the pip value"""
    result = calculate_signal_pips_with_trace(entry_price, exit_price, signal_type, pair)
    return result["calculated_pips"]


# ==============================================================================
# DETERMINISTIC PRICE TRIGGER ENGINE v4.0 - AUDITED ABSOLUTE THRESHOLDS
# ==============================================================================

class DeterministicPriceTrigger:
    """
    AUDITED absolute threshold price trigger — NO crossing detection.
    
    Every tick is evaluated independently. No dependency on previous_price.
    
    EXECUTION RULES (v4.0 — AUDITED):
      BUY signals (limit order: buy when price drops to entry):
        Entry:  price <= entry + EPSILON
        TP:     price >= tp - EPSILON
        SL:     price <= stop_loss        (NO epsilon)
      
      SELL signals (limit order: sell when price rises to entry):
        Entry:  price >= entry - EPSILON
        TP:     price <= tp + EPSILON
        SL:     price >= stop_loss        (NO epsilon)
    
    PRICE_EPSILON = 0.5 — broker spread tolerance.
    Applied ONLY to Entry and TP. NEVER to SL.
    
    GAP PROTECTION: Returns the DEFINED level price for execution,
    not the gapped market price. Deterministic and auditable.
    """
    
    PRICE_EPSILON = 0.5  # Broker spread tolerance (in price units)
    # Legacy alias
    BUFFER = PRICE_EPSILON
    
    @staticmethod
    def check_sl_triggered(
        current_price: float,
        stop_loss: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Stop Loss — NO EPSILON. Triggers immediately on breach.
        
        BUY:  price <= stop_loss  (price drops below SL)
        SELL: price >= stop_loss  (price rises above SL)
        """
        if not stop_loss or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            triggered = current_price >= stop_loss
        else:
            triggered = current_price <= stop_loss
        
        return (triggered, stop_loss if triggered else None)
    
    @staticmethod
    def check_tp_triggered(
        current_price: float,
        take_profit: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Take Profit — EPSILON applied for broker spread tolerance.
        
        BUY:  price >= tp - EPSILON  (price rises to TP)
        SELL: price <= tp + EPSILON  (price drops to TP)
        """
        if not take_profit or not current_price:
            return (False, None)
        
        eps = DeterministicPriceTrigger.PRICE_EPSILON
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            triggered = current_price <= take_profit + eps
        else:
            triggered = current_price >= take_profit - eps
        
        return (triggered, take_profit if triggered else None)
    
    @staticmethod
    def check_entry_triggered(
        current_price: float,
        entry_price: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Entry — EPSILON applied. Limit order behavior.
        
        BUY:  price <= entry + EPSILON  (price drops TO entry for buy limit)
        SELL: price >= entry - EPSILON  (price rises TO entry for sell limit)
        
        v4.0 FIX: Previous version had BUY/SELL conditions INVERTED,
        causing pending orders to trigger late or not at all.
        """
        if not entry_price or not current_price:
            return (False, None)
        
        eps = DeterministicPriceTrigger.PRICE_EPSILON
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL LIMIT: activate when price rises to entry
            triggered = current_price >= entry_price - eps
        else:
            # BUY LIMIT: activate when price drops to entry
            triggered = current_price <= entry_price + eps
        
        return (triggered, entry_price if triggered else None)


# Legacy alias for backward compatibility
PriceTrigger = DeterministicPriceTrigger


# ==============================================================================
# SIGNAL LIFECYCLE CONTROLLER v3.0 - DETERMINISTIC AUDITABLE
# ==============================================================================

class SignalLifecycleController:
    """
    THE authoritative controller for signal state management.
    
    RULES:
    1. Closed signals are NEVER processed
    2. Admin state is NEVER overridden
    3. State transitions follow strict rules
    4. Pips calculated ONCE at closure
    """
    
    def __init__(self, db_instance):
        self.db = db_instance
        self.trigger = PriceTrigger()
    
    def is_closed(self, signal: dict) -> bool:
        """Check if signal is closed (IMMUTABLE)"""
        state = signal.get("state", signal.get("status", "pending"))
        return state == "closed"
    
    def get_current_state(self, signal: dict) -> str:
        """Get the authoritative state of a signal"""
        return signal.get("state", signal.get("status", "pending"))
    
    def get_next_tp_target(self, signal: dict) -> tuple:
        """
        Get the next TP target based on current state.
        Returns (tp_price, exit_reason, new_state)
        
        SINGLE-TP FIX: If only tp1 exists (tp2/tp3 are null),
        hitting tp1 closes the trade immediately as PROFIT.
        """
        state = self.get_current_state(signal)
        tp1 = signal.get("tp1")
        tp2 = signal.get("tp2")
        tp3 = signal.get("tp3")
        
        if state == "active":
            if tp1:
                # Single-TP signal: tp1 exists but tp2/tp3 don't → close on tp1
                if not tp2 and not tp3:
                    return (tp1, ExitReason.TP1, "closed")
                # Multi-TP signal: advance to tp1 state
                return (tp1, ExitReason.TP1, "tp1")
            return (None, None, None)
        elif state == "tp1":
            if tp2:
                # Check if this is the last TP
                if not tp3:
                    return (tp2, ExitReason.TP2, "closed")
                return (tp2, ExitReason.TP2, "tp2")
            return (None, None, None)
        elif state == "tp2":
            if tp3:
                return (tp3, ExitReason.TP3, "closed")
            return (None, None, None)
        elif state == "tp3":
            # TP3 hit means close
            return (tp3 or tp2 or tp1, ExitReason.TP3, "closed")
        
        return (None, None, None)
    
    async def close_signal(
        self,
        signal_id: str,
        current_state: str,
        exit_price: float,
        exit_reason: str,
        signal: dict,
        price_context: Optional[dict] = None
    ) -> bool:
        """
        CLOSE a signal with full audit trail. This is FINAL - no further processing.
        
        Actions:
        1. Set state = closed
        2. Set exit_price (GAP-PROTECTED: defined SL/TP level, not gapped market price)
        3. Set exit_reason
        4. Calculate pips with full math trace
        5. Store price_source, poll_timestamp, last_price, current_price
        6. Set closed_at timestamp
        """
        entry_price = signal.get("entry_price_actual") or signal.get("entry")
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        
        # Calculate pips with FULL AUDIT TRACE
        pip_result = calculate_signal_pips_with_trace(entry_price, exit_price, signal_type, pair)
        
        # Determine tp_hit from exit_reason
        tp_hit_map = {
            "sl": 0,
            "tp1": 1,
            "tp2": 2,
            "tp3": 3,
            "manual": 0
        }
        tp_hit = tp_hit_map.get(exit_reason.lower() if isinstance(exit_reason, str) else exit_reason.value, 0)
        
        # Preserve existing tp_hit if closing from SL after hitting some TPs
        if exit_reason in ["sl", ExitReason.SL, "manual", ExitReason.MANUAL]:
            existing_tp = signal.get("tp_hit", 0)
            if existing_tp > tp_hit:
                tp_hit = existing_tp
        
        # Build audit record
        update_doc = {
            "state": "closed",
            "status": "closed",
            "exit_price": exit_price,
            "exit_reason": exit_reason if isinstance(exit_reason, str) else exit_reason.value,
            "final_pips": pip_result["calculated_pips"],
            "tp_hit": tp_hit,
            "closed_at": datetime.now(timezone.utc),
            # AUDIT TRAIL FIELDS
            "pip_size": pip_result["pip_size"],
            "pip_multiplier": pip_result["pip_multiplier"],
            "pip_math_trace": pip_result["math_trace"],
        }
        
        # Add price context if provided
        if price_context:
            update_doc["price_source"] = price_context.get("price_source")
            update_doc["poll_timestamp"] = price_context.get("poll_timestamp")
            update_doc["closure_last_price"] = price_context.get("last_price")
            update_doc["closure_current_price"] = price_context.get("current_price")
        
        # Update signal - ATOMIC operation
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": current_state},
            {"$set": update_doc}
        )
        
        if result.modified_count > 0:
            logger.info(
                f"[Engine] CLOSED signal {signal_id}: "
                f"exit_reason={exit_reason}, exit_price={exit_price}, "
                f"pips={pip_result['calculated_pips']}, "
                f"math={pip_result['math_trace']}"
            )
            return True
        
        return False
    
    async def advance_tp_state(
        self,
        signal_id: str,
        current_state: str,
        new_state: str,
        tp_hit: int,
        signal: Optional[dict] = None
    ) -> bool:
        """
        Advance signal to next TP state (e.g., active → tp1).
        
        TRAILING SL LOGIC (critical risk management):
          TP1 hit → SL moves to entry price (breakeven)
          TP2 hit → SL moves to TP1 price
          TP3 hit → signal closes (handled elsewhere)
        
        This ensures a trade that already hit TP1 can NEVER close at a loss.
        """
        update_doc = {
            "state": new_state,
            "status": "active",
            "tp_hit": tp_hit
        }
        
        # Trail the stop loss based on which TP was just hit
        if signal:
            entry = signal.get("entry_price_actual") or signal.get("entry")
            tp1 = signal.get("tp1")
            original_sl = signal.get("stop_loss")
            
            if tp_hit == 1 and entry:
                # TP1 hit → move SL to entry (breakeven)
                update_doc["stop_loss"] = entry
                update_doc["original_stop_loss"] = original_sl
                logger.info(
                    f"[Engine] Signal {signal_id}: TRAILING SL → entry (breakeven) "
                    f"SL {original_sl} → {entry}"
                )
            elif tp_hit == 2 and tp1:
                # TP2 hit → move SL to TP1 level (lock in TP1 profit)
                update_doc["stop_loss"] = tp1
                if not signal.get("original_stop_loss"):
                    update_doc["original_stop_loss"] = original_sl
                logger.info(
                    f"[Engine] Signal {signal_id}: TRAILING SL → TP1 "
                    f"SL {signal.get('stop_loss')} → {tp1}"
                )
        
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": current_state},
            {"$set": update_doc}
        )
        
        if result.modified_count > 0:
            logger.info(f"[Engine] Signal {signal_id} advanced: {current_state} → {new_state}")
            return True
        
        return False
    
    async def activate_signal(
        self,
        signal_id: str,
        activation_price: float,
        price_context: Optional[dict] = None
    ) -> bool:
        """
        Activate a pending signal with GAP PROTECTION.
        
        IMPORTANT: activation_price is the DEFINED entry level, not the gapped market price.
        This keeps signal math clean and deterministic.
        """
        update_doc = {
            "state": "active",
            "status": "active",
            "tp_hit": 0,
            "entry_price_actual": activation_price,  # GAP-PROTECTED: defined entry
            "activated_at": datetime.now(timezone.utc)
        }
        
        # Add price context if provided
        if price_context:
            update_doc["activation_price_source"] = price_context.get("price_source")
            update_doc["activation_poll_timestamp"] = price_context.get("poll_timestamp")
            update_doc["activation_last_price"] = price_context.get("last_price")
            update_doc["activation_current_price"] = price_context.get("current_price")
        
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": "pending"},
            {"$set": update_doc}
        )
        
        if result.modified_count > 0:
            logger.info(
                f"[Engine] Signal {signal_id} ACTIVATED at {activation_price} "
                f"(gap-protected entry level)"
            )
            return True
        
        return False
    
    async def process_signal(
        self,
        signal: dict,
        current_price: float,
        price_source: str,
        poll_timestamp: datetime,
        price_fresh: bool = True
    ) -> Optional[dict]:
        """
        MAIN ENTRY POINT: Process a single signal with current price.
        
        TRACE LOGGING: Every evaluation is logged with exact comparison.
        """
        signal_id = signal["signal_id"]
        current_state = self.get_current_state(signal)
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        last_price = signal.get("last_price")
        entry = signal.get("entry")
        stop_loss = signal.get("stop_loss")
        tp1 = signal.get("tp1")
        tp2 = signal.get("tp2")
        tp3 = signal.get("tp3")
        
        sig_type = signal_type.lower()
        eps = DeterministicPriceTrigger.PRICE_EPSILON
        
        # ===== STEP 1: MANDATORY TRACE LOG (every signal, every cycle) =====
        logger.info(
            f"[TRACE] {signal_id} | {pair} {sig_type.upper()} | state={current_state} | "
            f"price={current_price} | entry={entry} sl={stop_loss} "
            f"tp1={tp1} tp2={tp2} tp3={tp3} | "
            f"prev_price={last_price} | src={price_source} | fresh={price_fresh}"
        )
        
        # Build price context for audit trail
        price_context = {
            "price_source": price_source,
            "poll_timestamp": poll_timestamp,
            "last_price": last_price,
            "current_price": current_price
        }
        
        # RULE 1: NEVER process closed signals
        if self.is_closed(signal):
            return None
        
        # Update last_price for next iteration
        await self.db.signals.update_one(
            {"signal_id": signal_id},
            {"$set": {"last_price": current_price}}
        )
        
        # === PENDING SIGNALS: Check ENTRY ===
        if current_state == "pending":
            if not entry:
                return None
            
            triggered, activation_price = self.trigger.check_entry_triggered(
                current_price, entry, signal_type, last_price
            )
            
            # TRACE: Log exact entry evaluation
            if sig_type == "sell":
                logger.info(
                    f"[TRACE] {signal_id} | ENTRY CHECK: "
                    f"price({current_price}) >= entry({entry}) - eps({eps}) = {entry - eps} "
                    f"→ {current_price >= entry - eps} → {'TRIGGERED' if triggered else 'waiting'}"
                )
            else:
                logger.info(
                    f"[TRACE] {signal_id} | ENTRY CHECK: "
                    f"price({current_price}) <= entry({entry}) + eps({eps}) = {entry + eps} "
                    f"→ {current_price <= entry + eps} → {'TRIGGERED' if triggered else 'waiting'}"
                )
            
            if triggered:
                success = await self.activate_signal(signal_id, activation_price, price_context)
                if success:
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_notification(
                        signal_id, pair, SignalType(signal_type), visibility
                    ))
                    return {
                        "action": "activated",
                        "signal_id": signal_id,
                        "activation_price": activation_price,
                        "gap_protected": activation_price != current_price
                    }
            return None
        
        # === ACTIVE/TP1/TP2/TP3 SIGNALS ===
        if current_state in ["active", "tp1", "tp2", "tp3"]:
            entry_actual = signal.get("entry_price_actual") or entry
            
            # Auto-close TP3 state immediately
            if current_state == "tp3":
                tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
                logger.info(f"[TRACE] {signal_id} | TP3 STATE → auto-closing at {tp3_price}")
                success = await self.close_signal(
                    signal_id, current_state, tp3_price, ExitReason.TP3, signal, price_context
                )
                if success:
                    pips = calculate_signal_pips(entry_actual, tp3_price, signal_type, pair)
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_close_notification(
                        signal_id, pair, signal_type, pips, visibility
                    ))
                    return {"action": "closed", "reason": "tp3", "signal_id": signal_id}
                return None
            
            # ===== PRIORITY 1: CHECK STOP LOSS FIRST =====
            if stop_loss:
                sl_triggered, sl_exit_price = self.trigger.check_sl_triggered(
                    current_price, stop_loss, signal_type, last_price
                )
                
                # TRACE: Log exact SL evaluation
                if sig_type == "sell":
                    logger.info(
                        f"[TRACE] {signal_id} | SL CHECK: "
                        f"price({current_price}) >= sl({stop_loss}) "
                        f"→ {current_price >= stop_loss} → {'TRIGGERED' if sl_triggered else 'safe'}"
                    )
                else:
                    logger.info(
                        f"[TRACE] {signal_id} | SL CHECK: "
                        f"price({current_price}) <= sl({stop_loss}) "
                        f"→ {current_price <= stop_loss} → {'TRIGGERED' if sl_triggered else 'safe'}"
                    )
                
                if sl_triggered:
                    logger.info(
                        f"[Engine] SL TRIGGERED for {signal_id}: "
                        f"market={current_price}, exit_at={sl_exit_price} "
                        f"(gap_protected={sl_exit_price != current_price})"
                    )
                    
                    success = await self.close_signal(
                        signal_id, current_state, sl_exit_price, ExitReason.SL, signal, price_context
                    )
                    
                    if success:
                        pips = calculate_signal_pips(entry_actual, sl_exit_price, signal_type, pair)
                        visibility = SignalVisibility(signal.get("visibility", "free"))
                        asyncio.create_task(send_signal_close_notification(
                            signal_id, pair, signal_type, pips, visibility
                        ))
                        return {
                            "action": "closed",
                            "reason": "sl",
                            "pips": pips,
                            "signal_id": signal_id,
                            "exit_price": sl_exit_price,
                            "gap_protected": sl_exit_price != current_price
                        }
                    return None
            
            # ===== PRIORITY 2: CHECK TP LEVELS =====
            tp_target, exit_reason, new_state = self.get_next_tp_target(signal)
            
            if tp_target:
                tp_triggered, tp_exit_price = self.trigger.check_tp_triggered(
                    current_price, tp_target, signal_type, last_price
                )
                
                # TRACE: Log exact TP evaluation
                if sig_type == "sell":
                    logger.info(
                        f"[TRACE] {signal_id} | TP CHECK: "
                        f"price({current_price}) <= tp({tp_target}) + eps({eps}) = {tp_target + eps} "
                        f"→ {current_price <= tp_target + eps} → {'TRIGGERED' if tp_triggered else 'waiting'}"
                    )
                else:
                    logger.info(
                        f"[TRACE] {signal_id} | TP CHECK: "
                        f"price({current_price}) >= tp({tp_target}) - eps({eps}) = {tp_target - eps} "
                        f"→ {current_price >= tp_target - eps} → {'TRIGGERED' if tp_triggered else 'waiting'}"
                    )
                
                if tp_triggered:
                    logger.info(
                        f"[Engine] TP TRIGGERED for {signal_id}: "
                        f"market={current_price}, target={tp_exit_price} "
                        f"(gap_protected={tp_exit_price != current_price}) "
                        f"→ new_state={new_state}"
                    )
                    
                    tp_level = {"tp1": 1, "tp2": 2, "tp3": 3}.get(new_state, 1)
                    
                    if new_state == "closed":
                        # Single-TP or final TP → close immediately
                        success = await self.close_signal(
                            signal_id, current_state, tp_exit_price, exit_reason, signal, price_context
                        )
                        if success:
                            pips = calculate_signal_pips(entry_actual, tp_exit_price, signal_type, pair)
                            visibility = SignalVisibility(signal.get("visibility", "free"))
                            asyncio.create_task(send_signal_close_notification(
                                signal_id, pair, signal_type, pips, visibility
                            ))
                            return {
                                "action": "closed",
                                "reason": str(exit_reason),
                                "pips": pips,
                                "signal_id": signal_id,
                                "exit_price": tp_exit_price,
                                "gap_protected": tp_exit_price != current_price
                            }
                    else:
                        # Advance to next TP state (with trailing SL)
                        success = await self.advance_tp_state(
                            signal_id, current_state, new_state, tp_level, signal=signal
                        )
                        if success:
                            # Send TP hit notification with trailing SL info
                            running_pips = calculate_signal_pips(entry_actual, tp_exit_price, signal_type, pair)
                            
                            # Determine what the SL was trailed to for the notification
                            if tp_level == 1:
                                trail_msg = f"SL moved to entry ({entry_actual})"
                            elif tp_level == 2:
                                tp1_price = signal.get("tp1")
                                trail_msg = f"SL moved to TP1 ({tp1_price})"
                            else:
                                trail_msg = ""
                            
                            asyncio.create_task(send_tp_hit_notification(
                                signal_id, pair, signal_type, tp_level, running_pips
                            ))
                            return {
                                "action": "tp_hit",
                                "level": tp_level,
                                "signal_id": signal_id,
                                "trailing_sl": trail_msg,
                            }
        
        return None


# ==============================================================================
# ==============================================================================
# AUTOMATIC SIGNAL ENGINE - RE-ENABLED WITH SAFEGUARDS
# ==============================================================================
# 
# FEATURES:
# - Configurable on/off state via admin API
# - Respects signal visibility (Free/Premium/VIP subscription tiers)
# - Admin override capability
# - Paused state protection (no signals sent when paused)
# - Health checks and self-healing
# - Comprehensive logging
#
# ADMIN CONTROLS:
# - GET /api/automation/status - Check engine status
# - POST /api/admin/automation/start - Start the engine
# - POST /api/admin/automation/stop - Stop the engine
# - POST /api/admin/automation/config - Update engine config
# ==============================================================================

# Engine configuration (loaded from DB on startup)
ENGINE_CONFIG_DEFAULTS = {
    "enabled": True,              # Master switch
    "paused": False,              # Temporary pause (maintenance mode)
    "poll_interval": PRICE_POLL_INTERVAL,  # Seconds between price checks (default 5s from env)
    "min_poll_interval": 3,       # Minimum allowed poll interval
    "max_poll_interval": 300,     # Maximum allowed poll interval
    "auto_activate_pending": True,  # Auto-activate pending signals
    "auto_close_on_sl": True,     # Auto-close on stop loss
    "auto_advance_tp": True,      # Auto-advance through TP levels
    "auto_close_on_tp3": True,    # Auto-close after TP3
    "send_notifications": True,   # Send push notifications on events
    "last_health_check": None,    # Last successful price fetch
    "error_count": 0,             # Consecutive errors (auto-pause if > threshold)
    "max_errors": 5,              # Pause after this many consecutive errors
}

# Global engine state
lifecycle_controller = None
engine_lock_id = None  # For single instance enforcement


async def get_engine_config() -> dict:
    """Get engine configuration from database or use defaults"""
    config = await db.settings.find_one({"setting_id": "signal_engine_config"})
    if config:
        # Merge with defaults for any missing keys
        merged = {**ENGINE_CONFIG_DEFAULTS, **config.get("config", {})}
        return merged
    return ENGINE_CONFIG_DEFAULTS.copy()


async def save_engine_config(config: dict):
    """Save engine configuration to database"""
    await db.settings.update_one(
        {"setting_id": "signal_engine_config"},
        {"$set": {
            "setting_id": "signal_engine_config",
            "config": config,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )


async def acquire_engine_lock() -> Optional[str]:
    """
    Acquire a distributed lock to ensure single engine instance.
    Returns lock_id if acquired, None if already locked.
    """
    lock_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Try to acquire lock with upsert
    result = await db.settings.find_one_and_update(
        {
            "setting_id": "signal_engine_lock",
            "$or": [
                {"locked_until": {"$lt": now}},  # Lock expired
                {"locked_until": {"$exists": False}}  # No lock exists
            ]
        },
        {
            "$set": {
                "setting_id": "signal_engine_lock",
                "lock_id": lock_id,
                "locked_at": now,
                "locked_until": now + timedelta(seconds=PRICE_POLL_INTERVAL * 3),  # 3x poll interval
                "locked_by": os.environ.get("HOSTNAME", "unknown")
            }
        },
        upsert=True,
        return_document=True
    )
    
    if result and result.get("lock_id") == lock_id:
        logger.info(f"[Engine] Acquired engine lock: {lock_id}")
        return lock_id
    
    logger.warning("[Engine] Failed to acquire lock - another instance is running")
    return None


async def renew_engine_lock(lock_id: str) -> bool:
    """Renew the engine lock to prevent expiry during long operations."""
    now = datetime.now(timezone.utc)
    result = await db.settings.update_one(
        {"setting_id": "signal_engine_lock", "lock_id": lock_id},
        {"$set": {"locked_until": now + timedelta(seconds=PRICE_POLL_INTERVAL * 3)}}
    )
    return result.modified_count > 0


async def release_engine_lock(lock_id: str):
    """Release the engine lock on shutdown."""
    await db.settings.delete_one({"setting_id": "signal_engine_lock", "lock_id": lock_id})
    logger.info(f"[Engine] Released engine lock: {lock_id}")


# ==============================================================================
# ADAPTIVE POLLING — reduce API calls, preserve precision near triggers
# ==============================================================================

NEAR_THRESHOLD = 1.0   # Distance (in price units) considered "near" for XAUUSD
FAST_POLL = 1           # seconds — when price is near a trigger
SLOW_POLL = 8           # seconds — when price is far from all triggers
RATE_LIMIT_COOLDOWN = 30  # seconds to force slow mode after 429


def get_polling_interval(
    signals: list[dict],
    price_map: dict,
) -> tuple[int, str, list[str]]:
    """
    Determine optimal polling interval based on proximity to triggers.

    Returns:
        (interval_seconds, mode_label, debug_reasons)

    Rules:
        - If ANY signal has price within NEAR_THRESHOLD of entry/SL/TP → FAST (1s)
        - Otherwise → SLOW (8s)
    """
    reasons: list[str] = []

    for sig in signals:
        pair = sig.get("pair", "").upper()
        price_info = price_map.get(pair) or price_map.get(pair.replace("/", ""))
        if not price_info:
            continue

        price = price_info["price"]
        sid = sig.get("signal_id", "?")[:12]
        state = sig.get("state", "?")

        # Pending → check entry distance
        if state == "pending":
            entry = sig.get("entry")
            if entry:
                d = abs(price - entry)
                reasons.append(f"{sid} entry_dist={d:.2f}")
                if d <= NEAR_THRESHOLD:
                    return (FAST_POLL, "FAST", reasons)

        # Active/TPx → check SL and next TP distance
        if state in ("active", "tp1", "tp2", "tp3"):
            sl = sig.get("stop_loss")
            if sl:
                d_sl = abs(price - sl)
                reasons.append(f"{sid} sl_dist={d_sl:.2f}")
                if d_sl <= NEAR_THRESHOLD:
                    return (FAST_POLL, "FAST", reasons)

            # Check the relevant TP level for current state
            tp_key = {
                "active": "tp1",
                "tp1": "tp2",
                "tp2": "tp3",
            }.get(state)
            tp_val = sig.get(tp_key) if tp_key else None
            if tp_val:
                d_tp = abs(price - tp_val)
                reasons.append(f"{sid} tp_dist={d_tp:.2f}")
                if d_tp <= NEAR_THRESHOLD:
                    return (FAST_POLL, "FAST", reasons)

    return (SLOW_POLL, "SLOW", reasons)


# ==============================================================================

def _classify_error(error: Exception) -> str:
    """
    Classify errors as TRANSIENT or CRITICAL.
    
    TRANSIENT (do NOT count toward threshold):
      - API timeouts, rate limits (429), network errors, connection resets
      - These are expected during normal operation and self-resolve.
    
    CRITICAL (count toward threshold):
      - Code bugs, DB failures, unexpected exceptions
    """
    transient_types = (
        httpx.TimeoutException,
        httpx.ConnectError,
        httpx.NetworkError,
        ConnectionError,
        TimeoutError,
        OSError,
    )
    if isinstance(error, transient_types):
        return "transient"

    msg = str(error).lower()
    transient_keywords = [
        "timeout", "rate limit", "429", "502", "503", "504",
        "network", "connection reset", "connection refused",
        "temporary", "unavailable", "throttl",
    ]
    if any(kw in msg for kw in transient_keywords):
        return "transient"

    return "critical"


# ==============================================================================
# LAST-KNOWN PRICE CACHE — failsafe for SL evaluation during API outages
# ==============================================================================

_last_known_prices: Dict[str, dict] = {}


async def run_price_automation():
    """
    AUTOMATIC SIGNAL ENGINE v3.1 — FAULT-TOLERANT Main Loop
    
    RELIABILITY GUARANTEES:
    1. Engine NEVER permanently pauses — auto-recovers after backoff
    2. Engine NEVER stops monitoring when active trades exist
    3. Transient errors (timeout, 429, network) do NOT count toward threshold
    4. Last-known prices used for SL failsafe when API is temporarily down
    5. Exponential backoff (5s → 10s → … → 30s cap) on sustained failures
    
    UNCHANGED:
    - Signal evaluation logic (SL/TP/Entry rules)
    - API response format
    - Execution buffers
    """
    global lifecycle_controller, engine_lock_id

    # Acquire distributed lock
    engine_lock_id = await acquire_engine_lock()
    if not engine_lock_id:
        logger.error("[Engine] Cannot start - another instance is already running")
        return

    engine_state.price_automation_running = True
    lifecycle_controller = SignalLifecycleController(db)

    IDLE_SLEEP = 10   # Sleep when no active/pending signals
    ACTIVE_SLEEP = 1  # Fast polling when signals are live

    # --- On startup: clear any stale auto-pause from previous crash ---
    try:
        startup_config = await get_engine_config()
        pause_reason = startup_config.get("pause_reason", "")
        if startup_config.get("paused") and "auto-paused" in str(pause_reason).lower():
            startup_config["paused"] = False
            startup_config["pause_reason"] = None
            await save_engine_config(startup_config)
            logger.info("[Engine] Cleared stale auto-pause from previous session")
    except Exception as e:
        logger.warning(f"[Engine] Could not clear stale pause: {e}")

    logger.info("=" * 60)
    logger.info("[Engine] Signal Auto-Engine v4.1 STARTED (ADAPTIVE POLLING)")
    logger.info(f"[Engine] Fast poll: {FAST_POLL}s | Slow poll: {SLOW_POLL}s | Idle: {IDLE_SLEEP}s")
    logger.info(f"[Engine] NEAR_THRESHOLD: {NEAR_THRESHOLD} | PRICE_EPSILON: {DeterministicPriceTrigger.PRICE_EPSILON}")
    logger.info("[Engine] Mode: ABSOLUTE THRESHOLD, GAP-PROTECTED, SELF-RECOVERING")
    logger.info("[Engine] Polling: FAST(1s) near triggers, SLOW(8s) when far")
    logger.info("[Engine] Rate-limit failsafe: 30s cooldown on 429")
    logger.info("[Engine] Entry: BUY=limit(price<=entry+eps), SELL=limit(price>=entry-eps)")
    logger.info("=" * 60)

    critical_errors = 0        # Only CRITICAL errors counted here
    transient_streak = 0       # Transient errors in a row (for backoff)
    total_transient = 0        # Lifetime transient count (diagnostic only)
    recovery_backoff_round = 0 # How many times we've hit the recovery backoff
    rate_limit_until = 0.0     # monotonic timestamp until which we force slow mode

    while engine_state.price_automation_running:
        poll_timestamp = datetime.now(timezone.utc)

        try:
            # Renew lock
            if not await renew_engine_lock(engine_lock_id):
                logger.error("[Engine] Lost engine lock — stopping")
                break

            # Load current config
            config = await get_engine_config()
            logger.debug(f"[Engine] Poll cycle at {poll_timestamp.isoformat()}")

            # Check if engine is MANUALLY disabled by admin
            if not config.get("enabled", True):
                logger.info("[Engine] Engine is DISABLED by admin. Sleeping...")
                await asyncio.sleep(IDLE_SLEEP)
                continue

            # Check if engine is MANUALLY paused by admin
            # NOTE: auto-pause is removed — only manual admin pause is respected
            if config.get("paused", False):
                pause_reason = config.get("pause_reason", "unknown")
                # If this is a stale auto-pause, clear it and continue
                if "auto-paused" in str(pause_reason).lower():
                    config["paused"] = False
                    config["pause_reason"] = None
                    await save_engine_config(config)
                    logger.info("[Engine] Cleared stale auto-pause — resuming")
                else:
                    logger.info(f"[Engine] MANUAL PAUSE active: {pause_reason}. Sleeping...")
                    await asyncio.sleep(IDLE_SLEEP)
                    continue

            # === AUTO-RECOVERY: backoff on sustained critical errors ===
            max_errors = config.get("max_errors", 5)
            if critical_errors >= max_errors:
                recovery_backoff_round += 1
                backoff = min(5 * recovery_backoff_round, 30)  # 5s, 10s, 15s… 30s cap
                logger.warning(
                    f"[Engine] RECOVERY MODE: {critical_errors} critical errors. "
                    f"Backing off {backoff}s (round {recovery_backoff_round}). "
                    f"Engine will NOT pause — auto-recovering."
                )
                critical_errors = 0  # Reset after backoff
                await asyncio.sleep(backoff)
                continue

            # === MAIN PROCESSING ===

            # Get all non-closed signals
            active_signals = await db.signals.find({
                "state": {"$ne": "closed"},
                "status": {"$ne": "closed"}
            }).limit(500).to_list(500)

            if not active_signals:
                logger.debug("[Engine] No active/pending signals — idle sleep")
                await asyncio.sleep(IDLE_SLEEP)
                continue

            # Detect if we have live (non-pending) signals that need SL monitoring
            has_live_trades = any(
                s.get("state") in ("active", "tp1", "tp2", "tp3")
                for s in active_signals
            )

            # Extract unique symbols
            symbols = list(set(
                s.get("pair", "").upper() for s in active_signals if s.get("pair")
            ))

            if not symbols:
                await asyncio.sleep(IDLE_SLEEP)
                continue

            # --- Fetch live prices — ALWAYS FRESH (no cache) ---
            import time as _time
            cycle_start = _time.monotonic()
            
            price_data = await fetch_live_prices(symbols)
            price_fresh = True

            if price_data:
                # SUCCESS — update caches, reset error counters
                _last_known_prices.update(price_data)
                transient_streak = 0
                critical_errors = 0
                recovery_backoff_round = 0

                # Update health check
                config["last_health_check"] = poll_timestamp.isoformat()
                config["error_count"] = 0
                await save_engine_config(config)
            else:
                # PRICE FETCH FAILED — classify and handle
                transient_streak += 1
                total_transient += 1

                # Rate-limit failsafe: force SLOW mode for 30s
                rate_limit_until = _time.monotonic() + RATE_LIMIT_COOLDOWN
                logger.warning(
                    f"[Engine] Rate limit hit — forcing SLOW mode for {RATE_LIMIT_COOLDOWN}s"
                )

                if has_live_trades and _last_known_prices:
                    # FAILSAFE: use last-known prices for SL evaluation
                    price_data = {}
                    price_fresh = False
                    for sym in symbols:
                        cached = _last_known_prices.get(sym) or _last_known_prices.get(sym.replace("/", ""))
                        if cached:
                            price_data[sym] = {
                                **cached,
                                "source": f"{cached.get('source', 'unknown')}:cached",
                            }
                    if price_data:
                        logger.warning(
                            f"[Engine] API failed (streak={transient_streak}). "
                            f"Using CACHED prices for SL failsafe on {len(price_data)} symbols."
                        )
                    else:
                        logger.warning(
                            f"[Engine] API failed (streak={transient_streak}). "
                            f"No cached prices available. SKIPPING cycle."
                        )
                        # Short retry delay — do NOT stop the loop
                        retry_delay = min(1 + transient_streak, 5)
                        await asyncio.sleep(retry_delay)
                        continue
                elif has_live_trades:
                    logger.warning(
                        f"[Engine] API failed (streak={transient_streak}). "
                        f"LIVE trades exist but no cached prices. Retrying in 2s."
                    )
                    await asyncio.sleep(2)
                    continue
                else:
                    # Only pending signals — safe to skip
                    logger.warning(
                        f"[Engine] API failed (streak={transient_streak}). "
                        f"No live trades. Skipping cycle."
                    )
                    # Use SLOW_POLL during rate-limit cooldown
                    await asyncio.sleep(SLOW_POLL)
                    continue

            # --- Process each signal ---
            processed = 0
            actions = 0
            skipped = 0

            for signal in active_signals:
                pair = signal.get("pair", "").upper()
                price_info = price_data.get(pair) or price_data.get(pair.replace("/", ""))

                if not price_info:
                    skipped += 1
                    continue

                current_price = price_info["price"]
                price_source = price_info["source"]

                processed += 1

                # Per-signal debug log
                entry = signal.get("entry")
                if entry:
                    diff = round(current_price - entry, 2)
                    logger.debug(
                        f"[Engine] {pair} | price={current_price} entry={entry} "
                        f"diff={diff:+.2f} state={signal.get('state')} src={price_source}"
                    )

                # Process signal through lifecycle controller
                result = await lifecycle_controller.process_signal(
                    signal, current_price, price_source, poll_timestamp,
                    price_fresh=price_fresh
                )

                if result:
                    actions += 1
                    logger.info(f"[Engine] Action: {result}")

            if processed > 0 or skipped > 0:
                cycle_end = _time.monotonic()
                cycle_duration = round((cycle_end - cycle_start) * 1000, 1)

                # Adaptive polling: determine next sleep interval
                if _time.monotonic() < rate_limit_until:
                    poll_interval = SLOW_POLL
                    poll_mode = "SLOW (rate-limit cooldown)"
                    poll_reasons = []
                else:
                    poll_interval, poll_mode, poll_reasons = get_polling_interval(
                        active_signals, price_data
                    )

                logger.info(
                    f"[Engine] Cycle: {processed} processed, {actions} actions, "
                    f"{skipped} skipped | {cycle_duration}ms | "
                    f"fresh={price_fresh} | mode={poll_mode} ({poll_interval}s)"
                )
                if poll_reasons:
                    logger.info(f"[Engine] Distances: {' | '.join(poll_reasons)}")

                await asyncio.sleep(poll_interval)
            else:
                await asyncio.sleep(SLOW_POLL)

        except asyncio.CancelledError:
            logger.info("[Engine] Engine task cancelled")
            break
        except Exception as e:
            # Classify the error
            err_type = _classify_error(e)

            if err_type == "transient":
                transient_streak += 1
                total_transient += 1
                logger.warning(
                    f"[Engine] TRANSIENT error (streak={transient_streak}): {e}"
                )
                retry_delay = min(1 + transient_streak, 5)
                await asyncio.sleep(retry_delay)
            else:
                critical_errors += 1
                logger.error(
                    f"[Engine] CRITICAL error ({critical_errors}/{config.get('max_errors', 5)}): {e}"
                )
                import traceback
                traceback.print_exc()
                await asyncio.sleep(ACTIVE_SLEEP)

    # Release lock on shutdown
    if engine_lock_id:
        await release_engine_lock(engine_lock_id)

    engine_state.price_automation_running = False
    logger.info(
        f"[Engine] Signal Auto-Engine STOPPED "
        f"(total_transient_errors={total_transient})"
    )

