# Swift FX Production — PRD

## Original Problem Statement
Repository setup, verification, and iterative feature development on the Swift FX mobile trading signals app (Expo/React Native + FastAPI + Supabase + MongoDB).

## Architecture
- **Frontend**: Expo/React Native (TypeScript), Expo Router, react-native-iap v14
- **Backend**: FastAPI (Python), deployed on Railway
- **Auth**: Supabase Auth (email/password + OAuth)
- **Database**: Supabase (profiles, auth), MongoDB (device_tokens, iap_transactions, signals)
- **Push**: Expo Push → FCM (Android) / APNs (iOS)
- **IAP**: Google Play Billing (via react-native-iap v14 Nitro), Apple StoreKit
- **Charts**: TradingView WebView embed with signal overlays

## What's Been Implemented

### Session 1 — Repository & Infrastructure
- Cloned `swift-fx-production` from GitHub, verified 6,294 files match `origin/main`
- Hard reset to clean mirror of remote `main`
- Created `muriel` branch, implemented changes, merged via fast-forward, cleaned up

### Android Notification Branding
- Added `android.largeIcon` to push notification payload (Supabase-hosted SwiftFX logo)
- Added `notification.icon` + `notification.color` to `app.json` Android config
- Created `notification-icon.png` (white silhouette, transparent background)

### Firebase Push Fix
- Swapped Expo FCM v1 credentials from wrong project (`swift-fx-signals`) to correct (`swift-fx-89f91`)
- Deleted old key, uploaded new service account, validated via `/api/debug/android-push-trace`

### Password Recovery Flow (End-to-End)
- Added `redirectTo: 'swiftfx://auth'` to `resetPasswordForEmail`
- Created `app/reset-password.tsx` screen with password update + logout flow
- Moved ALL deep link handling from `auth.tsx` to `AuthContext` (fixes race condition)
- Cold start: `getInitialURL()` processed before routing; Runtime: `addEventListener` in AuthContext
- `isLoading` blocks `_layout.tsx` routing until deep link processing completes
- `auth.tsx` reduced to minimal passthrough screen

### Notification Preferences (Full Stack)
- Unified backend to read/write `notification_preferences` (not `notification_settings`)
- Frontend settings screen now calls `PUT /settings/notifications` on toggle change
- Push service enforces `push_enabled` global override before per-category checks
- `notification_settings` deprecated (not deleted)

### In-App TradingView Charts
- Created `app/chart.tsx` with full-screen WebView loading TradingView widget embed
- Dashboard watchlist now opens charts in-app via `router.push('/chart?symbol=...')`
- Fallback to external browser on WebView error

### Signal Overlay System
- `SignalOverlay.tsx`: Floating card showing signal type, entry, SL, TPs with dismiss + "View Signal" action
- `SignalLinesOverlay.tsx`: Horizontal price lines (Entry=blue, SL=red, TP=green) over WebView
- Current-price-anchored positioning with adaptive padding (tight→3.5×, normal→2.5×, wide→2.0×)
- Out-of-range indicators (green tint above, red tint below)
- Symbol-change auto-reset, smart signal selection (active preferred, then most recent)

### Timestamp Fix (Global)
- Backend: `UTCJsonEncoder` + `UTCJSONResponse` as default — all datetimes serialized with `Z`
- Frontend: Removed all `parseUTC()` hacks — `new Date()` works correctly with UTC strings
- All timezones display correctly worldwide

### IAP v14 Migration
- Rewrote `iapService.native.ts` for react-native-iap v14 API:
  - `getSubscriptions()` → `fetchProducts({ type: 'subs' })`
  - `requestSubscription()` → `requestPurchase({ type: 'subs', request: { apple/google } })`
  - `product.productId` → `product.id`, `localizedPrice` → `displayPrice`
- Added `react-native-iap` config plugin + `expo-build-properties` (Kotlin 2.1.20) to `app.json`
- Fixed race condition: `isIAPAvailable()` gate removed from `subscription.tsx`
- Android fallback: individual SKU fetch if batch returns empty

### Purchase Verification Event System
- `onPurchaseVerified` callback: fires after successful backend verification
- `onPurchaseVerificationFailed` callback: fires on rejection, network error, missing receipt
- `SubscriptionContext` subscribes to both → immediate UI refresh or error alert
- Removed `setTimeout` blind refresh from subscription screen

### Restore Purchases
- `restorePurchases()` fires `onPurchaseVerified` callbacks for immediate UI update
- Auto-restore on startup: if user is `free` tier + IAP available, silently checks device
- Manual restore via button on subscription screen

### Subscription Downgrade Protection
- `should_update_subscription()` guard on both Apple and Google verify endpoints
- Tier priority: vip(2) > premium(1) > free(0)
- Upgrades/renewals: always allowed
- Downgrades: only if higher tier is confirmed expired
- Missing expiry treated as active (blocks downgrade)
- `on_user_subscription_change` referral hook only fires when profile actually updates

### Swift Insights — Admin Media Upload Pipeline (Feb 2026)
- Replaced manual URL inputs with on-device file pickers via `expo-image-picker`
- Added `expo-video-thumbnails` for auto first-frame thumbnail generation
- Added `expo-file-system` (legacy API) for base64→ArrayBuffer reads on RN
- Created `frontend/src/services/storageUploader.ts` (Supabase upload helper, size/duration limits)
- Rewrote `frontend/app/(admin)/insights.tsx` with:
  - "Select Video from device" → uploads to bucket `swift-insights-videos`
  - Auto-generated thumbnail (first frame) → uploads to `swift-insights-thumbnails` (manual override available)
  - Live preview, "Auto-generated" badge, file size/duration validation (50 MB · 60 s · 8 MB thumb)
- Created `/app/SUPABASE_INSIGHTS_SETUP.md` with bucket creation + RLS policy SQL

## Prioritized Backlog
- **P0**: User runs the SQL in `/app/SUPABASE_INSIGHTS_SETUP.md` to create the two storage buckets
- **P0**: EAS Build with `--clear-cache` for native IAP linking + new media-picker libs (`expo-image-picker`, `expo-video-thumbnails`, `expo-file-system`)
- **P1**: Monitor push delivery rates post-Firebase fix across all 16 Android tokens
- **P2**: Add scheduled push health-check (daily silent push to canary device)
- **P2**: Bulk push test across full Android device fleet
- **P3**: Consider `googleServiceAccountKeyForSubmissions` for Play Store submissions

## Next Tasks
1. **Create the Supabase storage buckets** using SQL in `/app/SUPABASE_INSIGHTS_SETUP.md`
2. Run `eas build --platform android --clear-cache` (or `--platform all`) to ship IAP + new media pickers
3. Test admin Insight creation end-to-end: pick video → auto thumbnail → submit → appears in feed
4. Test full purchase flow end-to-end on Android closed testing
5. Validate restore purchases on fresh install
6. Test password recovery deep link on both cold start and runtime
7. Verify notification preferences toggle persists and filters push correctly
