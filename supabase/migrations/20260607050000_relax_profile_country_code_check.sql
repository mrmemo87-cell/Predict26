-- Relax profile country validation so onboarding can save any seeded country.
-- Keeps the existing countries(code) foreign key and does not add auth.users triggers.

alter table public.profiles
  alter column country_code type text using trim(country_code::text),
  alter column country_code drop not null;

update public.profiles
set country_code = null
where country_code is not null
  and length(trim(country_code)) = 0;

alter table public.profiles
  drop constraint if exists profiles_country_code_check;

alter table public.profiles
  add constraint profiles_country_code_check
  check (
    country_code is null
    or length(trim(country_code)) between 2 and 3
  );
