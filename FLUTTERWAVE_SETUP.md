# Flutterwave Integration — Setup Checklist

Apple IAP and Google Play Billing are **untouched**. Flutterwave is enabled
only on Android sideloaded builds (APK / Xiaomi / Samsung).

## 1) Railway environment variables (backend)

Set these on the production backend service in Railway → **Variables**:

| Key | Value | Notes |
|---|---|---|
| `FLW_SECRET_KEY` | `FLWSECK-...` (live) | From Flutterwave Dashboard → Settings → API keys (Live mode). |
| `FLW_SECRET_HASH` | `<generate-with-openssl-rand-base64-48>` | **Generate a fresh secret (`openssl rand -base64 48`) and never commit it.** Paste the SAME value into Flutterwave dashboard. |
| `FLW_BASE_URL` | `https://api.flutterwave.com/v3` | Optional — defaults to this when unset. |
| `FLW_REDIRECT_URL` | `https://swift-fx-production-production.up.railway.app/api/payments/flutterwave/redirect` | Optional — defaults to this when unset. |

> If you'd rather use your own random hash, just generate one and use the same value
> in both Flutterwave dashboard and Railway.

## 2) Flutterwave Dashboard configuration

1. **Live mode → Settings → API**: copy the **Secret Key** into `FLW_SECRET_KEY` (Railway).
2. **Live mode → Settings → Webhooks**:
   - **Webhook URL** → `https://swift-fx-production-production.up.railway.app/api/payments/flutterwave/webhook`
   - **Secret Hash** → paste the same value you stored in `FLW_SECRET_HASH`
3. Make sure the merchant account is set up to **accept USD payments globally** (Card method is the only one enabled by the integration).

## 3) EAS build profiles (frontend)

Add `EXPO_PUBLIC_ENABLE_FLUTTERWAVE` and optionally
`EXPO_PUBLIC_DISTRIBUTION_CHANNEL` to the build profiles that should expose
Flutterwave. Example `eas.json` snippet:

```json
{
  "build": {
    "production-apk": {
      "extends": "production",
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_ENABLE_FLUTTERWAVE": "true",
        "EXPO_PUBLIC_DISTRIBUTION_CHANNEL": "android_apk"
      }
    },
    "production-xiaomi": {
      "extends": "production",
      "distribution": "internal",
      "android": { "buildType": "app-bundle" },
      "env": {
        "EXPO_PUBLIC_ENABLE_FLUTTERWAVE": "true",
        "EXPO_PUBLIC_DISTRIBUTION_CHANNEL": "xiaomi"
      }
    },
    "production-samsung": {
      "extends": "production",
      "distribution": "internal",
      "android": { "buildType": "app-bundle" },
      "env": {
        "EXPO_PUBLIC_ENABLE_FLUTTERWAVE": "true",
        "EXPO_PUBLIC_DISTRIBUTION_CHANNEL": "samsung"
      }
    }
  }
}
```

The default `production` profile (Apple + Play) leaves the var **unset**, so
Flutterwave is hidden on iOS and Google Play automatically.

> When you want to re-enable Flutterwave on Google Play later, simply add
> `EXPO_PUBLIC_ENABLE_FLUTTERWAVE=true` to the Play profile — no code change.

## 4) MongoDB index (one-time, run once)

The backend already inserts into `payment_transactions`. To enforce idempotency
on `tx_ref`, run once against the production MongoDB:

```js
db.payment_transactions.createIndex({ "tx_ref": 1 }, { unique: true })
db.payment_transactions.createIndex({ "user_id": 1, "created_at": -1 })
```

## 5) Verification

Once deployed:

```bash
# Sanity — landing page should load (200)
curl -i 'https://swift-fx-production-production.up.railway.app/api/payments/flutterwave/redirect?status=successful&tx_ref=test'

# Webhook should reject unsigned requests
curl -i -X POST 'https://swift-fx-production-production.up.railway.app/api/payments/flutterwave/webhook' \
  -H 'Content-Type: application/json' -d '{"event":"charge.completed"}'
# Expected: HTTP/1.1 401 Unauthorized   (because signature header is missing)
```

End-to-end test (use a sideloaded APK or a build with the env var set):
1. Sign in as a free user.
2. Open Subscription → tap **Pay with Card** on any plan.
3. Complete checkout on Flutterwave's hosted page using a test card.
4. App polls status → activates subscription → updates badge/feature gating.
