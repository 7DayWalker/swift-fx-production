# Swift FX In-App Purchases (IAP) Setup Guide

## Overview

Swift FX uses native Apple App Store and Google Play subscriptions for mobile users.
The backend validates all purchases and is the source of truth for subscription status.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    iOS/Android   │────▶│   Swift FX API   │────▶│    Apple/Google  │
│      Client      │     │     Backend      │     │       APIs       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                        │
        │ 1. Purchase            │ 3. Validate receipt
        │                        │ 4. Acknowledge (Google)
        ▼                        ▼
   Apple/Google              MongoDB
   Store Purchase           (User subscription)
```

## Product IDs

### iOS (App Store Connect)
- `swiftfx_premium_monthly` - Premium subscription
- `swiftfx_vip_monthly` - VIP subscription

### Android (Google Play Console)
- `swiftfx_premium_monthly` - Premium subscription
- `swiftfx_vip_monthly` - VIP subscription

---

## Backend Configuration

### Environment Variables (.env)

```bash
# Apple App Store
APPLE_SHARED_SECRET=""        # From App Store Connect
APPLE_BUNDLE_ID="com.swiftfx.app"
APPLE_ENVIRONMENT="sandbox"   # "sandbox" or "production"

# Apple App Store Server API (optional, for advanced features)
APPLE_KEY_ID=""              # From App Store Connect
APPLE_ISSUER_ID=""
APPLE_PRIVATE_KEY=""

# Google Play
GOOGLE_PACKAGE_NAME="com.swiftfx.app"
GOOGLE_SERVICE_ACCOUNT_JSON="" # Base64 encoded service account JSON

# IAP Product IDs (configurable)
IOS_PREMIUM_MONTHLY_ID="swiftfx_premium_monthly"
IOS_VIP_MONTHLY_ID="swiftfx_vip_monthly"
ANDROID_PREMIUM_MONTHLY_ID="swiftfx_premium_monthly"
ANDROID_VIP_MONTHLY_ID="swiftfx_vip_monthly"
```

---

## Apple App Store Setup

### 1. Create Products in App Store Connect

1. Go to **App Store Connect** → **My Apps** → **Swift FX**
2. Navigate to **Monetization** → **Subscriptions**
3. Create a Subscription Group: "Swift FX Premium"
4. Add subscriptions:
   - **swiftfx_premium_monthly** (Premium - Monthly)
   - **swiftfx_vip_monthly** (VIP - Monthly)
5. Set prices, localization, and review information

### 2. Get Shared Secret

1. In App Store Connect, go to **App Information**
2. Scroll to **App-Specific Shared Secret**
3. Click **Manage** and copy the secret
4. Add to `.env`: `APPLE_SHARED_SECRET="your_secret"`

### 3. Configure Server Notifications (Webhooks)

1. In App Store Connect, go to **App Information**
2. Scroll to **App Store Server Notifications**
3. Enter Production URL: `https://your-domain.com/api/webhooks/apple`
4. Enter Sandbox URL: `https://your-domain.com/api/webhooks/apple`
5. Select **Version 2 Notifications**

### 4. Sandbox Testing

1. Create Sandbox testers in **Users and Access** → **Sandbox**
2. On test device, sign out of App Store
3. Sign in with sandbox account
4. Make test purchases

---

## Google Play Setup

### 1. Create Products in Google Play Console

1. Go to **Google Play Console** → **Swift FX**
2. Navigate to **Monetization** → **Products** → **Subscriptions**
3. Create subscriptions:
   - **swiftfx_premium_monthly** (Premium - Monthly)
   - **swiftfx_vip_monthly** (VIP - Monthly)
4. Set prices, grace periods, and base plans

### 2. Create Service Account

1. Go to **Google Cloud Console**
2. Create a new project or select existing
3. Enable **Google Play Android Developer API**
4. Go to **IAM & Admin** → **Service Accounts**
5. Create service account with **Editor** role
6. Create JSON key and download
7. Base64 encode: `base64 -i service-account.json`
8. Add to `.env`: `GOOGLE_SERVICE_ACCOUNT_JSON="base64_encoded_json"`

### 3. Link Service Account to Play Console

1. In **Google Play Console**, go to **Setup** → **API Access**
2. Link Google Cloud Project
3. Add service account with **Admin** permissions

### 4. Configure Real-Time Developer Notifications (RTDN)

1. In Google Play Console, go to **Monetization setup**
2. Scroll to **Real-time developer notifications**
3. Create a Pub/Sub topic in Google Cloud
4. Enter topic name
5. Set up Cloud Function or webhook to receive notifications

#### Option A: Direct Webhook (Recommended)
Use Cloud Functions to forward to your backend:

```javascript
// Cloud Function
exports.handlePlayNotification = async (message, context) => {
  const response = await fetch('https://your-domain.com/api/webhooks/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message })
  });
};
```

### 5. Testing

1. Add license testers in **Setup** → **License testing**
2. Use a test account that's a license tester
3. Make test purchases (will not be charged)

---

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/iap/products` | GET | Get product IDs for client |

### Authenticated Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/iap/apple/verify` | POST | Validate Apple receipt |
| `/api/iap/apple/restore` | POST | Restore Apple purchases |
| `/api/iap/google/verify` | POST | Validate Google purchase |
| `/api/iap/google/restore` | POST | Restore Google purchases |
| `/api/iap/status` | GET | Get user's IAP status |
| `/api/iap/transactions` | GET | Get transaction history |

### Webhook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/apple` | POST | Apple Server Notifications |
| `/api/webhooks/google` | POST | Google RTDN |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/iap/transactions` | GET | List all transactions |
| `/api/admin/iap/stats` | GET | IAP statistics |

---

## Purchase Flow

### iOS Flow

```
1. User taps "Subscribe to Premium"
2. App calls RNIap.requestSubscription()
3. Apple presents native purchase sheet
4. User authenticates (Face ID/password)
5. Apple processes payment
6. App receives receipt
7. App sends receipt to POST /api/iap/apple/verify
8. Backend validates with Apple servers
9. Backend updates user subscription in MongoDB
10. Backend returns success
11. App finishes transaction
12. App refreshes user state
```

### Android Flow

```
1. User taps "Subscribe to Premium"
2. App calls RNIap.requestSubscription()
3. Google presents native purchase sheet
4. User authenticates
5. Google processes payment
6. App receives purchase token
7. App sends token to POST /api/iap/google/verify
8. Backend validates with Google Play API
9. Backend acknowledges purchase (required)
10. Backend updates user subscription in MongoDB
11. Backend returns success
12. App refreshes user state
```

---

## Subscription Lifecycle

### States

| State | Description | User Access |
|-------|-------------|-------------|
| `active` | Valid, paid subscription | ✅ Full access |
| `grace_period` | Payment failed, retrying | ✅ Full access |
| `on_hold` | Payment failed, paused | ❌ Limited |
| `cancelled` | User cancelled, not yet expired | ✅ Until expiry |
| `expired` | Subscription ended | ❌ Free tier |

### Webhook Events (Auto-handled)

**Apple:**
- `INITIAL_BUY` - New subscription
- `DID_RENEW` - Renewed
- `EXPIRED` - Expired
- `DID_CHANGE_RENEWAL_STATUS` - Auto-renew toggled
- `REFUND` - Refunded

**Google:**
- `SUBSCRIPTION_PURCHASED` - New subscription
- `SUBSCRIPTION_RENEWED` - Renewed
- `SUBSCRIPTION_EXPIRED` - Expired
- `SUBSCRIPTION_CANCELED` - Cancelled
- `SUBSCRIPTION_REVOKED` - Access revoked

---

## Security Rules

1. **Never** unlock features client-side
2. **Always** validate receipts server-side
3. **Never** hardcode prices in app
4. **Always** use HTTPS for API calls
5. **Never** store raw receipts long-term
6. **Always** acknowledge Google purchases within 3 days

---

## Troubleshooting

### Common Issues

**"Cannot connect to iTunes Store"**
- Check internet connection
- Verify sandbox account is properly configured
- Restart device

**"Product not found"**
- Verify product IDs match App Store Connect exactly
- Check agreements are signed in App Store Connect
- Wait 24 hours after creating products

**"Validation failed"**
- Verify shared secret is correct
- Check sandbox vs production environment
- Verify bundle ID matches

**Google "Purchase not acknowledged"**
- Check service account permissions
- Verify API is enabled in Cloud Console
- Check acknowledgement is called within 3 days

---

## Testing Checklist

- [ ] Sandbox purchase completes (iOS)
- [ ] License test purchase completes (Android)
- [ ] Receipt validates on backend
- [ ] User subscription updates correctly
- [ ] Restore purchases works
- [ ] Manage subscription opens native screen
- [ ] Expired subscription downgrades user
- [ ] Webhook receives renewal events
- [ ] Admin dashboard shows transactions

---

## Files Modified

### Backend
- `/app/backend/.env` - IAP configuration
- `/app/backend/server.py` - IAP endpoints and validation

### Frontend
- `/app/frontend/src/services/iapService.ts` - IAP service
- `/app/frontend/app/subscription.tsx` - Updated UI

---

## Support

For IAP issues:
- Apple: developer.apple.com/contact
- Google: play.google.com/console/support

For Swift FX issues:
- Email: support@swiftfx.app
