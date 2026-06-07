# Predict26 – Supabase Migration Files

## Overview

These SQL migration files set up the Predict26 database schema for country/team structure, competitions, matches, predictions, and reports.

## How to Run

Run the files **in order**:

```bash
psql $DATABASE_URL -f 01_schema.sql
psql $DATABASE_URL -f 02_rls.sql
psql $DATABASE_URL -f 03_seed_countries.sql
psql $DATABASE_URL -f 04_seed_competition_and_teams.sql
psql $DATABASE_URL -f 05_seed_sample_matches.sql
```

Or via the Supabase SQL Editor: paste each file's contents in sequence.

## Important Notes

1. **Run files in order** – each file depends on the previous ones (schema → RLS → seeds).

2. **No `00_reset` file is included** – a reset/drop script is intentionally omitted because this is production-sensitive. If you need a reset for local development, write one yourself and **never** run it against production.

3. **Do NOT create triggers on `auth.users`** – Supabase manages the `auth` schema. Profile creation should be handled in application code or Edge Functions, not via database triggers.

4. **`countries` = user nationality / home country** – This table represents real-world countries. Users pick their country from this list regardless of whether their country is participating in a tournament.

5. **`competition_teams` = tournament participants** – This table tracks which countries are participating in a specific competition (e.g., FIFA World Cup 2026). It is separate from the `countries` table.

6. **Users can choose any country** – A user can select their home country even if that country is not participating in the current competition. The `profiles.country_code` references `countries.code`, not `competition_teams`.

## File Descriptions

| File | Purpose |
|------|---------|
| `01_schema.sql` | Creates all tables, indexes, constraints, and safely adds `country_code` to profiles |
| `02_rls.sql` | Enables Row Level Security and creates access policies |
| `03_seed_countries.sql` | Seeds a broad list of real countries with confederations |
| `04_seed_competition_and_teams.sql` | Creates the World Cup 2026 competition and adds participating teams |
| `05_seed_sample_matches.sql` | Adds a few sample matches for development/testing |
