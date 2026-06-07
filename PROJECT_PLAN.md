# Predict26 — Implementation Plan

## 1. Overview

**Predict26** is a World Cup 2026 match prediction platform where users forecast match results, compete with friends, represent their country on leaderboards, and win real prizes ($300 / $100 / $50).

Key features:
- Match prediction (score-based)
- Global & country-based leaderboards
- Friend challenges / private leagues
- Founder Badge for first 1,000 users
- Prize pool distribution
- Telegram channel integration for community

---

## 2. Folder Structure

```
predict26/
├── apps/
│   ├── web/                    # Next.js frontend (App Router)
│   │   ├── app/
│   │   │   ├── (auth)/        # Login, register, callback pages
│   │   │   ├── (dashboard)/   # Main app pages (predictions, leaderboard, profile)
│   │   │   ├── admin/         # Admin panel (manage matches, results, prizes)
│   │   │   ├── api/           # API routes (webhooks, cron jobs)
│   │   │   └── layout.tsx
│   │   ├── components/        # Shared UI components
│   │   ├── lib/               # Utilities, Supabase client, helpers
│   │   ├── hooks/             # Custom React hooks
│   │   ├── styles/            # Global styles, Tailwind config
│   │   └── public/            # Static assets (flags, icons)
│   └── telegram-bot/          # Optional Telegram bot (notifications)
│       ├── src/
│       │   ├── bot.ts
│       │   ├── commands/
│       │   └── handlers/
│       └── package.json
├── packages/
│   ├── shared/                # Shared types, constants, scoring logic
│   │   ├── types/
│   │   ├── constants/
│   │   └── scoring/
│   └── supabase/              # Supabase migrations, seed data, Edge Functions
│       ├── migrations/
│       ├── seed/
│       └── functions/         # Supabase Edge Functions
├── docs/                      # Documentation
├── .github/
│   └── workflows/             # CI/CD pipelines
├── PROJECT_PLAN.md
├── package.json               # Monorepo root (pnpm workspaces)
├── turbo.json                 # Turborepo config
└── .env.example
```

---

## 3. Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React, Tailwind CSS, shadcn/ui |
| Auth | Supabase Auth (Email, Google, Telegram OAuth) |
| Database | Supabase (PostgreSQL) |
| Realtime | Supabase Realtime (live leaderboards) |
| Storage | Supabase Storage (avatars) |
| Backend Logic | Supabase Edge Functions + Next.js API Routes |
| Hosting | Vercel (web app) |
| Bot | Node.js + grammY (Telegram bot) |
| Monorepo | Turborepo + pnpm workspaces |
| CI/CD | GitHub Actions |

### Architecture Diagram (Logical)

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│  Next.js    │◄────►│  Supabase    │◄────►│  PostgreSQL DB   │
│  Frontend   │      │  (Auth/API)  │      │  (tables, RLS)   │
└─────────────┘      └──────────────┘      └──────────────────┘
       │                     │
       │                     ▼
       │              ┌──────────────┐
       │              │  Edge Funcs  │  (scoring, cron, webhooks)
       │              └──────────────┘
       │
       ▼
┌─────────────┐
│  Telegram   │  (notifications, mini-app link)
│  Bot        │
└─────────────┘
```

### Scoring System

| Prediction | Points |
|-----------|--------|
| Exact score (e.g., 2-1 = 2-1) | 5 pts |
| Correct goal difference (e.g., 2-0 vs 3-1) | 3 pts |
| Correct outcome (win/draw/loss) | 1 pt |
| Wrong prediction | 0 pts |

Bonus points:
- Predicting upsets (underdog win) correctly: +2 pts
- Predicting knockout stage matches: 1.5x multiplier

---

## 4. Database Schema

### Entity Relationship

```
users ──< predictions >── matches
users ──< league_members >── leagues
users ──< badges
matches ──< match_results (1:1)
```

### Tables

#### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | References auth.users.id |
| username | text (unique) | Display name |
| avatar_url | text | Profile picture |
| country_code | text | ISO country code (for country leaderboard) |
| telegram_id | bigint | Optional Telegram user ID |
| is_founder | boolean | First 1000 users |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `matches`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| home_team | text | Country code |
| away_team | text | Country code |
| stage | text | group / round_of_16 / quarter / semi / third_place / final |
| group_name | text | A, B, C... (nullable for knockout) |
| match_date | timestamptz | Kickoff time |
| venue | text | Stadium name |
| status | text | upcoming / live / finished |
| home_score | integer | Actual result (null until finished) |
| away_score | integer | Actual result (null until finished) |
| lock_time | timestamptz | Predictions lock before this time |
| created_at | timestamptz | |

#### `predictions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles) | |
| match_id | uuid (FK → matches) | |
| home_score | integer | Predicted score |
| away_score | integer | Predicted score |
| points_earned | integer | Calculated after match ends (null before) |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| **UNIQUE** | (user_id, match_id) | One prediction per match per user |

#### `leagues`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | League name |
| code | text (unique) | Invite code (6 chars) |
| owner_id | uuid (FK → profiles) | Creator |
| is_public | boolean | |
| max_members | integer | Default 100 |
| created_at | timestamptz | |

#### `league_members`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| league_id | uuid (FK → leagues) | |
| user_id | uuid (FK → profiles) | |
| joined_at | timestamptz | |
| **UNIQUE** | (league_id, user_id) | |

#### `badges`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles) | |
| badge_type | text | founder / perfect_week / streak_5 / top_10 |
| awarded_at | timestamptz | |

#### `leaderboard_cache` (materialized view or table refreshed by cron)
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | |
| total_points | integer | |
| correct_predictions | integer | |
| total_predictions | integer | |
| rank_global | integer | |
| rank_country | integer | |
| country_code | text | |
| updated_at | timestamptz | |

---

## 5. Supabase Configuration

### Row Level Security (RLS) Policies

| Table | Policy | Rule |
|-------|--------|------|
| profiles | Users can read all profiles | `SELECT` for authenticated |
| profiles | Users can update own profile | `UPDATE WHERE auth.uid() = id` |
| predictions | Users can read own predictions | `SELECT WHERE auth.uid() = user_id` |
| predictions | Users can insert/update before lock_time | `INSERT/UPDATE WHERE auth.uid() = user_id AND match.lock_time > now()` |
| matches | Anyone can read matches | `SELECT` for authenticated |
| leagues | Members can read their leagues | `SELECT` via league_members join |
| league_members | Members can read league members | `SELECT` via league membership |

### Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `calculate-scores` | Cron (every 5 min) or webhook | When match ends → calculate points for all predictions |
| `refresh-leaderboard` | After score calculation | Recalculate ranks |
| `award-badges` | After score calculation | Check and award badges |
| `send-notifications` | Match status change | Notify via Telegram bot |

### Realtime Subscriptions

- `matches` table (status changes → live score updates)
- `leaderboard_cache` table (rank changes)

---

## 6. MVP Roadmap

### Phase 1 — Foundation (Week 1-2)
- [ ] Initialize monorepo (Turborepo + pnpm)
- [ ] Set up Supabase project (database, auth)
- [ ] Create database migrations (all tables above)
- [ ] Configure RLS policies
- [ ] Set up Next.js app with Tailwind + shadcn/ui
- [ ] Implement auth (sign up, login, OAuth)
- [ ] Create profile setup page (username, country, avatar)
- [ ] Founder Badge logic (auto-assign for first 1000 users)

### Phase 2 — Core Predictions (Week 3-4)
- [ ] Seed match data (all WC 2026 group stage matches)
- [ ] Match list page (upcoming, live, finished)
- [ ] Prediction form (select scores before lock time)
- [ ] My predictions page (history + points)
- [ ] Scoring Edge Function (auto-calculate on match end)
- [ ] Admin panel: enter/edit match results

### Phase 3 — Leaderboards & Leagues (Week 5-6)
- [ ] Global leaderboard page
- [ ] Country leaderboard (filter by country_code)
- [ ] Create/join private leagues
- [ ] League leaderboard page
- [ ] Invite link / code sharing
- [ ] Realtime leaderboard updates

### Phase 4 — Engagement & Polish (Week 7-8)
- [ ] Badge system (UI + awarding logic)
- [ ] Telegram bot (match reminders, score notifications)
- [ ] Push notifications (web)
- [ ] Social sharing (prediction cards)
- [ ] Match detail page (stats, community predictions)
- [ ] Mobile responsiveness polish
- [ ] Landing page with countdown to tournament

### Phase 5 — Launch & Prizes (Week 9-10)
- [ ] Beta testing with early users
- [ ] Prize rules page (terms & conditions)
- [ ] Payment integration for prize distribution
- [ ] Analytics dashboard (admin)
- [ ] Performance optimization (caching, ISR)
- [ ] Public launch 🚀

---

## 7. Deployment Plan

### Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local dev | localhost:3000 |
| Staging | Testing & QA | staging.predict26.com |
| Production | Live app | predict26.com |

### Infrastructure

| Service | Provider | Purpose |
|---------|----------|---------|
| Web App | Vercel | Next.js hosting (auto-deploy from `main`) |
| Database | Supabase (Pro plan) | PostgreSQL + Auth + Realtime + Storage |
| Bot Hosting | Railway or Fly.io | Telegram bot (always-on) |
| Domain | Cloudflare | DNS + CDN + DDoS protection |
| Monitoring | Vercel Analytics + Sentry | Error tracking + performance |
| Email | Resend | Transactional emails (welcome, password reset) |

### CI/CD Pipeline (GitHub Actions)

```
Push to feature branch → Lint + Type check + Unit tests
PR to main            → Preview deployment (Vercel) + Integration tests
Merge to main         → Auto-deploy to production
```

### Supabase Deployment

- Use Supabase CLI for migrations (`supabase db push`)
- Staging linked to Supabase staging project
- Production linked to Supabase production project
- Edge Functions deployed via `supabase functions deploy`

### Pre-Launch Checklist

- [ ] SSL certificates configured
- [ ] Environment variables set in Vercel
- [ ] Supabase RLS policies audited
- [ ] Rate limiting on API routes
- [ ] Database backups enabled (Supabase Pro)
- [ ] Error monitoring active (Sentry)
- [ ] GDPR compliance (privacy policy, data deletion)
- [ ] Load testing (expected 1000+ concurrent users)
- [ ] Telegram bot webhook configured
- [ ] Prize pool terms published
- [ ] Match data seeded (all 104 matches)

---

## 8. Key Decisions & Assumptions

1. **Monorepo** — shared types and scoring logic between web and bot
2. **Supabase over custom backend** — faster MVP, built-in auth/realtime
3. **Next.js App Router** — server components for SEO, API routes for webhooks
4. **Score-based predictions** — more engaging than win/draw/loss only
5. **Country leaderboard** — leverages national pride for virality
6. **Telegram-first community** — aligns with target audience
7. **Founder Badge** — early adopter incentive / FOMO mechanic
8. **Prize pool funded by** — TBD (sponsorship / entry fee / platform budget)

---

*Document created: June 2026*
*Last updated: June 7, 2026*
