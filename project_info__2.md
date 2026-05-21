# Diagnosis (404 on publishing app announcements)

## 1) ACTUAL final registered backend route path (POST app announcements)
From `backend/api/routes/announcement.py`:
- Router initialization: `router = APIRouter(tags=["announcement"])` (**no** `prefix="/api"`)
- Endpoint decorator: `@router.post("/admin/app-announcements", ...)`

From `backend/main.py`:
- `app.include_router(announcement.router)` (**no** additional prefix)

✅ **Actual backend route is:**  
**`POST /admin/app-announcements`**

---

## 2) EXACT frontend request path currently being called
From `frontend/src/services/api.ts`:
- Axios `baseURL = ${EXPO_PUBLIC_BACKEND_URL}/api`

From `frontend/app/(admin)/app-announcements.tsx`:
- `api.post('/admin/app-announcements', ...)`

So the request path being sent is:

✅ **Frontend calls:**  
**`POST /api/admin/app-announcements`**

---

## 3) Whether `/api` is being duplicated / router not mounted / decorator mismatch
- **No double-`/api` duplication** on the frontend: the `/api` comes from `api.ts` baseURL.
- **Router is mounted** in `backend/main.py`.
- **Decorator path is correct** (`"/admin/app-announcements"`).

❗ **Exact mismatch:** backend registers `/admin/...` (no `/api`), while frontend always calls `/api/admin/...`.

---

## 4) SINGLE minimal correction required
**Minimal backend fix (single-line change):** restore `/api` prefix on the announcements router so it matches the frontend’s `/api/admin/...` calls.

- Change `backend/api/routes/announcement.py` router init to:
  - `router = APIRouter(prefix="/api", tags=["announcement"])`

This would make backend register:
- **`POST /api/admin/app-announcements`**
and resolve the 404.