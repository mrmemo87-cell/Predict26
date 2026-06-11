# Predict26

🏆 Predict World Cup 2026 & Win Real Prizes

⚽ Predict matches of the 2026 FIFA World Cup  
🔥 Compete with friends  
🌍 Represent your country  
🏅 Climb the leaderboard  
💰 Win real cash prizes  

## Prize Pool

🥇 $300 | 🥈 $100 | 🥉 $50

🎁 First 1,000 members receive an exclusive Founder Badge

## Tech Stack

- Next.js 15
- React 19
- Tailwind CSS 4
- TypeScript

## Getting Started

```bash
npm install
npm run dev
```

Open the local development URL printed by Next.js to view the landing page.

## Scripts

- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint

## Production OAuth checklist

Predict26 production Google OAuth must always use the canonical production domain, not a Vercel deployment URL.

### Vercel environment variables

Set this value in the production Vercel environment:

```bash
NEXT_PUBLIC_SITE_URL=https://predict26.live
```

The app normalizes trailing slashes, so `https://predict26.live/` is also safe. Do not set production OAuth to `VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL`, or a `*.vercel.app` deployment URL.

### Supabase Auth URL Configuration

In Supabase Dashboard → Authentication → URL Configuration, verify:

- Site URL: `https://predict26.live`
- Redirect URLs:
  - `https://predict26.live/auth/callback`
  - `https://predict26.live/**`
  - `https://www.predict26.live/**`
  - `https://predict26-4l6v.vercel.app/**` only if you are still testing that preview deployment
