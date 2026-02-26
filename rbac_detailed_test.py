#!/usr/bin/env python3
"""
Detailed RBAC Testing - Focus on the specific issues found
"""

import requests
import json
import time

BASE_URL = "https://restore-and-test.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "ellaniswell@gmail.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin_c4e25774!"

def test_permission_enforcement_detailed():
    """Test the specific permission enforcement issue"""
    print("🔍 DETAILED PERMISSION ENFORCEMENT TEST")
    print("=" * 50)
    
    # Step 1: Login as Super Admin
    login_response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    
    if login_response.status_code != 200:
        print("❌ Super Admin login failed")
        return False
    
    super_admin_token = login_response.json()["token"]
    print("✅ Super Admin logged in")
    
    # Step 2: Create a Signal Admin
    timestamp = int(time.time())
    signal_admin_data = {
        "email": f"testsignal{timestamp}@swiftfx.com",
        "name": "Test Signal Admin",
        "password": "TestPass123!",
        "admin_role": "signal_admin"
    }
    
    create_response = requests.post(f"{BASE_URL}/admin/rbac/admins", 
                                  json=signal_admin_data,
                                  headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if create_response.status_code != 200:
        print(f"❌ Failed to create signal admin: {create_response.text}")
        return False
    
    signal_admin_id = create_response.json()["user_id"]
    signal_admin_email = signal_admin_data["email"]
    print(f"✅ Created Signal Admin: {signal_admin_id}")
    
    # Step 3: Login as Signal Admin
    signal_login_response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": signal_admin_email,
        "password": "TestPass123!"
    })
    
    if signal_login_response.status_code != 200:
        print("❌ Signal Admin login failed")
        return False
    
    signal_admin_token = signal_login_response.json()["token"]
    print("✅ Signal Admin logged in")
    
    # Step 4: Test Fund Applications Access (Should be 403)
    fund_response = requests.get(f"{BASE_URL}/admin/fund/applications",
                               headers={"Authorization": f"Bearer {signal_admin_token}"})
    
    print(f"🔍 Fund Applications Access Test:")
    print(f"   Status Code: {fund_response.status_code}")
    print(f"   Expected: 403 (Forbidden)")
    print(f"   Actual: {fund_response.status_code}")
    
    if fund_response.status_code == 403:
        print("✅ Permission enforcement working correctly")
        permission_working = True
    else:
        print("❌ CRITICAL: Permission enforcement NOT working!")
        print(f"   Response: {fund_response.text[:200]}")
        permission_working = False
    
    # Step 5: Test Signal Creation (Should work)
    signal_data = {
        "pair": "EURUSD",
        "signal_type": "buy",
        "entry": 1.1000,
        "stop_loss": 1.0950,
        "tp1": 1.1050,
        "visibility": "free",
        "analysis": "Test signal"
    }
    
    signal_response = requests.post(f"{BASE_URL}/admin/signals",
                                  json=signal_data,
                                  headers={"Authorization": f"Bearer {signal_admin_token}"})
    
    print(f"🔍 Signal Creation Test:")
    print(f"   Status Code: {signal_response.status_code}")
    print(f"   Expected: 200/201 (Success)")
    
    if signal_response.status_code in [200, 201]:
        print("✅ Signal Admin can create signals")
        signal_creation_working = True
    else:
        print("❌ Signal Admin cannot create signals")
        print(f"   Response: {signal_response.text[:200]}")
        signal_creation_working = False
    
    # Cleanup: Delete the test admin
    delete_response = requests.delete(f"{BASE_URL}/admin/rbac/admins/{signal_admin_id}",
                                    headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if delete_response.status_code == 200:
        print("✅ Test admin cleaned up")
    else:
        print(f"⚠️ Failed to cleanup test admin: {delete_response.status_code}")
    
    return permission_working and signal_creation_working

def test_protected_super_admin_detailed():
    """Test protected super admin functionality"""
    print("\n🔍 DETAILED PROTECTED SUPER ADMIN TEST")
    print("=" * 50)
    
    # Login as Super Admin
    login_response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD
    })
    
    if login_response.status_code != 200:
        print("❌ Super Admin login failed")
        return False
    
    super_admin_token = login_response.json()["token"]
    print("✅ Super Admin logged in")
    
    # Get admin list to find protected super admin
    admins_response = requests.get(f"{BASE_URL}/admin/rbac/admins",
                                 headers={"Authorization": f"Bearer {super_admin_token}"})
    
    if admins_response.status_code != 200:
        print("❌ Failed to get admin list")
        return False
    
    admins = admins_response.json()["admins"]
    protected_admin = None
    
    # Look for ellapauledache@gmail.com (protected super admin)
    for admin in admins:
        if admin["email"] == "ellapauledache@gmail.com":
            protected_admin = admin
            break
    
    if not protected_admin:
        print("⚠️ Protected super admin not found, testing protection during creation")
        
        # Test creating protected email as non-super admin
        create_data = {
            "email": "ellapauledache@gmail.com",
            "name": "Test Protected",
            "password": "TempPass123!",
            "admin_role": "signal_admin"
        }
        
        create_response = requests.post(f"{BASE_URL}/admin/rbac/admins",
                                      json=create_data,
                                      headers={"Authorization": f"Bearer {super_admin_token}"})
        
        print(f"🔍 Protected Email Creation Test:")
        print(f"   Status Code: {create_response.status_code}")
        print(f"   Expected: 403 (Forbidden)")
        
        if create_response.status_code == 403:
            print("✅ Protected email cannot be created as non-super admin")
            return True
        else:
            print("❌ Protected email creation not properly blocked")
            return False
    else:
        print(f"✅ Found protected super admin: {protected_admin['email']}")
        
        # Try to downgrade protected super admin
        update_data = {"admin_role": "signal_admin"}
        
        update_response = requests.put(f"{BASE_URL}/admin/rbac/admins/{protected_admin['user_id']}",
                                     json=update_data,
                                     headers={"Authorization": f"Bearer {super_admin_token}"})
        
        print(f"🔍 Protected Super Admin Downgrade Test:")
        print(f"   Status Code: {update_response.status_code}")
        print(f"   Expected: 403 (Forbidden)")
        
        if update_response.status_code == 403:
            print("✅ Protected super admin cannot be downgraded")
            return True
        else:
            print("❌ Protected super admin downgrade not properly blocked")
            print(f"   Response: {update_response.text[:200]}")
            return False

def main():
    """Run detailed tests"""
    print("🚀 DETAILED RBAC ISSUE INVESTIGATION")
    print("=" * 60)
    
    # Test 1: Permission Enforcement
    permission_test = test_permission_enforcement_detailed()
    
    # Test 2: Protected Super Admin
    protection_test = test_protected_super_admin_detailed()
    
    print("\n" + "=" * 60)
    print("🏁 DETAILED TEST RESULTS")
    print(f"Permission Enforcement: {'✅ WORKING' if permission_test else '❌ BROKEN'}")
    print(f"Protected Super Admin: {'✅ WORKING' if protection_test else '❌ BROKEN'}")
    
    if permission_test and protection_test:
        print("\n🎉 All detailed tests passed!")
        return True
    else:
        print("\n💥 Issues confirmed in RBAC system!")
        return False

if __name__ == "__main__":
    main()