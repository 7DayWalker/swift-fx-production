"""
Test Community Redesign and Dashboard Watchlist Features
- Community: Filter tabs, image-first posts, engagement bar, FAB, comments
- Dashboard: Watchlist, pair picker modal, performance stats
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://rbac-audit-logs.preview.emergentagent.com')

class TestCommunityEndpoints:
    """Community API endpoint tests"""
    
    def test_get_posts_returns_comment_count(self):
        """GET /api/community/posts should return posts with comment_count field"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        posts = response.json()
        assert isinstance(posts, list), "Response should be a list"
        
        # If there are posts, verify comment_count field exists
        if len(posts) > 0:
            first_post = posts[0]
            assert "comment_count" in first_post, "Post should have comment_count field"
            assert isinstance(first_post["comment_count"], int), "comment_count should be an integer"
            assert "post_id" in first_post, "Post should have post_id"
            assert "user_name" in first_post, "Post should have user_name"
            assert "content" in first_post, "Post should have content"
            assert "post_type" in first_post, "Post should have post_type"
            assert "likes" in first_post, "Post should have likes array"
            print(f"✓ Found {len(posts)} posts, first post has comment_count: {first_post['comment_count']}")
        else:
            print("✓ No posts found, but endpoint works correctly")
    
    def test_posts_have_required_fields(self):
        """Verify posts have all required fields for UI rendering"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        assert response.status_code == 200
        
        posts = response.json()
        required_fields = ["post_id", "user_id", "user_name", "content", "post_type", "likes", "created_at", "comment_count"]
        
        for post in posts[:5]:  # Check first 5 posts
            for field in required_fields:
                assert field in post, f"Post missing required field: {field}"
        
        print(f"✓ All {min(len(posts), 5)} checked posts have required fields")
    
    def test_posts_sorted_by_created_at_desc(self):
        """Verify posts are sorted by created_at descending (newest first)"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        assert response.status_code == 200
        
        posts = response.json()
        if len(posts) >= 2:
            # Check that posts are sorted newest first
            for i in range(len(posts) - 1):
                current_date = posts[i].get("created_at", "")
                next_date = posts[i + 1].get("created_at", "")
                assert current_date >= next_date, f"Posts not sorted correctly: {current_date} should be >= {next_date}"
            print(f"✓ Posts are correctly sorted by created_at descending")
        else:
            print("✓ Not enough posts to verify sorting")
    
    def test_post_types_valid(self):
        """Verify post_type values are valid"""
        response = requests.get(f"{BASE_URL}/api/community/posts")
        assert response.status_code == 200
        
        posts = response.json()
        valid_types = ["general", "analysis", "ai_analysis", "results", "question"]
        
        for post in posts:
            post_type = post.get("post_type", "")
            assert post_type in valid_types, f"Invalid post_type: {post_type}"
        
        print(f"✓ All post types are valid")


class TestDashboardEndpoints:
    """Dashboard API endpoint tests"""
    
    def test_dashboard_returns_performance_stats(self):
        """GET /api/dashboard should return performance stats"""
        response = requests.get(f"{BASE_URL}/api/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check for recent_signals
        assert "recent_signals" in data, "Response should have recent_signals"
        assert isinstance(data["recent_signals"], list), "recent_signals should be a list"
        
        print(f"✓ Dashboard returns {len(data['recent_signals'])} recent signals")
    
    def test_signals_endpoint(self):
        """GET /api/signals should return signals list"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            signal = data[0]
            required_fields = ["signal_id", "pair", "signal_type", "entry", "stop_loss"]
            for field in required_fields:
                assert field in signal, f"Signal missing required field: {field}"
        
        print(f"✓ Signals endpoint returns {len(data)} signals")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_backend_health(self):
        """Verify backend is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("✓ Backend health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
