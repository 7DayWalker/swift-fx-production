#!/usr/bin/env python3
"""
Backend Testing Suite for Swift FX Signals - Help & Support System
Tests all Help & Support System endpoints with proper authentication and role-based access control.
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL from frontend .env
BASE_URL = "https://postgres-transition.preview.emergentagent.com/api"

# Test credentials from review request
SUPER_ADMIN_EMAIL = "ellapauledache@gmail.com"
SUPER_ADMIN_PASSWORD = "SuperAdmin2025!"
VIP_USER_EMAIL = "fundtest@test.com"
VIP_USER_PASSWORD = "password"

class TestRunner:
    def __init__(self):
        self.super_admin_token = None
        self.vip_user_token = None
        self.test_ticket_id = None
        self.passed = 0
        self.failed = 0
        self.results = []

    def log_result(self, test_name: str, success: bool, message: str = "", details: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = f"{status}: {test_name}"
        if message:
            result += f" - {message}"
        if details and not success:
            result += f"\nDetails: {details}"
        
        print(result)
        self.results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "details": details
        })
        
        if success:
            self.passed += 1
        else:
            self.failed += 1

    def make_request(self, method: str, endpoint: str, token: str = None, data: Dict = None, params: Dict = None) -> requests.Response:
        """Make HTTP request with optional authentication"""
        url = f"{BASE_URL}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, json=data, params=params, timeout=30)
            elif method.upper() == "PUT":
                response = requests.put(url, headers=headers, json=data, params=params, timeout=30)
            elif method.upper() == "DELETE":
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            raise

    def authenticate_super_admin(self) -> bool:
        """Authenticate Super Admin and store token"""
        try:
            response = self.make_request("POST", "/auth/login", data={
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.super_admin_token = data.get("token")
                self.log_result("Super Admin Login", True, f"Authenticated as {SUPER_ADMIN_EMAIL}")
                return True
            else:
                self.log_result("Super Admin Login", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Super Admin Login", False, f"Exception: {str(e)}")
            return False

    def authenticate_vip_user(self) -> bool:
        """Authenticate VIP User and store token"""
        try:
            response = self.make_request("POST", "/auth/login", data={
                "email": VIP_USER_EMAIL,
                "password": VIP_USER_PASSWORD
            })
            
            if response.status_code == 200:
                data = response.json()
                self.vip_user_token = data.get("token")
                self.log_result("VIP User Login", True, f"Authenticated as {VIP_USER_EMAIL}")
                return True
            else:
                self.log_result("VIP User Login", False, f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("VIP User Login", False, f"Exception: {str(e)}")
            return False

    def test_get_faqs_public(self):
        """Test 1: GET /api/support/faqs (public endpoint)"""
        try:
            response = self.make_request("GET", "/support/faqs")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_keys = ["faqs", "grouped", "categories"]
                missing_keys = [key for key in required_keys if key not in data]
                
                if missing_keys:
                    self.log_result("Get FAQs (Public)", False, f"Missing keys: {missing_keys}")
                    return
                
                faqs = data.get("faqs", [])
                grouped = data.get("grouped", {})
                categories = data.get("categories", [])
                
                # Verify FAQ count (should have 20 items as per review request)
                if len(faqs) != 20:
                    self.log_result("Get FAQs (Public)", False, f"Expected 20 FAQs, got {len(faqs)}")
                    return
                
                # Verify each FAQ has required fields
                required_faq_fields = ["faq_id", "category", "question", "answer", "is_active"]
                for i, faq in enumerate(faqs[:3]):  # Check first 3 FAQs
                    missing_faq_fields = [field for field in required_faq_fields if field not in faq]
                    if missing_faq_fields:
                        self.log_result("Get FAQs (Public)", False, f"FAQ {i} missing fields: {missing_faq_fields}")
                        return
                
                # Verify categories structure
                if len(categories) != 5:
                    self.log_result("Get FAQs (Public)", False, f"Expected 5 categories, got {len(categories)}")
                    return
                
                self.log_result("Get FAQs (Public)", True, f"Retrieved {len(faqs)} FAQs, {len(categories)} categories, grouped by category")
            else:
                self.log_result("Get FAQs (Public)", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get FAQs (Public)", False, f"Exception: {str(e)}")

    def test_get_support_info_vip(self):
        """Test 2: GET /api/support/info (VIP user)"""
        try:
            response = self.make_request("GET", "/support/info", token=self.vip_user_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required fields
                required_fields = ["whatsapp_number", "whatsapp_url", "email", "email_subject"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Get Support Info (VIP)", False, f"Missing fields: {missing_fields}")
                    return
                
                # Verify WhatsApp number matches expected
                expected_whatsapp = "+2348169427440"
                if data.get("whatsapp_number") != expected_whatsapp:
                    self.log_result("Get Support Info (VIP)", False, f"Expected WhatsApp {expected_whatsapp}, got {data.get('whatsapp_number')}")
                    return
                
                self.log_result("Get Support Info (VIP)", True, f"WhatsApp: {data.get('whatsapp_number')}, Email: {data.get('email')}")
            else:
                self.log_result("Get Support Info (VIP)", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get Support Info (VIP)", False, f"Exception: {str(e)}")

    def test_create_support_ticket_vip(self):
        """Test 3: POST /api/support/tickets (VIP user)"""
        try:
            ticket_data = {
                "category": "technical",
                "subject": "Test support ticket",
                "message": "This is a test message for the support system"
            }
            
            response = self.make_request("POST", "/support/tickets", token=self.vip_user_token, data=ticket_data)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_fields = ["success", "ticket_id", "status"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Create Support Ticket (VIP)", False, f"Missing fields: {missing_fields}")
                    return
                
                # Verify success and status
                if not data.get("success"):
                    self.log_result("Create Support Ticket (VIP)", False, "Success field is False")
                    return
                
                if data.get("status") != "open":
                    self.log_result("Create Support Ticket (VIP)", False, f"Expected status 'open', got {data.get('status')}")
                    return
                
                # Verify ticket ID format (TKT-XXXXXXXX)
                ticket_id = data.get("ticket_id")
                if not ticket_id or not ticket_id.startswith("TKT-") or len(ticket_id) != 12:
                    self.log_result("Create Support Ticket (VIP)", False, f"Invalid ticket ID format: {ticket_id}")
                    return
                
                # Store ticket ID for later tests
                self.test_ticket_id = ticket_id
                
                self.log_result("Create Support Ticket (VIP)", True, f"Created ticket {ticket_id} with status 'open'")
            else:
                self.log_result("Create Support Ticket (VIP)", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Create Support Ticket (VIP)", False, f"Exception: {str(e)}")

    def test_get_user_tickets_vip(self):
        """Test 4: GET /api/support/tickets (VIP user)"""
        try:
            response = self.make_request("GET", "/support/tickets", token=self.vip_user_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                if "tickets" not in data:
                    self.log_result("Get User Tickets (VIP)", False, "Missing 'tickets' field")
                    return
                
                tickets = data.get("tickets", [])
                
                # Verify the new ticket appears in the list
                if self.test_ticket_id:
                    ticket_found = any(ticket.get("ticket_id") == self.test_ticket_id for ticket in tickets)
                    if not ticket_found:
                        self.log_result("Get User Tickets (VIP)", False, f"New ticket {self.test_ticket_id} not found in user's tickets")
                        return
                
                self.log_result("Get User Tickets (VIP)", True, f"Retrieved {len(tickets)} tickets, new ticket found")
            else:
                self.log_result("Get User Tickets (VIP)", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Get User Tickets (VIP)", False, f"Exception: {str(e)}")

    def test_admin_get_all_tickets(self):
        """Test 5: GET /api/admin/support/tickets (Super Admin)"""
        try:
            response = self.make_request("GET", "/admin/support/tickets", token=self.super_admin_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_fields = ["tickets", "stats"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Admin Get All Tickets", False, f"Missing fields: {missing_fields}")
                    return
                
                tickets = data.get("tickets", [])
                stats = data.get("stats", {})
                
                # Verify stats structure
                required_stats = ["total", "open", "in_progress", "resolved", "closed"]
                missing_stats = [stat for stat in required_stats if stat not in stats]
                
                if missing_stats:
                    self.log_result("Admin Get All Tickets", False, f"Missing stats: {missing_stats}")
                    return
                
                # Verify the user's ticket appears
                if self.test_ticket_id:
                    ticket_found = any(ticket.get("ticket_id") == self.test_ticket_id for ticket in tickets)
                    if not ticket_found:
                        self.log_result("Admin Get All Tickets", False, f"User ticket {self.test_ticket_id} not found in admin view")
                        return
                
                self.log_result("Admin Get All Tickets", True, f"Retrieved {len(tickets)} tickets, stats: {stats}")
            else:
                self.log_result("Admin Get All Tickets", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Admin Get All Tickets", False, f"Exception: {str(e)}")

    def test_admin_update_ticket_status(self):
        """Test 6: PUT /api/admin/support/tickets/{ticket_id}/status (Super Admin)"""
        if not self.test_ticket_id:
            self.log_result("Admin Update Ticket Status", False, "No test ticket ID available")
            return
        
        try:
            # Update ticket status to in_progress
            params = {"new_status": "in_progress"}
            response = self.make_request("PUT", f"/admin/support/tickets/{self.test_ticket_id}/status", 
                                       token=self.super_admin_token, params=params)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_fields = ["success", "ticket_id", "new_status"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Admin Update Ticket Status", False, f"Missing fields: {missing_fields}")
                    return
                
                # Verify success and new status
                if not data.get("success"):
                    self.log_result("Admin Update Ticket Status", False, "Success field is False")
                    return
                
                if data.get("new_status") != "in_progress":
                    self.log_result("Admin Update Ticket Status", False, f"Expected status 'in_progress', got {data.get('new_status')}")
                    return
                
                self.log_result("Admin Update Ticket Status", True, f"Updated ticket {self.test_ticket_id} to 'in_progress'")
            else:
                self.log_result("Admin Update Ticket Status", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Admin Update Ticket Status", False, f"Exception: {str(e)}")

    def test_admin_add_reply(self):
        """Test 7: POST /api/admin/support/tickets/{ticket_id}/reply (Super Admin)"""
        if not self.test_ticket_id:
            self.log_result("Admin Add Reply", False, "No test ticket ID available")
            return
        
        try:
            reply_data = {
                "message": "Thank you for contacting support. We're looking into this."
            }
            
            response = self.make_request("POST", f"/admin/support/tickets/{self.test_ticket_id}/reply", 
                                       token=self.super_admin_token, data=reply_data)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_fields = ["success", "reply_id"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Admin Add Reply", False, f"Missing fields: {missing_fields}")
                    return
                
                # Verify success
                if not data.get("success"):
                    self.log_result("Admin Add Reply", False, "Success field is False")
                    return
                
                reply_id = data.get("reply_id")
                self.log_result("Admin Add Reply", True, f"Added reply {reply_id} to ticket {self.test_ticket_id}")
            else:
                self.log_result("Admin Add Reply", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Admin Add Reply", False, f"Exception: {str(e)}")

    def test_admin_add_note(self):
        """Test 8: POST /api/admin/support/tickets/{ticket_id}/note (Super Admin)"""
        if not self.test_ticket_id:
            self.log_result("Admin Add Note", False, "No test ticket ID available")
            return
        
        try:
            note_data = {
                "note": "VIP customer - priority handling"
            }
            
            response = self.make_request("POST", f"/admin/support/tickets/{self.test_ticket_id}/note", 
                                       token=self.super_admin_token, data=note_data)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_fields = ["success", "note_id"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Admin Add Note", False, f"Missing fields: {missing_fields}")
                    return
                
                # Verify success
                if not data.get("success"):
                    self.log_result("Admin Add Note", False, "Success field is False")
                    return
                
                note_id = data.get("note_id")
                self.log_result("Admin Add Note", True, f"Added note {note_id} to ticket {self.test_ticket_id}")
            else:
                self.log_result("Admin Add Note", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Admin Add Note", False, f"Exception: {str(e)}")

    def test_admin_get_ticket_detail(self):
        """Test 9: GET /api/admin/support/tickets/{ticket_id} (Super Admin)"""
        if not self.test_ticket_id:
            self.log_result("Admin Get Ticket Detail", False, "No test ticket ID available")
            return
        
        try:
            response = self.make_request("GET", f"/admin/support/tickets/{self.test_ticket_id}", 
                                       token=self.super_admin_token)
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify response structure
                required_fields = ["ticket", "user_info"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_result("Admin Get Ticket Detail", False, f"Missing fields: {missing_fields}")
                    return
                
                ticket = data.get("ticket", {})
                user_info = data.get("user_info", {})
                
                # Verify ticket status is updated
                if ticket.get("status") != "in_progress":
                    self.log_result("Admin Get Ticket Detail", False, f"Expected status 'in_progress', got {ticket.get('status')}")
                    return
                
                # Verify replies array contains admin reply
                replies = ticket.get("replies", [])
                if not replies:
                    self.log_result("Admin Get Ticket Detail", False, "No replies found in ticket")
                    return
                
                # Verify admin_notes array contains internal note
                admin_notes = ticket.get("admin_notes", [])
                if not admin_notes:
                    self.log_result("Admin Get Ticket Detail", False, "No admin notes found in ticket")
                    return
                
                self.log_result("Admin Get Ticket Detail", True, f"Ticket detail retrieved with {len(replies)} replies and {len(admin_notes)} notes")
            else:
                self.log_result("Admin Get Ticket Detail", False, f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("Admin Get Ticket Detail", False, f"Exception: {str(e)}")

    def test_role_based_access_control(self):
        """Test 10: Role-Based Access Control (VIP user accessing admin endpoints)"""
        try:
            # Try accessing admin endpoint as VIP user (should return 403)
            response = self.make_request("GET", "/admin/support/tickets", token=self.vip_user_token)
            
            if response.status_code == 403:
                self.log_result("Role-Based Access Control", True, "VIP user correctly blocked from admin endpoints (403 Forbidden)")
            else:
                self.log_result("Role-Based Access Control", False, f"Expected 403, got {response.status_code}")
        except Exception as e:
            self.log_result("Role-Based Access Control", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all Help & Support System tests"""
        print("🚀 Starting Help & Support System Backend Tests")
        print("=" * 60)
        
        # Authentication tests
        if not self.authenticate_super_admin():
            print("❌ Super Admin authentication failed. Stopping tests.")
            return
        
        if not self.authenticate_vip_user():
            print("❌ VIP User authentication failed. Stopping tests.")
            return
        
        print("\n📋 Running Help & Support System Tests:")
        print("-" * 40)
        
        # Core functionality tests
        self.test_get_faqs_public()
        self.test_get_support_info_vip()
        self.test_create_support_ticket_vip()
        self.test_get_user_tickets_vip()
        self.test_admin_get_all_tickets()
        self.test_admin_update_ticket_status()
        self.test_admin_add_reply()
        self.test_admin_add_note()
        self.test_admin_get_ticket_detail()
        self.test_role_based_access_control()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY: {self.passed} passed, {self.failed} failed")
        
        if self.failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['message']}")
        
        return self.failed == 0

def main():
    """Main test execution"""
    runner = TestRunner()
    success = runner.run_all_tests()
    
    if success:
        print("\n🎉 All Help & Support System tests passed!")
        sys.exit(0)
    else:
        print(f"\n💥 {runner.failed} test(s) failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()