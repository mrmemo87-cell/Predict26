-- Ensure provider post-match upserts have matching conflict targets. PostgreSQL
-- unique indexes allow multiple NULL values, while provider upserts always include
-- provider IDs for rows that use these conflict targets.
create unique index if not exists match_events_provider_event_unique
  on public.match_events(match_id, source, provider_event_id);

create unique index if not exists match_lineups_provider_lineup_unique
  on public.match_lineups(match_id, team_side, source, provider_lineup_id);
