-- Fix country onboarding profile writes for authenticated users.
-- Safe/idempotent: does not add auth.users triggers or use service-role-only paths.

alter table public.countries
  add column if not exists is_active boolean;

update public.countries
set is_active = true
where is_active is null;

alter table public.countries
  alter column is_active set default true,
  alter column is_active set not null;

create index if not exists idx_countries_is_active on public.countries (is_active);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
