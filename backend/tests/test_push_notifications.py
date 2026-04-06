"""
Test Push Notification Flow - Backend Tests
============================================
Tests for the centralized push notification service and signal engine integration.
"""
import pytest
import requests
import os
import asyncio
from datetime import datetime, timezone

# Base URL from environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com').rstrip('/')


class TestPushNotificationImports:
    """Test that push notification modules import correctly"""
    
    def test_push_notifications_module_imports(self):
        """Verify services.push_notifications module loads without errors"""
        try:
            from services.push_notifications import (
                send_notification, 
                notify_new_signal, 
                notify_signal_closed, 
                notify_tp_hit
            )
            assert callable(send_notification), "send_notification should be callable"
            assert callable(notify_new_signal), "notify_new_signal should be callable"
            assert callable(notify_signal_closed), "notify_signal_closed should be callable"
            assert callable(notify_tp_hit), "notify_tp_hit should be callable"
            print("✓ All push_notifications functions are callable")
        except ImportError as e:
            pytest.fail(f"Failed to import push_notifications module: {e}")
    
    def test_signal_engine_notification_wrappers_import(self):
        """Verify signal_engine notification wrappers load without errors"""
        try:
            from services.signal_engine import (
                send_signal_notification,
                send_signal_close_notification,
                send_tp_hit_notification
            )
            assert callable(send_signal_notification), "send_signal_notification should be callable"
            assert callable(send_signal_close_notification), "send_signal_close_notification should be callable"
            assert callable(send_tp_hit_notification), "send_tp_hit_notification should be callable"
            print("✓ All signal_engine notification wrappers are callable")
        except ImportError as e:
            pytest.fail(f"Failed to import signal_engine notification wrappers: {e}")
    
    def test_push_notifications_internal_functions(self):
        """Verify internal helper functions exist in push_notifications module"""
        try:
            from services.push_notifications import (
                _get_engine_notifications_enabled,
                _fetch_active_tokens,
                _fetch_user_profiles_batch,
                _mark_tokens_inactive,
                _send_expo_push_batch,
                check_push_receipts,
                EXPO_PUSH_URL,
                EXPO_RECEIPTS_URL,
                BATCH_SIZE
            )
            # Verify constants
            assert EXPO_PUSH_URL == "https://exp.host/--/api/v2/push/send"
            assert EXPO_RECEIPTS_URL == "https://exp.host/--/api/v2/push/getReceipts"
            assert BATCH_SIZE == 100
            print("✓ All internal functions and constants exist")
        except ImportError as e:
            pytest.fail(f"Failed to import internal functions: {e}")


class TestNotificationEndpoints:
    """Test notification API endpoints"""
    
    def test_register_token_endpoint_exists(self):
        """Verify /api/notifications/register-token endpoint accepts POST"""
        # Without auth, should return 401 or 403
        response = requests.post(
            f"{BASE_URL}/api/notifications/register-token",
            json={"token": "ExponentPushToken[test123]", "platform": "ios"},
            headers={"Content-Type": "application/json"}
        )
        # Endpoint exists if we get 401/403 (auth required) or 422 (validation error)
        # 404 would mean endpoint doesn't exist
        assert response.status_code in [401, 403, 422], f"Expected 401/403/422, got {response.status_code}"
        print(f"✓ /api/notifications/register-token endpoint exists (returns {response.status_code} without auth)")
    
    def test_preferences_endpoint_exists(self):
        """Verify /api/notifications/preferences endpoint accepts PUT"""
        response = requests.put(
            f"{BASE_URL}/api/notifications/preferences",
            json={"signals": True, "community": False},
            headers={"Content-Type": "application/json"}
        )
        # Endpoint exists if we get 401/403 (auth required) or 422 (validation error)
        assert response.status_code in [401, 403, 422], f"Expected 401/403/422, got {response.status_code}"
        print(f"✓ /api/notifications/preferences endpoint exists (returns {response.status_code} without auth)")


class TestSignalEngineStartup:
    """Test signal engine startup and configuration"""
    
    def test_engine_config_defaults(self):
        """Verify engine config defaults include send_notifications flag"""
        from services.signal_engine import ENGINE_CONFIG_DEFAULTS
        
        assert "send_notifications" in ENGINE_CONFIG_DEFAULTS
        assert ENGINE_CONFIG_DEFAULTS["send_notifications"] is True
        assert "enabled" in ENGINE_CONFIG_DEFAULTS
        assert "poll_interval" in ENGINE_CONFIG_DEFAULTS
        print("✓ Engine config defaults include send_notifications=True")
    
    def test_signal_lifecycle_controller_exists(self):
        """Verify SignalLifecycleController class exists"""
        from services.signal_engine import SignalLifecycleController
        
        assert SignalLifecycleController is not None
        # Check key methods exist
        assert hasattr(SignalLifecycleController, 'process_signal')
        assert hasattr(SignalLifecycleController, 'close_signal')
        assert hasattr(SignalLifecycleController, 'activate_signal')
        assert hasattr(SignalLifecycleController, 'advance_tp_state')
        print("✓ SignalLifecycleController class exists with required methods")


class TestPushNotificationLogic:
    """Test push notification logic paths"""
    
    def test_send_notification_signature(self):
        """Verify send_notification has correct signature"""
        import inspect
        from services.push_notifications import send_notification
        
        sig = inspect.signature(send_notification)
        params = list(sig.parameters.keys())
        
        # Check required keyword-only parameters
        assert 'title' in params
        assert 'body' in params
        assert 'data' in params
        assert 'preference_key' in params
        assert 'check_engine_config' in params
        
        # Check defaults
        assert sig.parameters['preference_key'].default == "signals"
        assert sig.parameters['check_engine_config'].default is True
        print("✓ send_notification has correct signature with engine config check")
    
    def test_notify_new_signal_signature(self):
        """Verify notify_new_signal has correct signature"""
        import inspect
        from services.push_notifications import notify_new_signal
        
        sig = inspect.signature(notify_new_signal)
        params = list(sig.parameters.keys())
        
        assert 'signal_id' in params
        assert 'pair' in params
        assert 'signal_type' in params
        print("✓ notify_new_signal has correct signature")
    
    def test_notify_signal_closed_signature(self):
        """Verify notify_signal_closed has correct signature"""
        import inspect
        from services.push_notifications import notify_signal_closed
        
        sig = inspect.signature(notify_signal_closed)
        params = list(sig.parameters.keys())
        
        assert 'signal_id' in params
        assert 'pair' in params
        assert 'signal_type' in params
        assert 'final_pips' in params
        print("✓ notify_signal_closed has correct signature")
    
    def test_notify_tp_hit_signature(self):
        """Verify notify_tp_hit has correct signature"""
        import inspect
        from services.push_notifications import notify_tp_hit
        
        sig = inspect.signature(notify_tp_hit)
        params = list(sig.parameters.keys())
        
        assert 'signal_id' in params
        assert 'pair' in params
        assert 'signal_type' in params
        assert 'tp_level' in params
        assert 'running_pips' in params
        print("✓ notify_tp_hit has correct signature")


class TestHealthEndpoints:
    """Test basic health and API endpoints"""
    
    def test_api_health(self):
        """Verify API is responding"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ API health endpoint responding")
    
    def test_signals_endpoint(self):
        """Verify signals endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200
        data = response.json()
        # API returns list directly or {"signals": [...]}
        if isinstance(data, list):
            print(f"✓ Signals endpoint responding with {len(data)} signals")
        else:
            assert "signals" in data
            print(f"✓ Signals endpoint responding with {len(data.get('signals', []))} signals")
    
    def test_subscription_plans_endpoint(self):
        """Verify subscription plans endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/subscription/plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        print(f"✓ Subscription plans endpoint responding with {len(data.get('plans', []))} plans")


class TestEngineConfigCheck:
    """Test that push notifications check engine config"""
    
    def test_get_engine_notifications_enabled_function(self):
        """Verify _get_engine_notifications_enabled function exists and is async"""
        import inspect
        from services.push_notifications import _get_engine_notifications_enabled
        
        assert inspect.iscoroutinefunction(_get_engine_notifications_enabled)
        print("✓ _get_engine_notifications_enabled is an async function")
    
    def test_send_notification_checks_engine_config(self):
        """Verify send_notification has check_engine_config parameter"""
        import inspect
        from services.push_notifications import send_notification
        
        sig = inspect.signature(send_notification)
        check_param = sig.parameters.get('check_engine_config')
        
        assert check_param is not None
        assert check_param.default is True
        print("✓ send_notification checks engine config by default")


class TestDeviceTokenSchema:
    """Test DeviceTokenRegister schema"""
    
    def test_device_token_register_schema(self):
        """Verify DeviceTokenRegister schema exists with correct fields"""
        from models.schemas import DeviceTokenRegister
        
        # Create a valid instance
        token_data = DeviceTokenRegister(
            token="ExponentPushToken[test123]",
            platform="ios"
        )
        
        assert token_data.token == "ExponentPushToken[test123]"
        assert token_data.platform == "ios"
        print("✓ DeviceTokenRegister schema works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
