# Swift Insights — Supabase Storage Setup

Run this **once** in your Supabase project (SQL Editor) to enable in-app media uploads
for the Swift Insights admin pipeline.

## 1) Create the buckets (public read)

Open Supabase Dashboard → **Storage** → **New bucket** and create the following two buckets,
or run the SQL below in the **SQL Editor**:

```sql
-- Videos bucket: 50 MB per file
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swift-insights-videos',
  'swift-insights-videos',
  true,
  52428800, -- 50 MB
  array['video/mp4','video/quicktime','video/x-m4v','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Thumbnails bucket: 8 MB per file
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swift-insights-thumbnails',
  'swift-insights-thumbnails',
  true,
  8388608, -- 8 MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

## 2) Storage policies

Public read + authenticated upload. Both buckets share the same policy logic.

```sql
-- VIDEOS bucket
drop policy if exists "swift-insights-videos read"   on storage.objects;
drop policy if exists "swift-insights-videos insert" on storage.objects;
drop policy if exists "swift-insights-videos update" on storage.objects;
drop policy if exists "swift-insights-videos delete" on storage.objects;

create policy "swift-insights-videos read"
on storage.objects for select
using ( bucket_id = 'swift-insights-videos' );

create policy "swift-insights-videos insert"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'swift-insights-videos' );

create policy "swift-insights-videos update"
on storage.objects for update
to authenticated
using ( bucket_id = 'swift-insights-videos' );

create policy "swift-insights-videos delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'swift-insights-videos' );

-- THUMBNAILS bucket
drop policy if exists "swift-insights-thumbnails read"   on storage.objects;
drop policy if exists "swift-insights-thumbnails insert" on storage.objects;
drop policy if exists "swift-insights-thumbnails update" on storage.objects;
drop policy if exists "swift-insights-thumbnails delete" on storage.objects;

create policy "swift-insights-thumbnails read"
on storage.objects for select
using ( bucket_id = 'swift-insights-thumbnails' );

create policy "swift-insights-thumbnails insert"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'swift-insights-thumbnails' );

create policy "swift-insights-thumbnails update"
on storage.objects for update
to authenticated
using ( bucket_id = 'swift-insights-thumbnails' );

create policy "swift-insights-thumbnails delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'swift-insights-thumbnails' );
```

> **Tighter security (optional)**: replace `to authenticated` with a role check, e.g.:
> ```sql
> with check ( bucket_id = '...' and (auth.jwt() ->> 'role') = 'admin' )
> ```
> This requires you to set `is_admin` (or similar) into the JWT via a Supabase Edge Function
> or a custom claim. The current setup allows any authenticated user to upload — but only the
> admin UI exposes the upload action.

## 3) Verify

After running the SQL, head to **Storage** in the Supabase dashboard and confirm both
buckets exist and are flagged **public**. The admin panel will now show:

- **Select Video from device** — uploads to `swift-insights-videos`
- **Select Thumbnail from device** — uploads to `swift-insights-thumbnails`
- After picking a video, a thumbnail is **auto-generated** from the first frame and uploaded.
  You can still tap **Replace Thumbnail** to override it manually.

## Limits enforced client-side

- Video: **50 MB max**, **60 seconds max**
- Thumbnail: **8 MB max**

These match the bucket-level `file_size_limit` for defense-in-depth.
