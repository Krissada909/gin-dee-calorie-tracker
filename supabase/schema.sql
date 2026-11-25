-- Run this once in Supabase SQL Editor. The app uses Supabase Auth for private user accounts.
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_at timestamptz not null default now(),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(name) between 1 and 160),
  calories integer not null check (calories >= 0 and calories <= 10000),
  image_path text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists food_entries_user_eaten_idx
  on public.food_entries (user_id, eaten_at desc);

create table if not exists public.exercise_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_at timestamptz not null default now(),
  activity text not null check (char_length(activity) between 1 and 100),
  calories_burned integer not null default 0 check (calories_burned >= 0 and calories_burned <= 20000),
  distance_km numeric(7, 2) not null default 0 check (distance_km >= 0 and distance_km <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists exercise_entries_user_performed_idx
  on public.exercise_entries (user_id, performed_at desc);

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai-compatible')),
  api_key text not null check (char_length(api_key) between 8 and 4096),
  base_url text,
  model text not null check (char_length(model) between 1 and 200),
  updated_at timestamptz not null default now()
);

alter table public.food_entries enable row level security;
alter table public.exercise_entries enable row level security;
alter table public.user_ai_settings enable row level security;

revoke all on table public.user_ai_settings from anon;
grant select, insert, update, delete on table public.user_ai_settings to authenticated;

drop policy if exists "Users manage their own food entries" on public.food_entries;
create policy "Users manage their own food entries" on public.food_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own exercise entries" on public.exercise_entries;
create policy "Users manage their own exercise entries" on public.exercise_entries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own AI settings" on public.user_ai_settings;
create policy "Users manage their own AI settings" on public.user_ai_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Private images: stored at {auth.uid()}/{filename}. No public bucket access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

drop policy if exists "Users upload their own food photos" on storage.objects;
create policy "Users upload their own food photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users read their own food photos" on storage.objects;
create policy "Users read their own food photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update their own food photos" on storage.objects;
create policy "Users update their own food photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own food photos" on storage.objects;
create policy "Users delete their own food photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Optional adult EER profile; do not use for under-19, pregnant or breastfeeding users.
create table if not exists public.energy_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age smallint not null check (age between 19 and 120),
  sex_category text not null check (sex_category in ('male','female')),
  height_cm numeric(5,1) not null check (height_cm between 100 and 250),
  weight_kg numeric(5,1) not null check (weight_kg between 25 and 350),
  activity_category text not null check (activity_category in ('inactive','low_active','active','very_active')),
  updated_at timestamptz not null default now()
);

alter table public.energy_profiles enable row level security;
revoke all on table public.energy_profiles from anon;
grant select, insert, update, delete on table public.energy_profiles to authenticated;
drop policy if exists "Users manage their own energy profile" on public.energy_profiles;
create policy "Users manage their own energy profile" on public.energy_profiles
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
