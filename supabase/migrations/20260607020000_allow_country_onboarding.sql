-- Allow first-time Google OAuth users to complete country selection in app.

alter table public.profiles
  alter column country_code drop not null,
  alter column country_code drop default;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  founder_threshold integer := 1000;
  profile_total integer;
  generated_referral_code text;
  candidate_name text;
begin
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
    null,
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
