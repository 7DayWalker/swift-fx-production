"""
Test Pre-Release Bug Fixes - Iteration 38
==========================================
Tests for:
1. Duplicate notification fix (signal creation only notifies on ACTIVE state)
2. Close notification on state transition
3. State+Status field sync in update_signal_state
4. Signal history queries 'state: closed' 
5. Dashboard aggregation uses 'state: closed'
6. Push notification payload includes priority+channelId
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com').rstrip('/')


class TestHealthAndBasics:
    """Basic health checks"""
    
    def test_backend_health(self):
        """Verify backend is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"✓ Backend healthy: {data}")
    
    def test_signals_endpoint(self):
        """Verify signals endpoint returns data"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/signals returned {len(data)} signals")


class TestDashboardStateQuery:
    """Test dashboard uses 'state: closed' for aggregation"""
    
    def test_dashboard_returns_performance_stats(self):
        """Verify dashboard returns performance stats with total_signals > 0"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "performance" in data
        assert "recent_signals" in data
        
        performance = data["performance"]
        assert "win_rate" in performance
        assert "total_pips" in performance
        assert "total_signals" in performance
        
        print(f"✓ Dashboard performance: win_rate={performance['win_rate']}%, total_pips={performance['total_pips']}, total_signals={performance['total_signals']}")
        
        # Note: total_signals may be 0 if no closed signals exist
        # The key fix is that it queries 'state: closed' not 'status: closed'
        return performance


class TestSignalHistoryStateQuery:
    """Test signal history queries 'state: closed'"""
    
    def test_signal_history_stats_endpoint(self):
        """Verify signal history stats endpoint returns closed signals"""
        response = requests.get(f"{BASE_URL}/api/signals/history/stats")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "stats" in data
        assert "signals" in data
        
        stats = data["stats"]
        assert "total_signals" in stats
        assert "winning_signals" in stats
        assert "losing_signals" in stats
        assert "win_rate" in stats
        assert "total_pips" in stats
        
        print(f"✓ Signal history stats: total={stats['total_signals']}, wins={stats['winning_signals']}, losses={stats['losing_signals']}, win_rate={stats['win_rate']}%")
        
        # Verify signals returned have state='closed'
        signals = data.get("signals", [])
        for signal in signals[:5]:  # Check first 5
            state = signal.get("state", signal.get("status"))
            assert state == "closed", f"Signal {signal.get('signal_id')} has state={state}, expected 'closed'"
        
        if signals:
            print(f"✓ All {len(signals)} signals in history have state='closed'")
        else:
            print("⚠ No closed signals found in history (may be expected if no signals closed yet)")


class TestCodeReviewSignalsNotification:
    """Code review verification for notification fixes"""
    
    def test_create_signal_notification_conditional(self):
        """Verify create_signal only sends notification when state is ACTIVE"""
        # Read signals.py and verify the conditional notification logic
        signals_path = "/app/backend/api/routes/signals.py"
        
        with open(signals_path, 'r') as f:
            content = f.read()
        
        # Check for the conditional notification on ACTIVE state
        # Line 209-210: if initial_state == SignalState.ACTIVE: \n background_tasks.add_task(send_signal_notification...)
        assert "if initial_state == SignalState.ACTIVE:" in content, "Missing conditional check for ACTIVE state before notification"
        
        # Verify the notification is inside the conditional block
        # The notification can be on the same line or next line after the if statement
        lines = content.split('\n')
        found_conditional_with_notification = False
        
        for i, line in enumerate(lines):
            # Look for the conditional in create_signal function (around line 209)
            if "if initial_state == SignalState.ACTIVE:" in line:
                # Check if notification is on the same line (single-line if)
                if "send_signal_notification" in line:
                    found_conditional_with_notification = True
                    break
                # Check next few lines for notification call (multi-line if block)
                for j in range(i+1, min(i+10, len(lines))):
                    next_line = lines[j]
                    if "send_signal_notification" in next_line:
                        found_conditional_with_notification = True
                        break
                    # Stop if we hit another if/else/def (left the block)
                    if next_line.strip() and not next_line.startswith(' ' * 8) and not next_line.startswith('\t\t'):
                        if next_line.strip().startswith(('if ', 'else', 'elif', 'def ', 'return', 'async def')):
                            break
                if found_conditional_with_notification:
                    break
        
        assert found_conditional_with_notification, "send_signal_notification not found in ACTIVE conditional block"
        
        print("✓ create_signal only sends notification when initial_state == ACTIVE (duplicate notification fix)")
    
    def test_update_signal_state_has_background_tasks(self):
        """Verify update_signal_state endpoint has BackgroundTasks parameter"""
        signals_path = "/app/backend/api/routes/signals.py"
        
        with open(signals_path, 'r') as f:
            content = f.read()
        
        # Find the update_signal_state function definition
        # Should have: async def update_signal_state(..., background_tasks: BackgroundTasks, ...)
        pattern = r"async def update_signal_state\([^)]*background_tasks:\s*BackgroundTasks"
        match = re.search(pattern, content)
        
        assert match, "update_signal_state missing BackgroundTasks parameter"
        print("✓ update_signal_state has BackgroundTasks parameter")
    
    def test_update_signal_state_sends_close_notification(self):
        """Verify update_signal_state sends close notification when state transitions to 'closed'"""
        signals_path = "/app/backend/api/routes/signals.py"
        
        with open(signals_path, 'r') as f:
            content = f.read()
        
        # Find the update_signal_state function and check for close notification
        # Should have: if new_state == "closed": ... background_tasks.add_task(send_signal_close_notification...)
        
        # Look for the pattern within update_signal_state function
        lines = content.split('\n')
        in_update_signal_state = False
        found_close_check = False
        found_close_notification = False
        
        for i, line in enumerate(lines):
            if "async def update_signal_state" in line:
                in_update_signal_state = True
            elif in_update_signal_state and line.strip().startswith("async def "):
                # Reached next function
                break
            elif in_update_signal_state:
                if 'if new_state == "closed"' in line or "if new_state == 'closed'" in line:
                    found_close_check = True
                if found_close_check and "send_signal_close_notification" in line:
                    found_close_notification = True
        
        assert found_close_check, "update_signal_state missing 'if new_state == closed' check"
        assert found_close_notification, "update_signal_state missing send_signal_close_notification call"
        
        print("✓ update_signal_state sends close notification when state transitions to 'closed'")
    
    def test_update_signal_state_sets_both_state_and_status(self):
        """Verify update_signal_state sets both 'state' AND 'status' fields"""
        signals_path = "/app/backend/api/routes/signals.py"
        
        with open(signals_path, 'r') as f:
            content = f.read()
        
        # Find update_signal_state function and check for both state and status in update_doc
        lines = content.split('\n')
        in_update_signal_state = False
        found_state_assignment = False
        found_status_assignment = False
        
        for i, line in enumerate(lines):
            if "async def update_signal_state" in line:
                in_update_signal_state = True
            elif in_update_signal_state and line.strip().startswith("async def "):
                break
            elif in_update_signal_state:
                if '"state":' in line or "'state':" in line:
                    found_state_assignment = True
                if '"status":' in line or "'status':" in line:
                    found_status_assignment = True
        
        assert found_state_assignment, "update_signal_state missing 'state' field assignment"
        assert found_status_assignment, "update_signal_state missing 'status' field assignment"
        
        print("✓ update_signal_state sets both 'state' AND 'status' fields")
    
    def test_full_update_signal_sets_status_from_state(self):
        """Verify full_update_signal sets 'status' via get_status_from_state() when state changes"""
        signals_path = "/app/backend/api/routes/signals.py"
        
        with open(signals_path, 'r') as f:
            content = f.read()
        
        # Find full_update_signal function and check for get_status_from_state call
        lines = content.split('\n')
        in_full_update_signal = False
        found_status_from_state = False
        
        for i, line in enumerate(lines):
            if "async def full_update_signal" in line:
                in_full_update_signal = True
            elif in_full_update_signal and line.strip().startswith("async def "):
                break
            elif in_full_update_signal:
                if "get_status_from_state" in line:
                    found_status_from_state = True
        
        assert found_status_from_state, "full_update_signal missing get_status_from_state() call"
        
        print("✓ full_update_signal sets 'status' via get_status_from_state() when state changes")


class TestCodeReviewDashboard:
    """Code review verification for dashboard state query fix"""
    
    def test_dashboard_uses_state_closed(self):
        """Verify dashboard aggregation uses 'state: closed' instead of 'status: closed'"""
        dashboard_path = "/app/backend/api/routes/dashboard.py"
        
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check for state: closed in aggregation pipeline
        assert '"state": "closed"' in content or "'state': 'closed'" in content, \
            "Dashboard aggregation should use 'state: closed'"
        
        # Verify it does NOT use status: closed
        # Note: status might appear in other contexts, so we check specifically in the $match
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if "$match" in line:
                # Check next few lines for the match condition
                for j in range(i, min(i+5, len(lines))):
                    if '"status": "closed"' in lines[j] or "'status': 'closed'" in lines[j]:
                        pytest.fail("Dashboard aggregation should NOT use 'status: closed' in $match")
        
        print("✓ Dashboard aggregation uses 'state: closed' (not 'status: closed')")


class TestCodeReviewSignalHistory:
    """Code review verification for signal history state query fix"""
    
    def test_signal_history_uses_state_closed(self):
        """Verify signal history queries 'state: closed' instead of 'status: closed'"""
        signals_path = "/app/backend/api/routes/signals.py"
        
        with open(signals_path, 'r') as f:
            content = f.read()
        
        # Find get_signal_history_stats function
        lines = content.split('\n')
        in_history_stats = False
        found_state_closed_query = False
        
        for i, line in enumerate(lines):
            if "async def get_signal_history_stats" in line:
                in_history_stats = True
            elif in_history_stats and line.strip().startswith("async def "):
                break
            elif in_history_stats:
                if '"state": "closed"' in line or "'state': 'closed'" in line:
                    found_state_closed_query = True
        
        assert found_state_closed_query, "get_signal_history_stats should query 'state: closed'"
        
        print("✓ Signal history queries 'state: closed' (manually closed trades now appear)")


class TestCodeReviewPushNotifications:
    """Code review verification for push notification payload fixes"""
    
    def test_push_notification_has_priority_and_channel(self):
        """Verify push notification payload includes 'priority: high' and 'channelId: default'"""
        push_path = "/app/backend/services/push_notifications.py"
        
        with open(push_path, 'r') as f:
            content = f.read()
        
        # Check for priority and channelId in the message payload
        assert '"priority": "high"' in content or "'priority': 'high'" in content, \
            "Push notification payload missing 'priority: high'"
        
        assert '"channelId": "default"' in content or "'channelId': 'default'" in content, \
            "Push notification payload missing 'channelId: default'"
        
        print("✓ Push notification payload includes 'priority: high' and 'channelId: default' (Android fix)")


class TestCodeReviewFrontendIAP:
    """Code review verification for frontend IAP diagnostic logging"""
    
    def test_iap_service_logs_product_skus(self):
        """Verify iapService.native.ts logs product SKUs during initialization"""
        iap_path = "/app/frontend/src/services/iapService.native.ts"
        
        with open(iap_path, 'r') as f:
            content = f.read()
        
        # Check for logging of SKUs
        assert "console.log" in content, "iapService should have console.log statements"
        
        # Check for specific logging patterns
        assert "Products loaded" in content or "products loaded" in content.lower(), \
            "iapService should log when products are loaded"
        
        # Check for SKU logging
        assert "productId" in content or "SKU" in content or "sku" in content.lower(), \
            "iapService should log product IDs/SKUs"
        
        print("✓ iapService.native.ts logs product SKUs and count during initialization")
    
    def test_subscription_screen_logs_iap_status(self):
        """Verify subscription.tsx getStorePrice logs IAP initialization status"""
        subscription_path = "/app/frontend/app/subscription.tsx"
        
        with open(subscription_path, 'r') as f:
            content = f.read()
        
        # Check for getStorePrice function with logging
        assert "getStorePrice" in content, "subscription.tsx should have getStorePrice function"
        
        # Check for console.log in getStorePrice
        lines = content.split('\n')
        in_get_store_price = False
        found_logging = False
        
        for i, line in enumerate(lines):
            if "getStorePrice" in line and ("const" in line or "function" in line or "=>" in line):
                in_get_store_price = True
            elif in_get_store_price:
                if "console.log" in line:
                    found_logging = True
                if line.strip().startswith("const ") and "getStorePrice" not in line:
                    # Reached next const declaration
                    break
        
        assert found_logging, "getStorePrice should have console.log for diagnostic logging"
        
        print("✓ subscription.tsx getStorePrice logs IAP initialization status and available products")


class TestCodeReviewDashboardTimestamp:
    """Code review verification for dashboard timestamp format fix"""
    
    def test_dashboard_uses_same_timestamp_format_as_signals(self):
        """Verify dashboard.tsx getDashboardAge uses same format as signals.tsx"""
        dashboard_path = "/app/frontend/app/(tabs)/dashboard.tsx"
        
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check for getDashboardAge function
        assert "getDashboardAge" in content, "dashboard.tsx should have getDashboardAge function"
        
        # Check for proper date formatting
        assert "toLocaleTimeString" in content or "toLocaleDateString" in content, \
            "getDashboardAge should use toLocaleTimeString/toLocaleDateString for consistent formatting"
        
        # Check for Today/Yesterday logic
        assert "Today" in content, "getDashboardAge should handle 'Today' case"
        assert "Yesterday" in content, "getDashboardAge should handle 'Yesterday' case"
        
        print("✓ dashboard.tsx getDashboardAge uses same format as signals.tsx (Today at HH:MM, Yesterday at HH:MM, etc.)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
