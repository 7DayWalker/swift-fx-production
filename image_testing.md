# Image Testing Playbook

## Image Handling Rules
- Always use base64-encoded images for all tests and requests
- Accepted formats: JPEG, PNG, WEBP only
- Do not use SVG, BMP, HEIC, or other formats
- Every image must contain real visual features

## Test AI Analysis
```bash
# First get auth token
TOKEN=$(curl -s -X POST "http://localhost:8001/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}' | jq -r '.token')

# Test AI usage endpoint
curl -X GET "http://localhost:8001/api/ai/usage" \
  -H "Authorization: Bearer $TOKEN"
```
