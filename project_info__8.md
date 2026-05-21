# Swift FX — Announcement Popup (Investigation-Only) — System Mapping

## Scope / Goal
Investigate only what already exists for the **backend announcement service** and identify the **safest low-regression frontend integration point** for a lightweight “show once” dismissible announcement popup modal.  
**No implementation, no redesign.** This document is mapping + integration risk analysis only.

---

## A) Existing Announcement Backend

### A1) Mongo model + schema/response contract
**File:** `backend/models/schemas.py`

- **Create model:** `AppAnnouncementCreate`
  - `title: str`
  - `message: str`
  - `version: str`
  - `cta_url: Optional[str] = None`
  - `active: bool = True`

- **Read model:** `AppAnnouncementRead`
  - `id: str`
  - `title: str`
  - `message: str`
  - `version: str`
  - `cta_url: Optional[str]`
  - `active: bool`
  - `created_at: datetime`

**Meaning:** the UI can rely on a stable `id` for “show once” persistence, plus `title/message/version` for display, and `cta_url/version` for any “update app” CTA.

### A2) Routes, indexes, and “one active announcement”
**File:** `backend/api/routes/announcement.py`

- Collection: `_COLLECTION_NAME = "app_announcements"`

- Indexes:
  - `active` index (`idx_app_announcements_active`)
  - `created_at` index (`idx_app_announcements_created_at`)

- “One-active-announcement” behavior is enforced **at publish time**, not in the database:
  - In `publish_announcement(payload.active == True)` it runs:
    - `update_many({"active": True}, {"$set": {"active": False}})`
  - Then inserts the new announcement doc with `active: payload.active` and `created_at = now`.

**Implication:** at read time there should be at most one document with `active: True`.

### A3) Exact read endpoint(s) for “latest active”
The backend provides two equivalent “latest active announcement” endpoints:

1. **GET** `/api/announcements/active`  
2. **GET** `/api/admin/app-announcements/latest-active`

Both return the normalized result of:
- `find_one({"active": True}, sort=[("created_at", -1)])`

**Response shape**: `Optional[AppAnnouncementRead]` normalized via `_normalize_announcement()`:
- Converts Mongo `_id` → `id` (string)
- Ensures `created_at` is tz-aware (adds UTC tzinfo if missing)

### A4) Exact publish endpoints (admin)
Admin publishing:

- **POST** `/api/admin/app-announcements`  
  - Calls `admin_publish_app_announcement(...)` and then `publish_announcement(...)`

- **POST** `/api/admin/announcements/publish`  
  - Calls `publish_announcement(...)` directly

**Request payload:** `AppAnnouncementCreate` (`title`, `message`, `version`, optional `cta_url`, `active`).

### A5) Push payload emitted on active publish (important for popup gating)
When `payload.active` is true, `publish_announcement()` triggers push + admin notification:

- `send_notification(...)` is called with:
  - `data.type = "app_announcement"`
  - `data.cta_url` (may be null)
  - `data.version`
  - `data.announcement_id = normalized["id"]`

**Meaning for the popup:** the push payload already contains the minimum fields a show-once modal needs to decide whether it’s already dismissed (`announcement_id`) and whether it should offer an update CTA (`cta_url`).

---

## B) Existing Announcement Frontend

### B1) Admin announcement publisher UI exists
**File:** `frontend/app/(admin)/app-announcements.tsx`

This screen is a simple publisher:
- collects `title`, `version`, `message`
- calls `POST /admin/app-announcements` with `{ title, version, message, active: true }`

**Meaning:** admin can activate an announcement and backend will enforce one-active-announcement and emit push.

### B2) Push notification framework exists, but does not handle `app_announcement`
**File:** `frontend/src/services/notificationService.ts`

- The global listener setup installs:
  - `receivedListener = addNotificationReceivedListener(...)` (currently only logs)
  - `responseListener = addNotificationResponseReceivedListener(...)`

- On notification tap (`responseListener`):
  - Reads `const data = response.notification.request.content.data;`
  - Navigates only when `data?.type === 'new_signal'`
  - **No branch exists for `data.type === "app_announcement"`**

**Implication:** even though backend emits announcement pushes with `data.type = "app_announcement"`, today the app will ignore those payloads (no popup, no routing).

### B3) Auth/layout routing stabilization exists and is the safest global “after login” gate
**File:** `frontend/app/_layout.tsx`

- `RootLayoutContent` decides navigation after auth state resolves:
  - while `isLoading` is true: it returns early (prevents navigation races)
  - when resolved:
    - if `isPasswordRecovery` → `router.replace('/reset-password')`
    - else if `user` → `router.replace('/(tabs)/dashboard')`
    - else → `router.replace('/(auth)/login')`

**Implication:** popup logic should not run before this resolution, or it risks interfering with OAuth recovery, deep links, and navigation restoration.

### B4) Existing announcement modal component NOT found
Expected file name(s) per earlier references (e.g. `frontend/src/components/AppAnnouncementModal.tsx`) were **not present** in the actual component inventory during this investigation:
- `frontend/src/components/` contains only:
  - `ComingSoonGate.tsx`, `InsightCard.tsx`, `InsightViewer.tsx`, etc., plus `ads/` and `ui/`
- Earlier reads for `frontend/src/components/AppAnnouncementModal.tsx` failed due to missing path.

**Implication:** the “popup modal not implemented yet” status appears accurate.

---

## C) Safest Frontend Popup Trigger Point (low-regression)

Given:
- there is no existing popup UI,
- push tap handler currently only navigates for `new_signal`,
- and `_layout.tsx` already provides a single deterministic “auth stabilization gate”,

### Best integration point (safest)
**File:** `frontend/app/_layout.tsx`  
**Trigger moment:** after `isLoading` becomes false and the redirect decision is made (inside the existing `useEffect` in `RootLayoutContent`).

**Why this is safest:**
- ensures auth/session is known (no chance of modal rendering during OAuth recovery/restoration),
- avoids competing with navigation replacement logic,
- keeps popup display orthogonal to most feature screens.

### Secondary option (higher integration coupling)
**File:** `frontend/src/services/notificationService.ts`  
**Trigger moment:** inside `responseListener` when `data.type === "app_announcement"`.

**Why it’s riskier:**
- notification tap processing timing is independent of the layout navigation effect,
- modal rendering may conflict with router transitions.

---

## D) Existing Modal / Styling Patterns

During the investigation, no existing announcement popup component was found to copy.

However, the app’s current “dark card” styling palette is consistent across admin UI:
- Background: `#0A0E17`
- Card: `#1A1F2E`
- Borders: `#2A2F3E`
- Accent/button: `#D97706` and/or `#00D4AA`

**Recommendation (investigation-only):** future popup overlay should reuse these exact palette values to match existing design language with minimal UI surprises.

---

## E) Safest Local Persistence Strategy (AsyncStorage)

### Existing AsyncStorage usage pattern
**File:** `frontend/src/services/notificationService.ts`  
Uses AsyncStorage with simple string keys like:
- `@notification_enabled`
- `@calendar_notification_enabled`
- `@push_token`

No announcement-specific persistence keys were found in the areas inspected.

### Persistence strategy for show-once
Use AsyncStorage directly (no wrapper discovered for announcements during this investigation):
- Key: `@dismissed_app_announcement_id`
- Optional: `@dismissed_app_announcement_dismissed_at`

**Show logic:**
- fetch latest active announcement (`/api/announcements/active`)
- compare `latest.id` against stored dismissed id
- show popup only when they differ

**Failure policy (minimal risk):**
- if fetch fails → do not show modal (fail closed)
- if storage read fails → do not show modal (fail closed)

---

## F) Announcement Modal Behavior (minimal-risk behavioral strategy)

1. **Show-once**
   - Show only when latest active `announcement.id` != stored dismissed id

2. **Dismiss persistence**
   - on dismiss, store `latest.id` as dismissed id

3. **Repeat prevention**
   - if same announcement remains active later, it stays dismissed

4. **Offline handling**
   - fail closed (no modal) on fetch/storage errors unless you explicitly add caching (not discovered today)

5. **Failure fallback**
   - never block routing, OAuth, or deep-link flow; popup must be best-effort and non-blocking

---

## G) Exact Files Involved (likely minimal implementation surface)
**Backend (already exists; no new endpoints required):**
- `backend/api/routes/announcement.py`
- `backend/models/schemas.py`

**Frontend (likely integration points for a future implementation):**
- `frontend/app/_layout.tsx` (safest trigger after auth stabilization)
- `frontend/src/services/notificationService.ts` (optional, if supporting tap-to-show behavior)
- likely a new popup component file under `frontend/src/components/` or `frontend/src/components/ui/` (not found during this investigation)

**Potentially needed persistence:**
- direct AsyncStorage in the popup logic (no existing announcement wrapper found)

---

## H) Risk Assessment

- **Backend risk: low**
  - endpoints and push payload already exist; stable `announcement_id` is included in push data.

- **Frontend risk: medium-high**
  - no existing modal/popup implementation found,
  - notification handling currently ignores `app_announcement`,
  - improper insertion point could interfere with auth restoration/navigation.

- **Integration risk (highest):**
  - rendering the popup during OAuth/deep-link restoration while `_layout.tsx` is still redirecting.

---

## I) Minimal Implementation Surface Recommendation (investigation-only)

To implement later with minimal regression risk:
1. Add a show-once decision flow in `frontend/app/_layout.tsx` after `isLoading` resolves and redirect decisions are complete.
2. Fetch latest active announcement via one read endpoint:
   - `GET /api/announcements/active`
3. Store/retrieve dismissed id in AsyncStorage using one key.
4. Render a lightweight overlay modal only when needed.
5. Optionally extend `notificationService.ts` to also show the popup when a push tap has `data.type === "app_announcement"` (but this is slightly riskier than layout-gated showing).