# Auth Testing Playbook

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('swiftfx_db');
var visitorId = 'user_' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: visitorId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  role: 'free',
  created_at: new Date()
});
print('User ID: ' + visitorId);
"
```

## Step 2: Test Backend API
```bash
# Test registration
curl -X POST "http://localhost:8001/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com", "password": "test123"}'

# Test login
curl -X POST "http://localhost:8001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'
```
