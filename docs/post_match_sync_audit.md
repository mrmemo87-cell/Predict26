# Predict26 Post-Match Sync, Scoring, and Bonus Pipeline Audit

_Date: 2026-06-17_

## Executive summary

The current post-match system works as a single broad pipeline: admin/cron jobs select eligible matches, call OpenAI web search for exact score plus every bonus category, stage the provider response, apply canonical data when ready, update bonus readiness, run `score_finished_match`, record provider current state, and write provider/job history.

The biggest issue is source-of-truth ambiguity, not scoring rules. `matches`, `match_provider_sync_state`, `provider_sync_runs`, `admin_sync_jobs`, readiness RPCs, and `scoring_ledger` can all imply different current states. The safest simplification is to make exact score sync/scoring an independent fast path, make bonus categories independently retryable, keep run/job tables as history/execution only, and make admin UI read one derived match operations state.

## Scope and non-goals

This audit does not change scoring rules, prediction locks, auth/RLS, data retention, public UI, or provider choice. No large refactor is implemented in this PR. The only repository change is this audit document.

---

## Part 1 — Current flow map

### 1. Exact score sync

1. **Selection**: cron can call `POST /api/admin/sync-finished-matches` directly, while admin actions enqueue jobs through `queueMatchSync()` or `queueFinishedMatchesBatch()`. Job processing calls `processAdminSyncJobs()`, which delegates match sync job types to `syncFinishedMatches(undefined, matchId)`. `loadEligibleMatches()` selects matches in post-kickoff statuses with kickoff at least 120 minutes ago, skipping future retries, max retries, and already fully-scored exact-ready matches in batch mode.
2. **OpenAI prompt**: `openAiRequestBody()` uses the Responses API with `web_search`. The primary request restricts domains; an HTTP 400 primary failure retries unrestricted web search. `extractionInstructions()` asks for strict JSON containing final score, possession, goals, lineups, category statuses, confidence, reasons, agreeing sources, and conflicting sources. It explicitly allows exact score to be ready while bonus categories or URL capture are incomplete.
3. **Provider return**: `toProviderReport()` converts extracted JSON into `ProviderPostMatchReport`. Final score conflict throws `final_score_conflict`; final-without-score throws `final_score_missing`. Named trusted sources can become `uncaptured:<host>` markers.
4. **Storage**: `stageReport()` writes `match_result_staging`. If exact result validates ready, `applyCanonicalData()` updates `matches.status = 'finished'`, `home_score`, and `away_score`. `updateSyncState()` upserts `match_provider_sync_state`; `finishSyncRun()` writes `provider_sync_runs` history.
5. **Scoring trigger**: `syncOneMatch()` calls `scoreFinishedMatch()` when exact becomes ready and existing state was not exact-ready. If exact was already ready, newly ready bonus categories can also trigger `scoreFinishedMatch()`.
6. **Errors**: provider failures write missing statuses to `match_provider_sync_state`, warnings/details in metadata, and `provider_sync_runs.error_message`. Job wrapper failures write `admin_sync_jobs.error_message`.
7. **Admin UI reads**: `/admin/matches` reads `matches`, `match_provider_sync_state`, latest `provider_sync_runs`, `admin_sync_jobs`, `scoring_runs`, and readiness RPC diagnostics, then derives labels/buttons inline.

### 2. Possession sync

- **Extraction**: OpenAI asks for both teams' possession percentages with source references.
- **Validation**: `validateReport()` requires two numeric rows, home and away values, and a total of 99–101.
- **Storage**: `stageReport()` writes `match_stats_staging`; `applyCanonicalData()` upserts ready stats into `match_stats` on `(match_id, team_side, source)`.
- **Readiness**: `updateReadiness()` calls `set_match_bonus_scoring_readiness()`; `getMatchBonusReadiness()` can promote ready based on canonical data/RPC diagnostics.
- **Scoring trigger**: a newly ready possession category triggers `scoreFinishedMatch()`.
- **Failure modes**: missing stats, one-sided stats, totals outside tolerance, provider status not ready, DB upsert failure, stale state, readiness RPC failure.

### 3. Scorer / goal-event sync

- **Extraction prompt**: OpenAI extracts goal scorer name, team side/code, minute, penalty, own-goal flag, and sources.
- **Sources**: trusted named sources are acceptable when URLs are not captured.
- **Own goals**: `own_goal` is excluded because `SCOREABLE_GOAL_TYPES` includes only `goal` and `penalty_goal`.
- **Mapping**: `ensureReportPlayerMappings()` creates active mappings by matching synthetic provider IDs against `competition_team_players` using aliases, shirt number, normalized name, surname/initial, and token overlap. `loadPlayerMappings()` then reads active mappings.
- **Canonical upsert**: ready goal events upsert into `match_events` with conflict target `(match_id, source, provider_event_id)`.
- **Readiness/scoring**: readiness RPC checks canonical events; `score_finished_match` scores scorer predictions from canonical events/ledger.
- **Failure modes**: alias miss, confidence below threshold, tied match, inactive/wrong mapping, canonical upsert failure, or provider readiness before all players map.

### 4. Home XI / Away XI sync

- **Extraction prompt**: OpenAI extracts team side/code, player name, shirt number, position, starter flag, slot, and sources.
- **Source requirement**: each side is ready only with exactly 11 starters; extracted names should still be returned when mapping needs review.
- **Team code/alias**: `loadTeamAliases()` maps raw country/team codes to canonical squad codes and is used for mapping, staging, upsert, and diagnostics.
- **Squad lookup**: active `competition_team_players` rows for `WC2026` and canonical code are the squad source.
- **Mapping**: confidence must be >= 90 with no same-confidence tie.
- **Canonical upsert**: ready starters upsert into `match_lineups` on `(match_id, team_side, source, provider_lineup_id)`.
- **Readiness/scoring**: readiness counts official starters; `score_finished_match` scores lineup predictions when canonical readiness passes.
- **Failure modes**: no lineup source, not exactly 11 extracted, wrong team code, missing alias, zero squad rows, partial mapping, duplicate provider IDs, constraint mismatch, readiness/UI disagreement.

### 5. Async/admin job flow

- **Queueing**: per-match admin buttons insert `admin_sync_jobs` with `sync_match_exact`, `sync_match_bonus`, `sync_match_full`, or `score_match`; batch inserts `sync_match_full` rows.
- **Processing**: admin action `processSyncQueueNow()` and `POST /api/admin/process-sync-jobs` process queued jobs. Jobs are marked running, attempts incremented, then `scoreFinishedMatch()` or `syncFinishedMatches()` runs.
- **Retries**: `recoverStaleJobs()` marks jobs running over 15 minutes failed; `retryFailedSyncJobs()` requeues failed jobs with attempts < 3. Match-level provider retry uses `next_sync_after` and `retry_count`.
- **Results**: jobs store status/timestamps/result/errors; provider sync stores current state in `match_provider_sync_state` and history in `provider_sync_runs`.
- **UI**: admin reads jobs and match state separately, so failed jobs can remain visible after later success.

---

## Part 2 — Related files by responsibility

| Area | File | What it does | Truth/UI | Duplication | Risk |
|---|---|---|---|---|---|
| Provider orchestration | `src/lib/football-data/postMatchSync.ts` | Selects eligible matches; calls provider; stages report; applies canonical data; updates readiness/current state; triggers scoring. | Source-of-truth logic | Duplicates status derivation with admin UI and readiness RPCs. | High |
| OpenAI provider | `src/lib/football-data/providers/openAiWebSearch.ts` | Builds prompt, calls Responses API web search, parses JSON, normalizes sources/report. | Extraction logic | Category readiness overlaps `validateReport()`. | High |
| Provider types | `src/lib/football-data/providers/types.ts` | Provider contracts/results. | Logic contract | Low. | Medium |
| Admin actions | `src/app/admin/matches/actions.ts` | Queues jobs, manual scoring, readiness updates, manual mappings, match edits. | Mutating admin logic | Queue/scoring checks overlap helpers/UI. | High |
| Admin match page | `src/app/admin/matches/page.tsx` | Command center/match operations UI. | UI with heavy derived logic | Duplicates current-state logic. | High |
| Admin jobs | `src/lib/admin/syncJobs.ts` | Queue insertion, batch selection, stale recovery, processing. | Execution queue logic | Batch eligibility duplicates sync eligibility. | High |
| Cron job route | `src/app/api/admin/process-sync-jobs/route.ts` | Cron/admin queued job processor. | Execution entry point | Low. | Medium |
| Direct sync cron | `src/app/api/admin/sync-finished-matches/route.ts` | Cron direct `syncFinishedMatches()` call. | Execution entry point | Bypasses queue. | High |
| Scoring wrapper | `src/lib/scoring/matchScoring.ts` | TS wrapper for `score_finished_match`; score helpers. | Call boundary | SQL is actual truth. | Medium |
| Bonus readiness wrapper | `src/lib/scoring/bonusReadiness.ts` | Calls readiness RPCs and normalizes diagnostics. | Call boundary | Status constants overlap provider statuses. | Medium |
| Upcoming data | `src/lib/data/upcomingPredictionMatches.ts` | Reads sync state for match data. | Data helper | Public display can depend on provider state. | Medium |
| Prediction pages/actions | `src/app/predictions/page.tsx`, `src/app/predictions/actions.ts` | Saves user score/bonus picks; reads squads/aliases. | Lock/save logic | Must remain isolated. | Medium |
| Core schema | `supabase/migrations/20250607000000_initial_schema.sql`, `20260607003000_predict26_initial_schema.sql`, `20260608000000_fix_prediction_saving_schema.sql` | Core matches/predictions/profiles. | DB truth | Multiple migrations evolve same tables. | High |
| Football data | `supabase/migrations/20260607030000_football_data_expansion.sql` | Match lineups/events/stats/reference tables. | DB truth | Later provider migrations add columns/indexes. | High |
| Scoring migrations | `20260607060000_prepare_prediction_scoring.sql`, `20260608005000_scoring_ledger_foundation.sql`, `20260608007000_cutover_exact_result_ledger_scoring.sql`, `20260608009000_match_bonus_ledger_scoring.sql` | Exact/result and bonus ledger scoring. | DB scoring truth | Multiple `score_finished_match` versions; latest wins. | High |
| Bonus readiness | `20260608003000_bonus_prediction_foundation.sql`, `20260608008000_bonus_readiness_foundation.sql` | Bonus pick storage/locks/readiness RPCs. | DB truth | Readiness overlaps provider state. | High |
| Provider/mapping migrations | `20260608002000_squad_import_foundation.sql`, `20260611110000_post_match_provider_sync.sql`, `20260616090000_provider_sync_current_state_and_lineup_mapping.sql` | Aliases, provider mappings, sync state/staging/indexes. | DB truth | Alias and provider mapping both resolve identity. | High |
| Admin jobs migration | `20260616090000_admin_sync_jobs_command_center.sql` | Queue table and event upsert index. | DB truth | Queue state overlaps provider state in UI. | High |

---

## Part 3 — Database source-of-truth audit

| Table/RPC | Writes | Reads | Kind | Admin reads directly? | Stale errors? | Upsert/index status | Duplication risk |
|---|---|---|---|---|---|---|---|
| `matches` | Admin save; provider exact sync. | Prediction pages, admin, scoring RPC. | Canonical score/status. | Yes | No | Core unique indexes. | Can disagree with exact status. |
| `predictions` | User save; `score_finished_match`. | Scoring/leaderboards. | User pick + compatibility scoring fields. | Indirect | No | Unique per user/match. | Points mirror ledger. |
| `match_provider_sync_state` | Sync update; manual review. | Admin/upcoming/sync eligibility. | Current provider/admin state. | Yes | Yes | PK `match_id`. | Overlaps readiness/runs/jobs/scoring. |
| `provider_sync_runs` | Provider sync. | Admin latest run display. | History. | Yes | Yes | Match/start indexes. | Should not be current truth. |
| `admin_sync_jobs` | Queue/retry/worker. | Admin. | Execution queue/history. | Yes | Yes | Status/priority and match indexes. | Can conflict with match state. |
| `match_result_staging` | Provider sync. | Audit/diagnostics. | Staging/history. | Not primary | Historical | Append-only. | Old scores if used as current. |
| `match_event_staging` | Provider sync. | Diagnostics. | Staging/history. | Not primary | Historical | Append-only. | Expected duplicates by run. |
| `match_stats_staging` | Provider sync. | Diagnostics. | Staging/history. | Not primary | Historical | Append-only. | Expected duplicates by run. |
| `match_lineup_staging` | Provider sync. | Diagnostics. | Staging/history. | Not primary | Historical | Append-only. | Expected duplicates by run. |
| `match_events` | Provider/manual. | Readiness/scorer scoring. | Canonical bonus facts. | Via diagnostics | No | Full unique `(match_id, source, provider_event_id)`. | Semantic duplicates possible with different provider IDs. |
| `match_lineups` | Provider/manual. | Readiness/lineup scoring. | Canonical lineup facts. | Via diagnostics | No | Provider lineup unique; legacy player/shirt unique. | Provider and legacy constraints can conflict. |
| `match_stats` | Provider/manual. | Readiness/possession scoring. | Canonical stats. | Via diagnostics | No | Unique `(match_id, team_side, source)`. | Multiple sources can disagree. |
| `provider_player_mappings` | Auto/manual mapping. | Sync mapping. | Current identity mapping. | Mapping panel | Raw context can stale | PK `(provider, provider_player_id)`. | Synthetic IDs depend on team code/name. |
| `provider_team_mappings` | Structured providers. | Structured sync. | Current mapping. | Low | Low | Unique provider/team. | Less relevant to OpenAI. |
| `team_code_aliases` | Squad import/admin seed. | Sync/predictions. | Current alias truth. | Indirect | No | Alias lookup indexed by migration. | Missing alias breaks mapping. |
| `competition_team_players` | Squad import. | Prediction validation/auto-map. | Canonical active squad. | Indirect | No | Active unique player/number. | Wrong canonical code maps 0. |
| `scoring_runs` | Scoring RPC. | Admin/provider state. | Scoring history. | Yes | Historical | Scope/status indexes. | Latest run can conflict with ledger truth. |
| `scoring_ledger` | Scoring RPC. | Profile recalculation/reconcile. | Scoring truth. | Not directly | No | Active unique `(user_id, category, entity_key)`. | Entity-key consistency required. |
| `profiles` totals | Scoring RPC recalculation. | Leaderboards/dashboard. | Derived totals. | Indirect | No | Profile PK. | Must reconcile to ledger. |
| `get_match_bonus_scoring_readiness` | Reads canonical/readiness data. | TS/admin/sync. | Derived readiness. | Via helper | Metadata may stale | RPC. | Duplicates provider statuses. |
| `set_match_bonus_scoring_readiness` | Provider/admin. | Readiness/scoring. | Current readiness status. | Indirect | Notes/metadata can stale | RPC. | Can disagree with canonical data. |
| `score_finished_match` | Writes predictions, ledger, profiles, run. | TS/admin/sync. | Scoring source of truth. | Indirect | Failed run only | Ledger uniqueness. | Does exact and all bonuses together. |

---

## Part 4 — Source-of-truth conflicts

| Conflict | How it can happen | Code path | Recommended source of truth | UI fallback order |
|---|---|---|---|---|
| Score exists but exact status missing | Later provider failure catch overwrites statuses with `missingStatuses()`. | `syncOneMatch()` catch. | `matches` + exact ledger. | Ledger → prediction flags → match score/status → provider state. |
| Scorer ready but provider run error visible | Historical run error remains after canonical/readiness success. | Admin reads latest run plus readiness. | Readiness/canonical events. | Derived category state → latest non-stale run detail → history. |
| Job failed but sync later succeeded | Failed `admin_sync_jobs` row remains. | Queue history independent of sync state. | Derived current match state. | Active job → current provider state → job history. |
| Exact scored but command center says needs action | Bonus pending makes mixed state `bonus_pending`/`needs_review`. | `updateSyncState()` single status. | Separate exact and bonus states. | Exact ledger/match score first, then bonus blockers. |
| Bonus pending no clear blocker | Metadata reasons, provider statuses, and RPC diagnostics diverge. | UI combines raw fields. | Category diagnostics. | Readiness RPC → provider category status → metadata reason. |
| Extracted 11 but mapped 0 | Missing alias or zero active squad rows. | Auto-map/diagnostics. | Alias + canonical squad table. | Raw code → alias target → squad count → suggestions. |
| Stale retry date | Manual scoring/review does not clear retry fields. | `scoreMatch()`, `markMatchSyncReviewed()`. | Derived retryability by category. | Category status + queued jobs before date. |
| Completed job but error still shown | Old job/run/query error remains. | Admin raw history display. | Current operations state. | Current state → active job → expandable history. |

---

## Part 5 — Failure mode audit

| Failure mode | Error/symptom | Category | Exact continue? | Bonus continue? | Review? | Auto retry? | Store error | Show in UI |
|---|---|---|---|---|---|---|---|---|
| OpenAI timeout/request failure | `openai_request_failed` | All provider | No unless already scored | No | After retries | Yes | state warning + run/job error | Sync failed / retrying |
| OpenAI no sources | `openai_web_search_no_sources` | All | No | No | After retries | Yes | state + run | Waiting retry |
| URL missing but trusted names found | `sources_uncaptured_but_answered` | Metadata | Yes if exact ready | Yes if categories ready | Maybe | No | metadata warning | Low-priority warning |
| Final score conflict | `final_score_conflict` | Exact | No | No exact-dependent scoring | Yes | Limited | exact ambiguous + run error | Manual review |
| Possession missing | `missing` | Possession | Yes | Other ready bonuses yes | Maybe | Yes | category reason | Exact scored, bonus pending |
| Scorer extracted not mapped | `missing_player_mapping` | Scorers | Yes | Other bonuses yes; scorer no | Yes | No until mapping fixed | metadata + mapping panel | Mapping needed |
| Scorer upsert failure | `goal_event_apply_failed` | Scorers | Yes | Other bonuses yes | Yes/dev | Yes after fix | warning metadata | Partial sync |
| Lineup source missing | no trusted lineup source | Lineup side | Yes | Other bonuses yes | Maybe | Yes | category reason | Waiting retry |
| Lineup 11 extracted partial mapped | `x of 11 mapped` | Lineup side | Yes | That lineup no | Yes | No until mapping fixed | metadata | Mapping needed |
| Wrong team code/squad code | squad count 0 | Scorers/lineups | Yes | Affected no | Yes | No until alias fixed | diagnostics | Alias/squad mismatch |
| Player not in squad | mapping failure | Scorers/lineups | Yes | Affected no | Yes | No until squad fixed | diagnostics | Player missing |
| Mapping mismatch | wrong player mapped | Scorers/lineups | Yes | Dangerous | Yes | No | mapping audit | Manual review |
| Job stuck running | running > 15 min | Job | Unknown | Unknown | Maybe | Recovery marks failed | `admin_sync_jobs` | Queue stuck |
| Batch partially failed | job `partial` or result failed | Some matches | Per match | Per match | Failed only | Yes | job result + states | Batch partial |
| Stale provider error | old error after success | UI | Yes | Yes | No | No | history only | Suppress current error |
| Duplicate scoring risk | repeated scoring | All | Mostly safe | Mostly safe | No | N/A | scoring runs/ledger | Show latest run/history |
| Retry window stale/past | old `next_sync_after` | Sync | Yes | Category-specific | Maybe | Queue now if retryable | current state | Waiting only if future |

---

## Part 6 — Scoring safety audit

### Duplicate protections now

- `score_finished_match` locks the match row and recalculates exact/result prediction fields.
- Exact/result ledger rows use stable entity keys and `ON CONFLICT` update active rows.
- Bonus ledger uses active ledger uniqueness by user/category/entity key.
- Stale ledger rows are voided on rescore when no longer eligible.
- Profile totals are recalculated from active ledger rows rather than incremented blindly.

### Remaining duplicate or miss risks

- Duplicate semantic canonical events/lineups with different provider IDs could score twice unless SQL deduplicates.
- Exact scoring can be skipped if `match_provider_sync_state.exact_result_status` is ready but predictions/ledger are not actually scored.
- Bonus scoring can be skipped if canonical data becomes ready but previous provider status was already `ready`, so `newlyReadyBonus` is false.
- Readiness RPC failures after exact score update can prevent current state from reflecting ready bonuses.

### Safest scoring order

1. Exact result fast path.
2. Possession if ready.
3. Scorers if ready.
4. Home XI if ready.
5. Away XI if ready.

No bonus failure should block exact scoring.

---

## Part 7 — Admin UX audit

Admin needs to know: final score known, exact/result scored, each bonus category state, active queued/running work, next safe action, and whether errors are current or historical.

`/admin/matches` should remain the main operating page, but should consume a derived operations helper/view. Direct long-running work should move behind queued jobs. `sync_match_exact` and `sync_match_bonus` currently do not mean much because both call the same full sync path.

Recommended states and buttons:

| State | Meaning | Buttons |
|---|---|---|
| Fully scored | Exact and ready/available bonuses scored; no blockers. | View history; rescore after manual correction. |
| Exact scored, bonus pending | Exact/result scored; bonus categories missing/retryable. | Retry pending bonus; category diagnostics. |
| Exact not scored | No final score/current exact scoring. | Queue exact sync; manual score; full sync. |
| Sync failed | Current provider attempt failed and no better truth exists. | Retry sync; manual review. |
| Mapping needed | Data extracted but mapping blocks scoring. | Add mapping/alias; retry category. |
| Waiting retry | Future `next_sync_after`. | Force retry; wait. |
| Queue running | Active queued/running job for match. | Disable duplicate buttons; show started time. |
| Manual review needed | Conflict, max retries, unsafe mapping. | Mark reviewed; edit data; add mappings. |

---

## Part 8 — Complexity audit

The system feels complicated because status logic is duplicated across prompt rules, provider validation, readiness RPCs, sync metadata, job status, and admin page helpers. History tables are used like current state. Errors live in provider runs, sync state metadata, job rows, readiness notes, and URL query params. Sync and scoring are mixed in one function. Bonus categories share one retry count and parent status despite failing independently. Server actions can process slow OpenAI work inline. Admin UI reads raw DB state instead of a single derived current-state helper. There is no category-specific state machine for exact, possession, scorers, home lineup, and away lineup.

---

## Part 9 — Recommended simplified architecture

| Priority | Recommendation | Risk | Benefit | Files affected | Migration? |
|---|---|---|---|---|---|
| P0 | Split exact-score sync/scoring from bonus sync. | Medium | Fast exact scoring; bonus failures no longer block exact. | `postMatchSync.ts`, provider/types, jobs/actions/routes. | Maybe. |
| P0 | Treat `provider_sync_runs` and `admin_sync_jobs` as history/execution only. | Low | Removes stale error confusion. | Admin page/helper. | No. |
| P0 | Add derived match operations helper/view for admin UI. | Medium | One source for labels/buttons/blockers. | New helper, admin page. | Optional SQL view later. |
| P1 | Independent category statuses: exact, possession, scorers, home_lineup, away_lineup. | Medium | Clear retries/review. | Sync state/RPC/UI. | Likely. |
| P1 | Make admin sync buttons enqueue only. | Medium | Prevents page timeouts/reloads. | Actions, routes, jobs. | No. |
| P1 | Make job types real: exact-only and bonus/category paths. | Medium | Faster retries and clearer results. | Jobs, sync provider. | No/optional. |
| P1 | Store current errors by category and clear on success. | Medium | Prevents stale errors. | Sync state update/helper. | Maybe JSON only. |
| P1 | Improve mapping diagnostics/actions around alias → squad → player. | Low | Faster repair. | Admin page/actions, metadata. | No. |
| P2 | Normalize provider metadata as `categoryResults`. | Low | Easier debug/UI. | Provider/sync/admin helper. | No. |

Target ownership: `matches` = final score; `scoring_ledger` = scoring truth; `match_provider_sync_state` = current provider/category state; `provider_sync_runs` = history; `admin_sync_jobs` = queue/history; canonical bonus tables = facts; admin UI = derived operations state.

---

## Part 10 — Concrete next-step plan

### PR 1: Stabilize exact-score fast path and stale-error handling
- **Goal**: Exact score sync/scoring is independent, fast, and not overwritten by bonus failures.
- **Files touched**: `postMatchSync.ts`, `openAiWebSearch.ts`, `types.ts`, `syncJobs.ts`, minimal admin labels.
- **DB changes**: Optional category error JSON in metadata; no required table change.
- **Test plan**: exact-only fixture responses; `npm run lint`; `npm run build`; `git diff --check`; manual admin exact sync.
- **Rollback risk**: Medium.

### PR 2: Create derived admin match operations view/helper
- **Goal**: One helper computes current state, blockers, stale-history suppression, and buttons.
- **Files touched**: new helper, `src/app/admin/matches/page.tsx`, tests.
- **DB changes**: None initially.
- **Test plan**: fixture conflict states; lint/build/diff.
- **Rollback risk**: Low.

### PR 3: Make admin jobs truly async/non-blocking
- **Goal**: Buttons enqueue only; route/cron processes queue.
- **Files touched**: admin actions, `syncJobs.ts`, API routes, page controls.
- **DB changes**: Optional `next_attempt_at` and dedupe index.
- **Test plan**: queue/process route tests; stale recovery; lint/build/diff.
- **Rollback risk**: Medium.

### PR 4: Improve mapping and manual aliases
- **Goal**: Make alias/squad/player blockers actionable and category-specific.
- **Files touched**: admin page/actions, post-match metadata, squad helpers.
- **DB changes**: Optional alias indexes/constraints; no deletes.
- **Test plan**: wrong code, partial XI, unmapped scorer fixtures; lint/build/diff.
- **Rollback risk**: Low/medium.

### PR 5: Clean Command Center UX
- **Goal**: Present clear states and actions.
- **Files touched**: admin match page/components.
- **DB changes**: None.
- **Test plan**: screenshot/admin fixture review; lint/build/diff.
- **Rollback risk**: Low.

### PR 6: Optional provider metadata simplification
- **Goal**: Normalize metadata by category.
- **Files touched**: provider, `postMatchSync.ts`, admin helper.
- **DB changes**: None required.
- **Test plan**: parser fixtures; backward compatibility for old metadata; lint/build/diff.
- **Rollback risk**: Low.

---

## Part 11 — Tiny fixes made

No code fixes were made in this audit PR. The only change is `docs/post_match_sync_audit.md`.

---

## Part 12 — Required checks

Run before merging:

- `npm run lint`
- `npm run build`
- `git diff --check`
