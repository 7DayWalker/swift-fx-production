# Swift FX — Profile Picture / Avatar Support (Investigation & System Map)

## Summary
Swift FX already has **an avatar/picture column in Supabase (`profiles.picture`)** and the backend returns it as part of the authenticated user profile payload. On the frontend, however, the **AuthContext does not select/load `picture`**, and the main profile display surfaces currently render **initials-based avatars** only. Media upload infrastructure exists for other use-cases (community post images and AI analyzer media), including **Expo ImagePicker** and **Supabase Storage upload helpers**, but **there is no dedicated avatar bucket / avatar upload flow yet**.

---

## Architecture

### Primary pattern
- **React (Expo Router) + Context-based state** for auth/profile in the frontend.
- **FastAPI + Supabase (JWT verification + REST queries)** in the backend.
- **Supabase Storage (client-side uploads)** for media files (videos/thumbnails already supported).

### Key subsystems and how they relate
1. **Frontend AuthContext** (`frontend/src/context/AuthContext.tsx`)
   - Initializes Supabase session, then “enriches” user state from the `profiles` table.
   - Currently selects only `name, role, admin_role` for enrichment (so `picture` is not loaded into the app state).
2. **Backend settings/profile endpoints**
   - `GET /api/settings/profile` returns `picture` from `profiles`.
   - `PUT /api/settings/profile` currently supports name/phone updates only (does not accept picture).
3. **Frontend avatar display surfaces**
   - `MoreScreen` and community cards use initials only; there is no `picture` rendering.
4. **Frontend upload utilities (media already exists)**
   - `frontend/src/services/storageUploader.ts` uploads files to Supabase Storage buckets and returns a public URL.
   - Buckets configured/used today are **only** for “Swift Insights” media, not avatars.

### Execution start / runtime flow (profile-related)
- App startup → `AuthProvider` initializes Supabase session (`supabase.auth.getSession()`).
- If session exists → `enrichProfile()` fetches profile role/name from `profiles` in Supabase.
- The resolved `user` object drives what UI can show.
- Avatar display today depends on initials because `picture` is never loaded into `user` state.

---

## Directory Structure (relevant parts)

```text
frontend/
├── app/
│   ├── settings.tsx                 — User settings UI (profile card, name/phone changes)
│   └── (tabs)/
│       ├── more.tsx               — “Profile Header” + initials avatar
│       └── community.tsx         — Post author row uses initials avatars
└── src/
    ├── context/
    │   ├── AuthContext.tsx        — Loads profile from `profiles`, but omits `picture`
    │   └── ThemeContext.tsx
    ├── services/
    │   ├── supabase.ts            — Supabase client (SSR-safe)
    │   └── storageUploader.ts    — Uploads to existing Storage buckets
    └── components/
        └── (SubscriptionBadge / etc.)
backend/
├── api/
│   └── routes/
│       └── settings.py           — `GET/PUT /settings/profile` returns `picture` but doesn't update it
├── core/
│   └── dependencies.py            — `get_current_user()` loads `picture` from Supabase profile
├── models/
│   └── schemas.py               — Pydantic models include `picture` in some places
└── supabase_auth.py             — REST helpers for `profiles` CRUD (service-role)
supabase/
└── migrations/                  — subscription columns migration (no avatar migration found)
SUPABASE_INSIGHTS_SETUP.md      — Storage buckets + policies for insights media
```

---

## Key Abstractions

### AuthContext `AuthProvider`
- **File**: `frontend/src/context/AuthContext.tsx`
- **Responsibility**: Provide `user` to the app (id/name/email/role), and manage session lifecycle.
- **Interface** (core behavior):
  - `enrichProfile(sbUser, accessToken)` fetches from `profiles`.
  - Current select: `.select('name, role, admin_role')` (does not include `picture`).
- **Lifecycle**: Runs on initial app mount and on auth state changes.
- **Used by**: UI screens (e.g., `MoreScreen`, Settings, Dashboard) via `useAuth()`.

**Meaning for avatar system:** even though `user` type includes `picture?: string`, the enrichment query never populates it, so avatar display cannot work without changing enrichment.

---

### Supabase Storage Upload Helper
- **File**: `frontend/src/services/storageUploader.ts`
- **Responsibility**: Upload binary media (currently videos/thumbnails) to Supabase Storage and return a **public URL**.
- **Interface**:
  - `uploadFileToSupabase({ uri, bucket, fallbackContentType, prefix })`
  - `uploadVideoToSupabase(uri)`
  - `uploadThumbnailToSupabase(uri)`
- **Storage model used**:
  - Upload with `upsert: false`
  - After upload: `supabase.storage.from(bucket).getPublicUrl(path)`
- **Used by**: Admin “insights” pipeline (and possibly other areas not inspected deeply).

**Meaning for avatar system:** the codebase already uses a “client uploads → store public URL → render remote URL” pattern, which is the lowest-risk strategy to follow for avatars too.

---

### Backend Settings Profile Endpoints
- **File**: `backend/api/routes/settings.py`
- **Responsibility**: Provide profile info and allow updating certain user fields.
- **Key endpoints**:
  - `GET /api/settings/profile`
    - Returns `picture: user_doc.get("picture")`.
  - `PUT /api/settings/profile`
    - `ProfileUpdate` includes `name` and `phone` only (no picture field).
- **Meaning for avatar system:**
  - Backend already **stores and exposes `picture`**.
  - Backend currently **does not provide a supported API to upload/update picture** through this endpoint.

---

### User Pydantic Models / Profile Update Model
- **File**: `backend/models/schemas.py`
- **Responsibility**: Shared request/response schemas for FastAPI routes.
- **Key parts**:
  - `User` model includes `picture: Optional[str] = None`.
  - `ProfileUpdate` model includes `picture: Optional[str] = None` (but note: this may not be used by the settings route’s own `ProfileUpdate` class).
- **Meaning for avatar system:** the shared schema *anticipates* picture updates, but route-layer models may not be wired.

---

### Auth Dependencies (RBAC + user claim building)
- **File**: `backend/core/dependencies.py`
- **Responsibility**: Convert Supabase JWT claims + `profiles` row into a backend `User` model.
- **Interface**:
  - `get_current_user()` calls `fetch_profile(user_id)`
  - Populates `picture=profile.get("picture")`.
- **Meaning for avatar system:** backend understands `picture` as a first-class profile property; only frontend and the update endpoint are the gaps.

---

### Supabase Service Role REST Helpers
- **File**: `backend/supabase_auth.py`
- **Responsibility**: Server-side calls to Supabase REST API for profile data.
- **Key functions**:
  - `fetch_profile(user_id)`
  - `update_profile(user_id, data)`
- **Meaning for avatar system:** once an upload flow writes a picture URL into `profiles.picture`, the backend can persist it with existing update mechanisms.

---

## Data Flow (avatar-relevant, existing)

### Current (partial) data flow for profile picture
1. Backend authenticated request:
   - `get_current_user()` fetches `profiles` and includes `picture` in the backend `User` model.
   - **File**: `backend/core/dependencies.py`
2. `GET /api/settings/profile` returns `picture`:
   - **File**: `backend/api/routes/settings.py`
3. Frontend AuthContext:
   - Does enrichment fetch for `name/role/admin_role` only.
   - Does not include `picture`, so UI state has no `picture`.
   - **File**: `frontend/src/context/AuthContext.tsx`
4. UI rendering:
   - Avatar components render initials only (More / Community).
   - **Files**: `frontend/app/(tabs)/more.tsx`, `frontend/app/(tabs)/community.tsx`

### Media upload pattern already present (for other media)
1. Pick image (existing Expo ImagePicker usage is confirmed elsewhere, especially community creation).
2. Convert/read in RN-compatible form.
3. Upload to Supabase Storage via `supabase.storage.from(bucket).upload(...)`.
4. Convert storage path to public URL via `getPublicUrl`.
5. Persist URL in a table (for avatars, likely `profiles.picture`).
   - **File**: `frontend/src/services/storageUploader.ts`

---

## Non-Obvious Behaviors & Design Decisions

### 1) `profiles.picture` exists conceptually, but frontend doesn’t hydrate it
- The frontend `User` type allows `picture?: string`.
- `AuthContext`’s enrichment query does not select `picture`, so the app never receives the avatar URL.
- Result: even if `profiles.picture` is already populated in Supabase, the UI will ignore it today.

### 2) Backend uses different “ProfileUpdate” models than the shared schema
- Shared schema (`backend/models/schemas.py`) includes `ProfileUpdate.picture`.
- Settings route defines its own `ProfileUpdate` class in `backend/api/routes/settings.py` with **no `picture` field**.
- Practical implication: the backend likely never updates the `picture` column via this endpoint.

### 3) Storage policies for existing media buckets are “public read + authenticated upload”
- `SUPABASE_INSIGHTS_SETUP.md` explicitly makes insight buckets **public** and allows uploads for any authenticated user.
- Even though “only admin UI exposes upload,” RLS policy is not owner-restricted by default.
- For avatars, this would be a key risk to address.

---

## Exact files involved (minimum-risk mapping)

### Frontend (read/display/upload surfaces)
- `frontend/src/context/AuthContext.tsx`
  - Reads `profiles` but omits `picture` from enrichment select.
- `frontend/app/settings.tsx`
  - Fetches from `profiles` but profile UI doesn’t include picture fields.
- `frontend/app/(tabs)/more.tsx`
  - Renders avatar circle using initials (`user?.name?.charAt(0)`).
- `frontend/app/(tabs)/community.tsx`
  - Renders post author avatar using initials only.

### Backend (schema exposure/update surface)
- `backend/api/routes/settings.py`
  - `GET /settings/profile` returns `picture`.
  - `PUT /settings/profile` does not accept/update `picture`.
- `backend/core/dependencies.py`
  - `get_current_user()` loads `picture` from Supabase `profiles`.
- `backend/models/schemas.py`
  - `User.picture` and a shared `ProfileUpdate.picture` exist (but may not be wired in route-layer update).

### Supabase Storage / existing media infrastructure
- `frontend/src/services/storageUploader.ts`
  - Upload → `getPublicUrl` pattern (public URL model).
- `SUPABASE_INSIGHTS_SETUP.md`
  - Existing bucket names and policies for non-avatar media.

---

## Minimal-risk implementation recommendation (no implementation; safest plan)

1. **Use existing canonical storage column**
   - Store avatar URL in the existing `profiles.picture` column (backend already exposes it).
2. **Follow the existing upload pattern**
   - Reuse `frontend/src/services/storageUploader.ts` pattern:
     - Expo picker → upload bytes to Supabase Storage → `getPublicUrl()` → persist URL to `profiles.picture`.
3. **Add only the minimum avatar render capability**
   - Update the existing initials avatar usage (e.g., in `MoreScreen`) to display:
     - If `user.picture` exists → render remote image
     - Else → keep initials fallback.
   - This avoids UI redesign: only swaps content inside the existing avatar circle.
4. **Ensure avatar URL is loaded into frontend auth state**
   - Update `AuthContext.enrichProfile()` select list to include `picture`.
   - Without this, the UI cannot reliably show updated avatars after changes.
5. **Storage security (biggest risk area)**
   - Don’t reuse “insights bucket” policies for avatars without owner restrictions.
   - For lowest regression risk in a multi-user app, create an avatar bucket with policies that:
     - Allow authenticated users to upload/update only objects owned by them
     - Keep read as either:
       - public read (simple, matches current media pattern) OR
       - authenticated-only with controlled access (more secure but additional complexity)

If you want, I can continue the investigation narrowly to confirm whether any storage bucket besides “swift-insights-*” exists specifically for user media, and whether any RLS/policies for `profiles.picture` already imply an ownership model.