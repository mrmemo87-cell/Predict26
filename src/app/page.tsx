import CountdownTimer from "@/components/CountdownTimer";
import LottieWorldCupHero from "@/components/LottieWorldCupHero";

const valueCards = [
  {
    icon: "⏱️",
    title: "Catch up fast",
    body: "See what matters first: upcoming fixtures, kickoff timing, and the predictions you still need to make.",
  },
  {
    icon: "⚽",
    title: "Predict in seconds",
    body: "Enter exact scores match by match. No noisy feeds, no complicated forms, and no betting slips.",
  },
  {
    icon: "🏆",
    title: "Track your rank",
    body: "Follow your global leaderboard position as finished matches turn predictions into points.",
  },
  {
    icon: "🌍",
    title: "Represent your country",
    body: "Choose your country and compare progress on country leaderboards throughout the tournament.",
  },
];

const steps = [
  {
    title: "Choose your country",
    body: "Join with Google, pick the nation you want to represent, and get your tournament hub ready.",
  },
  {
    title: "Predict exact scores",
    body: "Add home and away scores before kickoff. Every match locks automatically once it starts.",
  },
  {
    title: "Score points after matches finish",
    body: "Earn 5 points for an exact score, 2 for the correct result, and 0 for a miss.",
  },
];

const scoringRules = [
  { label: "Exact score", points: "5", detail: "Perfect home and away score" },
  { label: "Correct result", points: "2", detail: "Right winner or draw" },
  { label: "Wrong prediction", points: "0", detail: "Result does not match" },
];

const previewMatches = [
  {
    stage: "Group stage",
    kickoff: "Fri · 18:00",
    home: "Mexico",
    homeFlag: "🇲🇽",
    away: "South Africa",
    awayFlag: "🇿🇦",
  },
  {
    stage: "Group stage",
    kickoff: "Sat · 21:00",
    home: "United States",
    homeFlag: "🇺🇸",
    away: "Japan",
    awayFlag: "🇯🇵",
  },
  {
    stage: "Group stage",
    kickoff: "Sun · 16:00",
    home: "Brazil",
    homeFlag: "🇧🇷",
    away: "France",
    awayFlag: "🇫🇷",
  },
];

const glanceItems = [
  "Next match",
  "Pending predictions",
  "Points",
  "Country rank",
  "Global rank",
];

const focusLinkClass =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 focus-visible:ring-offset-2";

export default function Home() {
  return (
    <main className="flex-1 bg-[#f7faf8] text-gray-950">
      <section className="relative overflow-hidden px-4 py-16 sm:py-20 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(22,163,74,0.16),_transparent_34%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(236,253,245,0.74))]" />
        <div className="absolute inset-x-0 top-10 h-72 bg-[linear-gradient(90deg,_rgba(22,101,52,0.08)_1px,_transparent_1px),linear-gradient(0deg,_rgba(22,101,52,0.08)_1px,_transparent_1px)] bg-[size:72px_72px] opacity-70" />
        <div className="relative mx-auto grid w-full max-w-7xl min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
          <div className="min-w-0">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              World Cup 2026 prediction game
            </div>

            <h1 className="max-w-4xl text-4xl font-black leading-[1.04] tracking-tight text-gray-950 sm:text-5xl lg:text-7xl">
              Make every World Cup match matter
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-700 sm:text-xl">
              Predict exact scores, call the big moments, and chase prizes with your country behind you. Fast picks, friendly rivalry, all tournament long.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="/login"
                className={`${focusLinkClass} inline-flex items-center justify-center rounded-full bg-emerald-700 px-7 py-4 text-base font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800`}
              >
                Join Predict26
              </a>
              <a
                href="/rules"
                className={`${focusLinkClass} inline-flex items-center justify-center rounded-full border border-emerald-700/30 bg-white px-7 py-4 text-base font-bold text-emerald-900 shadow-sm transition hover:border-emerald-700 hover:bg-emerald-50`}
              >
                Explore scoring
              </a>
            </div>

            <p className="mt-5 text-sm font-medium text-gray-700">
              Free to join · Telegram updates at @Predict26Official · Picks lock at kickoff
            </p>
          </div>

          <div className="w-full min-w-0 max-w-full rounded-[2rem] border border-emerald-100 bg-white p-3 shadow-2xl shadow-emerald-900/10 sm:p-6">
            <LottieWorldCupHero />
            <div className="mt-4 min-w-0 rounded-[1.5rem] bg-emerald-700 p-4 text-white shadow-inner sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100">
                    Countdown to kickoff
                  </p>
                  <p className="mt-2 text-2xl font-black">World Cup 2026</p>
                </div>
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-3xl"
                  aria-hidden="true"
                >
                  ⚽
                </div>
              </div>
              <div className="mt-6 max-w-full overflow-hidden rounded-2xl bg-white p-3 text-gray-950 sm:p-4 [&>div]:flex-wrap [&>div]:gap-2">
                <CountdownTimer />
              </div>
            </div>

            <div className="mt-4 min-w-0 rounded-[1.5rem] border border-gray-100 bg-[#f8fbf9] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
                    Upcoming matches
                  </p>
                  <p className="text-sm text-gray-600">
                    A taste of the match hub
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  Fast view
                </span>
              </div>

              <div className="space-y-3">
                {previewMatches.map((match) => (
                  <article
                    key={`${match.home}-${match.away}`}
                    className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <span>{match.stage}</span>
                      <time>{match.kickoff}</time>
                    </div>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                      <div className="text-left">
                        <p className="text-2xl" aria-hidden="true">
                          {match.homeFlag}
                        </p>
                        <p className="truncate font-bold text-gray-950">
                          {match.home}
                        </p>
                      </div>
                      <div className="rounded-full bg-gray-100 px-3 py-1 text-sm font-black text-gray-500">
                        vs
                      </div>
                      <div className="text-right">
                        <p className="text-2xl" aria-hidden="true">
                          {match.awayFlag}
                        </p>
                        <p className="truncate font-bold text-gray-950">
                          {match.away}
                        </p>
                      </div>
                    </div>
                    <a
                      href="/login"
                      className={`${focusLinkClass} mt-4 inline-flex w-full items-center justify-center rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100`}
                    >
                      Make your pick
                    </a>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>


      <section className="px-4 pb-6">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2">
          <a
            href="https://t.me/Predict26Official"
            className={`${focusLinkClass} rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-900/10`}
          >
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">Telegram touchline</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">Follow @Predict26Official</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">Get kickoff reminders, prize notes, and tournament updates in one clean channel.</p>
          </a>
          <div className="rounded-3xl border border-gold/30 bg-gradient-to-br from-white to-gold/10 p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gold-dark">Prize chase</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">Climb into reward position</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">Every correct call moves you up the global table. Keep picking, keep climbing, and stay close to the prize zone.</p>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-18">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
              Built for football nights
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
              Everything you need before kickoff
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {valueCards.map((card) => (
              <article
                key={card.title}
                className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/10"
              >
                <div
                  className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl"
                  aria-hidden="true"
                >
                  {card.icon}
                </div>
                <h3 className="text-xl font-black text-gray-950">
                  {card.title}
                </h3>
                <p className="mt-3 leading-7 text-gray-700">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-18">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
              Three simple steps
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-700">
              Predict26 keeps the flow simple so you can make picks quickly and
              get back to watching football.
            </p>
          </div>
          <div className="grid gap-4">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="flex gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-lg font-black text-white">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 leading-7 text-gray-700">{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-18">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-xl shadow-emerald-900/5 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
                Fair scoring
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
                No hidden scoring rules
              </h2>
              <p className="mt-4 text-lg leading-8 text-gray-700">
                Everyone plays by the same points system. Predictions lock
                automatically at kickoff.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {scoringRules.map((rule) => (
                <article
                  key={rule.label}
                  className="rounded-3xl border border-gray-200 bg-[#f8fbf9] p-5 text-center"
                >
                  <p className="text-sm font-bold uppercase tracking-wide text-gray-600">
                    {rule.label}
                  </p>
                  <p className="mt-3 text-5xl font-black text-emerald-700">
                    {rule.points}
                  </p>
                  <p className="mt-1 font-bold text-gray-950">points</p>
                  <p className="mt-3 text-sm leading-6 text-gray-600">
                    {rule.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-18">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:items-center">
          <div className="rounded-[2rem] border border-emerald-100 bg-emerald-800 p-6 text-white shadow-xl shadow-emerald-900/15 sm:p-8">
            <div className="rounded-[1.5rem] border border-white/20 bg-white/10 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-100">
                At a glance
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">
                Your football dashboard, simplified
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {glanceItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl bg-white p-4 text-gray-950 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-gray-500">
                      {item}
                    </p>
                    <p className="mt-2 text-lg font-black text-emerald-800">
                      Ready when you are
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
              Busy fan catch-up
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
              Everything you need before kickoff
            </h2>
            <p className="mt-4 text-lg leading-8 text-gray-700">
              Open Predict26 and quickly check the next match, pending
              predictions, points, country rank, and global rank. It is built to
              be scanned in seconds on mobile.
            </p>
            <a
              href="/login"
              className={`${focusLinkClass} mt-7 inline-flex items-center justify-center rounded-full bg-emerald-700 px-7 py-4 text-base font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800`}
            >
              Join Predict26
            </a>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:py-18">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-1">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
                Trusted game
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950">
                Football predictions, not betting
              </h2>
            </div>
            <div className="grid gap-4 md:col-span-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-2xl" aria-hidden="true">
                  🛡️
                </p>
                <p className="mt-3 font-black text-gray-950">
                  Predict26 is a football prediction game, not betting.
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-2xl" aria-hidden="true">
                  📋
                </p>
                <p className="mt-3 font-black text-gray-950">
                  No hidden scoring rules.
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-2xl" aria-hidden="true">
                  🤝
                </p>
                <p className="mt-3 font-black text-gray-950">
                  Everyone plays by the same points system.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="relative overflow-hidden px-4 py-16 sm:py-20"
        id="join"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(22,163,74,0.16),_transparent_42%)]" />
        <div className="relative mx-auto max-w-4xl rounded-[2rem] border border-emerald-100 bg-white p-8 text-center shadow-2xl shadow-emerald-900/10 sm:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
            Before kickoff
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-gray-950 sm:text-5xl">
            Join Predict26 before kickoff
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-gray-700">
            Join for free, sign in with Google, and make exact-score predictions
            with clear 5 / 2 / 0 scoring.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="/login"
              className={`${focusLinkClass} inline-flex items-center justify-center rounded-full bg-emerald-700 px-8 py-4 text-base font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800`}
            >
              Join Predict26 before kickoff
            </a>
            <a
              href="/rules"
              className={`${focusLinkClass} inline-flex items-center justify-center rounded-full border border-emerald-700/30 bg-white px-8 py-4 text-base font-bold text-emerald-900 transition hover:bg-emerald-50`}
            >
              Review scoring rules
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white px-4 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 font-black text-emerald-800">
            <span className="text-xl" aria-hidden="true">
              ⚽
            </span>
            <span>Predict26</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium text-gray-600">
            <a
              href="/rules"
              className={`${focusLinkClass} rounded-md transition hover:text-emerald-800`}
            >
              Rules
            </a>
            <a
              href="/leaderboard"
              className={`${focusLinkClass} rounded-md transition hover:text-emerald-800`}
            >
              Leaderboard
            </a>
            <span>© 2026 Predict26. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
