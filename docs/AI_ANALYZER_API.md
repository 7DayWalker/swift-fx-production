# AI Analyzer - Supabase Edge Function API Documentation

## Overview

The AI Analyzer is implemented as a Supabase Edge Function (`ai-analyze`) that provides AI-powered chart analysis using GPT-4o-mini via the OpenAI-compatible API.

## Deployment

The Edge Function is located at:
```
/app/supabase/functions/ai-analyze/index.ts
```

### Environment Variables Required (in Supabase Dashboard)

Set these in your Supabase project under Edge Functions → Secrets:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your Emergent LLM Key (obtain from profile settings) |

Note: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are automatically available in Edge Functions.

## API Contract

### Endpoint

```
POST https://<project-ref>.supabase.co/functions/v1/ai-analyze
```

### Request Headers

```http
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

### Request Body

```json
{
  "prompt": "Describe the chart pattern you see or ask a question",
  "pair": "EUR/USD",          // Optional, defaults to "Unknown"
  "timeframe": "H1",          // Optional, defaults to "Unknown"
  "image_base64": "..."       // Optional, base64-encoded image (PNG recommended)
}
```

### Success Response (200)

```json
{
  "success": true,
  "analysis_id": "uuid-of-stored-analysis",
  "pair": "EUR/USD",
  "timeframe": "H1",
  "market_bias": "Bullish",
  "trend_structure": "Price is in a clear uptrend with higher highs and higher lows...",
  "support_levels": ["1.0850", "1.0800"],
  "resistance_levels": ["1.0950", "1.1000"],
  "trade_insight": "Consider long entries on pullbacks to 1.0850 support...",
  "confidence": "High",
  "remaining_analyses": 9,
  "weekly_limit": 10,
  "disclaimer": "This analysis is AI-generated and for educational purposes only...",
  "created_at": "2025-06-15T10:30:00.000Z"
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Missing or invalid authorization header"
}
```

#### 429 Too Many Requests (Quota Exceeded)
```json
{
  "error": "Weekly AI analysis limit reached",
  "limit": 3,
  "used": 3,
  "remaining": 0,
  "resets_at": "2025-06-22T00:00:00.000Z",
  "upgrade_message": "Upgrade to Premium for 10 analyses/week or VIP for unlimited."
}
```

#### 400 Bad Request
```json
{
  "error": "Prompt is required"
}
```

#### 502 Bad Gateway (AI Service Error)
```json
{
  "error": "AI analysis failed",
  "details": "OpenAI API error message"
}
```

## Usage Limits

| Tier | Weekly Limit |
|------|--------------|
| Free | 3 |
| Premium | 10 |
| VIP | Unlimited |
| Admin | Unlimited |

### Reset Logic

- Weekly usage counter resets every 7 days from the user's `ai_weekly_reset` timestamp
- Counter automatically resets when the 7-day window expires
- Reset timestamp is stored in `profiles.ai_weekly_reset`

## Database Schema

### Table: `ai_analyses`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to `profiles.id` |
| `prompt` | TEXT | User's analysis prompt (max 2000 chars stored) |
| `response` | TEXT | JSON-stringified AI response |
| `model` | VARCHAR(50) | LLM model used (default: `gpt-4o-mini`) |
| `tokens_used` | INTEGER | Total tokens consumed |
| `created_at` | TIMESTAMPTZ | Timestamp of analysis |

### Table: `profiles` (Usage Tracking Columns)

| Column | Type | Description |
|--------|------|-------------|
| `ai_weekly_used` | INTEGER | Number of analyses used this week |
| `ai_weekly_reset` | TIMESTAMPTZ | Timestamp when weekly counter was last reset |

## RLS Policies

- Users can read their own analyses (`auth.uid() = user_id`)
- Admins can read all analyses (`get_my_role() = 'admin'`)
- Edge Function inserts via service role (bypasses RLS)

## Frontend Integration Example

```typescript
import { supabase } from '../services/supabase';

async function analyzeChart(prompt: string, pair: string, timeframe: string, imageBase64?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-analyze`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        pair,
        timeframe,
        image_base64: imageBase64,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Analysis failed');
  }

  return response.json();
}
```

## Testing with cURL

```bash
# Get a valid access token first by logging in
TOKEN="your_supabase_access_token"

# Call the Edge Function
curl -X POST \
  'https://hrzghlqcfccnmgcipxxo.supabase.co/functions/v1/ai-analyze' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I see a double bottom pattern forming with RSI divergence",
    "pair": "EUR/USD",
    "timeframe": "H4"
  }'
```

## Deployment Instructions

1. **Ensure database schema is applied**:
   - Run `/app/docs/step8_ai_analyzer_schema.sql` in Supabase SQL Editor

2. **Set Edge Function secrets**:
   - Go to Supabase Dashboard → Edge Functions → Secrets
   - Add `OPENAI_API_KEY` with value: `sk-emergent-d262e87B959A8757cB`

3. **Deploy the Edge Function**:
   ```bash
   # From project root
   supabase functions deploy ai-analyze --project-ref hrzghlqcfccnmgcipxxo
   ```

4. **Verify deployment**:
   - Go to Supabase Dashboard → Edge Functions
   - Confirm `ai-analyze` function is listed and active
