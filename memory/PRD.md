# Swift FX Signals - Product Requirements Document

## Original Problem Statement
Professional trading signals mobile app (Expo SDK 54 + React Native) with FastAPI backend, MongoDB data store, and Supabase authentication. Production-grade cross-platform subscription system with iOS/Android In-App Purchases.

## Architecture
- **Frontend**: Expo SDK 54, Expo Router v6, React 19.1.0, Reanimated v4.1.1, react-native-iap
- **Backend**: FastAPI + MongoDB (signals, iap_transactions) + Supabase (auth, profiles)
- **Auth**: Supabase auth with RBAC (Super Admin, Admin, User roles)
- **Payments**: In-App Purchase only (Stripe removed). iOS + Android IAP configured.
- **Config**: Supabase credentials in frontend/.env as EXPO_PUBLIC_* variables

## Monetization Model (LOCKED)
- **PREMIUM**: Premium Forex Signals, Advanced insights, 10 AI analyses/week
- **VIP**: VIP Signals + Premium included, Unlimited AI, Academy, Fund Management
- VIP > Premium. VIP inherits all Premium access.

## Official Product IDs
```
com.swiftfx.signals.premium.weekly
com.swiftfx.signals.premium.monthly
com.swiftfx.signals.premium.yearly
com.swiftfx.signals.vip.weekly
com.swiftfx.signals.vip.monthly
com.swiftfx.signals.vip.yearly
```

## Entitlement Authority
- Backend `/api/subscription/status` is the ONLY authority
- Entitlement derived strictly from MongoDB `iap_transactions`
- No Supabase profile.role fallback for subscription tier
- `is_admin` is separate from subscription entitlement
- Frontend must NOT unlock content based on local purchase state

## What's Been Implemented

### P0 Verification (Feb 22, 2026)
- [x] Dependencies installed (yarn install)
- [x] Supabase credentials verified
- [x] Metro bundler compilation successful
- [x] Supabase initializes without crash
- [x] Backend APIs confirmed working
- [x] Frontend renders correctly

### Phase 1 — Backend IAP System (Feb 22, 2026)
- [x] IAP_PRODUCT_IDS: 6 official SKUs replacing legacy 2-SKU config
- [x] IAP_PRODUCTS_BY_TIER: tier/cycle mapping
- [x] `/api/iap/products`: Returns all 6 SKUs + tier groupings
- [x] `/api/subscription/status`: Backend-authoritative from MongoDB only
- [x] `get_plan_from_product_id()`: Handles new + legacy IDs
- [x] Removed stale env vars for old product IDs
- [x] Tests: 22/22 passed

### Phase 2 — Frontend IAP Service (Feb 22, 2026)
- [x] `iapService.native.ts`: Full rewrite with 6 SKUs
- [x] Purchase flow: requestSubscription → purchaseUpdatedListener → verifyWithBackend → finishTransaction
- [x] Listener guard: registered once, cleaned up on endIAP()
- [x] Restore: VIP prioritized over Premium when multiple purchases exist
- [x] Android: selectAndroidOfferToken() prefers base plan offer
- [x] Failed verification does NOT consume transaction

### Phase 3 — SubscriptionContext + Subscription Screen (Feb 22, 2026)
- [x] `SubscriptionContext.tsx`: Uses only `/api/subscription/status`, no Supabase queries
- [x] `subscription.tsx`: Fetches plans from `/api/subscription/plans`
- [x] Removed Supabase import from subscription screen
- [x] Removed PaymentSession/pendingSessions (legacy Stripe)
- [x] Added legal compliance: Terms, Privacy, auto-renew disclosure
- [x] Purchase passes selectedCycle to IAPService
- [x] Tests: 22/22 backend + 100% frontend passed

## Prioritized Backlog

### P1 — Full IAP End-to-End Test
- Build native APK via EAS
- Test purchase flow on Android internal testing
- Test purchase flow on iOS TestFlight
- Verify receipt validation with Apple/Google
- Test restore purchases
- Test subscription expiry/cancellation

### P2 — Production Infrastructure
- Persistent backend domain
- FCM/APNs production push notification credentials
- OAuth production redirect URLs
- Store console product configuration verification

### P3 — Investment Tier Features
- Fund management features
- Investor dashboard enhancements
- Fund performance tracking

### P4 — Admin Operational Enhancements
- Admin management improvements
- Support ticket system
- Referral tracking

## Key Technical Decisions
- Backend is authoritative for subscriptions (MongoDB iap_transactions)
- No Stripe (IAP only)
- No insecure IAP webhooks
- No local entitlement fallback
- No process.env for Supabase in frontend
- Expo configuration unified
- Super Admin emails: ellapauledache@gmail.com, ellaniswell@gmail.com

## Test Credentials
- VIP test user: paradoxella@gmail.com / Grace1992@
- Admin user: ellapauledache@gmail.com / Grace1992@
