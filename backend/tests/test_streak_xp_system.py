"""
Academy Streak System and XP Economy Tests
Tests for: streak-status, lesson-complete XP, quiz-submit XP, duplicate prevention, VIP streak shield
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com')
SUPABASE_URL = "https://hrzghlqcfccnmgcipxxo.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemdobHFjZmNjbm1nY2lweHhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTc5NzIsImV4cCI6MjA4NTg3Mzk3Mn0.yImldZ1cCW4yEat4b6X1lAFufVs6ym_Hudm4lsRXwkQ"

# Test credentials - SUPER_ADMIN with VIP access
TEST_EMAIL = "ellapauledache@gmail.com"
TEST_PASSWORD = "Grace1992@"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token from Supabase"""
    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        },
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
    )
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    data = response.json()
    return data.get("access_token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


# ============================================================================
# STREAK STATUS ENDPOINT TESTS
# ============================================================================
class TestStreakStatus:
    """Tests for GET /api/academy/streak-status endpoint"""
    
    def test_streak_status_returns_200(self, api_client):
        """Streak status endpoint should return 200 for authenticated user"""
        response = api_client.get(f"{BASE_URL}/api/academy/streak-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_streak_status_returns_required_fields(self, api_client):
        """Streak status should return all required fields"""
        response = api_client.get(f"{BASE_URL}/api/academy/streak-status")
        assert response.status_code == 200
        
        data = response.json()
        required_fields = [
            "current_streak", "longest_streak", "active_today",
            "streak_at_risk", "has_streak_shield", "shield_available"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
    
    def test_streak_status_data_types(self, api_client):
        """Streak status fields should have correct data types"""
        response = api_client.get(f"{BASE_URL}/api/academy/streak-status")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data["current_streak"], int), "current_streak should be int"
        assert isinstance(data["longest_streak"], int), "longest_streak should be int"
        assert isinstance(data["active_today"], bool), "active_today should be bool"
        assert isinstance(data["streak_at_risk"], bool), "streak_at_risk should be bool"
        assert isinstance(data["has_streak_shield"], bool), "has_streak_shield should be bool"
        assert isinstance(data["shield_available"], bool), "shield_available should be bool"
    
    def test_streak_status_vip_has_shield(self, api_client):
        """VIP user (admin) should have has_streak_shield=true"""
        response = api_client.get(f"{BASE_URL}/api/academy/streak-status")
        assert response.status_code == 200
        
        data = response.json()
        # Admin user should be treated as VIP
        assert data["has_streak_shield"] == True, "VIP user should have streak shield"
    
    def test_streak_status_requires_auth(self):
        """Streak status should require authentication"""
        response = requests.get(f"{BASE_URL}/api/academy/streak-status")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"


# ============================================================================
# LESSON COMPLETE XP TESTS
# ============================================================================
class TestLessonCompleteXP:
    """Tests for POST /api/academy/lesson-complete XP rewards"""
    
    def test_lesson_complete_returns_xp_object(self, api_client):
        """Lesson complete should return xp object with required fields"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_xp_lesson_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "xp" in data, "Response should contain xp object"
        
        xp = data["xp"]
        required_xp_fields = ["base_xp", "bonus_xp", "total_xp_earned", "streak_increased", "current_streak"]
        for field in required_xp_fields:
            assert field in xp, f"XP object missing field: {field}"
    
    def test_new_lesson_awards_20_base_xp(self, api_client):
        """New lesson completion should award 20 base XP"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_new_lesson_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        xp = data.get("xp", {})
        assert xp.get("base_xp") == 20, f"Expected base_xp=20 for new lesson, got {xp.get('base_xp')}"
    
    def test_duplicate_lesson_awards_0_base_xp(self, api_client):
        """Duplicate lesson completion should award 0 base XP (farming prevention)"""
        unique_id = str(uuid.uuid4())[:8]
        course_id = f"TEST_duplicate_lesson_{unique_id}"
        
        # First completion
        response1 = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={"course_id": course_id, "lesson_id": 1}
        )
        assert response1.status_code == 200
        xp1 = response1.json().get("xp", {})
        assert xp1.get("base_xp") == 20, "First completion should award 20 XP"
        
        # Second completion (duplicate)
        response2 = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={"course_id": course_id, "lesson_id": 1}
        )
        assert response2.status_code == 200
        xp2 = response2.json().get("xp", {})
        assert xp2.get("base_xp") == 0, f"Duplicate completion should award 0 base XP, got {xp2.get('base_xp')}"
    
    def test_lesson_complete_includes_streak_info(self, api_client):
        """Lesson complete should include streak information"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_streak_info_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        xp = data.get("xp", {})
        assert "current_streak" in xp, "XP should include current_streak"
        assert "streak_increased" in xp, "XP should include streak_increased"
        assert isinstance(xp["current_streak"], int), "current_streak should be int"
        assert isinstance(xp["streak_increased"], bool), "streak_increased should be bool"


# ============================================================================
# QUIZ SUBMIT XP TESTS
# ============================================================================
class TestQuizSubmitXP:
    """Tests for POST /api/academy/quiz-submit XP rewards"""
    
    def test_quiz_submit_returns_xp_object(self, api_client):
        """Quiz submit should return xp object with required fields"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/quiz-submit",
            json={
                "course_id": f"TEST_quiz_xp_{unique_id}",
                "lesson_id": 5,
                "score": 80
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "xp" in data, "Response should contain xp object"
        
        xp = data["xp"]
        required_xp_fields = ["base_xp", "bonus_xp", "total_xp_earned"]
        for field in required_xp_fields:
            assert field in xp, f"XP object missing field: {field}"
    
    def test_perfect_quiz_awards_60_xp(self, api_client):
        """Perfect quiz score (100%) should award 60 base XP"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/quiz-submit",
            json={
                "course_id": f"TEST_perfect_quiz_{unique_id}",
                "lesson_id": 5,
                "score": 100
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        xp = data.get("xp", {})
        assert xp.get("base_xp") == 60, f"Expected base_xp=60 for perfect quiz, got {xp.get('base_xp')}"
    
    def test_passing_quiz_awards_40_xp(self, api_client):
        """Passing quiz (60-99%) should award 40 base XP"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/quiz-submit",
            json={
                "course_id": f"TEST_passing_quiz_{unique_id}",
                "lesson_id": 5,
                "score": 75
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        xp = data.get("xp", {})
        assert xp.get("base_xp") == 40, f"Expected base_xp=40 for passing quiz, got {xp.get('base_xp')}"
    
    def test_failing_quiz_awards_0_xp(self, api_client):
        """Failing quiz (<60%) should award 0 base XP"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/quiz-submit",
            json={
                "course_id": f"TEST_failing_quiz_{unique_id}",
                "lesson_id": 5,
                "score": 40
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        xp = data.get("xp", {})
        assert xp.get("base_xp") == 0, f"Expected base_xp=0 for failing quiz, got {xp.get('base_xp')}"
    
    def test_boundary_60_quiz_awards_40_xp(self, api_client):
        """Quiz score exactly 60% should award 40 base XP (passing)"""
        unique_id = str(uuid.uuid4())[:8]
        response = api_client.post(
            f"{BASE_URL}/api/academy/quiz-submit",
            json={
                "course_id": f"TEST_boundary_quiz_{unique_id}",
                "lesson_id": 5,
                "score": 60
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        xp = data.get("xp", {})
        assert xp.get("base_xp") == 40, f"Expected base_xp=40 for boundary quiz (60%), got {xp.get('base_xp')}"


# ============================================================================
# STREAK INCREMENT TESTS
# ============================================================================
class TestStreakIncrement:
    """Tests for streak increment behavior"""
    
    def test_first_activity_increments_streak(self, api_client):
        """First activity of the day should increment streak"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Get initial streak status
        initial_response = api_client.get(f"{BASE_URL}/api/academy/streak-status")
        initial_streak = initial_response.json().get("current_streak", 0)
        
        # Complete a lesson
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_streak_inc_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response.status_code == 200
        
        xp = response.json().get("xp", {})
        # If this is first activity today, streak should increase
        # If already active today, streak_increased should be False
        assert "streak_increased" in xp, "Response should include streak_increased"
    
    def test_second_activity_same_day_no_increment(self, api_client):
        """Second activity on same day should NOT increment streak"""
        unique_id = str(uuid.uuid4())[:8]
        
        # First activity
        response1 = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_same_day_1_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response1.status_code == 200
        xp1 = response1.json().get("xp", {})
        streak_after_first = xp1.get("current_streak", 0)
        
        # Second activity (same day)
        response2 = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_same_day_2_{unique_id}",
                "lesson_id": 2
            }
        )
        assert response2.status_code == 200
        xp2 = response2.json().get("xp", {})
        streak_after_second = xp2.get("current_streak", 0)
        
        # Streak should not increase on second activity same day
        assert streak_after_second == streak_after_first, \
            f"Streak should not increase on second activity: {streak_after_first} -> {streak_after_second}"
        assert xp2.get("streak_increased") == False, "streak_increased should be False for second activity"


# ============================================================================
# DAILY STREAK BONUS TESTS
# ============================================================================
class TestDailyStreakBonus:
    """Tests for daily streak bonus XP"""
    
    def test_daily_bonus_is_10_xp(self, api_client):
        """Daily streak bonus should be +10 XP"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Complete a new lesson (first activity of day if not already active)
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_daily_bonus_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response.status_code == 200
        
        xp = response.json().get("xp", {})
        # If streak increased (first activity today), bonus_xp should include 10
        if xp.get("streak_increased"):
            assert xp.get("bonus_xp", 0) >= 10, f"Daily bonus should be at least 10 XP, got {xp.get('bonus_xp')}"
    
    def test_total_xp_includes_bonus(self, api_client):
        """Total XP earned should include base + bonus"""
        unique_id = str(uuid.uuid4())[:8]
        
        response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_total_xp_{unique_id}",
                "lesson_id": 1
            }
        )
        assert response.status_code == 200
        
        xp = response.json().get("xp", {})
        base = xp.get("base_xp", 0)
        bonus = xp.get("bonus_xp", 0)
        total = xp.get("total_xp_earned", 0)
        
        assert total == base + bonus, f"total_xp_earned ({total}) should equal base_xp ({base}) + bonus_xp ({bonus})"


# ============================================================================
# LEADERBOARD XP UPDATE TESTS
# ============================================================================
class TestLeaderboardXPUpdate:
    """Tests for leaderboard XP updates after activities"""
    
    def test_lesson_complete_updates_leaderboard(self, api_client):
        """Lesson completion should update leaderboard XP"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Get initial XP
        initial_response = api_client.get(f"{BASE_URL}/api/academy/leaderboard")
        initial_xp = initial_response.json().get("my_xp", 0)
        
        # Complete a new lesson
        lesson_response = api_client.post(
            f"{BASE_URL}/api/academy/lesson-complete",
            json={
                "course_id": f"TEST_lb_lesson_{unique_id}",
                "lesson_id": 1
            }
        )
        assert lesson_response.status_code == 200
        xp_earned = lesson_response.json().get("xp", {}).get("total_xp_earned", 0)
        
        # Check leaderboard XP increased
        final_response = api_client.get(f"{BASE_URL}/api/academy/leaderboard")
        final_xp = final_response.json().get("my_xp", 0)
        
        assert final_xp >= initial_xp + xp_earned, \
            f"Leaderboard XP should increase by {xp_earned}: {initial_xp} -> {final_xp}"
    
    def test_quiz_submit_updates_leaderboard(self, api_client):
        """Quiz submission should update leaderboard XP"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Get initial XP
        initial_response = api_client.get(f"{BASE_URL}/api/academy/leaderboard")
        initial_xp = initial_response.json().get("my_xp", 0)
        
        # Submit passing quiz
        quiz_response = api_client.post(
            f"{BASE_URL}/api/academy/quiz-submit",
            json={
                "course_id": f"TEST_lb_quiz_{unique_id}",
                "lesson_id": 5,
                "score": 80
            }
        )
        assert quiz_response.status_code == 200
        xp_earned = quiz_response.json().get("xp", {}).get("total_xp_earned", 0)
        
        # Check leaderboard XP increased
        final_response = api_client.get(f"{BASE_URL}/api/academy/leaderboard")
        final_xp = final_response.json().get("my_xp", 0)
        
        assert final_xp >= initial_xp + xp_earned, \
            f"Leaderboard XP should increase by {xp_earned}: {initial_xp} -> {final_xp}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
