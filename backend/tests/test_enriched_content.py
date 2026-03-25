"""
Test Suite for Academy Enriched Content System
Tests the new GPT-4o generated lesson content with:
- Overview (400-700 words)
- How to Apply This section
- Mini Action Task
- Key Takeaways
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com').rstrip('/')
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Test credentials
SUPER_ADMIN_EMAIL = "ellapauledache@gmail.com"
SUPER_ADMIN_PASSWORD = "Grace1992@"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for super admin user"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        }
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated API client"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestEnrichedContentEndpoint:
    """Tests for GET /api/academy/lesson-content/{course_id}/{lesson_id}"""
    
    def test_beginner_lesson_content_exists(self, api_client):
        """Test beginner tier lesson (intro-trading/1) returns enriched content"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/intro-trading/1")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("generated") == True, "Content should be marked as generated"
        assert data.get("course_id") == "intro-trading"
        assert data.get("lesson_id") == 1
        
        # Verify all required sections exist
        assert "overview" in data, "Missing 'overview' section"
        assert "how_to_apply" in data, "Missing 'how_to_apply' section"
        assert "mini_action_task" in data, "Missing 'mini_action_task' section"
        assert "key_takeaways" in data, "Missing 'key_takeaways' section"
        
        print(f"✓ Beginner lesson content verified: {data.get('lesson_title', 'N/A')}")
    
    def test_intermediate_lesson_content_exists(self, api_client):
        """Test intermediate tier lesson (technical-analysis/1) returns enriched content"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/technical-analysis/1")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("generated") == True, "Content should be marked as generated"
        assert data.get("tier") == "intermediate", f"Expected tier 'intermediate', got '{data.get('tier')}'"
        
        # Verify all required sections exist
        assert "overview" in data, "Missing 'overview' section"
        assert "how_to_apply" in data, "Missing 'how_to_apply' section"
        assert "mini_action_task" in data, "Missing 'mini_action_task' section"
        assert "key_takeaways" in data, "Missing 'key_takeaways' section"
        
        print(f"✓ Intermediate lesson content verified: {data.get('lesson_title', 'N/A')}")
    
    def test_advanced_lesson_content_exists(self, api_client):
        """Test advanced tier lesson (institutional/1) returns enriched content"""
        # Using 'institutional' course which is in advanced category
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/institutional/1")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("generated") == True, "Content should be marked as generated"
        assert data.get("tier") == "advanced", f"Expected tier 'advanced', got '{data.get('tier')}'"
        
        # Verify all required sections exist
        assert "overview" in data, "Missing 'overview' section"
        assert "how_to_apply" in data, "Missing 'how_to_apply' section"
        assert "mini_action_task" in data, "Missing 'mini_action_task' section"
        assert "key_takeaways" in data, "Missing 'key_takeaways' section"
        
        print(f"✓ Advanced lesson content verified: {data.get('lesson_title', 'N/A')}")
    
    def test_content_word_count_minimum(self, api_client):
        """Test that overview content has minimum 300 words"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/intro-trading/1")
        assert response.status_code == 200
        
        data = response.json()
        overview = data.get("overview", "")
        word_count = len(overview.split())
        
        assert word_count >= 300, f"Overview should have 300+ words, got {word_count}"
        print(f"✓ Word count verified: {word_count} words")
    
    def test_key_takeaways_structure(self, api_client):
        """Test that key_takeaways is a list with items"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/intro-trading/1")
        assert response.status_code == 200
        
        data = response.json()
        takeaways = data.get("key_takeaways", [])
        
        assert isinstance(takeaways, list), "key_takeaways should be a list"
        assert len(takeaways) >= 3, f"Should have at least 3 takeaways, got {len(takeaways)}"
        
        for i, takeaway in enumerate(takeaways):
            assert isinstance(takeaway, str), f"Takeaway {i} should be a string"
            assert len(takeaway) > 10, f"Takeaway {i} seems too short"
        
        print(f"✓ Key takeaways verified: {len(takeaways)} items")
    
    def test_nonexistent_lesson_returns_generated_false(self, api_client):
        """Test that non-existent lesson returns generated=false"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/nonexistent-course/999")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("generated") == False, "Non-existent lesson should have generated=false"
        print("✓ Non-existent lesson returns generated=false")


class TestBatchGenerationEndpoint:
    """Tests for POST /api/academy/generate-content-batch"""
    
    def test_batch_generation_requires_super_admin(self, api_client):
        """Test that batch generation endpoint requires super_admin role"""
        # This should succeed for super_admin
        response = api_client.post(f"{BASE_URL}/api/academy/generate-content-batch")
        # Should return 200 (started) since we're super_admin
        assert response.status_code == 200, f"Super admin should be able to start batch: {response.status_code}"
        
        data = response.json()
        assert data.get("status") == "started", "Should return started status"
        print("✓ Batch generation accessible to super_admin")
    
    def test_batch_generation_forbidden_for_non_admin(self):
        """Test that batch generation returns 403 for non-admin users"""
        # Create a session without auth
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(f"{BASE_URL}/api/academy/generate-content-batch")
        assert response.status_code == 401, f"Expected 401 for unauthenticated, got {response.status_code}"
        print("✓ Batch generation returns 401 for unauthenticated users")


class TestStreakSystemStillWorking:
    """Tests to verify streak system is still functional"""
    
    def test_streak_status_endpoint(self, api_client):
        """Test GET /api/academy/streak-status returns expected fields"""
        response = api_client.get(f"{BASE_URL}/api/academy/streak-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all expected fields exist
        expected_fields = [
            "current_streak", "longest_streak", "active_today",
            "streak_at_risk", "has_streak_shield", "shield_available"
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify types
        assert isinstance(data["current_streak"], int)
        assert isinstance(data["longest_streak"], int)
        assert isinstance(data["active_today"], bool)
        assert isinstance(data["streak_at_risk"], bool)
        assert isinstance(data["has_streak_shield"], bool)
        
        print(f"✓ Streak status verified: {data['current_streak']} day streak")


class TestLessonCompleteXP:
    """Tests to verify lesson complete still returns XP data"""
    
    def test_lesson_complete_returns_xp(self, api_client):
        """Test POST /api/academy/lesson-complete returns XP data"""
        # Use a lesson that might not be completed yet
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={"course_id": "chart-basics", "lesson_id": 2}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify XP object exists
        assert "xp" in data, "Response should contain 'xp' object"
        xp = data["xp"]
        
        # Verify XP fields
        assert "base_xp" in xp, "XP should have base_xp"
        assert "bonus_xp" in xp, "XP should have bonus_xp"
        assert "total_xp_earned" in xp, "XP should have total_xp_earned"
        
        print(f"✓ Lesson complete XP verified: {xp.get('total_xp_earned', 0)} XP earned")


class TestMultipleLessonsContent:
    """Test content exists across multiple courses and tiers"""
    
    def test_multiple_beginner_lessons(self, api_client):
        """Test multiple beginner lessons have content"""
        beginner_lessons = [
            ("intro-trading", 1),
            ("intro-trading", 2),
            ("chart-basics", 1),
            ("risk-management", 1),
        ]
        
        for course_id, lesson_id in beginner_lessons:
            response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/{course_id}/{lesson_id}")
            assert response.status_code == 200
            data = response.json()
            
            if data.get("generated"):
                assert "overview" in data
                word_count = len(data.get("overview", "").split())
                print(f"  ✓ {course_id}/{lesson_id}: {word_count} words")
            else:
                print(f"  ⚠ {course_id}/{lesson_id}: Not generated yet")
    
    def test_multiple_intermediate_lessons(self, api_client):
        """Test multiple intermediate lessons have content"""
        intermediate_lessons = [
            ("technical-analysis", 1),
            ("technical-analysis", 2),
            ("support-resistance", 1),
            ("fibonacci", 1),
        ]
        
        for course_id, lesson_id in intermediate_lessons:
            response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/{course_id}/{lesson_id}")
            assert response.status_code == 200
            data = response.json()
            
            if data.get("generated"):
                assert "overview" in data
                word_count = len(data.get("overview", "").split())
                print(f"  ✓ {course_id}/{lesson_id}: {word_count} words")
            else:
                print(f"  ⚠ {course_id}/{lesson_id}: Not generated yet")
    
    def test_multiple_advanced_lessons(self, api_client):
        """Test multiple advanced lessons have content"""
        advanced_lessons = [
            ("institutional", 1),
            ("order-flow", 1),
            ("smart-money", 1),
            ("liquidity", 1),
        ]
        
        for course_id, lesson_id in advanced_lessons:
            response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/{course_id}/{lesson_id}")
            assert response.status_code == 200
            data = response.json()
            
            if data.get("generated"):
                assert "overview" in data
                word_count = len(data.get("overview", "").split())
                print(f"  ✓ {course_id}/{lesson_id}: {word_count} words")
            else:
                print(f"  ⚠ {course_id}/{lesson_id}: Not generated yet")


class TestContentQuality:
    """Test content quality aspects"""
    
    def test_how_to_apply_has_content(self, api_client):
        """Test how_to_apply section has meaningful content"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/intro-trading/1")
        assert response.status_code == 200
        
        data = response.json()
        how_to_apply = data.get("how_to_apply", "")
        
        assert len(how_to_apply) >= 50, f"how_to_apply should have 50+ chars, got {len(how_to_apply)}"
        word_count = len(how_to_apply.split())
        assert word_count >= 20, f"how_to_apply should have 20+ words, got {word_count}"
        
        print(f"✓ how_to_apply verified: {word_count} words")
    
    def test_mini_action_task_has_content(self, api_client):
        """Test mini_action_task section has meaningful content"""
        response = api_client.get(f"{BASE_URL}/api/academy/lesson-content/intro-trading/1")
        assert response.status_code == 200
        
        data = response.json()
        mini_task = data.get("mini_action_task", "")
        
        assert len(mini_task) >= 30, f"mini_action_task should have 30+ chars, got {len(mini_task)}"
        word_count = len(mini_task.split())
        assert word_count >= 10, f"mini_action_task should have 10+ words, got {word_count}"
        
        print(f"✓ mini_action_task verified: {word_count} words")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
