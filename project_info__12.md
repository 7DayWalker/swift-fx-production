# Swift FX — Admin Support Ticket Notification Investigation (Observation Mode)

## Summary
Swift FX already has a support/ticket system fully implemented in the backend (MongoDB) with user-facing and admin-facing APIs. When a user creates a support ticket, the backend already creates an **admin-targeted in-app notification record** in MongoDB (`admin_notifications`) for `super_admin` and `customer_support` roles. The codebase also has a centralized Expo push notification system, but it is currently designed for **signals** (preference-keyed, not role-targeted), and there is no obvious existing email/SMS notification mechanism in the backend.

## Architecture
- **Backend**: FastAPI application (`backend/main.py`) exposing REST endpoints under `/api`.
  - Data persistence: MongoDB collections accessed via `core.database` (`db`).
  - Authentication/roles: Supabase JWT decoding + Supabase “profiles” used to construct a `models.schemas.User` object (`core/dependencies.py`).
- **Notification subsystems**:
  1. **In-app admin notifications** stored in MongoDB collection `admin_notifications` and exposed via admin endpoints (`backend/api/routes/admin.py`).
  2. **Expo push notifications** stored/sent via MongoDB device tokens (`device_tokens`) and preferences from Supabase profile (`backend/services/push_notifications.py`).
- **Frontend**: Expo Router React Native app.
  - User support is in `frontend/app/help-support.tsx`.
  - Admin ticket management is in `frontend/app/(admin)/support-tickets.tsx`.

## Directory Structure (relevant slices)
```txt
project-root/
├── backend/
│   ├── main.py                              — FastAPI app + router registration + startup indexes
│   ├── api/routes/
│   │   ├── support.py                      — Support ticket endpoints (user + admin)
│   │   ├── admin.py                        — Admin endpoints incl. admin notifications + audit
│   │   ├── subscriptions.py              — Device token registration + notification preferences update
│   │   └── (others)
│   ├── services/
│   │   ├── admin.py                        — create_admin_notification + audit logging
│   │   └── push_notifications.py          — Expo push dispatcher (signals-focused)
│   └── core/
│       ├── dependencies.py                — get_current_user / require_admin
│       └── database.py                    — Mongo client handle (db)
│
└── frontend/
    ├── app/
    │   ├── help-support.tsx              — user support/ticket UI
    │   └── (admin)/
    │       ├── support-tickets.tsx       — admin support ticket UI
    │       └── dashboard.tsx
    └── src/services/
        └── notificationService.ts       — Expo notifications setup + token registration trigger
```

## Key Abstractions

### 1) Support Tickets API (User + Admin)
- **Files**:
  - `backend/api/routes/support.py`
- **Responsibility**: Defines the ticket data model and the lifecycle endpoints.
- **Interface** (key endpoints):
  - `POST /api/support/tickets` → creates a new ticket for current user.
  - `GET /api/support/tickets` → list tickets for current user.
  - `GET /api/support/tickets/{ticket_id}` → details for current user.
  - `GET /api/admin/support/tickets` → list all tickets for admins.
  - `GET /api/admin/support/tickets/{ticket_id}` → admin details incl. user info.
  - `PUT /api/admin/support/tickets/{ticket_id}/status` → update ticket status.
  - `POST /api/admin/support/tickets/{ticket_id}/note` → internal admin notes.
  - `POST /api/admin/support/tickets/{ticket_id}/reply` → user-visible replies.
- **Lifecycle**:
  - Ticket is created in MongoDB collection `support_tickets`.
  - Status transitions are tracked via `status`, `updated_at`, and `resolved_at`/`closed_at` fields.
- **Used by**:
  - User UI: `frontend/app/help-support.tsx`
  - Admin UI: `frontend/app/(admin)/support-tickets.tsx`
  - Admin notifications: `backend/services/admin.py` via `create_admin_notification()`.

### 2) Admin In-App Notification Record
- **File**: `backend/services/admin.py`
- **Responsibility**: Creates notification records targeted to admin roles (stored in MongoDB).
- **Interface**:
  - `create_admin_notification(target_roles, notification_type, title, message, resource_id=None)`
    - Inserts into `db.admin_notifications`.
    - Sets `target_roles` and empty `read_by` list.
- **Lifecycle**:
  - Created at event time (e.g., ticket creation).
  - Later consumed by admin clients via `/api/admin/notifications` and marked read via `/api/admin/notifications/{id}/read`.
- **Used by**:
  - Ticket creation: `backend/api/routes/support.py`
  - Other admin events (admins created, announcements published, etc.).

### 3) Admin Notification Retrieval / Read Tracking
- **File**: `backend/api/routes/admin.py`
- **Responsibility**: Exposes admin notifications to authenticated admins.
- **Interface**:
  - `GET /api/admin/notifications?unread_only=...`
    - For non-super-admins, filters on `target_roles` = their `admin_role`.
    - For super-admins, sees all.
  - `PUT /api/admin/notifications/{notification_id}/read`
    - Adds the current admin’s `user_id` to `read_by` (idempotent via `$addToSet`).
- **Lifecycle**:
  - Notification becomes “read” per-admin when they call the read endpoint.
- **Used by**:
  - Not currently visible in frontend search results; the backend functionality exists regardless.

### 4) Role Identification / Auth Gate
- **File**: `backend/core/dependencies.py`
- **Responsibility**: Creates the `User` object and enforces admin access.
- **Interface**:
  - `get_current_user(authorization)` decodes Supabase JWT and loads Supabase profile.
  - `require_auth` → requires valid Supabase session.
  - `require_admin` → allows users whose profile role is admin/super_admin and `admin_enabled` is true.
- **Important detail**:
  - Admin authorization uses `user.role` (from Supabase profile) and `admin_enabled`.
  - Admin-specific routing then checks `admin.admin_role` (e.g., `customer_support`, `super_admin`) in the support/ticket endpoints.

### 5) Expo Push Notification Dispatcher (Signals-focused)
- **File**: `backend/services/push_notifications.py`
- **Responsibility**: Central push dispatcher using:
  - `db.device_tokens` (active tokens)
  - Supabase profile `notification_preferences` (category toggles)
  - Expo endpoints (`https://exp.host/--/api/v2/push/send`)
- **Interface**:
  - `send_notification(title, body, data, preference_key="signals", check_engine_config=True)`
- **Lifecycle & constraints**:
  - Not designed around admin roles.
  - It targets all users who have active tokens and whose preference allows the `preference_key`.
  - Includes `enriched_data` so Android background handlers can show a notification.
- **Used by**:
  - Signal event notifications (wrapper functions like `notify_new_signal`, etc.)
  - App announcements publish flow (`backend/api/routes/announcement.py` uses it with `preference_key="promotions"`)

### 6) Device Token Registration + Preferences Update
- **File**: `backend/api/routes/subscriptions.py`
- **Responsibility**: Registers `ExponentPushToken` device tokens per authenticated user.
- **Interface**:
  - `POST /api/notifications/register-token` (requires auth)
  - `PUT /api/notifications/preferences` (requires auth)
- **Important detail**:
  - Token registration deactivates the same physical token across other users to prevent duplicated sends.

### 7) Push Notification Client Setup (Frontend)
- **File**: `frontend/src/services/notificationService.ts`
- **Responsibility**:
  - Requests notification permissions.
  - Obtains Expo push token.
  - Calls backend `/notifications/register-token`.
  - Adds listeners for notification taps (navigation logic for `new_signal`).
- **Important detail**:
  - Tap handling currently only navigates for `data.type === 'new_signal'` (so ticket push payload routing is not implemented).

## Data Flow

1. **User opens Help & Support screen**
   - `frontend/app/help-support.tsx` loads FAQs, support info, and the user’s tickets via:
     - `GET /api/support/faqs`
     - `GET /api/support/info`
     - `GET /api/support/tickets`

2. **User submits a new support ticket**
   - UI calls:
     - `POST /api/support/tickets` with payload `{ category, subject, message }`.

3. **Backend persists ticket**
   - `backend/api/routes/support.py#create_support_ticket`:
     - Generates `ticket_id = "TKT-" + uuid...`
     - Inserts full ticket document into `db.support_tickets`.

4. **Backend creates admin in-app notification record**
   - Still inside `create_support_ticket`, backend calls:
     - `create_admin_notification(target_roles=[SUPER_ADMIN, CUSTOMER_SUPPORT], notification_type="new_support_ticket", title="New Support Ticket", message="New ticket from ...", resource_id=ticket_id)`

5. **Admin staff view ticket list and details**
   - Admin UI calls:
     - `GET /api/admin/support/tickets`
     - `GET /api/admin/support/tickets/{ticket_id}`
   - Admin can update status, add notes, and reply:
     - `PUT /api/admin/support/tickets/{ticket_id}/status?new_status=...`
     - `POST /api/admin/support/tickets/{ticket_id}/note`
     - `POST /api/admin/support/tickets/{ticket_id}/reply`

## Non-Obvious Behaviors & Design Decisions

### Existing “admin notification” is in-app and role-targeted; push is not
- Ticket creation already creates an entry in MongoDB `admin_notifications` targeted by `target_roles`.
- There is **no corresponding push dispatch** in `create_support_ticket`.
- This means “admins/staff will be notified” only if something in the admin UI fetches `/api/admin/notifications` and surfaces it visually.

### Push notifications exist but are category/preference keyed (signals/prog/promos)
- `send_notification()` filters recipients by:
  - active tokens in `device_tokens`
  - Supabase `notification_preferences`
  - and a global engine config flag
- It is not set up to target admin roles specifically; it would send to all users who have `preference_key` enabled.

### No SMTP/email implementation found
- A search for typical email delivery implementations (smtp/sendgrid/ses) did not reveal an email notification module in the backend.
- Therefore email is likely not a currently supported delivery option for ticket events.

### Minimal coupling / safest insertion is already present
- The ticket creation endpoint already has an explicit, isolated hook:
  - insert ticket
  - call `create_admin_notification(...)`
- This is the lowest-risk “surgical” surface because it does not alter the ticket storage model and only adds a second DB insert.

## Module Reference (one-liners)
| File | Purpose |
|---|---|
| `backend/api/routes/support.py` | Support ticket CRUD + admin ticket management; creates admin_notification records on ticket creation |
| `backend/services/admin.py` | `create_admin_notification()` + admin action audit logging |
| `backend/api/routes/admin.py` | Admin notifications list/read endpoints + other admin management |
| `backend/core/dependencies.py` | Auth + admin gating (Supabase JWT + profiles) |
| `backend/services/push_notifications.py` | Central Expo push dispatcher (signals-focused, preference-keyed) |
| `backend/api/routes/subscriptions.py` | Device token registration and notification preferences update |
| `frontend/app/help-support.tsx` | User help/support page with “submit ticket” form and ticket history |
| `frontend/app/(admin)/support-tickets.tsx` | Admin UI to list/manage tickets |
| `frontend/src/services/notificationService.ts` | Expo notification permission/token handling and tap routing |

## Answering the Investigation Objectives

### A) Support/Ticket System Map (exists)
- **Creation**: `POST /api/support/tickets`
- **Storage**: MongoDB `support_tickets`
- **Admin lifecycle**: `status` updated via admin endpoints; internal notes and user replies are appended to arrays (`admin_notes`, `replies`).

### B) Ticket Creation Flow (where it happens)
- Frontend: `frontend/app/help-support.tsx#handleSubmitTicket`
- Backend: `backend/api/routes/support.py#create_support_ticket`
- Synchronous behavior:
  - The endpoint awaits ticket insert and awaits `create_admin_notification()` before responding.

### C) Existing Push Notification Infrastructure (exists, but not admin-targeted for tickets)
- Backend Expo push:
  - `backend/services/push_notifications.py#send_notification`
- Device tokens:
  - `backend/api/routes/subscriptions.py#register_device_token`
- Admin targeting capability:
  - There is **no** “target admin role” helper in push dispatcher; push currently targets by preference_key and token/user preference.

### D) Admin User Identification (exists)
- Admins are identified via Supabase profile fields:
  - `role` (admin/super_admin)
  - `admin_role` (e.g., `super_admin`, `customer_support`)
  - `admin_enabled`
- Super admins are also protected by `PROTECTED_SUPER_ADMINS` and initialized in `backend/main.py`.

### E) Notification Delivery Options (what exists)
1. **Push notifications**: Yes, for signals and some other event types, preference-keyed.
2. **In-app admin notifications**: Yes, created for ticket creation already.
3. **Email**: Not found in backend implementation during search.
4. **Other admin announcement channels**: App announcements publish triggers both in-app admin notification + push (promotions preference_key).

## Safest / Lowest-Risk Notification Method

### Safest method to reuse: in-app admin notifications (`admin_notifications`)
Because:
- It already exists.
- It is already role-targeted for ticket creation.
- It is triggered at the exact correct insertion point (ticket creation endpoint).
- It is not coupled to Expo push preference routing or token fan-out.

### Safest insertion point (if any additional delivery is required)
- **Primary**: `backend/api/routes/support.py#create_support_ticket` right after:
  - `await db.support_tickets.insert_one(ticket_doc)`
  - and right where it already calls `create_admin_notification(...)`
- **Secondary (if adding push/email in the future)**: add after the admin_notification insert inside the same endpoint to keep ticket+notification ordering.

## Risk Assessment
- **Race conditions**:
  - Ticket creation + admin_notification creation are awaited sequentially, so admins will not receive an admin notification record without a ticket existing (assuming no DB-level failure).
  - There is no deduplication for ticket notifications (but ticket creation is already idempotent per user action; duplicates would only occur if the client submits multiple times).
- **Auth risks**:
  - Ticket endpoints require current user auth via `get_current_user`.
  - Admin ticket endpoints require admin auth via `require_admin` and also explicitly check `admin.admin_role` membership.
- **Spam risks**:
  - For in-app admin notifications, spam risk equals “number of tickets created”.
  - For push (if added), spam risks would be more complex due to token fan-out; dedup logic would likely be needed.

## Minimal-Risk Implementation Recommendation (No code changes, but “what to do”)
1. **Do not change the support system**: keep current `POST /api/support/tickets` hook.
2. **Ensure staff can actually see the existing notifications**:
   - The backend already provides `GET /api/admin/notifications` + “mark read”.
   - The safest next step (if needed) would be to integrate a simple admin UI fetch of this existing endpoint into the current admin pages (e.g., dashboard/header badge).
3. If push delivery is required beyond in-app:
   - The lowest-risk push approach would be to build a backend-side admin recipient resolver that selects `device_tokens` for users whose Supabase `admin_role` is one of the `target_roles`, then call `send_notification()` with a dedicated `preference_key` (or bypass preference checks if you choose that model).
   - However, this would require new code surface in `push_notifications.py` or a new wrapper, so it is higher risk than relying on existing `admin_notifications`.