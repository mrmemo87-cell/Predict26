-- Predict26 initial production schema

create extension if not exists pgcrypto;

create table if not exists public.countries (
  code text primary key,
  name text not null unique,
  flag_emoji text not null,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.countries (code, name, flag_emoji)
values
  ('KAZ', 'Kazakhstan', '🇰🇿'),
  ('KGZ', 'Kyrgyzstan', '🇰🇬'),
  ('UZB', 'Uzbekistan', '🇺🇿'),
  ('RUS', 'Russia', '🇷🇺')
on conflict (code) do nothing;

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.competitions (slug, name, is_active)
values ('world-cup-2026', 'FIFA World Cup 2026', true)
on conflict (slug) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  avatar_url text,
  country_code text not null references public.countries(code),
  points integer not null default 0 check (points >= 0),
  prediction_count integer not null default 0 check (prediction_count >= 0),
  correct_prediction_count integer not null default 0 check (correct_prediction_count >= 0),
  accuracy numeric(5,2) not null default 0,
  is_founder boolean not null default false,
  founder_badge_awarded_at timestamptz,
  referral_code text not null unique,
  referred_by uuid references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id),
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'postponed', 'cancelled')),
  result text check (result in ('home', 'draw', 'away')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (competition_id, home_team, away_team, kickoff_at)
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  choice text not null check (choice in ('home', 'draw', 'away')),
  is_correct boolean,
  points_awarded integer not null default 0 check (points_awarded in (0, 10)),
  submitted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, match_id)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (referee_id),
  unique (referrer_id, referee_id)
);

create table if not exists public.leaderboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  global_rank integer,
  country_rank integer,
  referral_rank integer,
  referral_count integer not null default 0,
  distance_to_top3 integer,
  distance_to_prize_zone integer,
  calculated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists matches_updated_at on public.matches;
create trigger matches_updated_at
before update on public.matches
for each row execute function public.update_updated_at_column();

drop trigger if exists predictions_updated_at on public.predictions;
create trigger predictions_updated_at
before update on public.predictions
for each row execute function public.update_updated_at_column();

drop trigger if exists leaderboards_updated_at on public.leaderboards;
create trigger leaderboards_updated_at
before update on public.leaderboards
for each row execute function public.update_updated_at_column();

alter table public.countries enable row level security;
alter table public.competitions enable row level security;
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.referrals enable row level security;
alter table public.leaderboards enable row level security;

drop policy if exists countries_read_all on public.countries;
create policy countries_read_all on public.countries for select using (true);

drop policy if exists competitions_read_all on public.competitions;
create policy competitions_read_all on public.competitions for select using (true);

drop policy if exists matches_read_all on public.matches;
create policy matches_read_all on public.matches for select using (true);

drop policy if exists profiles_read_all on public.profiles;
create policy profiles_read_all on public.profiles for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists predictions_read_self on public.predictions;
create policy predictions_read_self on public.predictions
for select using (auth.uid() = user_id);

drop policy if exists predictions_insert_self on public.predictions;
create policy predictions_insert_self on public.predictions
for insert with check (auth.uid() = user_id);

drop policy if exists predictions_update_self on public.predictions;
create policy predictions_update_self on public.predictions
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists referrals_read_self on public.referrals;
create policy referrals_read_self on public.referrals
for select using (auth.uid() = referrer_id or auth.uid() = referee_id);

drop policy if exists leaderboards_read_all on public.leaderboards;
create policy leaderboards_read_all on public.leaderboards
for select using (true);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_country text := 'KAZ';
  founder_threshold integer := 1000;
  profile_total integer;
  generated_referral_code text;
begin
  generated_referral_code := upper(substr(md5(new.id::text), 1, 8));

  select count(*) into profile_total from public.profiles;

  insert into public.profiles (
    id,
    username,
    avatar_url,
    country_code,
    is_founder,
    founder_badge_awarded_at,
    referral_code
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'user_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    default_country,
    profile_total < founder_threshold,
    case when profile_total < founder_threshold then timezone('utc', now()) else null end,
    generated_referral_code
  )
  on conflict (id) do nothing;

  insert into public.leaderboards (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();
