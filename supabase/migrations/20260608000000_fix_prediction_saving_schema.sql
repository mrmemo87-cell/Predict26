-- Fix prediction saving compatibility across earlier Predict26 schema variants.
-- The app writes canonical exact-score columns (home_score, away_score) plus
-- the derived result choice; older migrations may have left only predicted_*
-- columns, missing choice, or NOT NULL legacy columns that block inserts.

alter table public.predictions
  add column if not exists home_score integer,
  add column if not exists away_score integer,
  add column if not exists choice text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- Hydrate canonical score columns from the legacy exact-score columns when present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'predictions'
      and column_name = 'predicted_home_score'
  ) then
    update public.predictions
    set home_score = predicted_home_score
    where home_score is null
      and predicted_home_score is not null;

    alter table public.predictions
      alter column predicted_home_score drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'predictions'
      and column_name = 'predicted_away_score'
  ) then
    update public.predictions
    set away_score = predicted_away_score
    where away_score is null
      and predicted_away_score is not null;

    alter table public.predictions
      alter column predicted_away_score drop not null;
  end if;
end $$;

-- Keep the required result choice in sync with exact scores where possible.
update public.predictions
set choice = case
  when home_score > away_score then 'home'
  when home_score < away_score then 'away'
  else 'draw'
end
where choice is null
  and home_score is not null
  and away_score is not null;

-- Canonical exact-score constraints. They are intentionally NOT VALID first so
-- existing data can be remediated without blocking deployment; future writes are
-- still checked immediately by PostgreSQL.
alter table public.predictions
  drop constraint if exists predictions_home_score_nonnegative,
  drop constraint if exists predictions_away_score_nonnegative,
  drop constraint if exists predictions_choice_allowed,
  add constraint predictions_home_score_nonnegative check (home_score >= 0) not valid,
  add constraint predictions_away_score_nonnegative check (away_score >= 0) not valid,
  add constraint predictions_choice_allowed check (choice in ('home', 'draw', 'away')) not valid;

-- Remove any historical duplicate rows before enforcing the upsert conflict
-- target. Keep the most recently updated/submitted/created prediction.
with ranked_predictions as (
  select
    id,
    row_number() over (
      partition by user_id, match_id
      order by updated_at desc nulls last, submitted_at desc nulls last, created_at desc nulls last, id desc
    ) as row_number
  from public.predictions
)
delete from public.predictions p
using ranked_predictions r
where p.id = r.id
  and r.row_number > 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'predictions'
      and c.contype = 'u'
      and c.conkey = array[
        (select attnum from pg_attribute where attrelid = t.oid and attname = 'user_id'),
        (select attnum from pg_attribute where attrelid = t.oid and attname = 'match_id')
      ]::smallint[]
  ) then
    alter table public.predictions
      add constraint predictions_user_match_unique unique (user_id, match_id);
  end if;
end $$;

alter table public.predictions enable row level security;

drop policy if exists predictions_select_own on public.predictions;
create policy predictions_select_own on public.predictions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists predictions_insert_own on public.predictions;
create policy predictions_insert_own on public.predictions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists predictions_update_own on public.predictions;
create policy predictions_update_own on public.predictions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
