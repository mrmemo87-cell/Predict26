-- Keep Google/email signups self-service and immediately dashboard-ready.
-- No manual/admin approval state is part of the auth flow.

alter table public.profiles
  add column if not exists display_name text;

do $$
declare
  country_code_length integer;
  default_country text;
begin
  select character_maximum_length into country_code_length
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'country_code';

  default_country := case when country_code_length = 2 then 'KZ' else 'KAZ' end;

  execute format('alter table public.profiles alter column country_code set default %L', default_country);
end $$;

create or replace function public.predict26_safe_username(
  candidate text,
  user_id uuid
)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
  suffix text := '_' || left(user_id::text, 8);
  base_length integer := 24 - char_length(suffix);
begin
  normalized := lower(regexp_replace(coalesce(candidate, ''), '[^a-zA-Z0-9_]+', '_', 'g'));
  normalized := regexp_replace(normalized, '_+', '_', 'g');
  normalized := trim(both '_' from normalized);

  if char_length(normalized) < 3 then
    return 'user_' || left(user_id::text, 8);
  end if;

  return left(normalized, base_length) || suffix;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_country text;
  founder_threshold integer := 1000;
  profile_total integer;
  generated_referral_code text;
  candidate_name text;
begin
  select case when character_maximum_length = 2 then 'KZ' else 'KAZ' end
    into default_country
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'country_code';

  generated_referral_code := upper(substr(md5(new.id::text), 1, 8));
  candidate_name := coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  );

  select count(*) into profile_total from public.profiles;

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url,
    country_code,
    is_founder,
    founder_badge_awarded_at,
    referral_code
  )
  values (
    new.id,
    public.predict26_safe_username(candidate_name, new.id),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1),
      'Predict26 Player'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    default_country,
    profile_total < founder_threshold,
    case when profile_total < founder_threshold then timezone('utc', now()) else null end,
    generated_referral_code
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = timezone('utc', now());

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
