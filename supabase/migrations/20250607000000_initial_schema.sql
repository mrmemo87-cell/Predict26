-- Migration: Create core schema for Predict26
-- Tables: profiles, matches, predictions, referrals
-- Includes: indexes, RLS policies, comments

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

create extension if not exists "uuid-ossp" with schema extensions;

-- =============================================================================
-- PROFILES
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  country_code char(2) not null,
  points integer not null default 0,
  is_founder boolean not null default false,
  referral_code text unique not null default encode(gen_random_bytes(6), 'hex'),
  referred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profile data linked to auth.users.';
comment on column public.profiles.id is 'References auth.users.id.';
comment on column public.profiles.username is 'Unique public username.';
comment on column public.profiles.country_code is 'ISO 3166-1 alpha-2 country code the user represents.';
comment on column public.profiles.points is 'Total prediction points accumulated.';
comment on column public.profiles.is_founder is 'True if user joined within the first 1000 members.';
comment on column public.profiles.referral_code is 'Unique referral code for inviting others.';
comment on column public.profiles.referred_by is 'Profile ID of the user who referred this user.';

-- Indexes for profiles
create index idx_profiles_country_code on public.profiles(country_code);
create index idx_profiles_points on public.profiles(points desc);
create index idx_profiles_referral_code on public.profiles(referral_code);
create index idx_profiles_referred_by on public.profiles(referred_by);
create index idx_profiles_created_at on public.profiles(created_at);

-- RLS for profiles
alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =============================================================================
-- MATCHES
-- =============================================================================

create type public.match_status as enum ('scheduled', 'live', 'completed', 'cancelled');
create type public.match_stage as enum (
  'group', 'round_of_32', 'round_of_16',
  'quarter_final', 'semi_final', 'third_place', 'final'
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  home_team_code char(2) not null,
  away_team_code char(2) not null,
  home_team_name text not null,
  away_team_name text not null,
  home_score integer,
  away_score integer,
  stage public.match_stage not null,
  group_name char(1),
  match_number integer not null,
  venue text,
  city text,
  kickoff_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  points_multiplier numeric(3,1) not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matches_score_check
    check (
      (status in ('scheduled', 'cancelled') and home_score is null and away_score is null)
      or (status in ('live', 'completed') and home_score is not null and away_score is not null)
    ),
  constraint matches_teams_different
    check (home_team_code <> away_team_code)
);

comment on table public.matches is 'World Cup 2026 match schedule and results.';
comment on column public.matches.home_team_code is 'ISO 3166-1 alpha-2 code of the home team.';
comment on column public.matches.away_team_code is 'ISO 3166-1 alpha-2 code of the away team.';
comment on column public.matches.stage is 'Tournament stage (group, knockout rounds, final).';
comment on column public.matches.group_name is 'Group letter (A-L), null for knockout matches.';
comment on column public.matches.match_number is 'Official FIFA match number.';
comment on column public.matches.points_multiplier is 'Multiplier for points in later stages (e.g. 2x for final).';
comment on column public.matches.status is 'Current status: scheduled, live, completed, or cancelled.';

-- Indexes for matches
create index idx_matches_kickoff_at on public.matches(kickoff_at);
create index idx_matches_status on public.matches(status);
create index idx_matches_stage on public.matches(stage);
create index idx_matches_home_team on public.matches(home_team_code);
create index idx_matches_away_team on public.matches(away_team_code);
create unique index idx_matches_match_number on public.matches(match_number);

-- RLS for matches
alter table public.matches enable row level security;

create policy "Matches are viewable by everyone"
  on public.matches for select
  using (true);

-- Only service_role can insert/update/delete matches (admin operations)
-- No insert/update/delete policies for authenticated users

-- =============================================================================
-- PREDICTIONS
-- =============================================================================

create type public.prediction_outcome as enum ('exact', 'result', 'miss');

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  predicted_home_score integer not null check (predicted_home_score >= 0),
  predicted_away_score integer not null check (predicted_away_score >= 0),
  outcome public.prediction_outcome,
  points_earned integer not null default 0,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint predictions_unique_per_match unique (user_id, match_id)
);

comment on table public.predictions is 'User predictions for match outcomes.';
comment on column public.predictions.user_id is 'The user who made this prediction.';
comment on column public.predictions.match_id is 'The match being predicted.';
comment on column public.predictions.predicted_home_score is 'Predicted goals for home team.';
comment on column public.predictions.predicted_away_score is 'Predicted goals for away team.';
comment on column public.predictions.outcome is 'Scoring outcome: exact score, correct result, or miss. Null until match completes.';
comment on column public.predictions.points_earned is 'Points awarded for this prediction. 0 until scored.';

-- Indexes for predictions
create index idx_predictions_user_id on public.predictions(user_id);
create index idx_predictions_match_id on public.predictions(match_id);
create index idx_predictions_submitted_at on public.predictions(submitted_at);
create index idx_predictions_outcome on public.predictions(outcome) where outcome is not null;

-- RLS for predictions
alter table public.predictions enable row level security;

create policy "Users can view all predictions for completed matches"
  on public.predictions for select
  using (
    exists (
      select 1 from public.matches
      where matches.id = predictions.match_id
      and matches.status = 'completed'
    )
    or auth.uid() = user_id
  );

create policy "Users can insert their own predictions before kickoff"
  on public.predictions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches
      where matches.id = match_id
      and matches.status = 'scheduled'
      and matches.kickoff_at > now()
    )
  );

create policy "Users can update their own predictions before kickoff"
  on public.predictions for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches
      where matches.id = match_id
      and matches.status = 'scheduled'
      and matches.kickoff_at > now()
    )
  );

create policy "Users can delete their own predictions before kickoff"
  on public.predictions for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches
      where matches.id = match_id
      and matches.status = 'scheduled'
      and matches.kickoff_at > now()
    )
  );

-- =============================================================================
-- REFERRALS
-- =============================================================================

create type public.referral_status as enum ('pending', 'completed', 'expired');

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid references public.profiles(id) on delete set null,
  referral_code text not null,
  status public.referral_status not null default 'pending',
  bonus_points integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint referrals_no_self_referral
    check (referrer_id <> referred_id)
);

comment on table public.referrals is 'Tracks referral invitations and their completion status.';
comment on column public.referrals.referrer_id is 'User who sent the referral.';
comment on column public.referrals.referred_id is 'User who signed up via the referral. Null until completed.';
comment on column public.referrals.referral_code is 'The referral code used for this invitation.';
comment on column public.referrals.status is 'pending = invited, completed = signed up, expired = timed out.';
comment on column public.referrals.bonus_points is 'Points awarded to referrer upon completion.';

-- Indexes for referrals
create index idx_referrals_referrer_id on public.referrals(referrer_id);
create index idx_referrals_referred_id on public.referrals(referred_id);
create index idx_referrals_referral_code on public.referrals(referral_code);
create index idx_referrals_status on public.referrals(status);
create index idx_referrals_created_at on public.referrals(created_at);

-- RLS for referrals
alter table public.referrals enable row level security;

create policy "Users can view their own referrals (as referrer)"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

create policy "Users can create referrals"
  on public.referrals for insert
  with check (auth.uid() = referrer_id);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.handle_updated_at() is 'Automatically sets updated_at to current timestamp on row update.';

-- Apply updated_at triggers
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_matches_updated_at
  before update on public.matches
  for each row execute function public.handle_updated_at();

create trigger set_predictions_updated_at
  before update on public.predictions
  for each row execute function public.handle_updated_at();

-- =============================================================================
-- AUTO-CREATE PROFILE ON SIGNUP (optional helper)
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, country_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'user_' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data ->> 'country_code', 'XX')
  );
  return new;
end;
$$;

comment on function public.handle_new_user() is 'Creates a profile row when a new user signs up via Supabase Auth.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
