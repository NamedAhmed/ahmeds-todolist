-- A private bucket for the pictures you add as wallpapers. Pictures are shrunk to 1920px JPEGs by the app (~300 KB),
-- so the free plan's 1 GB holds thousands. Each user can only touch files inside a folder named after their own id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallpapers', 'wallpapers', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "read own wallpapers" on storage.objects for select to authenticated
  using (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "add own wallpapers" on storage.objects for insert to authenticated
  with check (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own wallpapers" on storage.objects for delete to authenticated
  using (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = (select auth.uid())::text);
