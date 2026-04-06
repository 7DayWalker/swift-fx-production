"""
Test Trailing Stop Loss Logic - Critical Bug Fix Verification
==============================================================
This test verifies the critical fix for the trailing SL bug:
- Once TP1 is hit, SL must trail to entry (breakeven)
- Once TP2 is hit, SL must trail to TP1
- A trade that already hit TP should NEVER end in a loss

Test Scenario:
- Create signal with entry=100, SL=90, TP1=110, TP2=120, TP3=130
- Call advance_tp_state with tp_hit=1 → verify SL=100 (entry)
- Call advance_tp_state with tp_hit=2 → verify SL=110 (TP1)
- Verify original_stop_loss is preserved
"""
import pytest
import asyncio
import os
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

# Set up environment before imports
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "swiftfx_db")

import sys
sys.path.insert(0, '/app/backend')

# Configure pytest-asyncio to use function scope
pytestmark = pytest.mark.asyncio


def get_test_signal_id():
    """Generate unique test signal ID"""
    return f"TEST_TRAILING_SL_{uuid.uuid4().hex[:8]}"


def get_base_signal(signal_id):
    """Create a base test signal with standard TP levels"""
    return {
        "signal_id": signal_id,
        "pair": "XAUUSD",
        "signal_type": "buy",
        "entry": 100.0,
        "entry_price_actual": 100.0,
        "stop_loss": 90.0,
        "tp1": 110.0,
        "tp2": 120.0,
        "tp3": 130.0,
        "state": "active",
        "status": "active",
        "tp_hit": 0,
        "visibility": "free",
        "created_at": datetime.now(timezone.utc),
    }


class TestTrailingSLLogic:
    """Test the trailing stop loss logic in advance_tp_state()"""
    
    async def test_advance_tp_state_accepts_signal_parameter(self):
        """Verify advance_tp_state() now accepts signal parameter"""
        from services.signal_engine import SignalLifecycleController
        
        # Check method signature
        import inspect
        sig = inspect.signature(SignalLifecycleController.advance_tp_state)
        params = list(sig.parameters.keys())
        
        assert "signal" in params, "advance_tp_state must accept 'signal' parameter"
        
        # Check it's optional (has default None)
        signal_param = sig.parameters["signal"]
        assert signal_param.default is None, "signal parameter should default to None"
        
        print("✓ advance_tp_state() accepts optional signal parameter")
    
    async def test_tp1_hit_trails_sl_to_entry(self):
        """
        CRITICAL TEST: When TP1 is hit, SL must move to entry price (breakeven)
        
        Scenario:
        - Signal: entry=100, SL=90, TP1=110
        - TP1 hit → SL should become 100 (entry)
        """
        from services.signal_engine import SignalLifecycleController
        from core.database import db
        
        signal_id = get_test_signal_id()
        base_signal = get_base_signal(signal_id)
        
        # Insert test signal into MongoDB
        await db.signals.delete_many({"signal_id": signal_id})
        await db.signals.insert_one(base_signal.copy())
        
        try:
            controller = SignalLifecycleController(db)
            
            # Call advance_tp_state with tp_hit=1 and signal data
            success = await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="active",
                new_state="tp1",
                tp_hit=1,
                signal=base_signal
            )
            
            assert success, "advance_tp_state should return True on success"
            
            # Fetch updated signal from DB
            updated_signal = await db.signals.find_one({"signal_id": signal_id})
            
            # CRITICAL ASSERTION: SL must be at entry (100)
            assert updated_signal["stop_loss"] == 100.0, \
                f"After TP1 hit, SL should be 100 (entry), got {updated_signal['stop_loss']}"
            
            # Verify original_stop_loss is preserved
            assert updated_signal.get("original_stop_loss") == 90.0, \
                f"original_stop_loss should be 90, got {updated_signal.get('original_stop_loss')}"
            
            # Verify state advanced
            assert updated_signal["state"] == "tp1", \
                f"State should be 'tp1', got {updated_signal['state']}"
            
            assert updated_signal["tp_hit"] == 1, \
                f"tp_hit should be 1, got {updated_signal['tp_hit']}"
            
            print(f"✓ TP1 hit: SL trailed from 90 → 100 (entry/breakeven)")
            print(f"✓ original_stop_loss preserved: 90")
            
        finally:
            # Cleanup
            await db.signals.delete_many({"signal_id": signal_id})
    
    async def test_tp2_hit_trails_sl_to_tp1(self):
        """
        CRITICAL TEST: When TP2 is hit, SL must move to TP1 price
        
        Scenario:
        - Signal: entry=100, SL=100 (already at breakeven), TP1=110, TP2=120
        - TP2 hit → SL should become 110 (TP1)
        """
        from services.signal_engine import SignalLifecycleController
        from core.database import db
        
        signal_id = get_test_signal_id()
        base_signal = get_base_signal(signal_id)
        
        # Modify signal to be in tp1 state (SL already at entry)
        tp1_signal = base_signal.copy()
        tp1_signal["state"] = "tp1"
        tp1_signal["tp_hit"] = 1
        tp1_signal["stop_loss"] = 100.0  # Already at breakeven
        tp1_signal["original_stop_loss"] = 90.0  # Original preserved
        
        # Insert test signal into MongoDB
        await db.signals.delete_many({"signal_id": signal_id})
        await db.signals.insert_one(tp1_signal)
        
        try:
            controller = SignalLifecycleController(db)
            
            # Call advance_tp_state with tp_hit=2 and signal data
            success = await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="tp1",
                new_state="tp2",
                tp_hit=2,
                signal=tp1_signal
            )
            
            assert success, "advance_tp_state should return True on success"
            
            # Fetch updated signal from DB
            updated_signal = await db.signals.find_one({"signal_id": signal_id})
            
            # CRITICAL ASSERTION: SL must be at TP1 (110)
            assert updated_signal["stop_loss"] == 110.0, \
                f"After TP2 hit, SL should be 110 (TP1), got {updated_signal['stop_loss']}"
            
            # Verify original_stop_loss is still preserved
            assert updated_signal.get("original_stop_loss") == 90.0, \
                f"original_stop_loss should still be 90, got {updated_signal.get('original_stop_loss')}"
            
            # Verify state advanced
            assert updated_signal["state"] == "tp2", \
                f"State should be 'tp2', got {updated_signal['state']}"
            
            assert updated_signal["tp_hit"] == 2, \
                f"tp_hit should be 2, got {updated_signal['tp_hit']}"
            
            print(f"✓ TP2 hit: SL trailed from 100 → 110 (TP1)")
            print(f"✓ original_stop_loss still preserved: 90")
            
        finally:
            # Cleanup
            await db.signals.delete_many({"signal_id": signal_id})
    
    async def test_full_trailing_sl_scenario(self):
        """
        FULL SCENARIO TEST: Simulate complete TP1 → TP2 trailing SL flow
        
        Initial: entry=100, SL=90, TP1=110, TP2=120, TP3=130
        After TP1: SL=100 (breakeven)
        After TP2: SL=110 (TP1 level)
        
        This ensures a trade that hit TP1 can NEVER close at a loss.
        """
        from services.signal_engine import SignalLifecycleController
        from core.database import db
        
        signal_id = get_test_signal_id()
        base_signal = get_base_signal(signal_id)
        
        # Insert test signal into MongoDB
        await db.signals.delete_many({"signal_id": signal_id})
        await db.signals.insert_one(base_signal.copy())
        
        try:
            controller = SignalLifecycleController(db)
            
            # === STEP 1: TP1 HIT ===
            print("\n=== STEP 1: TP1 HIT ===")
            
            # Fetch current signal
            current_signal = await db.signals.find_one({"signal_id": signal_id})
            
            success = await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="active",
                new_state="tp1",
                tp_hit=1,
                signal=current_signal
            )
            assert success, "TP1 advance should succeed"
            
            # Verify TP1 trailing
            after_tp1 = await db.signals.find_one({"signal_id": signal_id})
            assert after_tp1["stop_loss"] == 100.0, f"After TP1: SL should be 100, got {after_tp1['stop_loss']}"
            assert after_tp1["original_stop_loss"] == 90.0, "original_stop_loss should be 90"
            assert after_tp1["state"] == "tp1"
            print(f"✓ After TP1: SL={after_tp1['stop_loss']} (breakeven), original_SL={after_tp1['original_stop_loss']}")
            
            # === STEP 2: TP2 HIT ===
            print("\n=== STEP 2: TP2 HIT ===")
            
            # Fetch updated signal
            current_signal = await db.signals.find_one({"signal_id": signal_id})
            
            success = await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="tp1",
                new_state="tp2",
                tp_hit=2,
                signal=current_signal
            )
            assert success, "TP2 advance should succeed"
            
            # Verify TP2 trailing
            after_tp2 = await db.signals.find_one({"signal_id": signal_id})
            assert after_tp2["stop_loss"] == 110.0, f"After TP2: SL should be 110, got {after_tp2['stop_loss']}"
            assert after_tp2["original_stop_loss"] == 90.0, "original_stop_loss should still be 90"
            assert after_tp2["state"] == "tp2"
            print(f"✓ After TP2: SL={after_tp2['stop_loss']} (TP1 level), original_SL={after_tp2['original_stop_loss']}")
            
            # === VERIFY: Trade can NEVER close at a loss ===
            print("\n=== VERIFICATION ===")
            print(f"Entry: 100, Current SL: {after_tp2['stop_loss']}")
            print(f"If SL is hit at {after_tp2['stop_loss']}, profit = {after_tp2['stop_loss'] - 100} pips (BUY)")
            assert after_tp2["stop_loss"] >= 100.0, "SL must be >= entry to prevent loss after TP hit"
            print("✓ Trade that hit TP1/TP2 can NEVER close at a loss!")
            
        finally:
            # Cleanup
            await db.signals.delete_many({"signal_id": signal_id})
    
    async def test_original_stop_loss_preserved_on_first_trail(self):
        """Verify original_stop_loss is set only on first trail (TP1)"""
        from services.signal_engine import SignalLifecycleController
        from core.database import db
        
        signal_id = get_test_signal_id()
        base_signal = get_base_signal(signal_id)
        
        # Insert test signal into MongoDB
        await db.signals.delete_many({"signal_id": signal_id})
        await db.signals.insert_one(base_signal.copy())
        
        try:
            controller = SignalLifecycleController(db)
            
            # TP1 hit - should set original_stop_loss
            current_signal = await db.signals.find_one({"signal_id": signal_id})
            await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="active",
                new_state="tp1",
                tp_hit=1,
                signal=current_signal
            )
            
            after_tp1 = await db.signals.find_one({"signal_id": signal_id})
            assert after_tp1.get("original_stop_loss") == 90.0, "original_stop_loss should be set to 90"
            
            # TP2 hit - should NOT overwrite original_stop_loss
            current_signal = await db.signals.find_one({"signal_id": signal_id})
            await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="tp1",
                new_state="tp2",
                tp_hit=2,
                signal=current_signal
            )
            
            after_tp2 = await db.signals.find_one({"signal_id": signal_id})
            assert after_tp2.get("original_stop_loss") == 90.0, \
                f"original_stop_loss should still be 90 after TP2, got {after_tp2.get('original_stop_loss')}"
            
            print("✓ original_stop_loss preserved correctly through TP1 and TP2")
            
        finally:
            await db.signals.delete_many({"signal_id": signal_id})
    
    async def test_no_trailing_without_signal_parameter(self):
        """Verify that without signal parameter, no trailing occurs (backward compat)"""
        from services.signal_engine import SignalLifecycleController
        from core.database import db
        
        signal_id = get_test_signal_id()
        base_signal = get_base_signal(signal_id)
        
        # Insert test signal into MongoDB
        await db.signals.delete_many({"signal_id": signal_id})
        await db.signals.insert_one(base_signal.copy())
        
        try:
            controller = SignalLifecycleController(db)
            
            # Call without signal parameter
            success = await controller.advance_tp_state(
                signal_id=signal_id,
                current_state="active",
                new_state="tp1",
                tp_hit=1,
                signal=None  # No signal provided
            )
            
            assert success, "advance_tp_state should succeed even without signal"
            
            # Verify SL was NOT changed (no trailing without signal data)
            updated = await db.signals.find_one({"signal_id": signal_id})
            assert updated["stop_loss"] == 90.0, \
                f"Without signal param, SL should remain 90, got {updated['stop_loss']}"
            
            print("✓ Backward compatibility: no trailing without signal parameter")
            
        finally:
            await db.signals.delete_many({"signal_id": signal_id})


class TestPushNotificationTrailingSLInfo:
    """Test that push notifications include trailing SL information"""
    
    async def test_notify_tp_hit_includes_trailing_sl_for_tp1(self):
        """Verify notify_tp_hit includes 'SL moved to entry' for TP1"""
        from services.push_notifications import notify_tp_hit
        
        # Mock send_notification to capture the body
        with patch('services.push_notifications.send_notification') as mock_send:
            mock_send.return_value = None
            
            await notify_tp_hit(
                signal_id="test123",
                pair="XAUUSD",
                signal_type="buy",
                tp_level=1,
                running_pips=10.0
            )
            
            # Verify send_notification was called
            assert mock_send.called, "send_notification should be called"
            
            # Get the body argument
            call_kwargs = mock_send.call_args.kwargs
            body = call_kwargs.get("body", "")
            
            assert "SL moved to entry" in body, \
                f"TP1 notification should include 'SL moved to entry', got: {body}"
            
            print(f"✓ TP1 notification body: {body}")
    
    async def test_notify_tp_hit_includes_trailing_sl_for_tp2(self):
        """Verify notify_tp_hit includes 'SL moved to TP1' for TP2"""
        from services.push_notifications import notify_tp_hit
        
        # Mock send_notification to capture the body
        with patch('services.push_notifications.send_notification') as mock_send:
            mock_send.return_value = None
            
            await notify_tp_hit(
                signal_id="test123",
                pair="XAUUSD",
                signal_type="buy",
                tp_level=2,
                running_pips=20.0
            )
            
            # Verify send_notification was called
            assert mock_send.called, "send_notification should be called"
            
            # Get the body argument
            call_kwargs = mock_send.call_args.kwargs
            body = call_kwargs.get("body", "")
            
            assert "SL moved to TP1" in body, \
                f"TP2 notification should include 'SL moved to TP1', got: {body}"
            
            print(f"✓ TP2 notification body: {body}")
    
    async def test_notify_tp_hit_no_trailing_info_for_tp3(self):
        """Verify notify_tp_hit does NOT include trailing info for TP3 (signal closes)"""
        from services.push_notifications import notify_tp_hit
        
        # Mock send_notification to capture the body
        with patch('services.push_notifications.send_notification') as mock_send:
            mock_send.return_value = None
            
            await notify_tp_hit(
                signal_id="test123",
                pair="XAUUSD",
                signal_type="buy",
                tp_level=3,
                running_pips=30.0
            )
            
            # Verify send_notification was called
            assert mock_send.called, "send_notification should be called"
            
            # Get the body argument
            call_kwargs = mock_send.call_args.kwargs
            body = call_kwargs.get("body", "")
            
            # TP3 should not have trailing info (signal closes at TP3)
            assert "SL moved" not in body, \
                f"TP3 notification should NOT include trailing info, got: {body}"
            
            print(f"✓ TP3 notification body (no trailing): {body}")


class TestSignalEngineImportsAndStarts:
    """Verify signal engine imports and starts cleanly"""
    
    def test_signal_engine_imports_without_errors(self):
        """Verify signal_engine module imports without errors"""
        try:
            from services.signal_engine import (
                SignalLifecycleController,
                DeterministicPriceTrigger,
                calculate_signal_pips,
                calculate_signal_pips_with_trace,
                run_price_automation,
                fetch_live_prices,
            )
            print("✓ All signal_engine exports import successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import signal_engine: {e}")
    
    def test_advance_tp_state_method_exists(self):
        """Verify advance_tp_state method exists on SignalLifecycleController"""
        from services.signal_engine import SignalLifecycleController
        
        assert hasattr(SignalLifecycleController, 'advance_tp_state'), \
            "SignalLifecycleController must have advance_tp_state method"
        
        # Verify it's async
        import asyncio
        method = getattr(SignalLifecycleController, 'advance_tp_state')
        assert asyncio.iscoroutinefunction(method), \
            "advance_tp_state must be an async method"
        
        print("✓ advance_tp_state method exists and is async")
    
    def test_push_notifications_imports_without_errors(self):
        """Verify push_notifications module imports without errors"""
        try:
            from services.push_notifications import (
                notify_tp_hit,
                notify_new_signal,
                notify_signal_closed,
                send_notification,
            )
            print("✓ All push_notifications exports import successfully")
        except ImportError as e:
            pytest.fail(f"Failed to import push_notifications: {e}")


class TestProcessSignalPassesSignalToAdvanceTP:
    """Verify process_signal() passes signal to advance_tp_state()"""
    
    async def test_process_signal_tp_hit_passes_signal(self):
        """
        Verify that when process_signal detects a TP hit,
        it passes signal=signal to advance_tp_state
        """
        from services.signal_engine import SignalLifecycleController
        
        # Check the source code for the call
        import inspect
        source = inspect.getsource(SignalLifecycleController.process_signal)
        
        # Look for advance_tp_state call with signal= parameter
        assert "signal=signal" in source, \
            "process_signal must pass signal=signal to advance_tp_state"
        
        print("✓ process_signal passes signal=signal to advance_tp_state")
    
    async def test_process_signal_returns_trailing_sl_info(self):
        """
        Verify that process_signal returns trailing_sl info in result dict
        """
        from services.signal_engine import SignalLifecycleController
        
        # Check the source code for trailing_sl in return
        import inspect
        source = inspect.getsource(SignalLifecycleController.process_signal)
        
        # Look for trailing_sl in return dict
        assert "trailing_sl" in source, \
            "process_signal should include trailing_sl in return dict"
        
        print("✓ process_signal includes trailing_sl in return dict")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
