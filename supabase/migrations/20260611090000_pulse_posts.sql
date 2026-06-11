-- Predict26 Pulse updates.
-- Additive-only: does not touch scoring, prediction saving, champion picks, or leaderboard logic.

create table if not exists public.pulse_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  body text,
  category text not null,
  country_code text,
  home_team_code text,
  away_team_code text,
  match_id uuid references public.matches(id) on delete set null,
  source_name text,
  source_url text,
  cta_label text,
  cta_href text,
  is_published boolean not null default false,
  is_pinned boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pulse_posts_title_not_blank check (length(trim(title)) > 0),
  constraint pulse_posts_summary_not_blank check (length(trim(summary)) > 0),
  constraint pulse_posts_category_allowed check (category in (
    'Matchday',
    'Team News',
    'Injuries',
    'Lineups',
    'Prediction Trends',
    'Leaderboard',
    'Prizes',
    'Official Update'
  )),
  constraint pulse_posts_source_url_safe check (
    source_url is null or source_url ~* '^https?://[^[:space:]]+$'
  ),
  constraint pulse_posts_cta_href_safe check (
    cta_href is null
    or cta_href ~ '^/[A-Za-z0-9/_#?=&.%:+,@~-]*$'
    or cta_href ~* '^https?://[^[:space:]]+$'
  ),
  constraint pulse_posts_country_code_format check (
    country_code is null or country_code = upper(country_code)
  ),
  constraint pulse_posts_home_team_code_format check (
    home_team_code is null or home_team_code = upper(home_team_code)
  ),
  constraint pulse_posts_away_team_code_format check (
    away_team_code is null or away_team_code = upper(away_team_code)
  )
);

create index if not exists idx_pulse_posts_public_feed
  on public.pulse_posts(is_published, is_pinned desc, published_at desc, created_at desc);

create index if not exists idx_pulse_posts_match_id
  on public.pulse_posts(match_id)
  where match_id is not null;

create or replace function public.set_pulse_post_publish_timestamps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());

  if new.is_published = true and new.published_at is null then
    new.published_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists set_pulse_post_publish_timestamps on public.pulse_posts;
create trigger set_pulse_post_publish_timestamps
  before insert or update on public.pulse_posts
  for each row
  execute function public.set_pulse_post_publish_timestamps();

alter table public.pulse_posts enable row level security;

-- Public visitors and signed-in players can only see published Pulse updates.
drop policy if exists "pulse_posts_select_published" on public.pulse_posts;
create policy "pulse_posts_select_published" on public.pulse_posts
  for select
  to anon, authenticated
  using (is_published = true);

-- No insert/update/delete policies are created. Admin writes use the server-only
-- service-role client after requireAdminUser checks in the app.

comment on table public.pulse_posts is 'Editorial Predict26 Pulse updates. Public reads are limited to published posts by RLS; writes are server-admin only.';

notify pgrst, 'reload schema';
