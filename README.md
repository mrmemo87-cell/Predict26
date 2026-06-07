# Predict26

Predict26 is a production-ready social football prediction platform focused on FIFA World Cup 2026.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres + RLS)
- Vercel-ready deployment
- Mobile-first premium dark UI

## Product Scope (MVP)

- Google authentication
- User profiles (username, avatar, country, points, accuracy, founder badge)
- Predictions (home / draw / away)
- 10-point scoring for correct prediction
- Founder program (first 1000 users)
- Global / country / referral leaderboards
- Referrals with unique referral code and tracking
- Prize system and prize zone tracker
- Landing page and dashboard skeleton

## Project Structure

```text
/tmp/workspace/mrmemo87-cell/Predict26
├── middleware.ts
├── supabase/
│   └── migrations/
│       └── 20260607003000_predict26_initial_schema.sql
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   ├── actions.ts
│   │   │   └── callback/route.ts
│   │   ├── dashboard/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── ui/auth-buttons.tsx
│   └── lib/
│       ├── data/dashboard.ts
│       ├── domain/{constants.ts,types.ts}
│       ├── env.ts
│       └── supabase/{client.ts,server.ts}
└── .env.example
```

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Local Development

```bash
npm install
npm run dev
```

## Database & Migrations

Schema includes:

- `countries`
- `competitions` (future-ready tournament expansion)
- `profiles`
- `matches`
- `predictions`
- `referrals`
- `leaderboards`

Migration path:

- `/tmp/workspace/mrmemo87-cell/Predict26/supabase/migrations/20260607003000_predict26_initial_schema.sql`

RLS policies are enabled for all core tables.

## Deployment

Deploy on Vercel and configure the same environment variables in project settings.
