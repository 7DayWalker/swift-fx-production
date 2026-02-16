#!/usr/bin/env python3
"""
Corrected RBAC Testing - Following the exact review request sequence
"""

import requests
import json
import time

BASE_URL = "https://pressable-scale.preview.emergentagent.com/api"

def test_complete_rbac_sequence():
    """Test the complete RBAC system following the exact review request"""
    print("🚀 COMPLETE ADMIN RBAC SYSTEM TEST")
    print("Following the exact review request sequence")
    print("=" * 60)
    
    results = []
    
    # Step 1: Verify Super Admin Setup
    print("\n=== STEP 1: Verify Super Admin Setup ===")
    
    # Use the correct super admin credentials
    login_response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "ellaniswell@gmail.com",
        "password": "SuperAdmin_c4e25774!"
    })
    
    if login_response.status_code == 200:
        super_admin_token = login_response.json()["token"]
        print("✅ Super Admin Login (ellaniswell@gmail.com) - SUCCESS")
        results.append("✅ Step 1: Super Admin Login - SUCCESS")
    else:
        print("❌ Super Admin Login - FAILED")
        results.append("❌ Step 1: Super Admin Login - FAILED")
        return results
    
    # GET /api/admin/rbac/me
    me_response = requests.get(f"{BASE_URL}/admin/rbac/me",
                              headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if me_response.status_code == 200:
        me_data = me_response.json()
        admin_role = me_data.get("admin_role")
        is_super_admin = me_data.get("is_super_admin")
        
        if admin_role == "super_admin" and is_super_admin:
            print(f"✅ RBAC Me Endpoint - admin_role: {admin_role}, is_super_admin: {is_super_admin}")
            results.append("✅ Step 1: RBAC Me Verification - SUCCESS")
        else:
            print(f"❌ RBAC Me Endpoint - Expected super_admin/true, got {admin_role}/{is_super_admin}")
            results.append("❌ Step 1: RBAC Me Verification - FAILED")
    else:
        print("❌ RBAC Me Endpoint - FAILED")
        results.append("❌ Step 1: RBAC Me Verification - FAILED")
    
    # Step 2: Test Admin Management - List
    print("\n=== STEP 2: Test Admin Management - List ===")
    
    admins_response = requests.get(f"{BASE_URL}/admin/rbac/admins",
                                 headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if admins_response.status_code == 200:
        admins_data = admins_response.json()
        admins = admins_data.get("admins", [])
        print(f"✅ List Admins - Found {len(admins)} admin accounts")
        results.append(f"✅ Step 2: List Admins - Found {len(admins)} accounts")
    else:
        print("❌ List Admins - FAILED")
        results.append("❌ Step 2: List Admins - FAILED")
    
    # Step 3: Test Admin Management - Create Signal Admin
    print("\n=== STEP 3: Create Signal Admin ===")
    
    timestamp = int(time.time())
    signal_admin_data = {
        "email": "signaltest@swiftfx.com",
        "name": "Signal Test Admin", 
        "password": "TestPass123!",
        "admin_role": "signal_admin"
    }
    
    create_response = requests.post(f"{BASE_URL}/admin/rbac/admins",
                                  json=signal_admin_data,
                                  headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if create_response.status_code == 200:
        create_data = create_response.json()
        signal_admin_id = create_data.get("user_id")
        print(f"✅ Create Signal Admin - ID: {signal_admin_id}")
        results.append(f"✅ Step 3: Create Signal Admin - SUCCESS (ID: {signal_admin_id})")
    else:
        print(f"❌ Create Signal Admin - FAILED: {create_response.text}")
        results.append("❌ Step 3: Create Signal Admin - FAILED")
        return results
    
    # Step 4: Test Permission Enforcement for Signal Admin
    print("\n=== STEP 4: Test Permission Enforcement ===")
    
    # Login as Signal Admin
    signal_login_response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "signaltest@swiftfx.com",
        "password": "TestPass123!"
    })
    
    if signal_login_response.status_code == 200:
        signal_admin_token = signal_login_response.json()["token"]
        print("✅ Signal Admin Login - SUCCESS")
        
        # Try GET /api/admin/fund/applications (should return 403)
        fund_response = requests.get(f"{BASE_URL}/admin/fund/applications",
                                   headers={"Authorization": f"Bearer {signal_admin_token}"})
        
        if fund_response.status_code == 403:
            print("✅ Permission Enforcement - Signal Admin correctly blocked from fund applications (403)")
            results.append("✅ Step 4: Permission Enforcement - SUCCESS")
        else:
            print(f"❌ Permission Enforcement - Expected 403, got {fund_response.status_code}")
            results.append(f"❌ Step 4: Permission Enforcement - FAILED (got {fund_response.status_code})")
    else:
        print("❌ Signal Admin Login - FAILED")
        results.append("❌ Step 4: Signal Admin Login - FAILED")
    
    # Step 5: Test Signal Admin Can Access Signals
    print("\n=== STEP 5: Test Signal Admin Signal Access ===")
    
    signal_data = {
        "pair": "EURUSD",
        "signal_type": "buy", 
        "entry": 1.1000,
        "stop_loss": 1.0950,
        "tp1": 1.1050,
        "visibility": "free",
        "analysis": "Test signal from Signal Admin"
    }
    
    signal_create_response = requests.post(f"{BASE_URL}/admin/signals",
                                         json=signal_data,
                                         headers={"Authorization": f"Bearer {signal_admin_token}"})
    
    if signal_create_response.status_code in [200, 201]:
        print("✅ Signal Creation - Signal Admin can create signals")
        results.append("✅ Step 5: Signal Admin Signal Access - SUCCESS")
    else:
        print(f"❌ Signal Creation - FAILED: {signal_create_response.status_code}")
        results.append("❌ Step 5: Signal Admin Signal Access - FAILED")
    
    # Step 6: Test Audit Logs
    print("\n=== STEP 6: Test Audit Logs ===")
    
    audit_response = requests.get(f"{BASE_URL}/admin/rbac/audit-logs",
                                headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if audit_response.status_code == 200:
        audit_data = audit_response.json()
        logs = audit_data.get("logs", [])
        print(f"✅ Audit Logs - Retrieved {len(logs)} logs")
        results.append(f"✅ Step 6: Audit Logs - SUCCESS ({len(logs)} logs)")
    else:
        print("❌ Audit Logs - FAILED")
        results.append("❌ Step 6: Audit Logs - FAILED")
    
    # Step 7: Test Admin Notifications
    print("\n=== STEP 7: Test Admin Notifications ===")
    
    notif_response = requests.get(f"{BASE_URL}/admin/notifications",
                                headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if notif_response.status_code == 200:
        notif_data = notif_response.json()
        notifications = notif_data.get("notifications", [])
        print(f"✅ Admin Notifications - Retrieved {len(notifications)} notifications")
        results.append(f"✅ Step 7: Admin Notifications - SUCCESS ({len(notifications)} notifications)")
    else:
        print("❌ Admin Notifications - FAILED")
        results.append("❌ Step 7: Admin Notifications - FAILED")
    
    # Step 8: Test Protected Super Admin Cannot Be Changed
    print("\n=== STEP 8: Test Protected Super Admin ===")
    
    # Find a protected super admin
    protected_admin = None
    for admin in admins:
        if admin.get("email") in ["ellapauledache@gmail.com", "ellaniswell@gmail.com"]:
            protected_admin = admin
            break
    
    if protected_admin:
        update_data = {"admin_role": "signal_admin"}
        protect_response = requests.put(f"{BASE_URL}/admin/rbac/admins/{protected_admin['user_id']}",
                                      json=update_data,
                                      headers={"Authorization": f"Bearer {super_admin_token}"})
        
        if protect_response.status_code == 403:
            print("✅ Protected Super Admin - Cannot be modified (403)")
            results.append("✅ Step 8: Protected Super Admin - SUCCESS")
        else:
            print(f"❌ Protected Super Admin - Expected 403, got {protect_response.status_code}")
            results.append(f"❌ Step 8: Protected Super Admin - FAILED (got {protect_response.status_code})")
    else:
        print("⚠️ Protected Super Admin - None found to test")
        results.append("⚠️ Step 8: Protected Super Admin - SKIPPED (none found)")
    
    # Step 9: Test Delete Admin
    print("\n=== STEP 9: Test Delete Admin ===")
    
    delete_response = requests.delete(f"{BASE_URL}/admin/rbac/admins/{signal_admin_id}",
                                    headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if delete_response.status_code == 200:
        print("✅ Delete Admin - SUCCESS")
        results.append("✅ Step 9: Delete Admin - SUCCESS")
    else:
        print(f"❌ Delete Admin - FAILED: {delete_response.status_code}")
        results.append("❌ Step 9: Delete Admin - FAILED")
    
    # Step 10: Verify Roles Endpoint
    print("\n=== STEP 10: Verify Roles Endpoint ===")
    
    roles_response = requests.get(f"{BASE_URL}/admin/rbac/roles",
                                headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if roles_response.status_code == 200:
        roles_data = roles_response.json()
        roles = roles_data.get("roles", [])
        
        expected_roles = ["super_admin", "signal_admin", "fund_admin", "account_manager", "customer_support"]
        found_roles = [role.get("role") for role in roles]
        
        if len(roles) == 5 and all(role in found_roles for role in expected_roles):
            print(f"✅ Roles Endpoint - All 5 roles found with permissions")
            results.append("✅ Step 10: Roles Endpoint - SUCCESS")
        else:
            print(f"❌ Roles Endpoint - Expected 5 roles, found {len(roles)}")
            results.append("❌ Step 10: Roles Endpoint - FAILED")
    else:
        print("❌ Roles Endpoint - FAILED")
        results.append("❌ Step 10: Roles Endpoint - FAILED")
    
    return results

def main():
    """Run the complete RBAC test sequence"""
    results = test_complete_rbac_sequence()
    
    print("\n" + "=" * 60)
    print("🏁 COMPLETE RBAC TEST RESULTS")
    print("=" * 60)
    
    passed = sum(1 for result in results if result.startswith("✅"))
    total = len([r for r in results if not r.startswith("⚠️")])
    
    for result in results:
        print(result)
    
    print(f"\n📊 SUMMARY: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED - Admin RBAC System is FULLY FUNCTIONAL!")
        return True
    else:
        print("💥 SOME TESTS FAILED - Issues detected in RBAC system")
        return False

if __name__ == "__main__":
    main()