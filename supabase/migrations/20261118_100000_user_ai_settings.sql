-- Store one AI provider configuration per authenticated user. Never expose it to anon users.
create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai-compatible')),
  api_key text not null check (char_length(api_key) between 8 and 4096),
  base_url text,
  model text not null check (char_length(model) between 1 and 200),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_settings enable row level security;

revoke all on table public.user_ai_settings from anon;
grant select, insert, update, delete on table public.user_ai_settings to authenticated;

drop policy if exists "Users manage their own AI settings" on public.user_ai_settings;
create policy "Users manage their own AI settings" on public.user_ai_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
