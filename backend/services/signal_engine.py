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


# Lazy-import wrappers for notification functions (defined in api.routes.signals)
# to avoid circular dependency: signal_engine → signals → signal_engine
async def send_signal_notification(signal_id, pair, signal_type, visibility):
    from api.routes.signals import send_signal_notification as _notify
    await _notify(signal_id, pair, signal_type, visibility)


async def send_signal_close_notification(signal_id, pair, signal_type, pips, visibility):
    from api.routes.signals import send_signal_close_notification as _notify_close
    await _notify_close(signal_id, pair, signal_type, pips, visibility)

# ==============================================================================
# SIGNAL LIFECYCLE ENGINE v3.0 - DETERMINISTIC AUDITABLE MODE
# ==============================================================================
#
# ARCHITECTURE OVERVIEW:
# ----------------------
# This is a SNAPSHOT-BASED, POLLING-DRIVEN signal lifecycle engine.
# It is NOT tick-level real-time execution. It is NOT broker execution.
#
# KEY CHARACTERISTICS:
# 1. POLLING-BASED: Prices fetched every N seconds (default 5s, configurable)
# 2. SNAPSHOT PRICES: Each poll gets a single price point per instrument
# 3. DETERMINISTIC: Same inputs always produce same outputs
# 4. GAP-PROTECTED: Price gaps use defined SL/TP/Entry, not jumped prices
# 5. AUDITABLE: Every closure stores full price trace and source
#
# CROSSING DETECTION RULES:
# - Activation/closure requires price to CROSS through target level
# - If last_price unavailable, uses simple threshold comparison
# - Gap protection ensures execution at defined levels, not market gaps
#
# PRICE SOURCES:
# - Forex: frankfurter.app (free API, mid-rate)
# - Gold: goldapi.io → CoinGecko PAX Gold fallback
# - Crypto: CoinGecko
# - NO SIMULATED/HARDCODED PRICES - if API fails, symbol is skipped
#
# SINGLE INSTANCE ENFORCEMENT:
# - DB-based distributed lock prevents duplicate engine execution
# - Lock auto-expires after 2x poll interval for crash recovery
#
# DATA STORED AT CLOSURE:
# - exit_price, exit_reason, price_source, poll_timestamp
# - last_price, current_price, activation_price
# - pip_size, pip_multiplier, calculated_pips with full math trace
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
    from services.market_data import get_price, _normalize_symbol, SYMBOL_PROVIDERS
    
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
    
    # Fetch from market_data service (handles caching + multi-provider fallback)
    for orig_symbol, md_symbol in market_data_symbols:
        try:
            result = await get_price(md_symbol)
            prices[orig_symbol] = {
                "price": result["price"],
                "source": result["source"],
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
# DETERMINISTIC PRICE TRIGGER ENGINE v3.0 - WITH GAP PROTECTION
# ==============================================================================

class DeterministicPriceTrigger:
    """
    Deterministic price trigger checker with gap protection.
    
    KEY RULES:
    1. Uses crossing detection when last_price is available
    2. Falls back to threshold comparison when last_price unavailable
    3. Returns the DEFINED level price, not the gapped market price
    
    GAP PROTECTION:
    - If price gaps through SL/TP/Entry between polls, we still trigger
    - But we use the DEFINED level price for execution, not the gapped price
    - This ensures deterministic, auditable results
    """
    
    @staticmethod
    def check_sl_triggered(
        current_price: float,
        stop_loss: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Check if Stop Loss is triggered.
        
        Returns (triggered: bool, execution_price: float)
        - execution_price is ALWAYS the defined SL, not the gapped price
        
        RULES:
        - SELL: SL triggers when price rises TO or THROUGH SL
        - BUY: SL triggers when price falls TO or THROUGH SL
        """
        if not stop_loss or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL SL: triggered when price RISES to or above SL
            if last_price is not None:
                # Crossing detection: was below SL, now at or above (or gapped through)
                triggered = last_price < stop_loss and current_price >= stop_loss
            else:
                triggered = current_price >= stop_loss
            
            # GAP PROTECTION: Always use defined SL, not gapped price
            return (triggered, stop_loss if triggered else None)
        else:
            # BUY SL: triggered when price FALLS to or below SL
            if last_price is not None:
                # Crossing detection: was above SL, now at or below (or gapped through)
                triggered = last_price > stop_loss and current_price <= stop_loss
            else:
                triggered = current_price <= stop_loss
            
            # GAP PROTECTION: Always use defined SL, not gapped price
            return (triggered, stop_loss if triggered else None)
    
    @staticmethod
    def check_tp_triggered(
        current_price: float,
        take_profit: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Check if Take Profit is triggered.
        
        Returns (triggered: bool, execution_price: float)
        - execution_price is ALWAYS the defined TP, not the gapped price
        
        RULES:
        - SELL: TP triggers when price falls TO or THROUGH TP
        - BUY: TP triggers when price rises TO or THROUGH TP
        """
        if not take_profit or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL TP: triggered when price FALLS to or below TP
            if last_price is not None:
                # Crossing detection: was above TP, now at or below (or gapped through)
                triggered = last_price > take_profit and current_price <= take_profit
            else:
                triggered = current_price <= take_profit
            
            # GAP PROTECTION: Always use defined TP, not gapped price
            return (triggered, take_profit if triggered else None)
        else:
            # BUY TP: triggered when price RISES to or above TP
            if last_price is not None:
                # Crossing detection: was below TP, now at or above (or gapped through)
                triggered = last_price < take_profit and current_price >= take_profit
            else:
                triggered = current_price >= take_profit
            
            # GAP PROTECTION: Always use defined TP, not gapped price
            return (triggered, take_profit if triggered else None)
    
    @staticmethod
    def check_entry_triggered(
        current_price: float,
        entry_price: float,
        signal_type: str,
        last_price: Optional[float] = None
    ) -> tuple:
        """
        Check if Entry price is reached for pending signals.
        
        Returns (triggered: bool, activation_price: float)
        - activation_price is ALWAYS the defined entry, not the gapped price
        
        RULES:
        - SELL Pending: Entry triggers when price rises TO or THROUGH entry (sell high)
        - BUY Pending: Entry triggers when price falls TO or THROUGH entry (buy low)
        
        GAP PROTECTION:
        - If price gaps across entry (e.g., 4220 → 4200 for entry 4211)
        - We activate at 4211, NOT at 4200
        - This keeps signal math clean and deterministic
        """
        if not entry_price or not current_price:
            return (False, None)
        
        sig_type = signal_type.lower()
        
        if sig_type == "sell":
            # SELL entry: we want to sell high - price must rise TO entry
            if last_price is not None:
                # Crossing: was below entry, now at or above (or gapped through)
                triggered = last_price < entry_price and current_price >= entry_price
            else:
                triggered = current_price >= entry_price
            
            # GAP PROTECTION: Always use defined entry, not gapped price
            return (triggered, entry_price if triggered else None)
        else:
            # BUY entry: we want to buy low - price must fall TO entry
            if last_price is not None:
                # Crossing: was above entry, now at or below (or gapped through)
                triggered = last_price > entry_price and current_price <= entry_price
            else:
                triggered = current_price <= entry_price
            
            # GAP PROTECTION: Always use defined entry, not gapped price
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
        """
        state = self.get_current_state(signal)
        
        if state == "active":
            return (signal.get("tp1"), ExitReason.TP1, "tp1")
        elif state == "tp1":
            tp2 = signal.get("tp2")
            if tp2:
                return (tp2, ExitReason.TP2, "tp2")
            return (None, None, None)  # No TP2, stay in tp1
        elif state == "tp2":
            tp3 = signal.get("tp3")
            if tp3:
                return (tp3, ExitReason.TP3, "tp3")
            return (None, None, None)  # No TP3, stay in tp2
        elif state == "tp3":
            # TP3 hit means we should close
            return (signal.get("tp3"), ExitReason.TP3, "closed")
        
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
        tp_hit: int
    ) -> bool:
        """Advance signal to next TP state (e.g., active → tp1)"""
        result = await self.db.signals.update_one(
            {"signal_id": signal_id, "state": current_state},
            {"$set": {
                "state": new_state,
                "status": "active",  # Still active until closed
                "tp_hit": tp_hit
            }}
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
        poll_timestamp: datetime
    ) -> Optional[dict]:
        """
        MAIN ENTRY POINT: Process a single signal with current price.
        
        DETERMINISTIC GAP-PROTECTED LOGIC:
        - Activation uses DEFINED entry price, not gapped market price
        - SL closure uses DEFINED SL price, not gapped market price
        - TP closure uses DEFINED TP price, not gapped market price
        
        Returns dict with action taken, or None if no action.
        """
        signal_id = signal["signal_id"]
        current_state = self.get_current_state(signal)
        signal_type = signal.get("signal_type", "buy")
        pair = signal.get("pair", "")
        last_price = signal.get("last_price")
        
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
        
        # === PENDING SIGNALS ===
        if current_state == "pending":
            entry = signal.get("entry")
            
            # Check if entry price hit (returns tuple with gap-protected price)
            triggered, activation_price = self.trigger.check_entry_triggered(
                current_price, entry, signal_type, last_price
            )
            
            if triggered:
                # GAP PROTECTION: activate at DEFINED entry, not gapped price
                success = await self.activate_signal(signal_id, activation_price, price_context)
                if success:
                    # Send notification
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
            stop_loss = signal.get("stop_loss")
            entry = signal.get("entry_price_actual") or signal.get("entry")
            
            # Auto-close TP3 state immediately
            if current_state == "tp3":
                tp3_price = signal.get("tp3") or signal.get("tp2") or signal.get("tp1")
                success = await self.close_signal(
                    signal_id, current_state, tp3_price, ExitReason.TP3, signal, price_context
                )
                if success:
                    pips = calculate_signal_pips(entry, tp3_price, signal_type, pair)
                    visibility = SignalVisibility(signal.get("visibility", "free"))
                    asyncio.create_task(send_signal_close_notification(
                        signal_id, pair, signal_type, pips, visibility
                    ))
                    return {"action": "closed", "reason": "tp3", "signal_id": signal_id}
                return None
            
            # CHECK STOP LOSS FIRST (priority over TP)
            if stop_loss:
                sl_triggered, sl_exit_price = self.trigger.check_sl_triggered(
                    current_price, stop_loss, signal_type, last_price
                )
                
                if sl_triggered:
                    # GAP PROTECTION: close at DEFINED SL, not gapped price
                    logger.info(
                        f"[Engine] SL TRIGGERED for {signal_id}: "
                        f"market={current_price}, exit_at={sl_exit_price} (gap_protected={sl_exit_price != current_price})"
                    )
                    
                    success = await self.close_signal(
                        signal_id, current_state, sl_exit_price, ExitReason.SL, signal, price_context
                    )
                    
                    if success:
                        pips = calculate_signal_pips(entry, sl_exit_price, signal_type, pair)
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
            
            # CHECK TP LEVELS
            tp_target, exit_reason, new_state = self.get_next_tp_target(signal)
            
            if tp_target:
                tp_triggered, tp_exit_price = self.trigger.check_tp_triggered(
                    current_price, tp_target, signal_type, last_price
                )
                
                if tp_triggered:
                    # GAP PROTECTION: close/advance at DEFINED TP, not gapped price
                    logger.info(
                        f"[Engine] TP TRIGGERED for {signal_id}: "
                        f"market={current_price}, target={tp_exit_price} (gap_protected={tp_exit_price != current_price})"
                    )
                    
                    # Determine TP level
                    tp_level = {"tp1": 1, "tp2": 2, "tp3": 3}.get(new_state, 1)
                    
                    # If TP3 or no more TPs, close the signal
                    if new_state == "closed" or new_state == "tp3":
                        # Close at TP
                        success = await self.close_signal(
                            signal_id, current_state, tp_exit_price, exit_reason, signal, price_context
                        )
                        if success:
                            pips = calculate_signal_pips(entry, tp_exit_price, signal_type, pair)
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
                        # Advance to next TP state
                        success = await self.advance_tp_state(signal_id, current_state, new_state, tp_level)
                        if success:
                            return {"action": "tp_hit", "level": tp_level, "signal_id": signal_id}
        
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
    
    logger.warning(f"[Engine] Failed to acquire lock - another instance is running")
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


async def run_price_automation():
    """
    AUTOMATIC SIGNAL ENGINE v3.0 - Main Processing Loop
    
    DETERMINISTIC, AUDITABLE MODE:
    - Single instance enforcement via distributed lock
    - Poll timestamp logged for each cycle
    - Price source tracked for each price
    - Gap-protected activation and closure
    - No hardcoded fallback prices
    
    This function:
    1. Acquires distributed lock (single instance)
    2. Checks engine config (enabled/paused)
    3. Fetches live prices for all active signals
    4. Processes each signal through the lifecycle controller with price context
    5. Handles errors gracefully with auto-recovery
    """
    global lifecycle_controller, engine_lock_id
    
    # Acquire distributed lock
    engine_lock_id = await acquire_engine_lock()
    if not engine_lock_id:
        logger.error("[Engine] Cannot start - another instance is already running")
        return
    
    engine_state.price_automation_running = True
    lifecycle_controller = SignalLifecycleController(db)
    
    logger.info("=" * 60)
    logger.info("[Engine] Signal Auto-Engine v3.0 STARTED")
    logger.info(f"[Engine] Poll interval: {PRICE_POLL_INTERVAL}s (configurable via SIGNAL_POLL_INTERVAL env)")
    logger.info("[Engine] Mode: DETERMINISTIC, GAP-PROTECTED, AUDITABLE")
    logger.info("[Engine] Visibility rules ACTIVE: Free/Premium/VIP")
    logger.info("=" * 60)
    
    consecutive_errors = 0
    
    while engine_state.price_automation_running:
        poll_timestamp = datetime.now(timezone.utc)
        
        try:
            # Renew lock
            if not await renew_engine_lock(engine_lock_id):
                logger.error("[Engine] Lost engine lock - stopping")
                break
            
            # Load current config
            config = await get_engine_config()
            poll_interval = config.get("poll_interval", PRICE_POLL_INTERVAL)
            
            # Log poll cycle
            logger.debug(f"[Engine] Poll cycle started at {poll_timestamp.isoformat()}")
            
            # Check if engine is enabled
            if not config.get("enabled", True):
                logger.info("[Engine] Engine is DISABLED. Sleeping...")
                await asyncio.sleep(poll_interval)
                continue
            
            # Check if engine is paused (maintenance mode)
            if config.get("paused", False):
                logger.info("[Engine] Engine is PAUSED. Sleeping...")
                await asyncio.sleep(poll_interval)
                continue
            
            # Check error threshold
            if consecutive_errors >= config.get("max_errors", 5):
                logger.error(f"[Engine] Too many errors ({consecutive_errors}). Auto-pausing...")
                config["paused"] = True
                config["pause_reason"] = f"Auto-paused after {consecutive_errors} consecutive errors"
                await save_engine_config(config)
                await asyncio.sleep(poll_interval)
                continue
            
            # === MAIN PROCESSING ===
            
            # Get all non-closed signals (with reasonable limit for performance)
            active_signals = await db.signals.find({
                "state": {"$ne": "closed"},
                "status": {"$ne": "closed"}
            }).limit(500).to_list(500)
            
            if not active_signals:
                await asyncio.sleep(poll_interval)
                continue
            
            # Extract unique symbols
            symbols = list(set(s.get("pair", "").upper() for s in active_signals if s.get("pair")))
            
            if not symbols:
                await asyncio.sleep(poll_interval)
                continue
            
            # Fetch live prices (returns dict with price AND source)
            price_data = await fetch_live_prices(symbols)
            
            if not price_data:
                consecutive_errors += 1
                logger.warning(f"[Engine] No prices fetched - SKIPPING this cycle (error {consecutive_errors})")
                await asyncio.sleep(poll_interval)
                continue
            
            # Reset error count on successful price fetch
            consecutive_errors = 0
            
            # Update health check timestamp
            config["last_health_check"] = poll_timestamp.isoformat()
            config["error_count"] = 0
            await save_engine_config(config)
            
            # Process each signal
            processed = 0
            actions = 0
            skipped = 0
            
            for signal in active_signals:
                pair = signal.get("pair", "").upper()
                # Try both formats
                price_info = price_data.get(pair) or price_data.get(pair.replace("/", ""))
                
                if not price_info:
                    skipped += 1
                    continue
                
                current_price = price_info["price"]
                price_source = price_info["source"]
                
                processed += 1
                
                # Process signal through lifecycle controller WITH PRICE CONTEXT
                result = await lifecycle_controller.process_signal(
                    signal,
                    current_price,
                    price_source,
                    poll_timestamp
                )
                
                if result:
                    actions += 1
                    logger.info(f"[Engine] Action: {result}")
            
            if processed > 0 or skipped > 0:
                logger.debug(
                    f"[Engine] Poll complete: processed={processed}, actions={actions}, skipped={skipped}"
                )
            
            await asyncio.sleep(poll_interval)
            
        except asyncio.CancelledError:
            logger.info("[Engine] Engine task cancelled")
            break
        except Exception as e:
            consecutive_errors += 1
            logger.error(f"[Engine] Error in main loop: {e} (error {consecutive_errors})")
            import traceback
            traceback.print_exc()
            await asyncio.sleep(poll_interval)  # Use poll interval for retry
    
    # Release lock on shutdown
    if engine_lock_id:
        await release_engine_lock(engine_lock_id)
    
    engine_state.price_automation_running = False
    logger.info("[Engine] Signal Auto-Engine STOPPED")

