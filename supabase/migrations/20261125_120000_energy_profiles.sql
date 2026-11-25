-- Optional user-owned EER inputs; applies only to adults 19+.
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
