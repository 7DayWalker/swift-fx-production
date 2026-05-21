# Swift FX — Admin “App Announcements” Publish (404) — Route Alignment Diagnosis

## 1) ACTUAL final registered backend route path (POST app announcements)
**Backend files**
- `backend/api/routes/announcement.py`
  - Router created as: `router = APIRouter(tags=["announcement"])` (**no** `prefix="/api"`)
  - Endpoint decorator: `@router.post("/admin/app-announcements", ...)`

- `backend/main.py`
  - Mounts announcements router with: `app.include_router(announcement.router)` (**no** additional prefix)

**Therefore the actual backend route is:**
- ✅ **`POST /admin/app-announcements`**

## 2) EXACT frontend request path currently being called
**Frontend files**
- `frontend/src/services/api.ts`
  - Axios `baseURL` is: `${EXPO_PUBLIC_BACKEND_URL}/api`
- `frontend/app/(admin)/app-announcements.tsx`
  - Calls: `api.post('/admin/app-announcements', ...)`

**Therefore the request path hitting the backend is:**
- ✅ **`/api/admin/app-announcements`**

## 3) Whether `/api` is being duplicated / router not mounted / decorator path mismatch
- **No double router duplication** is happening.
- The **router is mounted** (`app.include_router(announcement.router)` in `backend/main.py` is present).
- The **decorator path is correct** (`"/admin/app-announcements"`).
- The **mismatch is the missing `/api` prefix on the announcements router**:
  - Backend route is at `/admin/...`
  - Frontend calls `/api/admin/...`

## 4) Exact route mismatch
- **Frontend calls:** `POST /api/admin/app-announcements`
- **Backend only registers:** `POST /admin/app-announcements`
- Result: **404 Not Found**.

## SINGLE minimal correction required (DO NOT implement here)
Choose the smallest change that restores the backend `/api` namespace for this router:

- **Minimal backend fix:** change announcements router initialization to include the prefix:
  - `router = APIRouter(prefix="/api", tags=["announcement"])`

This would make backend register:
- `POST /api/admin/app-announcements`
and match the existing frontend request path.
